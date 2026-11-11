import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
import { secp256k1 } from "@noble/curves/secp256k1";
const integer = (words) => words.reduce((n, w) => n * 32n + BigInt(w), 0n);
// The signing message pads the unsigned u5 payload to whole bytes.
function padded(words) {
  let bits = 0,
    value = 0;
  const bytes = [];
  for (const w of words) {
    value = (value << 5) | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  if (bits) bytes.push((value << (8 - bits)) & 255);
  return Uint8Array.from(bytes);
}
export const hashText = (text) => bytesToHex(sha256(utf8ToBytes(text)));
// Deliberately strict BOLT11 subset for whole-satoshi, mainnet, hashed-description zaps.
// This does not initiate or authorize a payment. Historical receipts are checked at paid_at.
export function readInvoice(invoice) {
  if (typeof invoice !== "string" || invoice.length > 8192)
    throw Error("Invalid invoice");
  const { prefix, words } = bech32.decode(invoice, 8192);
  const m = /^lnbc([1-9][0-9]*)([munp]?)$/.exec(prefix);
  if (!m || words.length < 111) throw Error("Mainnet amount invoice required");
  let msats = BigInt(m[1]);
  if (m[2] === "p") {
    if (msats % 10n) throw Error("Fractional millisatoshi");
    msats /= 10n;
  } else
    msats *= { m: 100000000n, u: 100000n, n: 100n, "": 100000000000n }[m[2]];
  if (msats <= 0n || msats % 1000n || msats > BigInt(Number.MAX_SAFE_INTEGER))
    throw Error("Whole-satoshi amount out of range");
  const unsigned = words.slice(0, -104),
    signature = bech32.fromWords(words.slice(-104));
  const fields = new Map();
  for (let i = 7; i < unsigned.length; ) {
    if (i + 3 > unsigned.length) throw Error("Truncated invoice");
    const type = unsigned[i],
      len = unsigned[i + 1] * 32 + unsigned[i + 2];
    i += 3;
    if (i + len > unsigned.length) throw Error("Truncated field");
    const data = unsigned.slice(i, i + len);
    i += len;
    if ([1, 16, 23, 19, 6, 24, 5, 13, 27].includes(type)) {
      if (fields.has(type)) throw Error("Duplicate invoice field");
      fields.set(type, data);
    }
  }
  for (const [type, length] of [
    [1, 52],
    [16, 52],
    [23, 52],
    [19, 53],
  ]) {
    const f = fields.get(type);
    if ((type !== 19 && !f) || (f && f.length !== length))
      throw Error("Missing or malformed invoice field");
    // Decode every fixed-size field, including the otherwise opaque payment
    // secret: correct u5 length alone does not reject nonzero tail padding.
    if (f) {
      const decoded = bech32.fromWords(f);
      if (decoded.length !== (type === 19 ? 33 : 32))
        throw Error("Malformed invoice field");
    }
  }
  if (fields.has(13)) throw Error("Hashed description required");
  for (const type of [6, 24, 5])
    if (
      fields.has(type) &&
      (!fields.get(type).length || fields.get(type)[0] === 0)
    )
      throw Error("Nonminimal integer");
  // Known invoice features: variable onion, payment secret, MPP, payment metadata.
  const features = integer(fields.get(5) ?? []);
  for (let bit = 0; bit < 5120; bit += 2)
    if (features & (1n << BigInt(bit)) && ![8, 14, 16, 48].includes(bit))
      throw Error("Unsupported required feature");
  const has = (bit) => (features & (3n << BigInt(bit))) !== 0n;
  if ((has(16) && !has(14)) || (has(48) && !fields.has(27)))
    throw Error("Feature dependency missing");
  const hash = sha256(concatBytes(utf8ToBytes(prefix), padded(unsigned)));
  if (signature.length !== 65 || signature[64] > 3)
    throw Error("Invalid invoice signature");
  const sig = secp256k1.Signature.fromCompact(signature.slice(0, 64));
  const n = fields.get(19);
  const publicKey = n
    ? bech32.fromWords(n)
    : sig.addRecoveryBit(signature[64]).recoverPublicKey(hash).toRawBytes(true);
  if (!secp256k1.verify(sig, hash, publicKey, { lowS: !!n }))
    throw Error("Invalid invoice signature");
  const timestamp = integer(unsigned.slice(0, 7)),
    expiry = fields.has(6) ? integer(fields.get(6)) : 3600n;
  if (timestamp + expiry > BigInt(Number.MAX_SAFE_INTEGER) || expiry === 0n)
    throw Error("Invalid expiry");
  return {
    msats,
    paymentHash: bytesToHex(bech32.fromWords(fields.get(1))),
    descriptionHash: bytesToHex(bech32.fromWords(fields.get(23))),
    timestamp: Number(timestamp),
    expiresAt: Number(timestamp + expiry),
  };
}
