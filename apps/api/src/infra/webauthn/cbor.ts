/**
 * Minimal CBOR decoder — just enough to read a WebAuthn attestation object.
 *
 * Authenticator bytes are infrastructure, so this lives here rather than in
 * the pure domain. It supports the subset CBOR uses in FIDO2 attestations:
 * unsigned ints, byte strings, text strings, arrays, maps (including the
 * indefinite-length maps the WebAuthn spec mandates for the COSE key), booleans,
 * and the `null` marker.
 */

export type CborValue =
  | number
  | bigint
  | boolean
  | null
  | Uint8Array
  | string
  | CborValue[]
  | Map<CborValue, CborValue>;

const MAX_CBOR_BYTES = 24 * 1024;
const MAX_CBOR_DEPTH = 16;
const MAX_CBOR_ITEMS = 1_024;

export function decodeCbor(data: Uint8Array): CborValue {
  if (data.length === 0 || data.length > MAX_CBOR_BYTES) {
    throw new Error('CBOR: input size is outside the supported WebAuthn bounds');
  }
  let offset = 0;
  let decodedItems = 0;
  const value = decode(0);
  if (offset !== data.length) throw new Error('CBOR: trailing input');
  return value;

  function takeByte(): number {
    if (offset >= data.length) throw new Error('CBOR: truncated input');
    return data[offset++]!;
  }

  function decode(depth: number): CborValue {
    if (depth > MAX_CBOR_DEPTH) throw new Error('CBOR: maximum nesting depth exceeded');
    decodedItems += 1;
    if (decodedItems > MAX_CBOR_ITEMS) throw new Error('CBOR: item limit exceeded');
    const initial = takeByte();
    const major = initial >> 5;
    let additional = initial & 0x1f;

    let value: number | bigint;
    if (additional < 24) {
      value = additional;
    } else if (additional === 24) {
      value = takeByte();
    } else if (additional === 25) {
      value = (takeByte() << 8) | takeByte();
    } else if (additional === 26) {
      value =
        (takeByte() * 2 ** 24) +
        (takeByte() * 2 ** 16) +
        (takeByte() * 2 ** 8) +
        takeByte();
    } else if (additional === 27) {
      let n = 0n;
      for (let i = 0; i < 8; i += 1) n = n * 256n + BigInt(takeByte());
      value = n;
    } else if (additional === 31) {
      value = -1; // indefinite length marker handled by callers
    } else {
      throw new Error('CBOR: unsupported additional info');
    }

    switch (major) {
      case 0:
        return Number(value);
      case 1:
        return -1 - Number(value);
      case 2: {
        const length = Number(value);
        if (length < 0) throw new Error('CBOR: indefinite byte strings not supported');
        if (offset + length > data.length) throw new Error('CBOR: truncated byte string');
        const bytes = data.subarray(offset, offset + length);
        offset += length;
        return bytes;
      }
      case 3: {
        const length = Number(value);
        if (offset + length > data.length) throw new Error('CBOR: truncated text string');
        const text = Buffer.from(data.subarray(offset, offset + length)).toString('utf8');
        offset += length;
        return text;
      }
      case 4: {
        const length = Number(value);
        if (length < 0) throw new Error('CBOR: indefinite arrays not supported');
        if (length > MAX_CBOR_ITEMS - decodedItems) throw new Error('CBOR: item limit exceeded');
        const items: CborValue[] = [];
        for (let i = 0; i < length; i += 1) items.push(decode(depth + 1));
        return items;
      }
      case 5: {
        const map = new Map<CborValue, CborValue>();
        if (additional === 31) {
          while (true) {
            const next = data[offset];
            if (next === 0xff) {
              offset += 1;
              break;
            }
            const key = decode(depth + 1);
            map.set(key, decode(depth + 1));
          }
        } else {
          const length = Number(value);
          for (let i = 0; i < length; i += 1) {
            const key = decode(depth + 1);
            map.set(key, decode(depth + 1));
          }
        }
        return map;
      }
      case 6:
        // Tag: skip the tag, return the tagged item.
        return decode(depth + 1);
      case 7:
        if (additional === 20) return false;
        if (additional === 21) return true;
        if (additional === 22) return null;
        throw new Error('CBOR: unsupported simple value');
      default:
        throw new Error('CBOR: unsupported major type');
    }
  }
}
