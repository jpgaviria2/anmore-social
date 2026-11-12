import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function worker(
  fetcher = async () => {
    throw Error("offline");
  },
) {
  const handlers = {},
    removed = [],
    saved = [];
  let skipped = 0,
    claimed = 0;
  const self = {
    location: new URL("https://anmore.social/sw.js"),
    registration: { scope: "https://anmore.social/" },
    addEventListener: (k, fn) => (handlers[k] = fn),
    skipWaiting: async () => {
      skipped++;
    },
    clients: {
      claim: async () => {
        claimed++;
      },
    },
  };
  const cache = {
    addAll: async (paths) => saved.push(...paths),
    match: async () => new Response("offline"),
  };
  const caches = {
    open: async () => cache,
    keys: async () => [
      "anmore-social-pwa-old",
      "anmore-social-offline-v0",
      "unrelated-cache",
      "anmore-social-offline-v1",
    ],
    delete: async (key) => removed.push(key),
  };
  vm.runInNewContext(
    await readFile(new URL("../sw.js", import.meta.url), "utf8"),
    {
      self,
      caches,
      URL,
      Response,
      fetch: fetcher,
    },
  );
  const run = async (name) => {
    let p;
    handlers[name]({ waitUntil: (value) => (p = value) });
    await p;
  };
  return {
    handlers,
    run,
    removed,
    saved,
    skipped: () => skipped,
    claimed: () => claimed,
  };
}

test("owner-authorized offline worker installs only dedicated landing resources without skipWaiting", async () => {
  const w = await worker();
  await w.run("install");
  assert.deepEqual(w.saved, ["./offline.html", "./offline.css"]);
  assert.equal(w.skipped(), 0);
});

test("activation preserves unrelated and current caches while removing only own obsolete caches", async () => {
  const w = await worker();
  assert.equal(typeof w.handlers.activate, "function");
  await w.run("activate");
  assert.deepEqual(w.removed, [
    "anmore-social-pwa-old",
    "anmore-social-offline-v0",
  ]);
  assert.equal(w.claimed(), 1);
  assert.equal(w.skipped(), 0);
});

test("only root document navigation gets network-first dedicated offline fallback; payments and content bypass worker", async () => {
  const w = await worker();
  assert.equal(typeof w.handlers.fetch, "function");
  let response;
  w.handlers.fetch({
    request: {
      url: "https://anmore.social/?source=pwa",
      method: "GET",
      mode: "navigate",
    },
    respondWith: (p) => (response = p),
  });
  assert.equal(await (await response).text(), "offline");
  for (const [url, mode, method] of [
    ["https://pay.trailscoffee.com/callback", "navigate", "GET"],
    ["https://anmore.social/payment", "navigate", "GET"],
    ["https://anmore.social/?invoice=secret", "navigate", "GET"],
    ["https://anmore.social/?source=pwa&token=secret", "navigate", "GET"],
    ["https://anmore.social/.well-known/nostr.json", "cors", "GET"],
    ["https://anmore.social/app.js", "cors", "GET"],
    ["https://anmore.social/", "navigate", "POST"],
    ["lightning:invoice", "navigate", "GET"],
  ]) {
    let intercepted = false;
    w.handlers.fetch({
      request: { url, mode, method },
      respondWith: () => (intercepted = true),
    });
    assert.equal(intercepted, false, url);
  }
});

test("network-first returns live bytes and server errors unchanged without any runtime cache writes", async () => {
  for (const status of [200, 404, 503]) {
    let requests = 0;
    const w = await worker(async (request, options) => {
      requests++;
      assert.equal(options.cache, "no-store");
      return new Response("live-" + status, { status });
    });
    let result;
    w.handlers.fetch({
      request: {
        url: "https://anmore.social/",
        method: "GET",
        mode: "navigate",
      },
      respondWith: (p) => (result = p),
    });
    const response = await result;
    assert.equal(response.status, status);
    assert.equal(await response.text(), "live-" + status);
    assert.equal(requests, 1);
    assert.deepEqual(w.saved, []);
  }
});

test("only the explicit same-origin update message may skip waiting", async () => {
  const w = await worker();
  for (const event of [
    {
      data: { type: "SKIP_WAITING" },
      source: { url: "https://anmore.social/" },
    },
    {
      data: { type: "ACTIVATE_OFFLINE_UPDATE" },
      source: { url: "https://other.example/" },
    },
    { data: { type: "ACTIVATE_OFFLINE_UPDATE" } },
  ])
    w.handlers.message(event);
  assert.equal(w.skipped(), 0);
  let done;
  w.handlers.message({
    data: { type: "ACTIVATE_OFFLINE_UPDATE" },
    source: { url: "https://anmore.social/" },
    waitUntil: (p) => (done = p),
  });
  await done;
  assert.equal(w.skipped(), 1);
});
