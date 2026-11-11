import test from "node:test";
import assert from "node:assert/strict";
import { finalizeEvent } from "nostr-tools/pure";
const module = await import("../src/relay.js").catch(() => ({}));
class Socket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.readyState = 0;
    this.sent = [];
    Socket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = 1;
      this.emit("open", {});
    });
  }
  addEventListener(k, fn) {
    (this.listeners[k] ??= []).push(fn);
  }
  emit(k, value) {
    for (const fn of this.listeners[k] ?? []) fn(value);
  }
  send(raw) {
    const msg = JSON.parse(raw);
    this.sent.push(msg);
    if (msg[0] === "REQ")
      queueMicrotask(() => {
        this.emit("message", {
          data: JSON.stringify([
            "EVENT",
            msg[1],
            finalizeEvent(
              { kind: 1, created_at: 100, content: "local", tags: [] },
              new Uint8Array(32).fill(1),
            ),
          ]),
        });
        this.emit("message", { data: JSON.stringify(["EOSE", msg[1]]) });
      });
  }
  close() {
    this.readyState = 3;
    this.emit("close", {});
  }
}
test("one pinned read-only relay enforces filters and closes subscriptions at EOSE", async () => {
  assert.equal(typeof module.Relay, "function");
  const relay = new module.Relay(Socket);
  await relay.open();
  assert.equal(Socket.instances.at(-1).url, "wss://relay.anmore.me");
  assert.equal((await relay.query([{ kinds: [1], limit: 5 }])).length, 1);
  assert.equal((await relay.query([{ kinds: [0], limit: 1 }])).length, 0);
  assert.ok(
    Socket.instances.at(-1).sent.every((m) => ["REQ", "CLOSE"].includes(m[0])),
  );
  assert.equal(
    Socket.instances.at(-1).sent.filter((m) => m[0] === "CLOSE").length,
    2,
  );
  relay.close();
});
