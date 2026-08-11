import { parseReceiptText, type ReceiptScan } from '../../domain/receipts/parse';
import type { ReceiptOcrProvider } from '../../ports/receipts';

/**
 * Local, deterministic OCR fallback. It parses plain-text receipts and is
 * always available, so the feature works without an external AI/vision
 * provider — which is exactly the MISSION2 rule that analytics must never
 * depend on an unconfigured third party.
 */
export class RuleBasedReceiptOcr implements ReceiptOcrProvider {
  readonly name = 'local';
  readonly configured = true;

  recognize(text: string): Promise<ReceiptScan> {
    return Promise.resolve(parseReceiptText(text));
  }
}

/**
 * Placeholder for a real vision/LLM provider (e.g. Google Vision, Tesseract,
 * or an on-device model). Fails closed until credentials are configured.
 */
export class UnconfiguredReceiptOcr implements ReceiptOcrProvider {
  readonly name = 'unconfigured';
  readonly configured = false;

  recognize(_text: string): Promise<ReceiptScan> {
    return Promise.reject(
      new Error('Receipt OCR is not configured on this server.'),
    );
  }
}
