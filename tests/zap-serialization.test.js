import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyEvent } from "nostr-tools/pure";
import { createZap } from "../src/zaps.js";
import { invoice, sign, keys, NOW, hashText } from "./zap-fixtures.js";
const authority = {
  recipient: sign({}, keys.recipient).pubkey,
  issuer: sign({}, keys.issuer).pubkey,
  checkedAt: NOW,
  min: 1000,
  max: 100000000000,
};
// nostr 0.43.1 EventIntermediate serde field order (primary source).
const producerJSON = ({ id, pubkey, created_at, kind, tags, content, sig }) =>
  JSON.stringify({ id, pubkey, created_at, kind, tags, content, sig });
test("retained primary Rust nostr 0.43.1 serializer fixture is signature-valid and byte-identical", () => {
  const raw = readFileSync(
    new URL("./fixtures/nostr-0.43.1-request.txt", import.meta.url),
    "utf8",
  );
  assert.ok(verifyEvent(JSON.parse(raw)));
  assert.equal(producerJSON(JSON.parse(raw)), raw);
});
test("canonical request still rejects invoice amount, timestamp and expiry mismatches", async () => {
  for (const options of [
    { msats: 22000n },
    { time: NOW - 61 },
    { time: NOW + 61 },
    { time: NOW - 5, expiry: 1 },
  ]) {
    await assert.rejects(
      createZap(
        sign({ content: "post" }),
        authority,
        "21",
        async (url) =>
          new Response(
            JSON.stringify({
              pr: invoice(new URL(url).searchParams.get("nostr"), options),
            }),
          ),
        NOW,
      ),
      /binding/,
    );
  }
});
test("production zap sends bytes already equal to producer serialization before invoice hashing", async () => {
  let sent;
  const result = await createZap(
    sign({ content: "post" }),
    authority,
    "21",
    async (url) => {
      sent = new URL(url).searchParams.get("nostr");
      const event = JSON.parse(sent);
      assert.ok(verifyEvent(event));
      assert.equal(event.content, "");
      assert.ok(event.tags.flat().every((x) => /^[\x20-\x7e]*$/.test(x)));
      assert.equal(sent, producerJSON(event));
      return new Response(JSON.stringify({ pr: invoice(producerJSON(event)) }));
    },
    NOW,
  );
  assert.equal(result.serialized, sent);
  assert.equal(result.descriptionHash, hashText(sent));
  assert.ok(verifyEvent(JSON.parse(result.serialized)));
});
test("semantically identical signed event with changed raw bytes still fails invoice binding", async () => {
  await assert.rejects(
    createZap(
      sign({ content: "post" }),
      authority,
      "21",
      async (url) => {
        const sent = new URL(url).searchParams.get("nostr");
        const changed = JSON.stringify(JSON.parse(sent), null, 1);
        assert.ok(verifyEvent(JSON.parse(changed)));
        assert.notEqual(hashText(changed), hashText(sent));
        return new Response(JSON.stringify({ pr: invoice(changed) }));
      },
      NOW,
    ),
    /binding/,
  );
});
