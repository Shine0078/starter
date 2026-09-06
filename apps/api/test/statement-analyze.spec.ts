import { zipSync } from 'fflate';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';

import { analyzeStatement, extractStatementDetails, formatFor } from '../src/domain/statement-import/analyze';

const base = {
  currency: 'USD',
  existing: [],
  rules: [],
};

describe('statement analysis', () => {
  it('keeps only safe issuer, masked account, and period metadata', () => {
    expect(extractStatementDetails(
      'CIBC Aventura Visa Card\nAccount number 4502 XXXX XXXX 7175\nStatement Date August 24, 2026\nAugust statement period July 25 to August 24, 2026',
      'CAD',
    )).toEqual({
      issuer: 'CIBC',
      accountReferenceLast4: '7175',
      statementDate: '2026-08-24',
      periodStart: '2026-07-25',
      periodEnd: '2026-08-24',
      currency: 'CAD',
    });
  });

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

  it('normalizes Excel serial dates in recognized date columns', async () => {
    const files = {
      'xl/sharedStrings.xml': Buffer.from('<sst><si><t>Transaction Date</t></si><si><t>Description</t></si><si><t>Amount</t></si><si><t>Grocery</t></si></sst>'),
      'xl/worksheets/sheet1.xml': Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2"><v>46082</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-12.50</v></c></row></sheetData></worksheet>'),
    };
    const result = await analyzeStatement({
      ...base,
      filename: 'serial-date.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: Buffer.from(zipSync(files)),
    });
    expect(result.rows[0]?.postedAt).toBe('2026-03-01');
  });

  it('decodes XLSX XML entities once without double-unescaping', async () => {
    const files = {
      'xl/sharedStrings.xml': Buffer.from('<sst><si><t>Date</t></si><si><t>Description</t></si><si><t>Amount</t></si><si><t>AT&amp;amp;lt;B</t></si></sst>'),
      'xl/worksheets/sheet1.xml': Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>2026-03-01</t></is></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-12.50</v></c></row></sheetData></worksheet>'),
    };
    const result = await analyzeStatement({
      ...base,
      filename: 'nested-entities.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes: Buffer.from(zipSync(files)),
    });
    expect(result.rows[0]?.description).toBe('AT&amp;lt;B');
  });

  it('rejects XLSX ZIP metadata that would exceed the decompression budget', async () => {
    const bytes = Buffer.from(zipSync({
      'xl/worksheets/sheet1.xml': Buffer.from('<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData></worksheet>'),
    }));
    const centralDirectory = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(centralDirectory).toBeGreaterThan(0);
    // Keep the payload tiny while advertising an unsafe expansion size.
    bytes.writeUInt32LE(11 * 1024 * 1024, centralDirectory + 24);
    await expect(analyzeStatement({
      ...base,
      filename: 'bomb.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes,
    })).rejects.toThrow(/decompressed size exceeds/);
  });

  it('rejects worksheet cell references beyond Excel\'s XFD column limit', async () => {
    const bytes = Buffer.from(zipSync({
      'xl/worksheets/sheet1.xml': Buffer.from('<worksheet><sheetData><row r="1"><c r="XFE1"><v>1</v></c></row></sheetData></worksheet>'),
    }));
    await expect(analyzeStatement({
      ...base,
      filename: 'wide.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      bytes,
    })).rejects.toThrow(/XFD limit/);
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

  it('reads card statements with textual dates and treats positive charges as debits', async () => {
    const document = new PDFDocument();
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => document.on('end', () => resolve(Buffer.concat(chunks))));
    document.fontSize(10).text([
      'CIBC Credit Card',
      'Statement Date August 24, 2026',
      'Aug 01 Aug 04 APPLE.COM/BILL TORONTO ON Retail and Grocery 7.33',
      'Aug 18 Aug 19 PRESTO FARE/SGPLLHX68L TORONTO ON Transportation 4.85',
      'Aug 19 Aug 21 McDonalds 40024 OSHAWA ON Restaurants 2.10',
    ].join('\n'));
    document.end();

    const result = await analyzeStatement({
      ...base,
      currency: 'CAD',
      filename: 'card-statement.pdf',
      mimeType: 'application/pdf',
      bytes: await done,
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.postedAt)).toEqual([
      '2026-08-01', '2026-08-18', '2026-08-19',
    ]);
    expect(result.rows.map((row) => row.amount)).toEqual([-733, -485, -210]);
    expect(result.rows.map((row) => row.direction)).toEqual(['debit', 'debit', 'debit']);
    expect(result.rows.map((row) => row.decision)).toEqual(['include', 'include', 'include']);
    expect(result.rows.map((row) => row.categorySlug)).toEqual(['subscriptions', 'transportation', 'fast_food']);
  });

  it('reads signed Neo-style card rows without counting card payments as income', async () => {
    const document = new PDFDocument();
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => document.on('end', () => resolve(Buffer.concat(chunks))));
    document.fontSize(10).text([
      'Neo Financial Card Account',
      '•••• 5837',
      'Statement period July 16 to August 14, 2026',
      'Transaction Date Posted Date Description Amount ($CAD)',
      'Aug 08 Aug 08 Payment Received, Thank you 989.95',
      'Aug 07 Aug 08 WAL-MART #3161 OSHAWA CAN -39.37',
      'Aug 07 Aug 07 OPENAI *CHATGPT SUBSCR SAN FRANCISCO USA -28.25',
    ].join('\n'));
    document.end();

    const result = await analyzeStatement({
      ...base,
      currency: 'CAD',
      filename: 'neo-statement.pdf',
      mimeType: 'application/pdf',
      bytes: await done,
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((row) => row.categorySlug)).toEqual([
      'credit_card_payment', 'groceries', 'software',
    ]);
    expect(result.rows.map((row) => row.amount)).toEqual([98995, -3937, -2825]);
    expect(result.rows.every((row) => row.decision === 'include')).toBe(true);
    expect(result.documentDetails).toEqual({
      issuer: 'Neo Financial',
      accountReferenceLast4: '5837',
      statementDate: null,
      periodStart: '2026-07-16',
      periodEnd: '2026-08-14',
      currency: 'CAD',
    });
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
