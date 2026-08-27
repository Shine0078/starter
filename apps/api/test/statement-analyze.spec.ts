import { zipSync } from 'fflate';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';

import { analyzeStatement, formatFor } from '../src/domain/statement-import/analyze';

const base = {
  currency: 'USD',
  existing: [],
  rules: [],
};

describe('statement analysis', () => {
  it('extracts CSV rows and holds ambiguous dates for review', async () => {
    const result = await analyzeStatement({
      ...base,
      filename: 'march.csv',
      mimeType: 'text/csv',
      bytes: Buffer.from('Date,Description,Amount\n03/04/2026,Grocery,-12.50'),
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.decision).toBe('needs_review');
    expect(result.rows[0]?.flags).toContain('ambiguous_date');
  });

  it('reads a bounded XLSX worksheet without evaluating formulas', async () => {
    const files = {
      'xl/sharedStrings.xml': Buffer.from('<sst><si><t>Date</t></si><si><t>Description</t></si><si><t>Amount</t></si><si><t>Grocery</t></si></sst>'),
      'xl/worksheets/sheet1.xml': Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>2026-03-01</t></is></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-12.50</v></c></row></sheetData></worksheet>'),
    };
    const result = await analyzeStatement({
      ...base,
      filename: 'march.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: Buffer.from(zipSync(files)),
    });
    expect(result.format).toBe('xlsx');
    expect(result.rows[0]?.amount).toBe(-1250);
    expect(result.rows[0]?.postedAt).toBe('2026-03-01');
  });

  it('extracts text from a PDF and never accepts an unrecognised format', async () => {
    const document = new PDFDocument();
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => document.on('end', () => resolve(Buffer.concat(chunks))));
    document.fontSize(12).text('2026-03-01 GROCERY MART -12.50');
    document.end();
    const result = await analyzeStatement({ ...base, filename: 'statement.pdf', mimeType: 'application/pdf', bytes: await done });
    expect(result.format).toBe('pdf');
    expect(result.rows[0]?.amount).toBe(-1250);
    expect(() => formatFor('statement.exe', 'application/octet-stream')).toThrow(/Supported statement formats/);
    await expect(analyzeStatement({ ...base, filename: 'statement.pdf', mimeType: 'application/pdf', bytes: Buffer.from('not a pdf') })).rejects.toThrow(/PDF signature/);
    await expect(analyzeStatement({ ...base, filename: 'statement.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: Buffer.from('not a workbook') })).rejects.toThrow(/ZIP-based workbook/);
  });

  it('rejects image payloads with an extension-only disguise', async () => {
    await expect(analyzeStatement({ ...base, filename: 'statement.png', mimeType: 'image/png', bytes: Buffer.from('not an image') })).rejects.toThrow(/image signature/);
  });

  it('keeps identical-looking legitimate rows distinct by source line', async () => {
    const result = await analyzeStatement({
      ...base,
      filename: 'duplicate-looking.csv',
      mimeType: 'text/csv',
      bytes: Buffer.from('Date,Description,Amount\n2026-03-01,COFFEE SHOP,-4.50\n2026-03-01,COFFEE SHOP,-4.50'),
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.fingerprint).not.toBe(result.rows[1]?.fingerprint);
  });

  it('uses only this user\'s approved manual corrections as a local model', async () => {
    const result = await analyzeStatement({
      ...base,
      existing: [{
        id: 'txn-correction', accountId: 'account', providerTxnId: 'provider', postedAt: '2026-02-01',
        amount: -700, currency: 'USD', rawDescriptor: 'ALPHA BETA GAMMA', normalizedDescriptor: 'alpha beta gamma',
        categorySlug: 'groceries', categorySource: 'user_manual', categoryConfidence: 1, isRecurring: false, pending: false,
      }],
      filename: 'learned.csv',
      mimeType: 'text/csv',
      bytes: Buffer.from('Date,Description,Amount\n2026-03-01,ALPHA BETA GAMMA,-8.00'),
    });
    expect(result.rows[0]?.categorySlug).toBe('groceries');
    expect(result.rows[0]?.categorySource).toBe('model');
    expect(result.rows[0]?.categoryConfidence).toBeGreaterThan(0.6);
  });
});
