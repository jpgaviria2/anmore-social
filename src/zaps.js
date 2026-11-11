import { bech32 } from "@scure/base";
import { secp256k1 } from "@noble/curves/secp256k1";
import { generateSecretKey, finalizeEvent } from "nostr-tools/pure";
import { RELAY, validEvent, latestProfile } from "./core.js";
import { readInvoice, hashText } from "./invoice.js";
export { readInvoice } from "./invoice.js";
export const COMMUNITY_ADDRESS = "coffeeloverc2c2cd@pay.trailscoffee.com";
export const PAY_ENDPOINT =
  "https://pay.trailscoffee.com/.well-known/lnurlp/coffeeloverc2c2cd";
export const PAY_CALLBACK =
  "https://pay.trailscoffee.com/lnurlp/coffeeloverc2c2cd/invoice";
export const COMMUNITY_LNURL = bech32.encode(
  "lnurl",
  bech32.toWords(new TextEncoder().encode(PAY_ENDPOINT)),
  2000,
);
const hex = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
export async function boundedJSON(url, fetcher = fetch) {
  const response = await fetcher(url, {
    redirect: "error",
    credentials: "omit",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw Error(
      `Zap service returned HTTP ${response.status}. No payment was sent.`,
    );
  const reader = response.body?.getReader();
  if (!reader) throw Error("Zap service response unavailable");
  let size = 0;
  const parts = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072)
        throw Error("Zap service response exceeded safety limit");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function resolveCommunity(
  relay,
  fetcher = fetch,
  now = Math.floor(Date.now() / 1000),
) {
  const directory = await boundedJSON(
    "https://trailscoffee.com/.well-known/nostr.json",
    fetcher,
  );
  if (!directory?.names || Array.isArray(directory.names))
    throw Error("Community recipient directory unavailable");
  const entries = Object.entries(directory.names);
  if (
    entries.length > 128 ||
    entries.some(([n, p]) => !/^[a-z0-9_.-]+$/.test(n) || !hex(p))
  )
    throw Error("Community recipient directory exceeds safety contract");
  const authors = [...new Set(entries.map(([, p]) => p))];
  const profiles = [];
  for (let i = 0; i < authors.length; i += 16)
    profiles.push(
      ...(await relay.query(
        authors
          .slice(i, i + 16)
          .map((pubkey) => ({ kinds: [0], authors: [pubkey], limit: 1 })),
      )),
    );
  const matches = [];
  for (const pubkey of authors) {
    const profile = latestProfile(profiles, pubkey, now);
    if (!profile) continue;
    let metadata;
    try {
      metadata = JSON.parse(profile.content);
    } catch {
      continue;
    }
    if (
      metadata?.lud16 !== COMMUNITY_ADDRESS ||
      typeof metadata.nip05 !== "string" ||
      !/^[a-z0-9_.-]+@trailscoffee\.com$/.test(metadata.nip05)
    )
      continue;
    const name = metadata.nip05.split("@")[0];
    if (directory.names[name] !== pubkey) continue;
    matches.push(profile);
  }
  if (matches.length !== 1)
    throw Error(
      "Community recipient is not yet verifiable: a current signed profile must bind the exact Lightning address to its directory identity.",
    );
  const profile = matches[0];
  const deletions = await relay.query([
    { kinds: [5], authors: [profile.pubkey], limit: 500 },
  ]);
  if (
    deletions.length >= 500 ||
    deletions.some(
      (d) =>
        validEvent(d, now) &&
        d.pubkey === profile.pubkey &&
        d.tags.some(
          (t) =>
            (t[0] === "e" && t[1] === profile.id) ||
            (t[0] === "a" &&
              t[1] === `0:${profile.pubkey}:` &&
              d.created_at >= profile.created_at),
        ),
    )
  )
    throw Error("Community recipient profile deletion check failed");
  const endpoint = await boundedJSON(PAY_ENDPOINT, fetcher);
  if (
    endpoint?.tag !== "payRequest" ||
    endpoint.allowsNostr !== true ||
    !hex(endpoint.nostrPubkey) ||
    endpoint.callback !== PAY_CALLBACK ||
    !Number.isSafeInteger(endpoint.minSendable) ||
    !Number.isSafeInteger(endpoint.maxSendable) ||
    endpoint.minSendable < 1 ||
    endpoint.maxSendable < endpoint.minSendable ||
    endpoint.maxSendable > Number.MAX_SAFE_INTEGER
  )
    throw Error(
      "Community endpoint does not support the approved zap contract",
    );
  try {
    secp256k1.ProjectivePoint.fromHex("02" + endpoint.nostrPubkey);
  } catch {
    throw Error("Invalid receipt issuer key");
  }
  return {
    recipient: profile.pubkey,
    profileId: profile.id,
    issuer: endpoint.nostrPubkey,
    min: endpoint.minSendable,
    max: endpoint.maxSendable,
    checkedAt: now,
  };
}
function one(event, name, required = true) {
  const tags = event.tags.filter((t) => t[0] === name);
  if (tags.length === 0 && !required) return undefined;
  if (tags.length !== 1 || tags[0].length !== 2)
    throw Error("Ambiguous zap tag");
  return tags[0][1];
}
export function zapAmount(sats, authority) {
  if (typeof sats !== "string" || !/^[1-9][0-9]{0,8}$/.test(sats))
    throw Error("Enter a whole-satoshi amount.");
  const msats = BigInt(sats) * 1000n;
  if (
    !authority ||
    msats < BigInt(authority.min) ||
    msats > BigInt(authority.max)
  )
    throw Error("Amount is outside the receiving service range.");
  return msats;
}
export async function createZap(
  post,
  authority,
  sats,
  fetcher = fetch,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    !validEvent(post, now) ||
    ![1, 20].includes(post.kind) ||
    !authority ||
    !hex(authority.recipient) ||
    !hex(authority.issuer) ||
    authority.checkedAt > now ||
    now - authority.checkedAt > 60
  )
    throw Error("Refresh to recheck the post and community recipient.");
  const msats = zapAmount(sats, authority);
  const key = generateSecretKey();
  let request;
  try {
    request = finalizeEvent(
      {
        kind: 9734,
        created_at: now,
        content: "",
        tags: [
          ["p", authority.recipient],
          ["e", post.id],
          ["k", String(post.kind)],
          ["amount", String(msats)],
          ["lnurl", COMMUNITY_LNURL],
          ["relays", RELAY],
        ],
      },
      key,
    );
  } finally {
    key.fill(0);
  }
  // Construct producer-compatible bytes BEFORE sending or binding an invoice.
  // nostr 0.43.1 serializes EventIntermediate in this order. This request has
  // empty content and ASCII-only fixed tags, so JSON.stringify also matches
  // serde_json escaping. Never normalize a response or accept a different hash.
  const serialized = JSON.stringify({
      id: request.id,
      pubkey: request.pubkey,
      created_at: request.created_at,
      kind: request.kind,
      tags: request.tags,
      content: request.content,
      sig: request.sig,
    }),
    url = new URL(PAY_CALLBACK);
  url.searchParams.set("amount", String(msats));
  url.searchParams.set("nostr", serialized);
  url.searchParams.set("lnurl", COMMUNITY_LNURL);
  const result = await boundedJSON(url.href, fetcher);
  if (typeof result?.pr !== "string")
    throw Error(
      "The community service did not return a zap invoice. No payment was sent.",
    );
  const parsed = readInvoice(result.pr);
  if (
    parsed.msats !== msats ||
    parsed.descriptionHash !== hashText(serialized) ||
    parsed.timestamp < now - 60 ||
    parsed.timestamp > now + 60 ||
    parsed.expiresAt <= now
  )
    throw Error("Zap invoice binding failed. No payment was sent.");
  return {
    invoice: result.pr,
    uri: "lightning:" + result.pr,
    postId: post.id,
    request,
    serialized,
    msats,
    ...parsed,
  };
}
export function verifiedTotals(
  receipts,
  posts,
  authority,
  now = Math.floor(Date.now() / 1000),
) {
  const targets = new Map(posts.map((e) => [e.id, e])),
    payments = new Map(),
    totals = new Map();
  if (!authority) return totals;
  for (const receipt of receipts) {
    try {
      if (
        receipt.kind !== 9735 ||
        receipt.pubkey !== authority.issuer ||
        !validEvent(receipt, now)
      )
        continue;
      const postId = one(receipt, "e"),
        post = targets.get(postId);
      if (
        !post ||
        one(receipt, "p") !== authority.recipient ||
        receipt.tags.some((t) => t[0] === "a")
      )
        continue;
      const description = one(receipt, "description"),
        request = JSON.parse(description),
        parsed = readInvoice(one(receipt, "bolt11"));
      if (
        request.kind !== 9734 ||
        !validEvent(request, now) ||
        one(request, "e") !== postId ||
        one(request, "p") !== authority.recipient ||
        one(request, "lnurl") !== COMMUNITY_LNURL ||
        request.tags.some((t) => t[0] === "a")
      )
        continue;
      const amount = one(request, "amount", false),
        kind = one(request, "k", false),
        sender = one(receipt, "P", false);
      if (
        (amount !== undefined &&
          (!/^[1-9][0-9]*$/.test(amount) || BigInt(amount) !== parsed.msats)) ||
        (kind !== undefined && kind !== String(post.kind)) ||
        (sender !== undefined && sender !== request.pubkey)
      )
        continue;
      if (
        parsed.descriptionHash !== hashText(description) ||
        request.created_at > receipt.created_at ||
        parsed.timestamp > receipt.created_at ||
        parsed.expiresAt < receipt.created_at
      )
        continue;
      const payment = {
        postId,
        msats: parsed.msats,
        descriptionHash: parsed.descriptionHash,
      };
      const previous = payments.get(parsed.paymentHash);
      if (
        previous &&
        (previous.postId !== postId ||
          previous.msats !== payment.msats ||
          previous.descriptionHash !== payment.descriptionHash)
      )
        payments.set(parsed.paymentHash, { conflict: true });
      else if (!previous) payments.set(parsed.paymentHash, payment);
    } catch {
      /* Unverifiable claims never contribute to a monetary total. */
    }
  }
  for (const p of payments.values())
    if (!p.conflict)
      totals.set(p.postId, (totals.get(p.postId) ?? 0n) + p.msats);
  return totals;
}

export function sortPosts(posts, totals, mode = "newest") {
  return [...posts].sort((a, b) => {
    const aa = totals.get(a.id) ?? 0n,
      bb = totals.get(b.id) ?? 0n;
    return (
      (mode === "top" && aa !== bb ? (aa > bb ? -1 : 1) : 0) ||
      b.created_at - a.created_at ||
      a.id.localeCompare(b.id)
    );
  });
}
