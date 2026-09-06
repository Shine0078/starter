import { createHash } from 'node:crypto';

import { categorizeDescriptor } from '../categorization/categorize';
import { UNKNOWN_CATEGORY } from '../categories';
import { UserCorrectionClassifier } from '../categorization/user-correction-classifier';
import { normalizeDescriptor } from '../categorization/normalize';
import type { CategorizationRule, Transaction } from '../types';
import { parseAmount, parseDate, suggestMapping, type ColumnMapping } from '../imports/mapping';
import { parseCsv } from '../imports/csv-parse';
import { reviewImport, type ReviewedRow } from '../imports/review';
import type { StatementExtraction, StatementFormat, StatementRowDraft } from './types';

const MAX_ROWS = 10_000;
const MAX_DECOMPRESSED_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 512;
const MAX_XLSX_COLUMNS = 16_384; // Excel's XFD limit.
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/tiff', 'image/bmp']);

export function formatFor(filename: string, mimeType?: string): StatementFormat {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv' || mimeType === 'text/csv' || mimeType === 'text/plain') return 'csv';
  if (ext === 'xlsx' || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (IMAGE_MIME.has(mimeType ?? '') || ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'bmp'].includes(ext ?? '')) return 'image';
  throw new Error('Supported statement formats are CSV, XLSX, PDF, PNG, JPEG, WEBP, TIFF, and BMP.');
}

export interface StatementAnalyzeInput {
  filename: string;
  mimeType?: string;
  bytes: Buffer;
  currency: string;
  existing: readonly Transaction[];
  rules: readonly CategorizationRule[];
}

export async function analyzeStatement(input: StatementAnalyzeInput): Promise<StatementExtraction> {
  const format = formatFor(input.filename, input.mimeType);
  const statementHash = createHash('sha256').update(input.bytes).digest('hex');
  if (input.bytes.length === 0) throw new Error('The statement file is empty.');

  // Do not let an extension or user-controlled MIME type select a parser for
  // an unrelated payload. These small signatures also make malformed uploads
  // fail before ZIP/XML/PDF/OCR work begins.
  assertFileSignature(format, input.bytes);
  const model = UserCorrectionClassifier.fromTransactions(input.existing);

  if (format === 'csv') {
    return analyzeTabular(format, input.bytes.toString('utf8'), statementHash, input, model);
  }
  if (format === 'xlsx') {
    return analyzeTabular(format, xlsxToCsv(input.bytes), statementHash, input, model);
  }

  const text = format === 'pdf' ? await extractPdfText(input.bytes) : await extractImageText(input.bytes);
  const rows = parseTextRows(text, input.currency, input.rules, input.existing, model);
  return {
    format,
    rows,
    warnings: rows.length === 0 ? ['No transaction rows could be identified. Check the statement quality or review it manually.'] : [],
    statementHash,
    sourceText: text.slice(0, 200_000),
  };
}

function assertFileSignature(format: StatementFormat, bytes: Buffer): void {
  if (format === 'csv') return;
  if (format === 'xlsx') {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('The XLSX upload is not a valid ZIP-based workbook.');
    return;
  }
  if (format === 'pdf') {
    if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('The PDF upload does not have a valid PDF signature.');
    return;
  }
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  const isTiff = bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]));
  const isBmp = bytes.subarray(0, 2).toString('ascii') === 'BM';
  if (!isPng && !isJpeg && !isWebp && !isTiff && !isBmp) throw new Error('The image upload does not have a supported image signature.');
}

function analyzeTabular(
  format: StatementFormat,
  content: string,
  statementHash: string,
  input: StatementAnalyzeInput,
  model: UserCorrectionClassifier,
): StatementExtraction {
  const parsed = parseCsv(content);
  if (parsed.rows.length > MAX_ROWS) throw new Error(`A statement may contain at most ${MAX_ROWS} rows.`);
  const suggestion = suggestMapping(parsed.headers, parsed.rows.slice(0, 25));
  if (!suggestion.mapping) {
    return { format, rows: [], warnings: suggestion.warnings, statementHash };
  }
  const review = reviewImport({
    headers: parsed.headers,
    rows: parsed.rows,
    mapping: suggestion.mapping,
    existing: input.existing,
    currency: input.currency,
    raggedLines: parsed.raggedLines,
  });
  const ambiguousDates = suggestion.warnings.some((warning) => /ambiguous/i.test(warning));
  return {
    format,
    rows: review.rows.map((row) => draftFromReviewed(row, input.currency, input.rules, ambiguousDates, model)),
    warnings: suggestion.warnings,
    statementHash,
  };
}

function draftFromReviewed(
  row: ReviewedRow,
  currency: string,
  rules: readonly CategorizationRule[],
  ambiguousDates: boolean,
  model: UserCorrectionClassifier,
): StatementRowDraft {
  const description = row.descriptor ?? row.raw.filter(Boolean).join(' ').slice(0, 500);
  const categorized = row.descriptor ? categorizeDescriptor(row.descriptor, { rules, model }) : null;
  const flags: string[] = [];
  if (row.decision === 'duplicate') flags.push('possible_duplicate');
  if (row.decision === 'invalid') flags.push('extraction_error');
  if (ambiguousDates && row.postedAt) flags.push('ambiguous_date');
  if (categorized && categorized.confidence < 0.7) flags.push('low_confidence');
  if (!categorized || categorized.categorySlug === 'unknown') flags.push('uncategorized');
  const decision = row.decision === 'import' && flags.length === 0 ? 'include' : 'needs_review';
  const fingerprint = createHash('sha256')
    .update(`${row.line}|${row.postedAt ?? ''}|${row.amount ?? ''}|${normalizeDescriptor(description)}|${currency}`)
    .digest('hex');
  return {
    sourceLine: row.line,
    postedAt: row.postedAt ?? null,
    description,
    merchant: categorized?.merchant ?? null,
    amount: row.amount ?? null,
    currency,
    direction: row.amount === undefined || row.amount === null ? 'unknown' : row.amount < 0 ? 'debit' : 'credit',
    categorySlug: categorized?.categorySlug ?? UNKNOWN_CATEGORY,
    categorySource: categorized?.source ?? 'unknown',
    categoryConfidence: categorized?.confidence ?? 0,
    isRecurring: false,
    flags: [...flags, ...(row.reason ? [row.reason] : [])].slice(0, 8),
    decision,
    fingerprint,
    raw: row.raw.join(' | ').slice(0, 2_000),
  };
}

function parseTextRows(
  text: string,
  currency: string,
  rules: readonly CategorizationRule[],
  existing: readonly Transaction[],
  model: UserCorrectionClassifier,
): StatementRowDraft[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  // Many card issuers put two textual dates and a positive charge amount on
  // each row (for example, "Aug 01 Aug 04 MERCHANT Restaurants 7.33").
  // Those amounts are debits even though they do not carry a minus sign. Parse
  // this well-known statement shape before the generic signed-amount parser so
  // charges are not mistaken for income.
  const cardRows = parseCreditCardRows(lines, text, currency, rules, existing, model);
  if (cardRows.length > 0) return cardRows;

  const dates = lines.map((line) => /\b\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}\b/.exec(line)?.[0] ?? '').filter(Boolean);
  const dateOrder = dates.some((date) => /^\d{4}/.test(date)) ? 'YMD' : 'DMY';
  const ambiguousDate = dates.length > 0 && !dates.some((date) => {
    const match = /^(\d{1,2})[\/-](\d{1,2})/.exec(date);
    return match ? Number(match[1]) > 12 || Number(match[2]) > 12 : /^\d{4}/.test(date);
  });
  const rows: StatementRowDraft[] = [];
  for (let index = 0; index < lines.length && rows.length < MAX_ROWS; index += 1) {
    const line = lines[index]!;
    const dateMatch = /\b(\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/.exec(line);
    if (!dateMatch) continue;
    const amountMatch = /(?:\(|-)?\s*[$€£]?\d[\d,.]*\.?\d{0,2}\)?\s*$/.exec(line);
    if (!amountMatch) continue;
    const postedAt = parseDate(dateMatch[1]!, dateOrder);
    const amountText = amountMatch[0].trim();
    const amount = parseAmount(amountText, currency);
    const description = line
      .replace(dateMatch[0], '')
      .replace(amountMatch[0], '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const categorized = description ? categorizeDescriptor(description, { rules, model }) : null;
    const flags = [
      ...(postedAt ? [] : ['extraction_error']),
      ...(amount === null || amount === 0 ? ['extraction_error'] : []),
      ...(ambiguousDate ? ['ambiguous_date'] : []),
      ...(categorized && categorized.confidence < 0.7 ? ['low_confidence'] : []),
      ...(!categorized || categorized.categorySlug === 'unknown' ? ['uncategorized'] : []),
    ];
    const fingerprint = createHash('sha256').update(`${index + 1}|${postedAt ?? ''}|${amount ?? ''}|${normalizeDescriptor(description)}|${currency}`).digest('hex');
    const existingMatch = existing.some((txn) => txn.postedAt === postedAt && txn.amount === amount && txn.normalizedDescriptor === normalizeDescriptor(description));
    if (existingMatch) flags.push('possible_duplicate');
    rows.push({
      sourceLine: index + 1,
      postedAt,
      description: description.slice(0, 500),
      merchant: categorized?.merchant ?? null,
      amount,
      currency,
      direction: amount === null ? 'unknown' : amount < 0 ? 'debit' : 'credit',
      categorySlug: categorized?.categorySlug ?? UNKNOWN_CATEGORY,
      categorySource: categorized?.source ?? 'unknown',
      categoryConfidence: categorized?.confidence ?? 0,
      isRecurring: false,
      flags: flags.slice(0, 8),
      decision: flags.length === 0 ? 'include' : 'needs_review',
      fingerprint,
      raw: line.slice(0, 2_000),
    });
  }
  return rows;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const CARD_CATEGORY_LABELS = [
  'Retail and Grocery', 'Restaurants', 'Transportation',
  'Personal and Household Expenses', 'Professional and Financial Services',
  'Home and Office Improvement', 'Entertainment', 'Travel', 'Other',
];

function parseCreditCardRows(
  lines: readonly string[],
  text: string,
  currency: string,
  rules: readonly CategorizationRule[],
  existing: readonly Transaction[],
  model: UserCorrectionClassifier,
): StatementRowDraft[] {
  // Require a statement-year anchor. A month/day without a year is not safe
  // to import because a statement can span December and January.
  const year = findStatementYear(text);
  if (year === null || !/(?:credit card|card number|spend categories|new charges and credits)/i.test(text)) return [];

  const rows: StatementRowDraft[] = [];
  const datePattern = Object.keys(MONTHS).join('|');
  const rowPattern = new RegExp(`^(${datePattern})\\s+(\\d{1,2})\\s+(${datePattern})\\s+(\\d{1,2})\\s+(.+?)\\s+((?:\\(?[-+]?[$€£]?\\d[\\d,.]*\\)?))$`, 'i');

  for (let index = 0; index < lines.length && rows.length < MAX_ROWS; index += 1) {
    const line = lines[index]!;
    const match = rowPattern.exec(line);
    if (!match) continue;

    const transactionMonth = MONTHS[match[1]!.toLowerCase()];
    const transactionDay = Number(match[2]);
    const postedAt = buildTextDate(year, transactionMonth, transactionDay);
    const amount = parseAmount(match[6]!, currency);
    let description = match[5]!.trim();
    let issuerCategory: string | undefined;
    // Issuer-provided spend labels are metadata, not part of the merchant
    // name. Strip only a known suffix so a similarly named merchant is kept.
    for (const label of CARD_CATEGORY_LABELS) {
      const suffix = new RegExp(`\\s+${escapeRegExp(label)}$`, 'i');
      if (suffix.test(description)) {
        issuerCategory = label;
        description = description.replace(suffix, '').trim();
        break;
      }
    }

    const normalized = normalizeDescriptor(description);
    const isCredit = /\b(payment|credit|refund|reversal)\b/i.test(normalized);
    const signedAmount = amount === null ? null : isCredit ? Math.abs(amount) : -Math.abs(amount);
    rows.push(textDraft({
      sourceLine: index + 1,
      raw: line,
      postedAt,
      amount: signedAmount,
      currency,
      description,
      issuerCategory,
      rules,
      existing,
      model,
    }));
  }
  return rows;
}

function findStatementYear(text: string): number | null {
  const explicit = /(?:statement date|statement period|to)\b[^\d]*(20\d{2})\b/i.exec(text)?.[1];
  const fallback = /\b(20\d{2})\b/.exec(text)?.[1];
  const year = Number(explicit ?? fallback ?? '');
  return year >= 2000 && year <= 2100 ? year : null;
}

function buildTextDate(year: number | null, month: number | undefined, day: number): string | null {
  if (year === null || month === undefined || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function textDraft(input: {
  sourceLine: number;
  raw: string;
  postedAt: string | null;
  amount: number | null;
  currency: string;
  description: string;
  issuerCategory?: string;
  rules: readonly CategorizationRule[];
  existing: readonly Transaction[];
  model: UserCorrectionClassifier;
}): StatementRowDraft {
  const categorizedByMerchant = input.description
    ? categorizeDescriptor(input.description, { rules: input.rules, model: input.model })
    : null;
  const categorized = categorizedByMerchant?.categorySlug !== UNKNOWN_CATEGORY
    ? categorizedByMerchant
    : issuerCategoryResult(input.issuerCategory) ?? categorizedByMerchant;
  const normalized = normalizeDescriptor(input.description);
  const flags = [
    ...(input.postedAt ? [] : ['extraction_error']),
    ...(input.amount === null || input.amount === 0 ? ['extraction_error'] : []),
    ...(categorized && categorized.confidence < 0.7 ? ['low_confidence'] : []),
    ...(!categorized || categorized.categorySlug === UNKNOWN_CATEGORY ? ['uncategorized'] : []),
  ];
  if (input.existing.some((txn) => txn.postedAt === input.postedAt && txn.amount === input.amount && txn.normalizedDescriptor === normalized)) {
    flags.push('possible_duplicate');
  }
  const fingerprint = createHash('sha256')
    .update(`${input.sourceLine}|${input.postedAt ?? ''}|${input.amount ?? ''}|${normalized}|${input.currency}`)
    .digest('hex');
  return {
    sourceLine: input.sourceLine,
    postedAt: input.postedAt,
    description: input.description.slice(0, 500),
    merchant: categorized?.merchant ?? null,
    amount: input.amount,
    currency: input.currency,
    direction: input.amount === null ? 'unknown' : input.amount < 0 ? 'debit' : 'credit',
    categorySlug: categorized?.categorySlug ?? UNKNOWN_CATEGORY,
    categorySource: categorized?.source ?? 'unknown',
    categoryConfidence: categorized?.confidence ?? 0,
    isRecurring: false,
    flags: flags.slice(0, 8),
    decision: flags.length === 0 ? 'include' : 'needs_review',
    fingerprint,
    raw: input.raw.slice(0, 2_000),
  };
}

function issuerCategoryResult(label: string | undefined): { categorySlug: string; source: 'lexicon'; confidence: number; merchant?: string; reason: string } | null {
  if (!label) return null;
  if (/restaurant/i.test(label)) return { categorySlug: 'restaurants', source: 'lexicon', confidence: 0.82, merchant: 'Restaurant', reason: 'Matched the issuer-provided spend category.' };
  if (/transportation/i.test(label)) return { categorySlug: 'transportation', source: 'lexicon', confidence: 0.82, merchant: 'Transportation', reason: 'Matched the issuer-provided spend category.' };
  if (/retail and grocery/i.test(label)) return { categorySlug: 'groceries', source: 'lexicon', confidence: 0.72, merchant: 'Retail and Grocery', reason: 'Matched the issuer-provided spend category.' };
  if (/entertainment/i.test(label)) return { categorySlug: 'entertainment', source: 'lexicon', confidence: 0.78, merchant: 'Entertainment', reason: 'Matched the issuer-provided spend category.' };
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\[\]\\]/g, '\\$&');
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const module = await import('pdf-parse');
  const parser = new module.PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text ?? '';
  } finally {
    await parser.destroy();
  }
}

async function extractImageText(bytes: Buffer): Promise<string> {
  // Tesseract ships with the English model in the application image. No
  // network request or third-party model service is involved.
  const tesseract = await import('tesseract.js');
  // The data package intentionally exposes a path rather than embedding a
  // 25MB model in this source tree.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lang = require('@tesseract.js-data/eng') as { langPath: string };
  const worker = await tesseract.createWorker('eng', 1, { langPath: lang.langPath, gzip: true, logger: () => undefined });
  try {
    const result = await worker.recognize(bytes);
    return result.data.text ?? '';
  } finally {
    await worker.terminate();
  }
}

function xlsxToCsv(bytes: Buffer): string {
  // XLSX is a ZIP of XML parts. Parsing only worksheet cells and shared strings
  // keeps the attack surface small and lets us bound decompression before XML
  // processing. Formulas are never evaluated.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { unzipSync } = require('fflate') as { unzipSync(input: Uint8Array): Record<string, Uint8Array> };
  assertZipExpansionBudget(bytes);
  const parts = unzipSync(bytes);
  const total = Object.values(parts).reduce((sum, value) => sum + value.length, 0);
  if (total > MAX_DECOMPRESSED_BYTES) throw new Error('The XLSX decompressed size exceeds the safety limit.');
  const shared = parseSharedStrings(parts['xl/sharedStrings.xml']);
  const sheet = parts['xl/worksheets/sheet1.xml'];
  if (!sheet) throw new Error('The XLSX file does not contain a first worksheet.');
  const xml = Buffer.from(sheet).toString('utf8');
  const rows: string[][] = [];
  const rowMatches = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? [];
  if (rowMatches.length > MAX_ROWS) throw new Error(`An XLSX worksheet may contain at most ${MAX_ROWS} rows.`);
  for (const rowXml of rowMatches) {
    const cells: string[] = [];
    for (const cellXml of rowXml.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = /\br="([A-Z]+)\d+"/.exec(cellXml)?.[1] ?? '';
      const column = columnNumber(ref);
      if (column >= MAX_XLSX_COLUMNS) throw new Error('The XLSX worksheet contains a column beyond Excel\'s XFD limit.');
      while (cells.length < column) cells.push('');
      const type = /\bt="([^" ]+)"/.exec(cellXml)?.[1];
      const value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(cellXml)?.[1] ?? /<t>([\s\S]*?)<\/t>/.exec(cellXml)?.[1] ?? '');
      cells[column] = type === 's' ? shared[Number(value)] ?? '' : value;
    }
    rows.push(cells);
  }
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

/**
 * Validate ZIP metadata before fflate allocates decompressed buffers. XLSX is
 * user supplied and its central directory is the only bounded source of the
 * entry sizes available before inflation. ZIP64 and multi-disk archives are
 * rejected because they cannot be safely bounded by this parser.
 */
function assertZipExpansionBudget(bytes: Buffer): void {
  if (bytes.length < 22) throw new Error('The XLSX file is missing a valid ZIP directory.');
  const minimumEnd = Math.max(0, bytes.length - (22 + 0xffff));
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= minimumEnd; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('The XLSX file is missing a valid ZIP directory.');

  const disk = bytes.readUInt16LE(eocd + 4);
  const directoryDisk = bytes.readUInt16LE(eocd + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocd + 8);
  const entries = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entries || entries === 0 || entries > MAX_ZIP_ENTRIES) {
    throw new Error('The XLSX ZIP directory is invalid or contains too many entries.');
  }
  if (directorySize > bytes.length || directoryOffset > bytes.length || directoryOffset + directorySize > eocd) {
    throw new Error('The XLSX ZIP directory is outside the uploaded file.');
  }

  let cursor = directoryOffset;
  let total = 0;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > eocd || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('The XLSX ZIP directory contains a malformed entry.');
    }
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ZIP64 XLSX archives are not supported.');
    }
    const recordLength = 46 + nameLength + extraLength + commentLength;
    if (cursor + recordLength > eocd || localOffset >= bytes.length) {
      throw new Error('The XLSX ZIP directory contains an out-of-bounds entry.');
    }
    if (uncompressedSize > MAX_DECOMPRESSED_BYTES || compressedSize > bytes.length) {
      throw new Error('The XLSX decompressed size exceeds the safety limit.');
    }
    total += uncompressedSize;
    if (total > MAX_DECOMPRESSED_BYTES) throw new Error('The XLSX decompressed size exceeds the safety limit.');
    cursor += recordLength;
  }
  if (cursor !== directoryOffset + directorySize) throw new Error('The XLSX ZIP directory length is invalid.');
}

function parseSharedStrings(bytes: Uint8Array | undefined): string[] {
  if (!bytes) return [];
  const xml = Buffer.from(bytes).toString('utf8');
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ''));
}

function columnNumber(letters: string): number {
  let result = 0;
  for (const char of letters) result = result * 26 + char.charCodeAt(0) - 64;
  return Math.max(0, result - 1);
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function decodeXml(value: string): string {
  // Decode each entity exactly once. A chained replace can turn `&amp;lt;`
  // into `<`, even though the XML source only encoded the literal `&lt;`.
  return value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => {
    switch (entity) {
      case '&amp;': return '&';
      case '&lt;': return '<';
      case '&gt;': return '>';
      case '&quot;': return '"';
      case '&apos;': return "'";
      default: return entity;
    }
  });
}
