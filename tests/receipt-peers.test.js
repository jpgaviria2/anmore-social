import test from "node:test";
import assert from "node:assert/strict";
import * as peers from "../src/receipts.js";
import { sign, keys, NOW, invoice } from "./zap-fixtures.js";
const post = sign({});
const authority = {
  issuer: sign({}, keys.issuer).pubkey,
  recipient: sign({}, keys.recipient).pubkey,
};
const request = sign(
  {
    kind: 9734,
    tags: [
      ["p", authority.recipient],
      ["e", post.id],
      ["relays", "wss://never-follow.example"],
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
      ["bolt11", invoice(description)],
    ],
  },
  keys.issuer,
);
const frames = [];
let failPublic = false;
class Socket extends EventTarget {
  constructor(url) {
    super();
    this.readyState = 0;
    assert.equal(url, "wss://relay.primal.net");
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(raw) {
    const m = JSON.parse(raw);
    frames.push(m);
    if (m[0] !== "REQ") return;
    assert.deepEqual(m[2].kinds, [9735]);
    assert.deepEqual(m[2]["#e"], [post.id]);
    queueMicrotask(() => {
      if (failPublic) {
        this.dispatchEvent(new Event("error"));
        return;
      }
      for (const data of [
        ["EVENT", m[1], receipt],
        ["EVENT", m[1], post],
        ["EOSE", m[1]],
      ])
        this.dispatchEvent(
          new MessageEvent("message", { data: JSON.stringify(data) }),
        );
    });
  }
  close() {
    this.readyState = 3;
  }
}
test("two receipt-only peers dedupe events and preserve provenance, one healthy peer survives failure", async () => {
  assert.equal(typeof peers.collectReceipts, "function");
  let localCalls = 0;
  const duplicate = sign({ ...receipt, created_at: NOW }, keys.issuer);
  const local = {
    query: async (filters) => {
      localCalls++;
      assert.deepEqual(filters[0]["#e"], [post.id]);
      return [receipt, duplicate];
    },
  };
  const result = await peers.collectReceipts(
    [post],
    authority,
    local,
    Socket,
    NOW,
  );
  assert.equal(result.receipts.length, 2);
  assert.equal(result.provenance.get(receipt.id).size, 2);
  assert.equal(result.partial, false);
  assert.equal(result.totals.get(post.id), 21000n);
  const offline = {
    query: async () => {
      throw Error("offline");
    },
  };
  const publicOnly = await peers.collectReceipts(
    [post],
    authority,
    offline,
    Socket,
    NOW,
  );
  assert.equal(publicOnly.partial, true);
  assert.equal(publicOnly.totals.get(post.id), 21000n);
  failPublic = true;
  const localOnly = await peers.collectReceipts(
    [post],
    authority,
    local,
    Socket,
    NOW,
  );
  assert.equal(localOnly.partial, true);
  assert.equal(localOnly.totals.get(post.id), 21000n);
  await assert.rejects(
    peers.collectReceipts([post], authority, offline, Socket, NOW),
    /unavailable/,
  );
  const empty = await peers.collectReceipts([], authority, local, Socket, NOW);
  assert.equal(empty.receipts.length, 0);
  assert.equal(localCalls, 2);
  assert.ok(frames.every((m) => ["REQ", "CLOSE"].includes(m[0])));
});

test("a stalled receipt peer has a four-second total deadline while healthy Anmore remains usable", async () => {
  let publicClosed = false;
  class Stalled extends EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
      });
    }
    send(raw) {
      assert.ok(["REQ", "CLOSE"].includes(JSON.parse(raw)[0]));
    }
    close() {
      this.readyState = 3;
      publicClosed = true;
    }
  }
  const started = Date.now();
  let localStarted = false;
  const result = await peers.collectReceipts(
    [post],
    authority,
    {
      query: async (_filters, timeout) => {
        assert.equal(timeout, 4000);
        localStarted = true;
        return [receipt];
      },
    },
    Stalled,
    NOW,
  );
  assert.equal(localStarted, true);
  assert.equal(publicClosed, true);
  assert.ok(Date.now() - started >= 3900 && Date.now() - started < 5500);
  assert.equal(result.partial, true);
  assert.equal(result.totals.get(post.id), 21000n);
});

test("receipt peer aggregate bytes are bounded before parsing or signature work", async () => {
  class Flood extends EventTarget {
    constructor() {
      super();
      this.readyState = 0;
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
      });
    }
    send(raw) {
      if (JSON.parse(raw)[0] !== "REQ") return;
      queueMicrotask(() => {
        for (let i = 0; i < 10; i++)
          this.dispatchEvent(
            new MessageEvent("message", { data: "[]" + " ".repeat(1000000) }),
          );
        this.dispatchEvent(
          new MessageEvent("message", {
            data: JSON.stringify(["EOSE", "receipts"]),
          }),
        );
      });
    }
    close() {
      this.readyState = 3;
    }
  }
  const result = await peers.collectReceipts(
    [post],
    authority,
    { query: async () => [receipt] },
    Flood,
    NOW,
  );
  assert.equal(result.partial, true);
  assert.equal(result.totals.get(post.id), 21000n);
});

test("invalid or over-cap target snapshots perform no receipt I/O", async () => {
  let calls = 0;
  class Forbidden {
    constructor() {
      calls++;
      throw Error("unexpected I/O");
    }
  }
  const local = {
    query: async () => {
      calls++;
      return [];
    },
  };
  await assert.rejects(
    peers.collectReceipts(
      [{ ...post, sig: "f".repeat(128) }],
      authority,
      local,
      Forbidden,
      NOW,
    ),
    /Invalid/,
  );
  await assert.rejects(
    peers.collectReceipts(
      Array(1201).fill(post),
      authority,
      local,
      Forbidden,
      NOW,
    ),
    /Invalid/,
  );
  assert.equal(calls, 0);
});
