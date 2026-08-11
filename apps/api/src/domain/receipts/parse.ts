/**
 * Deterministic receipt parsing (ADR-0002: pure domain, no I/O).
 *
 * This is the local fallback in the OCR architecture and the reference the
 * provider abstraction is tested against. It understands the layout of a
 * plain-text or OCR'd receipt: a merchant line, a date, per-line items, tax,
 * and a total. Real OCR providers (Vision, Tesseract, an AI service) implement
 * the same port and may return richer fields; every provider output still runs
 * through this normalizer so the rest of the system sees one shape.
 */

export interface ReceiptScan {
  merchant: string | null;
  /** Normalised `YYYY-MM-DD` (the domain's date representation). */
  date: string | null;
  /** Minor units. Never a float — see ADR-0003. */
  totalMinor: number | null;
  taxMinor: number | null;
  currency: string | null;
  items: string[];
  /** 0..1. Enough evidence to show it as a draft rather than authority. */
  confidence: number;
}

const MONEY = /(\d{1,7}(?:[.,]\d{1,2})?)/;
const TOTAL_LABELS = ['total due', 'total', 'amount due', 'amount', 'balance due', 'grand total'];
const TAX_LABELS = ['tax', 'gst', 'hst', 'vat', 'pst', 'qst'];
const JUNK_FIRST_LINES = new Set([
  'receipt',
  'invoice',
  'tax invoice',
  'sale',
  'payment receipt',
  'thank you',
  'thank you for your purchase',
  'welcome',
  'www',
  'http',
]);
const DATE_ISO = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
// Ambiguous DD/MM/YYYY vs MM/DD/YYYY. Prefer the order that yields a plausible
// month (1-12) for the first group; otherwise treat it as YYYY-MM-DD order.
const DATE_SLASH = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/;

function toMinor(value: string): number | null {
  const normalized = value.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
}

function parseMoney(line: string): number | null {
  const match = line.match(MONEY);
  if (!match) return null;
  return toMinor(match[1]!);
}

function hasAnyLabel(line: string, labels: string[]): boolean {
  const lower = line.toLowerCase();
  // "Subtotal" must never satisfy the total/amount matchers.
  if (labels === TOTAL_LABELS && lower.includes('subtotal')) return false;
  return labels.some((label) => lower.includes(label));
}

function parseDate(line: string): string | null {
  const iso = line.match(DATE_ISO);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  }
  const slash = line.match(DATE_SLASH);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const c = slash[3]!.padStart(4, '2026'.slice(0, 4 - slash[3]!.length) + slash[3]!);
    // DD/MM vs MM/DD is genuinely ambiguous. When one side is clearly a day
    // (> 12) use that; otherwise prefer day-first, which is the common
    // convention in the Canadian launch market.
    let day: number;
    let month: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      day = b;
      month = a;
    } else {
      day = a;
      month = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${c}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

function looksLikeItemLine(line: string): boolean {
  return line.includes('$') || /\d[.,]\d{2}\s*$/.test(line);
}

export function parseReceiptText(text: string): ReceiptScan {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let merchant: string | null = null;
  let date: string | null = null;
  let totalMinor: number | null = null;
  let taxMinor: number | null = null;
  let currency: string | null = null;
  const items: string[] = [];

  const currencyMatch = text.match(/\b(USD|CAD|EUR|GBP|AUD|MXN)\b/i);
  if (currencyMatch) currency = currencyMatch[1]!.toUpperCase();

  for (const line of lines) {
    if (date === null) date = parseDate(line);
    if (merchant === null && !JUNK_FIRST_LINES.has(line.toLowerCase())) {
      if (!hasAnyLabel(line, [...TOTAL_LABELS, ...TAX_LABELS]) && looksLikeItemLine(line) === false) {
        merchant = line.slice(0, 120);
      }
    }
    if (totalMinor === null && hasAnyLabel(line, TOTAL_LABELS)) {
      totalMinor = parseMoney(line);
    }
    if (taxMinor === null && hasAnyLabel(line, TAX_LABELS)) {
      taxMinor = parseMoney(line);
    }
  }

  // Anything that ends in money but was not picked up as the total is a line
  // item, as long as it is not the merchant or a label.
  for (const line of lines) {
    if (items.length >= 12) break;
    if (hasAnyLabel(line, [...TOTAL_LABELS, ...TAX_LABELS])) continue;
    if (line === merchant) continue;
    if (looksLikeItemLine(line) && parseMoney(line) !== null) {
      items.push(line.slice(0, 200));
    }
  }

  let confidence = 0.4;
  if (merchant !== null) confidence += 0.15;
  if (date !== null) confidence += 0.1;
  if (totalMinor !== null) confidence += 0.2;
  if (taxMinor !== null) confidence += 0.05;

  return {
    merchant,
    date,
    totalMinor,
    taxMinor,
    currency,
    items,
    confidence: Math.min(confidence, 1),
  };
}
