import test from "node:test";
import assert from "node:assert/strict";
import { finalizeEvent } from "nostr-tools/pure";
const core = await import("../src/core.js").catch(() => ({}));
const key = new Uint8Array(32).fill(1);
export const signed = (fields = {}) =>
  finalizeEvent(
    { kind: 1, created_at: 100, tags: [], content: "Hello Anmore", ...fields },
    key,
  );
test("canonical event accepts relay indexed_at but rejects changed signatures and future dates", () => {
  assert.equal(
    typeof core.validEvent,
    "function",
    "validation implementation is missing",
  );
  const e = signed();
  assert.ok(core.validEvent({ ...e, indexed_at: 999 }, 200));
  assert.equal(core.validEvent({ ...e, content: "forged" }, 200), false);
  assert.equal(core.validEvent(signed({ created_at: 201 }), 200), false);
  assert.equal(core.validEvent({ ...e, tags: [[null]] }, 200), false);
  assert.equal(core.validEvent({ ...e, created_at: 1.2 }, 200), false);
});

test("identity admission is dynamic, exact, signed and bound to HTTPS names mapping", async () => {
  assert.equal(typeof core.identify, "function");
  const profile = signed({
    kind: 0,
    content: JSON.stringify({
      name: "River neighbour",
      nip05: "new.name-7@trailscoffee.com",
    }),
  });
  let url, options;
  const fetcher = async (u, o) => {
    url = u;
    options = o;
    return {
      ok: true,
      json: async () => ({
        names: { "new.name-7": profile.pubkey },
        relays: { [profile.pubkey]: ["wss://evil.example"] },
      }),
    };
  };
  assert.equal(
    (await core.identify(profile, fetcher, 200)).nip05,
    "new.name-7@trailscoffee.com",
  );
  assert.equal(
    url,
    "https://trailscoffee.com/.well-known/nostr.json?name=new.name-7",
  );
  assert.equal(options.redirect, "error");
  assert.equal(options.credentials, "omit");
  for (const nip05 of [
    "x@eviltrailscoffee.com",
    "x@trailscoffee.com.evil",
    "x@TRAILSCOFFEE.COM",
    "x@trailscoffee.com ",
    "x@@trailscoffee.com",
    "a+b@trailscoffee.com",
  ]) {
    assert.equal(
      await core.identify(
        signed({ kind: 0, content: JSON.stringify({ nip05 }) }),
        () => {
          throw Error("must not fetch");
        },
        200,
      ),
      null,
    );
  }
  assert.equal(
    await core.identify(
      profile,
      async () => ({
        ok: true,
        json: async () => ({ names: { "new.name-7": "f".repeat(64) } }),
      }),
      200,
    ),
    null,
  );
  assert.equal(
    await core.identify({ ...profile, content: "{}" }, fetcher, 200),
    null,
  );
  await assert.rejects(
    () =>
      core.identify(
        profile,
        async () => {
          throw Error("network unavailable");
        },
        200,
      ),
    /network unavailable/,
  );
});

test("chronology deduplicates, rejects invalid input, applies author deletions and addressable updates", () => {
  assert.equal(typeof core.visibleEvents, "function");
  const a = signed({ created_at: 90 }),
    b = signed({ created_at: 95, content: "newer" });
  const foreign = finalizeEvent(
    { kind: 5, created_at: 100, content: "", tags: [["e", b.id]] },
    new Uint8Array(32).fill(2),
  );
  assert.deepEqual(
    core.visibleEvents([a, b, a, foreign], 200).map((e) => e.id),
    [b.id, a.id],
  );
  const deletion = signed({ kind: 5, created_at: 100, tags: [["e", b.id]] });
  assert.deepEqual(
    core.visibleEvents([a, b, deletion], 200).map((e) => e.id),
    [a.id],
  );
  const old = signed({ kind: 31922, tags: [["d", "walk"]], created_at: 70 });
  const revision = signed({
    kind: 31922,
    tags: [["d", "walk"]],
    created_at: 80,
  });
  const del = signed({
    kind: 5,
    tags: [["a", `31922:${old.pubkey}:walk`]],
    created_at: 75,
  });
  assert.deepEqual(
    core.visibleEvents([old, revision, del], 200).map((e) => e.id),
    [revision.id],
  );
  const tie = signed({
    kind: 31922,
    tags: [["d", "walk"]],
    created_at: 80,
    content: "tie",
  });
  assert.equal(
    core.visibleEvents([old, revision, tie], 200)[0].id,
    [revision.id, tie.id].sort()[0],
  );
  assert.equal(
    core.visibleEvents(
      [signed({ created_at: 201 }), { ...b, sig: "0".repeat(128) }],
      200,
    ).length,
    0,
  );
});

test("calendar parser handles Pacific dates, invalid dates, upcoming times and expired events", () => {
  assert.equal(typeof core.calendarInfo, "function");
  const e = signed({
    kind: 31922,
    tags: [
      ["d", "day"],
      ["title", "Village day"],
      ["start", "2026-11-11"],
    ],
  });
  assert.equal(core.calendarInfo(e, 1794370000).date, "2026-11-11");
  assert.equal(
    core.calendarInfo(
      signed({
        kind: 31922,
        tags: [
          ["d", "x"],
          ["title", "bad"],
          ["start", "2026-02-30"],
        ],
      }),
      1794370000,
    ),
    null,
  );
  assert.equal(
    core.calendarInfo(
      signed({
        kind: 31923,
        tags: [
          ["d", "x"],
          ["title", "past"],
          ["start", "100"],
        ],
      }),
      200,
    ),
    null,
  );
  assert.equal(
    core.calendarInfo(
      signed({
        kind: 31923,
        tags: [
          ["d", "x"],
          ["title", "future"],
          ["start", "300"],
          ["end", "250"],
        ],
      }),
      200,
    ),
    null,
  );
});
test("safe HTTPS URLs reject executable URLs, credentials and local hosts", () => {
  assert.equal(typeof core.safeURL, "function");
  assert.equal(
    core.safeURL("https://example.com/photo.jpg"),
    "https://example.com/photo.jpg",
  );
  for (const u of [
    "javascript:alert(1)",
    "data:text/html,x",
    "http://example.com",
    "https://u:p@example.com",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://192.168.1.1/a",
    "https://[::1]/a",
  ])
    assert.equal(core.safeURL(u), null);
});

test("e deletion removes an exact same-author ID regardless of its timestamp, while a deletion preserves later revisions", () => {
  const e = signed({ created_at: 100 });
  const deletion = signed({ kind: 5, created_at: 90, tags: [["e", e.id]] });
  assert.equal(core.visibleEvents([e, deletion], 200).length, 0);
  const old = signed({ kind: 31922, created_at: 70, tags: [["d", "x"]] });
  const aDelete = signed({
    kind: 5,
    created_at: 75,
    tags: [["a", `31922:${old.pubkey}:x`]],
  });
  const next = signed({ kind: 31922, created_at: 80, tags: [["d", "x"]] });
  assert.deepEqual(
    core.visibleEvents([old, aDelete, next, old], 200).map((e) => e.id),
    [next.id],
  );
  assert.equal(
    core.visibleEvents([old, aDelete, { ...next, sig: "0".repeat(128) }], 200)
      .length,
    0,
  );
});

test("empty tag arrays are malformed and uppercase NIP-05 local names are not normalized", async () => {
  const e = signed({ tags: [[]] });
  assert.equal(core.validEvent(e, 200), false);
  assert.equal(
    await core.identify(
      signed({
        kind: 0,
        content: JSON.stringify({ nip05: "New@trailscoffee.com" }),
      }),
      () => {
        throw Error("must not fetch");
      },
      200,
    ),
    null,
  );
});
test("forged deletion signatures cannot hide real posts; latest profile tie is deterministic", () => {
  const note = signed();
  const del = signed({ kind: 5, tags: [["e", note.id]] });
  assert.deepEqual(
    core
      .visibleEvents([note, { ...del, sig: "0".repeat(128) }], 200)
      .map((e) => e.id),
    [note.id],
  );
  const a = signed({ kind: 0, content: '{"nip05":"a@trailscoffee.com"}' }),
    b = signed({ kind: 0, content: '{"nip05":"b@trailscoffee.com"}' });
  assert.equal(
    core.latestProfile([a, b], a.pubkey, 200).id,
    [a.id, b.id].sort()[0],
  );
});
