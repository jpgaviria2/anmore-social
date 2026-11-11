import test from "node:test";
import assert from "node:assert/strict";
import { verifiedTotals, COMMUNITY_LNURL } from "../src/zaps.js";
import { sign, keys, NOW, invoice } from "./zap-fixtures.js";
const post = sign({ content: "bound post" });
const authority = {
  recipient: sign({}, keys.recipient).pubkey,
  issuer: sign({}, keys.issuer).pubkey,
};
function receipt(tags) {
  const request = sign(
    {
      kind: 9734,
      tags: [
        ["p", authority.recipient],
        ["e", post.id],
        ["amount", "21000"],
        ...tags,
      ],
    },
    keys.sender,
  );
  const description = JSON.stringify(request);
  return sign(
    {
      kind: 9735,
      created_at: NOW - 1,
      tags: [
        ["p", authority.recipient],
        ["e", post.id],
        ["description", description],
        ["bolt11", invoice(description)],
      ],
    },
    keys.issuer,
  );
}
test("normative external request without optional lnurl counts; notification relays are never authority", () => {
  const r = receipt([["relays", "wss://relay.primal.net", "wss://nos.lol"]]);
  assert.equal(
    verifiedTotals([r, r], [post], authority, NOW).get(post.id),
    21000n,
  );
  for (const tags of [
    [
      ["relays", "wss://relay.primal.net"],
      ["lnurl", "wrong"],
    ],
    [
      ["relays", "wss://relay.primal.net"],
      ["lnurl", COMMUNITY_LNURL],
      ["lnurl", COMMUNITY_LNURL],
    ],
  ])
    assert.equal(
      verifiedTotals([receipt(tags)], [post], authority, NOW).size,
      0,
    );
  assert.equal(
    verifiedTotals(
      [
        receipt([
          ["relays", "wss://relay.primal.net"],
          ["lnurl", COMMUNITY_LNURL],
        ]),
      ],
      [post],
      authority,
      NOW,
    ).get(post.id),
    21000n,
  );
});
