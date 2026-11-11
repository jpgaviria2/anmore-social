import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifiedTotals, zapPeriodWindow, sortPosts } from "../src/zaps.js";
import { collectReceipts } from "../src/receipts.js";
import { sign, keys, invoice } from "./zap-fixtures.js";

// Exact independent adversary construction: one request per target/amount,
// one payment hash, earliest duplicate outside the week, cross-post conflict.
const now = Date.parse("2026-11-11T20:00:00Z") / 1000;
const a = sign({ created_at: now - 1e6, content: "older" });
const b = sign({ created_at: now - 100, content: "newer" });
const authority = {
  issuer: sign({}, keys.issuer).pubkey,
  recipient: sign({}, keys.recipient).pubkey,
};
const boundary = zapPeriodWindow("week", now).start;
const requests = new Map();
function receipt(target, time, hash = "ab".repeat(32), sats = 21) {
  const rk = target.id + ":" + sats;
  if (!requests.has(rk)) requests.set(rk, sign({
    kind: 9734, created_at: boundary - 100,
    tags: [["e", target.id], ["p", authority.recipient], ["amount", String(sats * 1000)]],
  }, keys.sender));
  const description = JSON.stringify(requests.get(rk));
  return sign({ kind: 9735, created_at: time,
    tags: [["e", target.id], ["p", authority.recipient], ["description", description],
      ["bolt11", invoice(description, { time: boundary - 50, expiry: 1e7,
        paymentHash: hash, msats: BigInt(sats) * 1000n })]],
  }, keys.issuer);
}
const old = receipt(a, boundary - 1), inside = receipt(a, boundary + 1);
const later = receipt(a, boundary + 10), conflict = receipt(b, boundary + 2);
function Peer(events, fail = false) {
  return class extends EventTarget {
    constructor() {
      super(); this.readyState = 0;
      queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
    }
    send(raw) {
      const m = JSON.parse(raw); if (m[0] !== "REQ") return;
      queueMicrotask(() => {
        if (fail) this.dispatchEvent(new Event("error"));
        else for (const data of [...events.map(e => ["EVENT", "receipts", e]), ["EOSE", "receipts"]])
          this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
      });
    }
    close() { this.readyState = 3; }
  };
}
const local = { query: async () => [inside] };
test("missing peer recovery can reduce this week's observed 21 sats to zero via earliest duplicate", async () => {
  const partial = await collectReceipts([a, b], authority, local, Peer([], true), now);
  const full = await collectReceipts([a, b], authority, local, Peer([old]), now);
  assert.equal(partial.partial, true); assert.equal(full.partial, false);
  assert.equal(verifiedTotals(partial.receipts, [a, b], authority, now, "week").get(a.id), 21000n);
  assert.equal(verifiedTotals(full.receipts, [a, b], authority, now, "week").get(a.id) ?? 0n, 0n);
  assert.equal(full.totals.get(a.id), 21000n, "All time still counts the same payment once");
});
test("missing peer recovery can reduce all-time observed 21 sats to zero via payment conflict", async () => {
  const partial = await collectReceipts([a, b], authority, local, Peer([], true), now);
  const full = await collectReceipts([a, b], authority, local, Peer([conflict]), now);
  assert.equal(partial.partial, true); assert.equal(full.partial, false);
  assert.equal(partial.totals.get(a.id), 21000n); assert.equal(full.totals.size, 0);
  assert.deepEqual(sortPosts([b, a], partial.totals, "top").map(p => p.id), [a.id, b.id]);
  assert.deepEqual(sortPosts([b, a], full.totals, "top").map(p => p.id), [b.id, a.id]);
});
function permutations(xs) {
  return xs.length ? xs.flatMap((x, i) => permutations(xs.filter((_, j) => i !== j)).map(t => [x, ...t])) : [[]];
}
test("independent adversary permutations preserve earliest dedup and sticky conflict after later duplicates", () => {
  for (const rs of permutations([old, inside, later])) {
    assert.equal(verifiedTotals(rs, [a, b], authority, now, "week").size, 0);
    assert.equal(verifiedTotals(rs, [a, b], authority, now, "all").get(a.id), 21000n);
  }
  for (const rs of permutations([old, inside, conflict, later]))
    for (const period of ["all", "week", "month"])
      assert.equal(verifiedTotals(rs, [a, b], authority, now, period).size, 0);
});
test("snapshot and card presentation cannot promise monetary lower bounds on provisional observations", async () => {
  const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /≥|lower[- ]bounds?/i);
  assert.match(source, /Partial receipt check · totals\/order may change as receipts become available\./);
  assert.match(source, /sats.*provisional/);
});
