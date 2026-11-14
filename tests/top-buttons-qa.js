import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { finalizeEvent } from "nostr-tools/pure";
import { invoice, keys } from "./zap-fixtures.js";
import {
  COMMUNITY_ADDRESS,
  PAY_ENDPOINT,
  PAY_CALLBACK,
  COMMUNITY_LNURL,
} from "../src/zaps.js";
import { PNG } from "pngjs";
import jsQR from "jsqr";
const dir = new URL("../qa/", import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const key = new Uint8Array(32).fill(3),
  now = Date.parse("2026-11-11T20:00:00Z") / 1000;
const sign = (x) =>
  finalizeEvent(
    { kind: 1, created_at: now - 10, tags: [], content: "", ...x },
    key,
  );
const profile = sign({
  kind: 0,
  content: JSON.stringify({
    display_name: "A new neighbour",
    nip05: "any.neighbour-9@trailscoffee.com",
  }),
});
const posts = [
  sign({
    content:
      "A little closer to home.\nA good morning on the trails, and a warm welcome to everyone finding their way here. https://example.com/forest.jpg",
  }),
  sign({
    created_at: now - 20,
    content:
      "<img src=x onerror=alert(1)> javascript:alert(2) " +
      "A neighbourhood notice. ".repeat(70),
  }),
  sign({ created_at: now - 30, content: "An older update from the village." }),
];
posts.push(
  ...Array.from({ length: 12 }, (_, i) =>
    sign({
      created_at: now - 40 - i,
      content: `Earlier community update ${i + 1}. A moment from around the village.`,
    }),
  ),
);
const calendar = sign({
  kind: 31923,
  tags: [
    ["d", "community-walk"],
    ["title", "A walk with neighbours"],
    ["start", String(now + 86400)],
    ["location", "Meet at the village green"],
  ],
  content: "Everyone is welcome. Bring a warm layer.",
});
let mode = "normal";
let peerOnlyReceipts = [];
const missingSourceIds = new Set(), missingOnExactRead = new Set();
let holdNextFeed = false,
  resumeFeed;
const communityProfile = finalizeEvent(
  {
    kind: 0,
    created_at: now - 10,
    content: JSON.stringify({
      nip05: "community@trailscoffee.com",
      lud16: COMMUNITY_ADDRESS,
    }),
    tags: [],
  },
  keys.recipient,
);
const zapReceipt = (post, sats, receivedAt = now - 1, paymentHash = post.id) => {
  const request = finalizeEvent(
    {
      kind: 9734,
      created_at: receivedAt - 10,
      content: "",
      tags: [
        ["p", communityProfile.pubkey],
        ["e", post.id],
        ["amount", String(sats * 1000)],
        ["lnurl", COMMUNITY_LNURL],
        ["relays", "wss://relay.anmore.me"],
      ],
    },
    keys.sender,
  );
  const description = JSON.stringify(request);
  return finalizeEvent(
    {
      kind: 9735,
      created_at: receivedAt,
      content: "",
      tags: [
        ["p", communityProfile.pubkey],
        ["e", post.id],
        ["description", description],
        [
          "bolt11",
          invoice(description, {
            msats: BigInt(sats) * 1000n,
            time: receivedAt - 5,
            paymentHash,
          }),
        ],
      ],
    },
    keys.issuer,
  );
};
const receipts = [
  zapReceipt(posts[2], 21),
  zapReceipt(posts[0], 7),
  zapReceipt(posts[14], 1250),
];
let callbacks = 0,
  lastInvoice;
const deletion = sign({
  kind: 5,
  created_at: now - 1,
  tags: [
    ["e", posts[0].id],
    ["k", "1"],
  ],
});
const requests = [],
  errors = [];
const context = await browser.newContext();
await context.route(
  "https://trailscoffee.com/.well-known/nostr.json",
  (route) =>
    route.fulfill({
      json: {
        names: {
          community: communityProfile.pubkey,
          "any.neighbour-9": profile.pubkey,
        },
      },
    }),
);
await context.route(PAY_ENDPOINT, (route) =>
  route.fulfill({
    json: {
      tag: "payRequest",
      allowsNostr: true,
      nostrPubkey: receipts[0].pubkey,
      callback: PAY_CALLBACK,
      minSendable: 1000,
      maxSendable: 100000000000,
    },
  }),
);
await context.route(PAY_CALLBACK + "?*", (route) => {
  callbacks++;
  const url = new URL(route.request().url());
  const description = url.searchParams.get("nostr");
  const request = JSON.parse(description);
  assert.equal(
    request.tags.find((t) => t[0] === "p")[1],
    communityProfile.pubkey,
  );
  assert.equal(request.tags.find((t) => t[0] === "e")[1], posts[2].id);
  assert.equal(url.searchParams.get("lnurl"), COMMUNITY_LNURL);
  lastInvoice = invoice(
    mode === "invoice-mismatch" ? "wrong request" : description,
    {
      msats: BigInt(url.searchParams.get("amount")),
      time: Math.floor(Date.now() / 1000),
    },
  );
  return route.fulfill({ json: { pr: lastInvoice } });
});
await context.route(
  "https://trailscoffee.com/.well-known/nostr.json?name=*",
  (route) =>
    mode === "identity-failure"
      ? route.abort("failed")
      : route.fulfill({
          json: {
            names: {
              "any.neighbour-9":
                mode === "mismatch" ? "f".repeat(64) : profile.pubkey,
            },
          },
        }),
);
await context.route("https://example.com/forest.jpg", (route) =>
  route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700"><rect width="1200" height="700" fill="#839d89"/><path d="M0 700L300 150 600 700M400 700L800 50 1200 700" fill="#345c4c"/></svg>',
  }),
);
await context.routeWebSocket("wss://relay.anmore.me", (ws) =>
  ws.onMessage(async (raw) => {
    const m = JSON.parse(raw);
    requests.push(m);
    if (m[0] !== "REQ") return;
    if (holdNextFeed && m.slice(2).some((f) => f.kinds?.includes(1))) {
      holdNextFeed = false;
      await new Promise((resolve) => {
        resumeFeed = resolve;
      });
    }
    if (mode === "relay-failure") {
      ws.send(
        JSON.stringify(["CLOSED", m[1], "restricted: fixture rejection"]),
      );
      return;
    }
    const filters = m.slice(2);
    if (filters.some(f => f.ids && !f.kinds)) {
      assert.ok(filters.every(f => f.ids.length <= 100 && f.limit === f.ids.length));
      if (mode === "presence-failure") {
        ws.send(JSON.stringify(["CLOSED", m[1], "exact source check unavailable"])); return;
      }
    }
    if (
      (mode === "local-receipts-failure" || mode === "receipts-failure") &&
      filters.some((f) => f.kinds?.includes(9735))
    ) {
      ws.send(JSON.stringify(["CLOSED", m[1], "fixture unavailable"]));
      return;
    }
    const candidates =
      mode === "empty"
        ? []
        : [
            profile,
            ...posts,
            calendar,
            ...(mode === "recipient-missing" ? [] : [communityProfile]),
            ...(mode === "public-only" ? [] : receipts),
            ...(mode === "deleted" ? [deletion] : []),
          ];
    const selected = new Map();
    for (const f of filters)
      for (const e of candidates
        .filter(
          (e) =>
            !missingSourceIds.has(e.id) && !(f.ids && missingOnExactRead.has(e.id)) &&
            (!f.kinds || f.kinds.includes(e.kind)) &&
            (!f.authors || f.authors.includes(e.pubkey)) &&
            (!f.ids || f.ids.includes(e.id)) &&
            (!f["#e"] ||
              e.tags.some((t) => t[0] === "e" && f["#e"].includes(t[1]))) &&
            (!f["#p"] ||
              e.tags.some((t) => t[0] === "p" && f["#p"].includes(t[1]))) &&
            (!f.until || e.created_at <= f.until) &&
            (!f["#d"] ||
              f["#d"].includes(e.tags.find((t) => t[0] === "d")?.[1])),
        )
        .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
        .slice(0, f.limit + (mode === "over-top-limit" && f.kinds?.includes(1) ? 1 : 0)))
        selected.set(e.id, e);
    for (const e of selected.values())
      ws.send(JSON.stringify(["EVENT", m[1], { ...e, indexed_at: now }]));
    ws.send(JSON.stringify(["EOSE", m[1]]));
  }),
);
const publicRequests = [];
await context.routeWebSocket("wss://relay.primal.net", (ws) =>
  ws.onMessage((raw) => {
    const m = JSON.parse(raw);
    publicRequests.push(m);
    assert.ok(["REQ", "CLOSE"].includes(m[0]));
    if (m[0] !== "REQ") return;
    const f = m[2];
    assert.deepEqual(f.kinds, [9735]);
    assert.ok(f["#e"].every((id) => posts.some((p) => p.id === id)));
    assert.deepEqual(f.authors, [receipts[0].pubkey]);
    assert.deepEqual(f["#p"], [communityProfile.pubkey]);
    if (mode === "public-failure" || mode === "receipts-failure") {
      ws.send(JSON.stringify(["CLOSED", m[1], "fixture unavailable"]));
      return;
    }
    for (const e of [...receipts, ...peerOnlyReceipts].filter((r) =>
      r.tags.some((t) => t[0] === "e" && f["#e"].includes(t[1])),
    ))
      ws.send(JSON.stringify(["EVENT", m[1], e]));
    if (mode === "deleted")
      ws.send(JSON.stringify(["EVENT", m[1], receipts[1]]));
    // Attempted content injection from receipt peer must never enter the feed.
    ws.send(JSON.stringify(["EVENT", m[1], posts[0]]));
    ws.send(JSON.stringify(["EOSE", m[1]]));
  }),
);
const page = await context.newPage();
await page.clock.install({ time: new Date(now * 1000) });
page.on("pageerror", (e) => errors.push(e.message));
const settle = () =>
  page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
// Independent monetary timelines use an explicitly new local history. Within
// each recovery/replay scenario the real durable database is retained.
const freshFeed = async () => {
  const base=process.env.QA_URL || 'http://127.0.0.1:4173';
  await page.goto(new URL('/offline.html',base).href);
  await page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.deleteDatabase('anmore-accepted-v1');q.onsuccess=resolve;q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Fixture DB still open'));}));
  await page.goto(base);await settle();
};
const expectedCards = winners => [
  ...winners.map(([index, amount]) => ({ id: posts[index].id, amount })),
  ...posts.filter((_, index) => !winners.some(([i]) => i === index)).map(p => ({ id:p.id, amount:"0 sats" })),
];
const cards = () =>
  page
    .locator(".post")
    .evaluateAll((es) =>
      es.map((e) => ({
        id: e.dataset.eventId,
        amount: e.querySelector(".zap-total").textContent,
      })),
    );
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:4173");
  await settle();
  assert.equal((await cards()).length, 12);
  assert.equal(await page.locator("select").count(), 0, "No order picklist");
  assert.equal(
    await page.getByRole("group", { name: "Order updates" }).count(),
    1,
  );
  const newest = page.getByRole("button", { name: "Newest", exact: true });
  const top = page.getByRole("button", { name: "Top zapped", exact: true });
  assert.equal(await newest.getAttribute("aria-pressed"), "true");
  holdNextFeed = true;
  await top.focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "true",
  );
  assert.equal(await newest.isDisabled(), true);
  assert.equal(await top.isDisabled(), true);
  for (const id of ["week", "month", "all"]) assert.equal(await page.locator("#period-" + id).isDisabled(), true);
  assert.match(
    await page.locator("#sort-note").innerText(),
    /Checking earlier/,
  );
  resumeFeed();
  await settle();
  assert.equal(await top.getAttribute("aria-pressed"), "true");
  assert.deepEqual((await cards())[0], {
    id: posts[14].id,
    amount: "1,250 sats",
  });
  assert.equal(
    (await cards()).length,
    15,
    "Top automatically includes older high tip",
  );
  assert.equal(callbacks, 0);
  // Background reconciliation must not close an in-progress invoice session.
  const beforeDialogSync=requests.length;
  await page.evaluate(()=>document.querySelector('#zap-dialog').showModal());
  await page.clock.fastForward(61000);
  assert.equal(await page.locator('#zap-dialog').isVisible(),true);
  assert.equal(requests.length,beforeDialogSync,'Visible automatic sync pauses while tip dialog is open');
  await page.evaluate(()=>document.querySelector('#zap-dialog').close());
  const periods = page.getByRole("group", { name: "Zap timeframe" });
  assert.equal(await periods.isVisible(), true);
  const week = periods.getByRole("button", { name: "This week", exact: true });
  const month = periods.getByRole("button", { name: "This month", exact: true });
  const all = periods.getByRole("button", { name: "All time", exact: true });
  assert.equal(await all.getAttribute("aria-pressed"), "true");
  // Receipt windows oppose chronology and all-time totals; an old post gets a new tip.
  const baseline = [...receipts];
  const { zapPeriodWindow } = await import("../src/zaps.js");
  const weekStart = zapPeriodWindow("week", now).start;
  const monthStart = zapPeriodWindow("month", now).start;
  // Port both independent missing-peer adversaries through the actual bundle.
  // Reuse exact serialized request/invoice for earliest-time duplicates.
  const adversaryRequests = new Map();
  const adversaryReceipt = (target, time, hash = "ab".repeat(32), sats = 21) => {
    const rk = target.id + ":" + sats;
    if (!adversaryRequests.has(rk)) adversaryRequests.set(rk, finalizeEvent({
      kind: 9734, created_at: weekStart - 100, content: "",
      tags: [["e", target.id], ["p", communityProfile.pubkey], ["amount", String(sats * 1000)]],
    }, keys.sender));
    const description = JSON.stringify(adversaryRequests.get(rk));
    return finalizeEvent({ kind: 9735, created_at: time, content: "",
      tags: [["e", target.id], ["p", communityProfile.pubkey], ["description", description],
        ["bolt11", invoice(description, { time: weekStart - 50, expiry: 1e7,
          paymentHash: hash, msats: BigInt(sats) * 1000n })]],
    }, keys.issuer);
  };
  const partialFailures = [];
  for (const scenario of ["earliest", "conflict"]) {
    receipts.splice(0, receipts.length,
      adversaryReceipt(posts[14], weekStart + 1),
      adversaryReceipt(posts[0], weekStart + 3, "cd".repeat(32), 7));
    peerOnlyReceipts = [scenario === "earliest"
      ? adversaryReceipt(posts[14], weekStart - 1)
      : adversaryReceipt(posts[2], weekStart + 2)];
    mode = "public-failure";
    await freshFeed();await top.click();await settle();
    await page.locator("#refresh").click(); await settle();
    await (scenario === "earliest" ? week : all).click();
    const observed = await cards();
    try {
      assert.deepEqual(observed, expectedCards([[14, "21 sats · provisional"], [0, "7 sats · provisional"]])
        .map(c => ({ ...c, amount: c.amount === "0 sats" ? "—" : c.amount })));
      assert.match(await page.locator("#sort-note").innerText(),
        /Partial receipt check · totals\/order may change as receipts become available\./);
      const presentation = await page.locator("#sort-note, .zap-total").evaluateAll(es =>
        es.map(e => [e.textContent, e.title, e.getAttribute("aria-label")].join(" ")).join("\n"));
      assert.doesNotMatch(presentation, /≥|lower[- ]bounds?/i);
      assert.ok((await page.locator(".zap-total").evaluateAll(es =>
        es.map(e => e.getAttribute("aria-label")))).every(s => /provisional|unavailable/.test(s)));
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations, []);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `qa/partial-${scenario}-${width}.png` });
      }
    } catch (error) {
      partialFailures.push(`${scenario}: ${error.message}`);
    }
    mode = "normal";
    await page.locator("#refresh").click(); await settle();
    assert.deepEqual(await cards(), expectedCards([[0, "7 sats"]]),
      `${scenario}: recovery must reduce 21 to zero and reorder every current card`);
    assert.doesNotMatch(await page.locator("#sort-note").innerText(), /Partial|provisional|lower[- ]bounds?|≥/i);
    const target = page.locator(`.post[data-event-id="${posts[14].id}"] .zap-total`);
    assert.equal(await target.innerText(), "0 sats");
    assert.doesNotMatch(await target.getAttribute("aria-label"), /provisional|partial/i);
    if (scenario === "earliest") {
      await all.click();
      assert.deepEqual(await cards(), expectedCards([[14, "21 sats"], [0, "7 sats"]]));
      await week.click();
      assert.deepEqual(await cards(), expectedCards([[0, "7 sats"]]));
    }
    assert.equal(callbacks, 0);
    console.log(`Partial adversary exercised: ${scenario}, observed 21 sats -> recovered 0 sats; full card order checked.`);
  }
  assert.deepEqual(partialFailures, [], "Both adversaries require provisional, never guaranteed-minimum presentation");
  peerOnlyReceipts = [];
  await all.click();
  receipts.splice(0, receipts.length,
    zapReceipt(posts[0], 900, monthStart - 1, "91".repeat(32)),
    zapReceipt(posts[2], 500, weekStart - 1, "92".repeat(32)),
    zapReceipt(posts[14], 50, now - 1, "93".repeat(32)));
  await freshFeed();await top.click();await settle();
  await page.locator("#refresh").click(); await settle();
  assert.deepEqual((await cards())[0], { id: posts[0].id, amount: "900 sats" });
  await week.focus(); await page.keyboard.press("Enter");
  assert.equal(await week.getAttribute("aria-pressed"), "true");
  assert.deepEqual((await cards())[0], { id: posts[14].id, amount: "50 sats" });
  assert.deepEqual(await cards(), expectedCards([[14, "50 sats"]]));
  assert.match(await page.locator("#sort-note").innerText(), /Monday|Mon/);
  await month.click();
  assert.deepEqual(await cards(), expectedCards([[2, "500 sats"], [14, "50 sats"]]));
  await all.click();
  assert.deepEqual((await cards())[0], { id: posts[0].id, amount: "900 sats" });
  assert.deepEqual(await cards(), expectedCards([[0, "900 sats"], [2, "500 sats"], [14, "50 sats"]]));
  assert.equal(callbacks, 0);
  receipts.splice(0, receipts.length, zapReceipt(posts[0], 900, monthStart - 1, "94".repeat(32)));
  await freshFeed();await top.click();await settle();
  await page.locator("#refresh").click(); await settle();
  await week.click();
  assert.ok((await cards()).every(c => c.amount === "0 sats"));
  assert.deepEqual((await cards()).map(c => c.id), posts.map(p => p.id));
  await month.click(); assert.ok((await cards()).every(c => c.amount === "0 sats"));
  receipts.splice(0, receipts.length, ...baseline);
  mode = "public-failure";
  await freshFeed();await top.click();await settle();
  await page.locator("#refresh").click(); await settle();
  await week.click();
  assert.deepEqual((await cards())[0], { id:posts[14].id, amount:"1,250 sats · provisional" });
  assert.match(await page.locator("#sort-note").innerText(), /Partial receipt check · totals\/order may change/);
  assert.equal((await cards()).find(c => c.id === posts[1].id).amount, "—");
  mode = "receipts-failure";
  await page.locator("#refresh").click(); await settle();
  assert.match(await page.locator("#sort-note").innerText(), /Partial receipt/);
  assert.equal((await cards())[0].id,posts[14].id);
  mode = "normal";
  await all.click();
  await page.locator("#refresh").click(); await settle();
  await newest.click();
  assert.equal(await periods.isVisible(), false);
  assert.deepEqual(
    (await cards()).map((c) => c.id),
    posts.map((p) => p.id),
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page
      .locator(".feed-order button")
      .evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    assert.equal(geometry.length, 2);
    assert.equal(geometry[0].y, geometry[1].y);
    assert.ok(geometry[0].x + geometry[0].w <= geometry[1].x);
    assert.ok(geometry.every((g) => g.w >= 44 && g.h >= 44));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await top.click(); await settle();
    const periodGeometry = await periods.locator("button").evaluateAll(es => es.map(e => {
      const r = e.getBoundingClientRect(); return { w:r.width, h:r.height, y:r.y };
    }));
    assert.equal(periodGeometry.length, 3);
    assert.ok(periodGeometry.every(r => r.w >= 44 && r.h >= 44));
    assert.ok(periodGeometry.every(r => r.y === periodGeometry[0].y));
    assert.ok(await page.locator(".post").first().evaluate(e => e.getBoundingClientRect().top < 650));
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(axe.violations, []);
    await page.screenshot({ path: `qa/buttons-${width}.png` });
  }
  // Administrative source removal has no author-signed kind-5 event.
  await page.reload(); await settle();
  assert.ok((await cards()).some(c => c.id === posts[0].id));
  missingSourceIds.add(posts[0].id);
  missingOnExactRead.add(posts[11].id);
  await top.click(); await settle();
  assert.equal((await cards()).some(c => c.id === posts[0].id), true,
    "Relay absence is not authenticated removal of accepted history");
  assert.equal((await cards()).some(c => c.id === posts[11].id), true, "Missing exact relay responses cannot erase accepted history");
  missingOnExactRead.clear();
  missingSourceIds.clear();
  await newest.click();
  missingSourceIds.add(posts[2].id);
  await top.click(); await settle();
  assert.equal((await cards()).some(c => c.id === posts[2].id), true,
    "Reentering Top preserves accepted history independently of source retention");
  missingSourceIds.clear();
  mode = "presence-failure";
  await newest.click(); await top.click(); await settle();
  assert.equal((await cards()).length,15,"Absence-only reads are no longer removal authority");
  assert.match(await page.locator("#sort-note").innerText(), /loaded posts/);
  mode = "normal";
  // Same-author signed deletion wins over a stale highest receipt on either peer.
  const highestDeletion = sign({
    kind: 5,
    created_at: now,
    tags: [["e", posts[14].id]],
  });
  posts.push(highestDeletion);
  await page.reload();
  await settle();
  await top.click();
  await settle();
  assert.equal(
    (await cards()).some((c) => c.id === posts[14].id),
    false,
  );
  assert.deepEqual((await cards())[0], { id: posts[2].id, amount: "21 sats" });
  posts.pop();
  // An older winner on the fifth content page must also be discovered automatically.
  const deep = Array.from({ length: 45 }, (_, i) =>
    sign({ created_at: now - 100 - i, content: `Farther update ${i}` }),
  );
  posts.push(...deep);
  receipts.push(zapReceipt(posts[50], 2500));
  await freshFeed();
  await settle();
  await top.click();
  await settle();
  assert.deepEqual((await cards())[0], {
    id: posts[50].id,
    amount: "2,500 sats",
  });
  assert.equal((await cards()).length, 60);
  receipts.pop();
  posts.splice(15);
  // More than six pages: one click is bounded and coverage is explicitly loaded-only.
  posts.push(
    ...Array.from({ length: 100 }, (_, i) =>
      sign({ created_at: now - 100 - i, content: `Deep update ${i}` }),
    ),
  );
  await freshFeed();
  await settle();
  const before = requests.filter(
    (m) => m[0] === "REQ" && m.slice(2).some((f) => f.kinds?.includes(1)),
  ).length;
  await top.click();
  await settle();
  const after = requests.filter(
    (m) => m[0] === "REQ" && m.slice(2).some((f) => f.kinds?.includes(1)),
  ).length;
  assert.equal(after - before, 6);
  assert.match(await page.locator("#sort-note").innerText(), /loaded posts/);
  assert.match(await page.locator("#sort-note").innerText(), /Load more/);
  assert.equal(await page.locator("#load-more").isEnabled(), true);
  missingSourceIds.add(posts[14].id);
  await page.locator("#load-more").click(); await settle();
  assert.equal((await cards()).some(c => c.id === posts[14].id), true,
    "Load more retains accepted content despite later relay absence");
  assert.equal((await cards()).length, posts.length);
  const presenceBefore = requests.length;
  await newest.click(); await top.click(); await settle();
  const presenceReads = requests.slice(presenceBefore).filter(m => m[0] === "REQ" && m[2].ids && !m[2].kinds);
  assert.deepEqual(presenceReads, [],"Source-absence eviction requests are retired");
  missingSourceIds.clear();
  await freshFeed(); await settle(); await top.click(); await settle();
  // Top pagination failure retains history; only completed pages move cursors.
  mode = "relay-failure";
  await page.locator("#load-more").click();
  await settle();
  assert.ok((await cards()).length>0);
  assert.match(await page.locator("#status").innerText(), /stale retained history/);
  assert.match(await page.locator("#sort-note").innerText(), /Partial receipt check.*totals\/order may change/);
  const staleWinner=page.locator(`[data-event-id="${posts[14].id}"] .zap-total`);
  assert.equal(await staleWinner.innerText(),"1,250 sats · provisional");
  assert.match(await staleWinner.getAttribute("aria-label"),/partial receipt check/);
  assert.equal(await top.isEnabled(), true);
  mode = "normal";
  await page.locator("#refresh").click();
  await settle();
  assert.deepEqual((await cards())[0], {
    id: posts[14].id,
    amount: "1,250 sats",
  });
  // The shared transport tolerates extra frames; Top must enforce its own admission budget.
  const retainedIds=(await cards()).map(c=>c.id).sort();
  const overBudgetPost=sign({created_at:now-1,content:"New over-budget candidate must not be retained"});
  posts.push(overBudgetPost);
  mode = "over-top-limit";
  await page.locator("#refresh").click();
  await settle();
  assert.deepEqual((await cards()).map(c=>c.id).sort(),retainedIds,"Over-request responses retain exactly the previously accepted IDs");
  assert.equal((await cards()).some(c=>c.id===overBudgetPost.id),false,"New over-budget candidate is not admitted");
  assert.match(await page.locator("#status").innerText(), /exceeded.*limit/i);
  posts.pop();
  mode = "normal";
  await page.locator("#refresh").click();
  await settle();
  assert.deepEqual((await cards())[0], { id: posts[14].id, amount: "1,250 sats" });
  assert.equal(callbacks, 0);
  assert.deepEqual(errors, []);
  console.log(
    "Top button QA passed: automatic older winner, deletion, six-page bound, failure recovery, keyboard, geometry and axe 0.",
  );
} finally {
  await browser.close();
}
