import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
test("retirement worker removes only its own legacy caches and unregisters without caching content", async () => {
  const handlers = {},
    removed = [];
  let unregistered = false,
    claimed = false;
  const self = {
    addEventListener: (k, f) => (handlers[k] = f),
    skipWaiting: async () => {},
    clients: {
      claim: async () => {
        claimed = true;
      },
    },
    registration: {
      unregister: async () => {
        unregistered = true;
      },
    },
  };
  const caches = {
    keys: async () => ["anmore-social-pwa-old", "unrelated-cache"],
    delete: async (key) => removed.push(key),
  };
  vm.runInNewContext(
    await readFile(new URL("../sw.js", import.meta.url), "utf8"),
    { self, caches },
  );
  let completed;
  handlers.activate({ waitUntil: (p) => (completed = p) });
  await completed;
  assert.deepEqual(removed, ["anmore-social-pwa-old"]);
  assert.equal(unregistered, true);
  assert.equal(claimed, true);
  assert.equal(handlers.fetch, undefined);
});
