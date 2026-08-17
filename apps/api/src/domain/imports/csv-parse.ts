/**
 * CSV reading for the import review.
 *
 * Hand-written rather than a dependency because bank CSV is not really CSV: the
 * files carry BOMs, mixed line endings, semicolon delimiters from European
 * exports, quoted fields containing the delimiter, and doubled quotes. A parser
 * that handles those four cases correctly is small; one that handles them
 * incorrectly corrupts a ledger silently.
 *
 * Pure: no file system, no encoding detection beyond the BOM. The caller hands
 * in text.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  delimiter: string;
  /** Rows whose column count disagrees with the header, by 1-based line number. */
  raggedLines: number[];
}

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|'];

/**
 * Picks the delimiter by which one yields the most consistent column count
 * across the first few lines.
 *
 * Counting occurrences on the header alone is the obvious approach and it is
 * wrong: a single header like `Date,Description` loses to a semicolon file
 * whose description happens to contain commas. Consistency across rows is the
 * signal that actually distinguishes them.
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ',';

  let best = ',';
  let bestScore = -1;

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = lines.map((line) => splitLine(line, delimiter).length);
    const columns = counts[0] ?? 1;
    if (columns < 2) continue;

    const consistent = counts.filter((count) => count === columns).length;
    // More columns breaks ties: a semicolon file also parses as one comma
    // column, and the richer split is the correct reading.
    const score = consistent * 100 + columns;

    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

/** Splits one line, honouring quotes and doubled escaped quotes. */
function splitLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1; // consume the escaped pair
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

/**
 * Splits into records, treating a newline inside quotes as part of the field.
 *
 * Bank exports do contain multi-line descriptions; splitting naively on `\n`
 * turns one transaction into two malformed ones.
 */
function toRecords(text: string): string[] {
  const records: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '""';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      records.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0) records.push(current);
  return records;
}

export const MAX_IMPORT_ROWS = 10_000;

export function parseCsv(text: string): ParsedCsv {
  // A UTF-8 BOM survives into the first header name and makes an exact match
  // like "Date" fail for a reason nobody can see.
  const cleaned = text.replace(/^﻿/, '');

  const records = toRecords(cleaned).filter((line) => line.trim().length > 0);
  if (records.length === 0) throw new CsvParseError('The file is empty.');

  const delimiter = detectDelimiter(cleaned);
  const headers = splitLine(records[0]!, delimiter).map((h) => h.trim());

  if (headers.length < 2) {
    throw new CsvParseError(
      'Could not find columns. Check that the file is a CSV exported from your bank.',
    );
  }

  const body = records.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    throw new CsvParseError(
      `That file has ${body.length} rows; the limit is ${MAX_IMPORT_ROWS}. Split it by date range.`,
    );
  }

  const rows: string[][] = [];
  const raggedLines: number[] = [];

  body.forEach((record, index) => {
    const fields = splitLine(record, delimiter).map((f) => f.trim());
    // Kept rather than dropped. A ragged row is reported in the preview so the
    // user decides; silently discarding rows from a bank export is how money
    // goes missing without anyone noticing.
    if (fields.length !== headers.length) raggedLines.push(index + 2);
    rows.push(fields);
  });

  return { headers, rows, delimiter, raggedLines };
}
