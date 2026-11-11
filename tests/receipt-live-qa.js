// Actual network reads only. Invoice callbacks are fenced off.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PAY_CALLBACK } from "../src/zaps.js";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage();
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
  page
    .locator(".post")
    .evaluateAll((es) =>
      es.map((e) => ({
        id: e.dataset.eventId,
        amount: e.querySelector(".zap-total").textContent,
      })),
    );
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:4187");
  await settle();
  const initial = await cards();
  await page.locator("#load-more").click();
  await settle();
  await page.locator("#feed-order").selectOption("top");
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
  assert.deepEqual(
    loaded.slice(0, 3).map((c) => [c.id, c.amount]),
    expected,
  );
  const geometry = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const g = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.equal(g.width, g.scroll);
    geometry.push(g);
    await page.screenshot({ path: `qa/receipt-live-${width}.png` });
  }
  assert.equal(callbacks, 0);
  assert.deepEqual(errors, []);
  const result = {
    initial,
    loaded,
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
