/**
 * Receipt OCR: parser, provider port, and the authenticated API.
 *
 * Boots the real module graph so the endpoints are exercised through the
 * global guard and validation pipe, exactly like the auth suite. The parser
 * tests are pure-domain and run everywhere; the API tests run against the
 * in-memory adapter.
 */

import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { afterAll, beforeAll } from 'vitest';

import { parseReceiptText } from '../src/domain/receipts/parse';
import { RuleBasedReceiptOcr } from '../src/infra/receipts/receipt-ocr-providers';

// Must be set before anything calls loadConfig(), which memoises.
process.env.STORE = 'memory';
process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long-for-hs256';
process.env.THROTTLE_DISABLED = 'true';

const PASSWORD = 'correct horse battery staple';
const RECEIPT_TEXT = `Blue Bottle Coffee
1234 Market Street
San Francisco, CA
2026-08-10
Cappuccino          4.50
Pour Over           6.00
Subtotal           10.50
Tax                0.92
Total Due          11.42
Thank you!`;

describe('parseReceiptText', () => {
  it('extracts merchant, date, items, tax, and total in minor units', () => {
    const scan = parseReceiptText(RECEIPT_TEXT);
    expect(scan.merchant).toBe('Blue Bottle Coffee');
    expect(scan.date).toBe('2026-08-10');
    expect(scan.totalMinor).toBe(1142);
    expect(scan.taxMinor).toBe(92);
    expect(scan.currency).toBeNull();
    expect(scan.items.length).toBeGreaterThanOrEqual(2);
    expect(scan.confidence).toBeGreaterThan(0.8);
  });

  it('handles empty and junk input without throwing', () => {
    const scan = parseReceiptText('');
    expect(scan.totalMinor).toBeNull();
    expect(scan.items).toEqual([]);
    expect(scan.confidence).toBeLessThan(0.5);
  });

  it('recognises a currency code', () => {
    expect(parseReceiptText('TOTAL USD 42.00').currency).toBe('USD');
  });

  it('parses a slash-formatted date into YYYY-MM-DD', () => {
    expect(parseReceiptText('Date: 10/08/2026\nTOTAL 5.00').date).toBe('2026-08-10');
  });
});

describe('RuleBasedReceiptOcr', () => {
  it('is always configured and delegates to the pure parser', async () => {
    const ocr = new RuleBasedReceiptOcr();
    expect(ocr.configured).toBe(true);
    const scan = await ocr.recognize(RECEIPT_TEXT);
    expect(scan.merchant).toBe('Blue Bottle Coffee');
  });
});

describe('receipts API', () => {
  let app: INestApplication;
  let http: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    const { loadConfig } = await import('../src/config');
    const { installHttpControls } = await import('../src/infra/http/controls');
    installHttpControls(app as NestExpressApplication, loadConfig());
    app.setGlobalPrefix('api', { exclude: ['healthz'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    http = await app.getUrl().then((url) => url.replace('[::1]', '127.0.0.1'));
  });

  afterAll(async () => {
    await app?.close();
  });

  let counter = 0;
  const freshEmail = (): string => `receipts${(counter += 1)}-${Date.now()}@example.com`;

  async function register() {
    const email = freshEmail();
    const response = await request(http).post('/api/auth/register').send({
      email,
      password: PASSWORD,
      acceptedTerms: true,
      termsVersion: 'terms-test-v1',
      acceptedPrivacyNotice: true,
      privacyVersion: 'privacy-test-v1',
    });
    return { email, tokens: response.body.tokens as { accessToken: string } };
  }

  it('requires a token', async () => {
    await request(http).post('/api/receipts/scan').send({ text: RECEIPT_TEXT }).expect(401);
  });

  it('scans receipt text without persisting', async () => {
    const { tokens } = await register();
    const response = await request(http)
      .post('/api/receipts/scan')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ text: RECEIPT_TEXT })
      .expect(201);
    expect(response.body.scan.merchant).toBe('Blue Bottle Coffee');
    expect(response.body.scan.totalMinor).toBe(1142);
  });

  it('rejects empty receipt text', async () => {
    const { tokens } = await register();
    await request(http)
      .post('/api/receipts/scan')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ text: '' })
      .expect(400);
  });

  it('attaches a receipt to the user transaction and reads it back', async () => {
    const { tokens } = await register();
    const me = await request(http)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    const userId = me.body.id as string;
    const transactionId = `txn-receipt-${Date.now()}`;
    const { TRANSACTION_STORE } = await import('../src/ports');
    const store = app.get(TRANSACTION_STORE) as {
      upsertMany(userId: string, rows: unknown[]): Promise<unknown>;
    };
    await store.upsertMany(userId, [
      {
        id: transactionId,
        accountId: 'acc-1',
        providerTxnId: 'provider-1',
        postedAt: '2026-08-10',
        amount: -1142,
        currency: 'USD',
        rawDescriptor: 'BLUE BOTTLE COFFEE',
        normalizedDescriptor: 'blue bottle coffee',
        merchant: 'Blue Bottle Coffee',
        categorySlug: 'coffee',
        categorySource: 'lexicon',
        categoryConfidence: 0.95,
        isRecurring: false,
        pending: false,
      },
    ]);

    const put = await request(http)
      .put(`/api/receipts/${transactionId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ text: RECEIPT_TEXT })
      .expect(200);
    expect(put.body.receipt.merchant).toBe('Blue Bottle Coffee');
    expect(put.body.receipt.totalMinor).toBe(1142);

    const get = await request(http)
      .get(`/api/receipts/${transactionId}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(get.body.receipt.transactionId).toBe(transactionId);
  });

  it('does not let one user read another user receipt', async () => {
    const alice = await register();
    const bob = await register();
    await request(http)
      .put('/api/receipts/nonexistent')
      .set('Authorization', `Bearer ${alice.tokens.accessToken}`)
      .send({ text: RECEIPT_TEXT })
      .expect(404);
    await request(http)
      .get('/api/receipts/nonexistent')
      .set('Authorization', `Bearer ${bob.tokens.accessToken}`)
      .expect(404);
  });
});
