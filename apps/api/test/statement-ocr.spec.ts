import { describe, expect, it, vi } from 'vitest';

const screenshotCalls: Array<Record<string, unknown>> = [];

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    async getText() { return { text: '' }; }
    async getScreenshot(options: Record<string, unknown>) {
      screenshotCalls.push(options);
      return { pages: [{ data: new Uint8Array([137, 80, 78, 71]) }] };
    }
    async destroy() {}
  },
}));

vi.mock('tesseract.js', () => ({
  createWorker: async () => ({
    recognize: async () => ({ data: { text: '2026-04-01 ACME PAYROLL 1500.00' } }),
    terminate: async () => {},
  }),
}));

import { analyzeStatement } from '../src/domain/statement-import/analyze';

describe('statement OCR fallback', () => {
  it('renders a bounded scanned PDF and sends the page image through OCR', async () => {
    screenshotCalls.length = 0;
    const result = await analyzeStatement({
      filename: 'scanned-statement.pdf',
      mimeType: 'application/pdf',
      bytes: Buffer.from('%PDF-1.7 scanned'),
      currency: 'USD',
      existing: [],
      rules: [],
    });

    expect(screenshotCalls[0]).toMatchObject({
      first: 20,
      desiredWidth: 1600,
      imageBuffer: true,
      imageDataUrl: false,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      postedAt: '2026-04-01',
      description: 'ACME PAYROLL',
      amount: 150000,
      categorySlug: 'salary',
    });
  });
});
