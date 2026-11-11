import { chromium, devices } from "playwright";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [],
  sockets = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("websocket", (s) => {
  sockets.push(s.url());
  s.on("framesent", (f) =>
    requests.push({ relay: s.url(), message: JSON.parse(f.payload) }),
  );
});
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:4173");
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
    { timeout: 90000 },
  );
  const result = {
    live: true,
    status: await page.locator("#status").innerText(),
    posts: await page.locator(".post").count(),
    events: await page.locator(".event").count(),
    identities: await page.locator(".identity").allTextContents(),
    sockets,
    errors,
    geometry: [],
  };
  assert.ok(
    sockets.every((s) =>
      ["wss://relay.anmore.me/", "wss://relay.primal.net/"].includes(s),
    ),
  );
  assert.ok(
    requests.every(({ message: m }) => ["REQ", "CLOSE"].includes(m[0])),
  );
  for (const { relay, message: m } of requests)
    if (relay === "wss://relay.primal.net/" && m[0] === "REQ")
      assert.ok(
        m
          .slice(2)
          .every(
            (f) =>
              f.kinds.length === 1 &&
              f.kinds[0] === 9735 &&
              f["#e"].every((id) => /^[0-9a-f]{64}$/.test(id)),
          ),
      );
  assert.deepEqual(errors, []);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(200);
    const geometry = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    result.geometry.push(geometry);
    assert.ok(geometry.scroll <= width);
    await page.screenshot({ path: `qa/live-${width}.png`, fullPage: false });
  }
  if (result.posts) {
    const before = result.posts;
    if (await page.locator("#load-more").isEnabled()) {
      await page.locator("#load-more").click();
      await page.waitForFunction(
        () =>
          document.querySelector("#feed").getAttribute("aria-busy") === "false",
      );
      result.afterLoadMore = await page.locator(".post").count();
      assert.ok(result.afterLoadMore >= before);
    }
    const timestamps = await page
      .locator(".post")
      .evaluateAll((els) => els.map((e) => Number(e.dataset.createdAt)));
    assert.deepEqual(
      timestamps,
      [...timestamps].sort((a, b) => b - a),
    );
  }
  const firstPhoto = page.locator(".post-media img").first();
  if (await firstPhoto.count()) {
    await firstPhoto.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    result.firstPhoto = await firstPhoto
      .evaluate((e) => ({
        loaded: e.complete && e.naturalWidth > 0,
        width: e.naturalWidth,
        height: e.naturalHeight,
      }))
      .catch(() => ({ loaded: false }));
    await page.screenshot({ path: "qa/live-photo-320.png" });
  }
  const mobileContext = await browser.newContext({ ...devices["iPhone 13"] });
  const mobile = await mobileContext.newPage();
  await mobile.goto(process.env.QA_URL || "http://127.0.0.1:4173");
  await mobile.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
    null,
    { timeout: 90000 },
  );
  result.mobileDevice = await mobile.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    touch: navigator.maxTouchPoints,
    dpr: devicePixelRatio,
    posts: document.querySelectorAll(".post").length,
  }));
  assert.equal(result.mobileDevice.width, 390);
  assert.ok(result.mobileDevice.touch > 0);
  assert.equal(result.mobileDevice.scroll, 390);
  await mobile.screenshot({ path: "qa/live-iphone13.png" });
  await mobileContext.close();
  await writeFile("qa/live-results.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
