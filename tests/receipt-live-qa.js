// Actual network reads only. Invoice callbacks are fenced off.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { Relay } from "../src/relay.js";
import { visibleEvents, latestProfile, identify } from "../src/core.js";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PAY_CALLBACK } from "../src/zaps.js";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();
const errors = [],
  frames = [],
  sockets = [];
let callbacks = 0;
await page.route(PAY_CALLBACK + "?*", (r) => {
  callbacks++;
  return r.abort();
});
page.on("pageerror", (e) => errors.push(e.message));
page.on("websocket", (s) => {
  sockets.push(s.url());
  s.on("framesent", (f) => {
    const m = JSON.parse(f.payload);
    assert.ok(["REQ", "CLOSE"].includes(m[0]));
    assert.ok(
      ["wss://relay.anmore.me/", "wss://relay.primal.net/"].includes(s.url()),
    );
    if (s.url().includes("primal") && m[0] === "REQ")
      for (const filter of m.slice(2)) {
        assert.deepEqual(filter.kinds, [9735]);
        assert.ok(filter["#e"].every((id) => /^[a-f0-9]{64}$/.test(id)));
      }
    frames.push({ relay: s.url(), type: m[0] });
  });
});
const settle = () =>
  page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
    null,
    { timeout: 90000 },
  );
const cards = () =>
  page.locator(".post").evaluateAll((es) =>
    es.map((e) => ({
      id: e.dataset.eventId,
      amount: e.querySelector(".zap-total").textContent,
      createdAt: Number(e.dataset.createdAt),
    })),
  );
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:4187");
  await settle();
  const initial = await cards();
  await page.getByRole("button", { name: "Top zapped", exact: true }).click();
  await settle();
  const loaded = await cards();
  const expected = [
    [
      "4c5a5c9d3973ff11ca4ea687fb41583780d0141e9c18413175bf425ffd4db35b",
      "50 sats",
    ],
    [
      "c6ba79d2604f2d912ba69856dead693e8a729af6ad99137d208a9532c08ab1f7",
      "42 sats",
    ],
    [
      "ba29587bedfa5327265622d3545958377eed38a5012214297c91cb967574ebeb",
      "21 sats",
    ],
  ];
  // Recheck authority directly on Anmore: a stale receipt cannot revive a removed post.
  const relay = new Relay();
  let fiftyAuthority;
  try {
    await relay.open();
    const exact = await relay.query([
      { ids: [expected[0][0]], kinds: [1, 20], limit: 1 },
    ]);
    const target = exact[0];
    const deletions = target
      ? await relay.query([
          { kinds: [5], authors: [target.pubkey], limit: 500 },
        ])
      : [];
    const profiles = target
      ? await relay.query([{ kinds: [0], authors: [target.pubkey], limit: 1 }])
      : [];
    const profile = target ? latestProfile(profiles, target.pubkey) : null;
    const profileDeleted =
      profile &&
      deletions.some((d) =>
        d.tags.some(
          (t) =>
            (t[0] === "e" && t[1] === profile.id) ||
            (t[0] === "a" &&
              t[1] === `0:${target.pubkey}:` &&
              d.created_at >= profile.created_at),
        ),
      );
    const identity =
      profile && !profileDeleted ? await identify(profile) : null;
    fiftyAuthority =
      !!target &&
      deletions.length < 500 &&
      !!identity &&
      visibleEvents([...exact, ...deletions]).some((e) => e.id === target.id);
  } finally {
    relay.close();
  }
  if (fiftyAuthority) {
    const older = loaded.find((c) => c.id === expected[0][0]);
    assert.ok(
      older,
      "A still-authorized older post must be found with one Top click",
    );
    assert.equal(older.amount, "50 sats");
  } else
    assert.equal(
      loaded.some((c) => c.id === expected[0][0]),
      false,
    );
  // Receipt state can change during acceptance. Compare the entire current snapshot,
  // including newly tipped posts and chronological ties, rather than stale fixed positions.
  const sats = (c) => BigInt(c.amount.replace(/[^0-9]/g, ""));
  assert.ok(
    loaded.every((c) => /^[0-9,]+ sats$/.test(c.amount)),
    "Complete live receipt check",
  );
  const ordered = loaded.toSorted((a, b) =>
    sats(a) > sats(b)
      ? -1
      : sats(a) < sats(b)
        ? 1
        : b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  );
  assert.deepEqual(
    loaded.map((c) => c.id),
    ordered.map((c) => c.id),
  );
  assert.equal(await page.locator("select").count(), 0);
  const geometry = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const g = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.equal(g.width, g.scroll);
    g.buttons = await page.locator(".feed-order button").evaluateAll((es) =>
      es.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    assert.equal(g.buttons[0].y, g.buttons[1].y);
    assert.ok(g.buttons.every((b) => b.width >= 44 && b.height >= 44));
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(axe.violations, []);
    g.accessibilityViolations = axe.violations.length;
    geometry.push(g);
    await page.screenshot({ path: `qa/receipt-live-${width}.png` });
  }
  assert.equal(callbacks, 0);
  assert.deepEqual(errors, []);
  const result = {
    initial,
    loaded,
    fiftyAuthority,
    manualLoadMoreClicks: 0,
    geometry,
    callbacks,
    sockets,
    frameCount: frames.length,
    errors,
  };
  await writeFile(
    "qa/receipt-live-browser.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        initialPosts: initial.length,
        loadedPosts: loaded.length,
        top: loaded.slice(0, 3),
        geometry,
        callbacks,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
