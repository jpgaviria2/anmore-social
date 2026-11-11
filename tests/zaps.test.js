import test from "node:test";
import assert from "node:assert/strict";
import * as zaps from "../src/zaps.js";
import { invoice, NOW, hashText, keys, sign } from "./zap-fixtures.js";
import { bech32 } from "@scure/base";
const pubkey = sign({}, keys.recipient).pubkey;
const issuer = sign({}, keys.issuer).pubkey;
const authority = {
  recipient: pubkey,
  issuer,
  checkedAt: NOW,
  min: 1000,
  max: 100000000000,
};
test("recipient must have an exact signed lud16 and authoritative directory association, never address suffix or receipt issuer", async () => {
  const profile = sign(
    {
      kind: 0,
      content: JSON.stringify({
        nip05: "community@trailscoffee.com",
        lud16: zaps.COMMUNITY_ADDRESS,
      }),
    },
    keys.recipient,
  );
  const queries = [];
  const relay = {
    query: async (filters) => {
      queries.push(filters);
      return filters[0].kinds[0] === 0 ? [profile] : [];
    },
  };
  const fetcher = async (url) =>
    new Response(
      JSON.stringify(
        url.includes("nostr.json")
          ? { names: { community: pubkey } }
          : {
              tag: "payRequest",
              allowsNostr: true,
              nostrPubkey: issuer,
              callback: zaps.PAY_CALLBACK,
              minSendable: 1000,
              maxSendable: 100000000000,
            },
      ),
    );
  assert.equal(
    (await zaps.resolveCommunity(relay, fetcher, NOW)).recipient,
    pubkey,
  );
  await assert.rejects(
    zaps.resolveCommunity({ query: async () => [] }, fetcher, NOW),
    /recipient/i,
  );
  await assert.rejects(
    zaps.resolveCommunity(
      {
        query: async () => [
          sign(
            {
              ...profile,
              content: JSON.stringify({
                nip05: "community@trailscoffee.com",
                lud16: "different@pay.trailscoffee.com",
              }),
            },
            keys.recipient,
          ),
        ],
      },
      fetcher,
      NOW,
    ),
    /recipient/i,
  );
  assert.equal(queries.filter((f) => f[0].kinds[0] === 0).length, 1);
});
test("one explicit post zap creates an exact signed request and accepts only its bound invoice", async () => {
  const post = sign({ content: "Community update" });
  let calls = 0,
    request;
  const fetcher = async (url) => {
    calls++;
    const u = new URL(url);
    request = JSON.parse(u.searchParams.get("nostr"));
    assert.equal(u.origin + u.pathname, zaps.PAY_CALLBACK);
    assert.equal(u.searchParams.get("amount"), "21000");
    assert.equal(request.kind, 9734);
    assert.equal(request.tags.find((t) => t[0] === "e")[1], post.id);
    assert.equal(request.tags.find((t) => t[0] === "p")[1], pubkey);
    return new Response(
      JSON.stringify({ pr: invoice(u.searchParams.get("nostr")) }),
    );
  };
  const result = await zaps.createZap(post, authority, "21", fetcher, NOW);
  assert.equal(result.uri, "lightning:" + result.invoice);
  assert.equal(result.postId, post.id);
  assert.equal(calls, 1);
  await assert.rejects(
    zaps.createZap(
      post,
      { ...authority, checkedAt: NOW - 61 },
      "21",
      fetcher,
      NOW,
    ),
  );
  assert.equal(calls, 1, "expired authority must perform zero callback I/O");
  await assert.rejects(
    zaps.createZap(
      post,
      authority,
      "21",
      async () =>
        new Response(JSON.stringify({ pr: invoice("different request") })),
      NOW,
    ),
    /binding/,
  );
});
test("receipts require approved issuer, signed exact post and recipient, invoice amount/hash; payment hashes deduplicate across events", () => {
  const post = sign({ content: "Community update" });
  const request = sign(
    {
      kind: 9734,
      tags: [
        ["e", post.id],
        ["p", pubkey],
        ["amount", "21000"],
        [
          "lnurl",
          bech32.encode(
            "lnurl",
            bech32.toWords(new TextEncoder().encode(zaps.PAY_ENDPOINT)),
            2000,
          ),
        ],
        ["relays", "wss://relay.anmore.me"],
      ],
    },
    keys.sender,
  );
  const description = JSON.stringify(request),
    bolt11 = invoice(description);
  const receipt = sign(
    {
      kind: 9735,
      created_at: NOW - 1,
      tags: [
        ["e", post.id],
        ["p", pubkey],
        ["description", description],
        ["bolt11", bolt11],
      ],
    },
    keys.issuer,
  );
  assert.equal(
    zaps.verifiedTotals([receipt], [post], authority, NOW).get(post.id),
    21000n,
  );
  const duplicate = sign({ ...receipt, created_at: NOW }, keys.issuer);
  assert.equal(
    zaps
      .verifiedTotals([receipt, duplicate], [post], authority, NOW)
      .get(post.id),
    21000n,
  );
  for (const bad of [
    sign({ ...receipt }, keys.author),
    sign({ ...receipt, tags: [...receipt.tags, ["e", post.id]] }, keys.issuer),
    sign(
      {
        ...receipt,
        tags: receipt.tags.map((t) => (t[0] === "p" ? ["p", issuer] : t)),
      },
      keys.issuer,
    ),
    sign(
      {
        ...receipt,
        tags: receipt.tags.map((t) =>
          t[0] === "bolt11"
            ? ["bolt11", invoice(description, { msats: 22000n })]
            : t,
        ),
      },
      keys.issuer,
    ),
    { ...receipt, sig: "f".repeat(128) },
  ]) {
    assert.equal(
      zaps.verifiedTotals([bad], [post], authority, NOW).get(post.id) ?? 0n,
      0n,
    );
  }
  assert.equal(
    zaps.verifiedTotals([receipt], [], authority, NOW).size,
    0,
    "removed post cannot be counted",
  );
});
test("post invoice reader verifies exact hash, amount, mainnet, signature and expiry", () => {
  const i = invoice("exact serialized request");
  const parsed = zaps.readInvoice(i);
  assert.equal(parsed.msats, 21000n);
  assert.equal(parsed.descriptionHash, hashText("exact serialized request"));
  assert.equal(parsed.paymentHash, "11".repeat(32));
  assert.equal(parsed.expiresAt, NOW - 5 + 3600);
  assert.throws(() => zaps.readInvoice(i.slice(0, -1) + "q"));
  for (const options of [
    { network: "tb" },
    { omit: [16] },
    { omit: [23] },
    { extra: [[23, Array(52).fill(1)]] },
    { extra: [[5, [1, 0, 0, 0, 0, 0, 0]]] },
    { msats: 1n },
  ]) {
    assert.throws(
      () => zaps.readInvoice(invoice("x", options)),
      JSON.stringify(options, (_, v) =>
        typeof v === "bigint" ? String(v) : v,
      ),
    );
  }
  assert.equal(zaps.readInvoice(invoice("x", { payee: true })).msats, 21000n);
});
test("Top zapped is explicit and deterministic; Newest remains default and input is immutable", () => {
  const posts = [
    { id: "b", created_at: 20 },
    { id: "a", created_at: 20 },
    { id: "c", created_at: 10 },
  ];
  const totals = new Map([
    ["c", 21000n],
    ["b", 0n],
  ]);
  assert.deepEqual(
    zaps.sortPosts(posts, totals).map((e) => e.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    zaps.sortPosts(posts, totals, "top").map((e) => e.id),
    ["c", "a", "b"],
  );
  assert.equal(posts[0].id, "b");
});
