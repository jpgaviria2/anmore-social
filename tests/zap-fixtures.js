import { finalizeEvent } from "nostr-tools/pure";
import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils";
export const NOW = 1794370000;
export const keys = {
  sender: new Uint8Array(32).fill(9),
  recipient: new Uint8Array(32).fill(8),
  issuer: new Uint8Array(32).fill(7),
  author: new Uint8Array(32).fill(6),
};
export const sign = (data, key = keys.author) =>
  finalizeEvent(
    { kind: 1, created_at: NOW - 10, content: "", tags: [], ...data },
    key,
  );
const digits = (n) => {
  n = BigInt(n);
  const a = [];
  do {
    a.unshift(Number(n % 32n));
    n /= 32n;
  } while (n);
  return a;
};
const padded = (words) => {
  let bits = 0,
    value = 0;
  const a = [];
  for (const w of words) {
    value = (value << 5) | w;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      a.push((value >>> bits) & 255);
    }
  }
  if (bits) a.push((value << (8 - bits)) & 255);
  return Uint8Array.from(a);
};
export function invoice(
  description,
  {
    msats = 21000n,
    paymentHash = "11".repeat(32),
    time = NOW - 5,
    expiry = 3600,
    network = "bc",
    extra = [],
    omit = [],
    payee = false,
    replace = {},
  } = {},
) {
  const prefix = `ln${network}${msats * 10n}p`;
  const hex = (s) =>
    Uint8Array.from(s.match(/../g).map((x) => parseInt(x, 16)));
  const fields = [
    [1, bech32.toWords(hex(paymentHash))],
    [16, bech32.toWords(new Uint8Array(32).fill(2))],
    [23, bech32.toWords(sha256(utf8ToBytes(description)))],
    [6, digits(expiry)],
    ...extra,
  ];
  if (payee)
    fields.push([19, bech32.toWords(secp256k1.getPublicKey(keys.issuer))]);
  const words = [
    ...Array(7 - digits(time).length).fill(0),
    ...digits(time),
    ...fields
      .map(([t, w]) => [t, replace[t] ?? w])
      .filter(([t]) => !omit.includes(t))
      .flatMap(([t, w]) => [t, w.length >>> 5, w.length & 31, ...w]),
  ];
  const hash = sha256(concatBytes(utf8ToBytes(prefix), padded(words)));
  const sig = secp256k1.sign(hash, keys.issuer);
  return bech32.encode(
    prefix,
    [
      ...words,
      ...bech32.toWords(
        concatBytes(sig.toCompactRawBytes(), new Uint8Array([sig.recovery])),
      ),
    ],
    10000,
  );
}
export const hashText = (text) => bytesToHex(sha256(utf8ToBytes(text)));
