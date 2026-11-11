import test from "node:test";
import assert from "node:assert/strict";
import { bech32 } from "@scure/base";
import { readInvoice } from "../src/invoice.js";
import { createZap, verifiedTotals, COMMUNITY_LNURL } from "../src/zaps.js";
import { invoice, sign, keys, NOW } from "./zap-fixtures.js";
const authority = {
  recipient: sign({}, keys.recipient).pubkey,
  issuer: sign({}, keys.issuer).pubkey,
  checkedAt: NOW,
  min: 1000,
  max: 100000000000,
};
const badSecret = bech32.toWords(new Uint8Array(32).fill(2));
badSecret[51] |= 1;
test("signed checksummed payment secret with nonzero u5 padding is rejected", () => {
  const malformed = invoice("padding regression", {
    replace: { 16: badSecret },
  });
  assert.throws(() => readInvoice(malformed), /padding|malformed/i);
});
test("all fixed byte fields reject nonzero padding and accept canonical padding", () => {
  assert.equal(
    readInvoice(invoice("canonical", { payee: true })).msats,
    21000n,
  );
  for (const type of [1, 16, 23, 19]) {
    const data = bech32.toWords(new Uint8Array(type === 19 ? 33 : 32).fill(2));
    for (const bit of type === 19 ? [1] : [1, 2, 4, 8]) {
      const malformed = [...data];
      malformed[malformed.length - 1] |= bit;
      assert.throws(
        () =>
          readInvoice(
            invoice("padding regression", {
              payee: true,
              replace: { [type]: malformed },
            }),
          ),
        /padding|malformed/i,
        `type=${type}, bit=${bit}`,
      );
    }
  }
});
test("malformed secret cannot reach createZap wallet/QR handoff or verified receipt totals", async () => {
  const post = sign({ content: "post" });
  await assert.rejects(
    createZap(
      post,
      authority,
      "21",
      async (url) =>
        new Response(
          JSON.stringify({
            pr: invoice(new URL(url).searchParams.get("nostr"), {
              replace: { 16: badSecret },
            }),
          }),
        ),
      NOW,
    ),
    /padding|malformed/i,
  );
  const request = sign(
    {
      kind: 9734,
      tags: [
        ["p", authority.recipient],
        ["e", post.id],
        ["amount", "21000"],
        ["lnurl", COMMUNITY_LNURL],
      ],
    },
    keys.sender,
  );
  const description = JSON.stringify(request);
  const receipt = sign(
    {
      kind: 9735,
      created_at: NOW - 1,
      tags: [
        ["p", authority.recipient],
        ["e", post.id],
        ["description", description],
        ["bolt11", invoice(description, { replace: { 16: badSecret } })],
      ],
    },
    keys.issuer,
  );
  assert.equal(verifiedTotals([receipt], [post], authority, NOW).size, 0);
});
