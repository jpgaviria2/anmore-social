import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { finalizeEvent } from "nostr-tools/pure";
import { invoice, keys } from "./zap-fixtures.js";
import { COMMUNITY_ADDRESS, COMMUNITY_LNURL, PAY_CALLBACK } from "../src/zaps.js";
const root = new URL("../", import.meta.url);
await mkdir(
  process.env.VISUAL_UI_ARTIFACTS ||
    new URL("../qa/visual-ui/", import.meta.url).pathname,
  { recursive: true },
);
const now = Math.floor(Date.now() / 1000),
  key = new Uint8Array(32).fill(31);
const sign = (v) =>
  JSON.parse(
    JSON.stringify(
      finalizeEvent(
        {
          kind: 1,
          created_at: now - 10,
          tags: [],
          content: "A local moment",
          ...v,
        },
        key,
      ),
    ),
  );
const profile = sign({
  kind: 0,
  content: JSON.stringify({
    name: "Neighbour",
    nip05: "neighbour@trailscoffee.com",
  }),
});
const proof = {
  profile,
  mapping: { names: { neighbour: profile.pubkey } },
  checkedAt: now,
};
const photo = (i) => [
  "imeta",
  `url https://media.example/photo-${i}.png`,
  `alt Community photo ${i}`,
];
async function fixture(
  t,
  engine = "chromium",
  events = [sign({ tags: Array.from({ length: 5 }, (_, i) => photo(i + 1)) })],
) {
  const appBytes =
    process.env.VISUAL_UI_SOURCE === "1"
      ? (
          await build({
            entryPoints: ["src/app.js"],
            bundle: true,
            write: false,
            format: "esm",
          })
        ).outputFiles[0].text
      : await readFile(new URL("app.js", root), "utf8");
  const api = await build({
    stdin: {
      contents: 'export {FeedStore} from "./src/feed-store.js";',
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "esm",
  });
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, "http://local").pathname;
    try {
      res.setHeader(
        "Content-Type",
        path.endsWith(".js")
          ? "application/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : path.endsWith(".mp4")
              ? "video/mp4"
              : "text/html",
      );
      res.end(
        path === "/app.js"
          ? appBytes
          : path === "/api.js"
            ? api.outputFiles[0].text
            : path === "/seed"
              ? '<html lang="en"><title>Seed</title></html>'
              : await readFile(
                  new URL(path === "/" ? "index.html" : path.slice(1), root),
                ),
      );
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser =
    engine === "webkit"
      ? await webkit.launch()
      : await chromium.launch({
          executablePath:
            process.env.CHROME_PATH ||
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          headless: true,
        });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    hasTouch: true,
  });
  const requests = [],
    errors = [];
  let currentProfile = profile,
    mapping = proof.mapping;
  await context.route("https://**/*", async (route) => {
    const url = route.request().url();
    requests.push({ url, type: route.request().resourceType() });
    if (url.includes("/broken.png")) return route.abort();
    if (url.startsWith("https://media.example/") && url.includes(".png"))
      return route.fulfill({
        contentType: "image/png",
        body: await readFile(new URL("icons/icon-512.png", root)),
      });
    if (url.includes("/clip.mp4"))
      return route.fulfill({
        contentType: "video/mp4",
        body: await readFile(
          new URL("tests/fixtures/community-video.mp4", root),
        ),
      });
    return route.abort();
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", {
      get: () => !!window.fixtureOnline,
    });
  });
  await context.route("https://trailscoffee.com/.well-known/nostr.json*", (r) =>
    r.fulfill({ json: mapping }),
  );
  await context.routeWebSocket(/wss:\/\/.*/, (ws) =>
    ws.onMessage((raw) => {
      const m = JSON.parse(raw);
      if (m[0] !== "REQ") return;
      const f = m[2];
      const rows = f.kinds?.includes(0)
        ? [currentProfile]
        : f.kinds?.includes(1)
          ? events
          : [];
      for (const e of rows) ws.send(JSON.stringify(["EVENT", m[1], e]));
      ws.send(JSON.stringify(["EOSE", m[1]]));
    }),
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  t.after(async () => {
    await browser.close();
    await new Promise((r) => server.close(r));
    assert.deepEqual(errors, []);
    assert.equal(requests.filter((r) => r.url.includes("/callback")).length, 0);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url + "/seed");
  await page.evaluate(
    async ({ events, proof }) => {
      const { FeedStore } = await import("/api.js");
      const s = new FeedStore();
      await s.restore();
      for (const e of events) await s.accept(e, proof);
    },
    { events, proof },
  );
  await page.goto(url);
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );

  return {
    page,
    context,
    requests,
    events,
    url,
    setIdentity({ name, handle }) {
      currentProfile = sign({
        kind: 0,
        created_at: now - 1,
        content: JSON.stringify({ name, nip05: handle + "@trailscoffee.com" }),
      });
      mapping = { names: { [handle]: currentProfile.pubkey } };
    },
  };
}
for (const engine of ["chromium", "webkit"])
  test(`${engine}: first four mosaic opens selected gallery and navigates beyond four`, async (t) => {
    const { page } = await fixture(t, engine);
    assert.equal(await page.locator(".media-tile").count(), 4);
    assert.equal(await page.locator(".media-more").textContent(), "+1");
    await page.locator(".media-tile").nth(3).click();
    assert.equal(
      await page.locator("#media-counter").textContent(),
      "Media 4 of 5",
    );
    assert.equal(
      await page.locator("#media-gallery img").getAttribute("alt"),
      "Community photo 4",
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    assert.equal(
      await page.locator("#media-counter").textContent(),
      "Media 5 of 5",
    );
    assert.equal(
      await page
        .locator("#media-gallery")
        .evaluate((e) => e.contains(document.activeElement)),
      true,
      "focus remains in modal when Next becomes disabled",
    );
    await page.evaluate(
      () =>
        (window.previousImage = document.querySelector("#media-gallery img")),
    );
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.locator("#media-counter").textContent(),
      "Media 4 of 5",
    );
    await page.evaluate(() => previousImage.dispatchEvent(new Event("error")));
    assert.equal(
      await page
        .locator(".gallery-stage")
        .evaluate((e) => e.querySelector("img")?.alt),
      "Community photo 4",
      "Late failure from a detached slide must not replace the current slide",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator("#media-gallery").evaluate((e) => e.open),
      false,
    );
    assert.equal(
      await page
        .locator(".media-tile")
        .nth(3)
        .evaluate((e) => e === document.activeElement),
      true,
    );
  });
for (const engine of ["chromium", "webkit"])
  test(`${engine}: video requires explicit Play, plays real local MP4 and clears on slide/close/background`, async (t) => {
    const events = [
      sign({
        tags: [
          [
            "imeta",
            "url https://media.example/clip.mp4",
            "m video/mp4",
            "alt Local walk",
          ],
          photo(1),
        ],
      }),
    ];
    const { page, requests } = await fixture(t, engine, events);
    assert.equal(await page.locator(".media-tile video").count(), 0);
    assert.equal(requests.filter((r) => r.type === "media").length, 0);
    await page.locator(".media-tile").first().click();
    assert.equal(
      requests.filter((r) => r.type === "media").length,
      0,
      "Opening a video must not fetch its original",
    );
    assert.equal(await page.locator("#media-gallery video[src]").count(), 0);
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("#media-gallery video")?.currentTime > 0.1,
    );
    const metadata = await page
      .locator("#media-gallery video")
      .evaluate((v) => {
        window.oldVideo = v;
        return {
          w: v.videoWidth,
          h: v.videoHeight,
          d: v.duration,
          time: v.currentTime,
          inline: v.playsInline,
          controls: v.controls,
        };
      });
    assert.ok(
      metadata.w > 0 && metadata.h > 0 && metadata.d > 0 && metadata.time > 0,
    );
    assert.ok(metadata.inline && metadata.controls);
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.evaluate(
        () => oldVideo.paused && !oldVideo.getAttribute("src"),
      ),
      true,
    );
    await page.keyboard.press("ArrowLeft");
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("#media-gallery video")?.currentTime > 0.1,
    );
    await page.evaluate(() => {
      window.oldVideo = document.querySelector("video");
      window.dispatchEvent(new Event("pagehide"));
    });
    assert.equal(
      await page.evaluate(
        () => oldVideo.paused && !oldVideo.getAttribute("src"),
      ),
      true,
    );
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("#media-gallery video")?.currentTime > 0.1,
    );
    await page.evaluate(() => {
      window.oldVideo = document.querySelector("video");
      document.querySelector(".gallery-stage").style.transform =
        "translateY(200vh)";
    });
    await page.waitForFunction(
      () => oldVideo.paused && !oldVideo.getAttribute("src"),
    );
    await page
      .locator(".gallery-stage")
      .evaluate((e) => (e.style.transform = ""));
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("video")?.currentTime > 0.1,
    );
    await page.evaluate(() => {
      window.oldVideo = document.querySelector("video");
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    assert.equal(
      await page.evaluate(
        () => oldVideo.paused && !oldVideo.getAttribute("src"),
      ),
      true,
    );
    await page.evaluate(() => {
      delete document.visibilityState;
    });
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("video")?.currentTime > 0.1,
    );
    await page.evaluate(
      () => (window.oldVideo = document.querySelector("video")),
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(
        () => oldVideo.paused && !oldVideo.getAttribute("src"),
      ),
      true,
    );
    console.log(engine, "LOCAL_MP4", metadata);
  });
for (const engine of ["chromium", "webkit"])
  test(`${engine}: first visit puts media first and caption expands without splitting links or emoji`, async (t) => {
    const text =
      "Neighbourhood 👨‍👩‍👧‍👦 update. ".repeat(25) +
      "https://example.com/very-long-source?keep=ALL&case=Yes&signature=abc:)";
    const { page } = await fixture(t, engine, [
      sign({ content: text, tags: [photo(1)] }),
    ]);
    assert.equal(
      await page.locator("#install-help").evaluate((e) => e.open),
      false,
    );
    assert.ok(
      (await page.locator(".media-grid").boundingBox()).y < 440,
      "media visible on first 390×844 visit",
    );
    await page.screenshot({
      path: `${process.env.VISUAL_UI_ARTIFACTS || new URL("../qa/visual-ui/", import.meta.url).pathname}/${engine}-first-visit-hero.png`,
      caret: "initial",
    });
    const caption = page.locator(".post-caption");
    assert.equal(await caption.textContent(), text);
    assert.equal(
      await caption.evaluate((e) => getComputedStyle(e).webkitLineClamp),
      "3",
    );
    const toggle = page.locator(".caption-toggle");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.equal(
      await caption.evaluate((e) => getComputedStyle(e).webkitLineClamp),
      "none",
    );
    assert.equal(
      await caption.locator("a").getAttribute("href"),
      "https://example.com/very-long-source?keep=ALL&case=Yes&signature=abc:)",
    );
    assert.equal(await caption.textContent(), text);
    assert.equal(await page.locator(".zap-button").innerText(), "Zap");
  });
for (const engine of ["chromium", "webkit"])
  test(`${engine}: adding a new update preserves caption, gallery, focus, playback and unchanged refresh scroll`, async (t) => {
    const original = sign({
      content: "Long neighbourhood update. ".repeat(60),
      tags: [
        [
          "imeta",
          "url https://media.example/clip.mp4",
          "m video/mp4",
          "alt Walk",
        ],
      ],
    });
    const { page, events } = await fixture(t, engine, [original]);
    await page.locator(".caption-toggle").click();
    await page.locator(".media-tile").click();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("video")?.currentTime > 0.1,
    );
    await page.evaluate(() => {
      window.savedCard = document.querySelector(".post");
      window.savedVideo = document.querySelector("video");
      window.savedDialog = document.querySelector("#media-gallery");
      window.savedFocus = document.activeElement;
      window.fixtureOnline = true;
    });
    events.push(sign({ created_at: now - 1, content: "New arrival" }));
    await page.evaluate(() => document.querySelector("#refresh").click());
    await page.waitForFunction(
      () => !document.querySelector("#refresh").disabled,
    );
    assert.equal(await page.locator(".post").count(), 2);
    assert.equal(
      await page.evaluate(
        () =>
          savedCard ===
          document.querySelector(
            `[data-event-id="${savedCard.dataset.eventId}"]`,
          ),
      ),
      true,
    );
    assert.equal(
      await page.evaluate(
        () =>
          savedVideo === document.querySelector("video") &&
          !savedVideo.paused &&
          savedDialog.open &&
          savedFocus === document.activeElement,
      ),
      true,
    );
    assert.equal(
      await page
        .locator(`[data-event-id="${original.id}"] .caption-toggle`)
        .getAttribute("aria-expanded"),
      "true",
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.body.style.overflow !== "hidden");
    await page
      .locator(`[data-event-id="${original.id}"] .caption-toggle`)
      .focus();
    await page.evaluate(() => {
      scrollTo({ top: 500, behavior: "instant" });
      window.savedY = scrollY;
      window.savedFocus = document.activeElement;
    });
    assert.ok(await page.evaluate(() => savedY > 0));
    await page.evaluate(() => document.querySelector("#refresh").click());
    await page.waitForFunction(
      () => !document.querySelector("#refresh").disabled,
    );
    assert.equal(
      await page.evaluate(
        () => scrollY === savedY && savedFocus === document.activeElement,
      ),
      true,
    );
  });
for (const engine of ["chromium", "webkit"])
  test(`${engine}: 0/1/2/3/4/5/60 media layouts, bounded downloads, focus trap, touch and responsive axe`, async (t) => {
    const counts = [0, 1, 2, 3, 4, 5, 60],
      events = counts.map((n, j) =>
        sign({
          created_at: now - 10 - j,
          content: `${n} attachments`,
          tags: Array.from({ length: n }, (_, i) =>
            n === 60 && i === 4
              ? [
                  "imeta",
                  "url https://media.example/clip.mp4",
                  "m video/mp4",
                  "alt Fifth attachment video",
                ]
              : photo(i + 1),
          ),
        }),
      );
    const { page, context, requests } = await fixture(t, engine, events);
    for (const [j, n] of counts.entries()) {
      const card = page.locator(`[data-event-id="${events[j].id}"]`);
      assert.equal(await card.locator(".media-tile").count(), Math.min(n, 4));
      if (n > 4)
        assert.equal(
          await card.locator(".media-more").textContent(),
          `+${n - 4}`,
        );
      if (n)
        assert.equal(
          await card.locator(".media-grid").getAttribute("class"),
          `post-media media-grid media-count-${Math.min(n, 4)}`,
        );
    }
    assert.equal(
      requests.some((r) => r.url.includes("photo-60.png")),
      false,
    );
    const dir =
      process.env.VISUAL_UI_ARTIFACTS ||
      new URL("../qa/visual-ui/", import.meta.url).pathname;
    await mkdir(dir, { recursive: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `overflow ${engine} ${width}`,
      );
      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      assert.deepEqual(axe.violations, [], `axe ${engine} ${width}`);
      await page.screenshot({
        path: `${dir}/${engine}-${width}.png`,
        caret: "initial",
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const tile = page
      .locator(`[data-event-id="${events[6].id}"] .media-tile`)
      .nth(3);
    await tile.tap();
    assert.equal(
      await page.locator("#media-counter").textContent(),
      "Media 4 of 60",
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .getByRole("button", { name: "Next", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .getByRole("button", { name: "Close", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    // Chromium uses native CDP touch input; WebKit has no swipe API, so its
    // real touch tap is followed by a dispatched gesture on the real DOM path.
    if (engine === "chromium") {
      const touch = await context.newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 290, y: 200 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 90, y: 200 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await page.locator(".gallery-stage").evaluate((e) => {
        const make = (x, type) => {
          const event = new Event(type, { bubbles: true });
          Object.defineProperties(event, {
            touches: {
              value: type === "touchend" ? [] : [{ clientX: x, clientY: 200 }],
            },
            changedTouches: { value: [{ clientX: x, clientY: 200 }] },
          });
          e.dispatchEvent(event);
        };
        make(290, "touchstart");
        make(90, "touchend");
      });
    }
    assert.equal(
      await page.locator("#media-counter").textContent(),
      "Media 5 of 60",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Play video", exact: true })
        .count(),
      1,
      "Mixed video beyond the preview is retained",
    );
    assert.equal(await page.locator("#media-gallery video[src]").count(), 0);
    assert.equal(requests.filter((r) => r.type === "media").length, 0);
    for (let i = 5; i < 60; i++) await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.locator("#media-counter").textContent(),
      "Media 60 of 60",
    );
    assert.equal(
      await page.locator("#media-gallery img").getAttribute("alt"),
      "Community photo 60",
    );
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(axe.violations, []);
    await page.screenshot({
      path: `${dir}/${engine}-gallery-60.png`,
      caret: "initial",
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.body.style.overflow !== "hidden");
    assert.equal(
      await tile.evaluate((e) => e === document.activeElement),
      true,
    );
  });
for (const engine of ["chromium", "webkit"])
  test(`${engine}: media failures retain safe original and unsupported HLS is honest`, async (t) => {
    const { page, context } = await fixture(t, engine, [
      sign({
        tags: [
          ["imeta", "url https://media.example/broken.png", "alt Failed photo"],
          ["imeta", "url https://media.example/broken.mp4", "m video/mp4"],
          [
            "imeta",
            "url https://media.example/live",
            "m application/x-mpegurl",
          ],
        ],
      }),
    ]);
    await page.locator(".media-tile").first().click();
    await page
      .getByText("Photo unavailable. You can open the original in a new tab.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      await page.locator(".gallery-original").getAttribute("href"),
      "https://media.example/broken.png",
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page
      .getByText(
        "Video unavailable in this browser. Open the original to try another player.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page.locator(".gallery-original").getAttribute("href"),
      "https://media.example/broken.mp4",
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    const native = await page.evaluate(() =>
      document
        .createElement("video")
        .canPlayType("application/vnd.apple.mpegurl"),
    );
    await page
      .getByText(
        native
          ? "Video unavailable in this browser. Open the original to try another player."
          : "HLS playback is not supported in this browser. Open the original to try a compatible player.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page
        .locator("#media-gallery")
        .evaluate((e) => e.contains(document.activeElement)),
      true,
      "failure retains modal keyboard focus",
    );
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowRight");
    await page.evaluate(() => {
      HTMLMediaElement.prototype.canPlayType = () => "";
    });
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page
      .getByText(
        "HLS playback is not supported in this browser. Open the original to try a compatible player.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await page.locator("#media-gallery video[src]").count(), 0);
    assert.equal(
      await page
        .locator("#media-gallery")
        .evaluate((e) => e.contains(document.activeElement)),
      true,
      "unsupported HLS retains modal keyboard focus",
    );
  });
test("author identity refresh updates compact avatar and expanded provenance without replacing the card", async (t) => {
  const { page, setIdentity, events } = await fixture(t, "chromium");
  const original = page.locator(`[data-event-id="${events[0].id}"]`);
  await original.locator(".provenance summary").click();
  await page.evaluate(() => {
    window.originalCard = document.querySelector(".post");
    window.fixtureOnline = true;
  });
  setIdentity({ name: "Fresh neighbour", handle: "fresh.neighbour" });
  events.push(
    sign({ created_at: now - 1, content: "New post with refreshed identity" }),
  );
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => !document.querySelector("#refresh").disabled,
  );
  assert.equal(
    await original.locator(".author strong").textContent(),
    "Fresh neighbour",
  );
  assert.equal(await original.locator(".avatar").textContent(), "F");
  assert.equal(
    await original.locator(".provenance dd").first().textContent(),
    "fresh.neighbour@trailscoffee.com",
  );
  assert.equal(
    await original.evaluate(
      (e) => originalCard === e && e.querySelector(".provenance").open,
    ),
    true,
  );
});
const videoTag = ["imeta", "url https://media.example/clip.mp4", "m video/mp4", "alt Local clip"];
for (const engine of ["chromium", "webkit"])
  test(`${engine}: native video owns arrow keys without detaching actual playback`, async (t) => {
    const { page } = await fixture(t, engine, [sign({ tags: [photo(1), videoTag, photo(2)] })]);
    await page.locator(".media-tile").nth(1).click();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0.1);
    const result = await page.evaluate(() => {
      const video = document.querySelector("video");
      video.focus();
      const prevented = ["ArrowLeft", "ArrowRight"].map(key => {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        video.dispatchEvent(event);
        return event.defaultPrevented;
      });
      return { prevented, connected: video.isConnected, src: video.getAttribute("src"), playing: !video.paused, counter: document.querySelector("#media-counter").textContent };
    });
    assert.deepEqual(result.prevented, [false, false], "gallery must not cancel player keys");
    assert.equal(result.connected && result.playing, true);
    assert.equal(result.src, "https://media.example/clip.mp4");
    assert.equal(result.counter, "Media 2 of 3");
    await page.getByRole("button", { name: "Close", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#media-counter").textContent(), "Media 3 of 3");
  });
// Deterministic DOM touch fault injection, not physical-device gesture timing.
for (const engine of ["chromium", "webkit"])
  for (const scenario of ["cancel", "slide", "close", "video-start", "video-end", "identifier"])
    test(`${engine}: gallery touch ownership rejects stale ${scenario} sequence`, async (t) => {
      const { page } = await fixture(t, engine, [sign({ tags: [photo(1), videoTag, photo(2)] })]);
      await page.locator(".media-tile").first().click();
      const result = await page.evaluate(async (scenario) => {
        const dialog = document.querySelector("#media-gallery");
        const stage = dialog.querySelector(".gallery-stage");
        const send = (target, type, x, identifier = 1) => {
          const point = { identifier, clientX: x, clientY: 100 };
          const event = new Event(type, { bubbles: true });
          Object.defineProperties(event, {
            touches: { value: type === "touchstart" ? [point] : [] },
            changedTouches: { value: [point] },
          });
          target.dispatchEvent(event);
        };
        send(stage, "touchstart", 300);
        let expected = "Media 1 of 3", video;
        if (scenario === "cancel") stage.dispatchEvent(new Event("touchcancel", { bubbles: true }));
        if (["slide", "video-start", "video-end"].includes(scenario)) {
          dialog.querySelector(".gallery-controls button:last-child").click();
          expected = "Media 2 of 3";
        }
        if (scenario === "close") {
          dialog.close();
          await new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
          document.querySelector(".media-tile").click();
        }
        if (scenario.startsWith("video")) {
          stage.querySelector("button").click();
          video = stage.querySelector("video");
          await new Promise(resolve => video.addEventListener("playing", resolve, { once: true }));
          if (scenario === "video-start") send(video, "touchstart", 200);
          else send(stage, "touchstart", 300);
        }
        send(video || stage, "touchend", 100, scenario === "identifier" ? 2 : 1);
        return { counter: document.querySelector("#media-counter").textContent, expected, videoKept: !video || (video.isConnected && !video.paused && !!video.getAttribute("src")) };
      }, scenario);
      assert.equal(result.counter, result.expected, scenario);
      assert.equal(result.videoKept, true);
      await page.getByRole("button", { name: "Close", exact: true }).click();
    });
for (const engine of ["chromium", "webkit"])
  test(`${engine}: same-task native close and reopen fences queued close and restores scroll lock`, async (t) => {
    const { page } = await fixture(t, engine, [sign({ tags: [videoTag, photo(1)] })]);
    await page.evaluate(() => { document.body.style.overflow = "clip"; });
    await page.locator(".media-tile").first().click();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0.1);
    const result = await page.evaluate(async () => {
      const dialog = document.querySelector("#media-gallery");
      const video = dialog.querySelector("video");
      const nativeEvents = [];
      dialog.addEventListener("close", e => nativeEvents.push(e.isTrusted));
      const closed = () => new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));
      const first = closed();
      dialog.close();
      const synchronous = { cleaned: video.paused && !video.getAttribute("src") && !video.isConnected, overflow: document.body.style.overflow };
      document.querySelectorAll(".media-tile")[1].click();
      await first; // Actual browser-queued close, never a dispatched Event("close").
      const reopened = { open: dialog.open, image: !!dialog.querySelector(".gallery-stage img"), counter: dialog.querySelector("#media-counter").textContent, overflow: document.body.style.overflow, focus: dialog.contains(document.activeElement) };
      const last = closed();
      dialog.close();
      await last;
      return { synchronous, reopened, finalOverflow: document.body.style.overflow, nativeEvents, open: dialog.open };
    });
    assert.deepEqual(result.synchronous, { cleaned: true, overflow: "clip" }, "close must tear down before returning");
    assert.deepEqual(result.reopened, { open: true, image: true, counter: "Media 2 of 2", overflow: "hidden", focus: true });
    assert.equal(result.finalOverflow, "clip");
    assert.equal(result.open, false);
    assert.deepEqual(result.nativeEvents, [true, true]);
  });
for (const engine of ["chromium", "webkit"])
  test(`${engine}: retired observer callback cannot own a later actual video`, async (t) => {
    const { page } = await fixture(t, engine, [sign({ tags: [videoTag, photo(1)] })]);
    // Retain disconnected callbacks deterministically; actual media is not stubbed.
    // This proves ownership fencing, not spontaneous native IO queue timing.
    await page.evaluate(() => {
      window.galleryObservers = [];
      window.IntersectionObserver = class {
        constructor(callback) { this.callback = callback; galleryObservers.push(this); }
        observe() {}
        disconnect() { this.disconnected = true; }
      };
    });
    await page.locator(".media-tile").first().click();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0.1);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0.1);
    const result = await page.evaluate(() => {
      const stale = galleryObservers[0], owner = galleryObservers.at(-1);
      const video = document.querySelector("video");
      stale.callback([{ isIntersecting: false }]);
      const kept = video.isConnected && !video.paused && !!video.getAttribute("src");
      owner.callback([{ isIntersecting: false }]);
      return { disconnected: stale.disconnected, kept, currentCanSuspend: !video.isConnected && video.paused && !video.getAttribute("src") };
    });
    assert.deepEqual(result, { disconnected: true, kept: true, currentCanSuspend: true });
  });
// Historical signed receipt fixture only: no live invoice or payment request.
function receiptClaim(post) {
  const signed = (data, key) => finalizeEvent({ kind: 1, created_at: now - 20, content: "", tags: [], ...data }, key);
  const community = signed({ kind: 0, content: JSON.stringify({ nip05: "community@trailscoffee.com", lud16: COMMUNITY_ADDRESS }) }, keys.recipient);
  const issuer = signed({}, keys.issuer).pubkey;
  const mapping = { names: { community: community.pubkey } };
  const endpoint = { tag: "payRequest", allowsNostr: true, nostrPubkey: issuer, callback: PAY_CALLBACK, minSendable: 1000, maxSendable: 100000000 };
  const authority = { recipient: community.pubkey, profileId: community.id, issuer, checkedAt: now, min: 1000, max: 100000000, evidence: { profile: community, mapping, mappingJSON: JSON.stringify(mapping), endpoint } };
  const request = signed({ kind: 9734, created_at: now - 10, tags: [["p", community.pubkey], ["e", post.id], ["amount", "25000"], ["lnurl", COMMUNITY_LNURL], ["relays", "wss://relay.anmore.me"]] }, keys.sender);
  const description = JSON.stringify(request);
  const event = signed({ kind: 9735, created_at: now - 1, tags: [["p", community.pubkey], ["e", post.id], ["description", description], ["bolt11", invoice(description, { msats: 25000n, time: now - 5, paymentHash: post.id })]] }, keys.issuer);
  return { event, authority };
}
for (const engine of ["chromium", "webkit"])
  test(`${engine}: receipt Top refresh moves the actually focused card and preserves its descendant with preventScroll`, async (t) => {
    const original = sign({ created_at: now - 20, content: "Expanded neighbourhood caption. ".repeat(60), tags: [photo(1)] });
    const newer = sign({ created_at: now - 2, content: "Newer unpaid neighbour" });
    const { page } = await fixture(t, engine, [original, newer]);
    await page.evaluate(() => { window.fixtureOnline = true; document.querySelector("#order-top").click(); });
    await page.waitForFunction(() => !document.querySelector("#refresh").disabled);
    const card = page.locator(`[data-event-id="${original.id}"]`);
    assert.equal(await page.locator(".post").first().getAttribute("data-event-id"), newer.id);
    await card.locator(".caption-toggle").click();
    await card.locator(".provenance summary").click();
    await card.locator(".caption-toggle").focus();
    await page.evaluate(() => {
      window.savedFocus = document.activeElement;
      window.savedCard = savedFocus.closest(".post");
      window.focusOptions = [];
      savedFocus.focus = function(options) { focusOptions.push(options); HTMLElement.prototype.focus.call(this, options); };
      window.movedActiveCard = false;
      new MutationObserver(records => {
        if (records.some(record => [...record.removedNodes].includes(savedCard))) movedActiveCard = true;
      }).observe(document.querySelector("#feed"), { childList: true });
    });
    const accepted = await page.evaluate(async ({ event, authority }) => {
      const { FeedStore } = await import("/api.js");
      const store = new FeedStore();
      await store.restore();
      await store.addReceipts([event], authority, new Map([[event.id, ["wss://relay.anmore.me"]]]));
      return store.state.receipts.length;
    }, receiptClaim(original));
    assert.equal(accepted, 1, "receipt accepted through real durable store, as from another tab");
    await page.evaluate(() => document.querySelector("#refresh").click());
    await page.waitForFunction(() => !document.querySelector("#refresh").disabled);
    assert.equal(await page.locator(".post").first().getAttribute("data-event-id"), original.id);
    const result = await page.evaluate(() => ({ moved: movedActiveCard, sameCard: savedCard === document.querySelector(".post"), focus: savedFocus === document.activeElement, expanded: savedFocus.getAttribute("aria-expanded"), details: savedCard.querySelector("details").open, preventScroll: focusOptions.some(options => options?.preventScroll === true) }));
    assert.deepEqual(result, { moved: true, sameCard: true, focus: true, expanded: "true", details: true, preventScroll: true });
  });
for (const engine of ["chromium", "webkit"])
  test(`${engine}: signed gallery opener removal restores useful feed heading focus`, async (t) => {
    const original = sign({ tags: [videoTag] });
    const { page, events } = await fixture(t, engine, [original]);
    await page.locator(".media-tile").click();
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("video")?.currentTime > 0.1);
    await page.evaluate(() => { window.removedVideo = document.querySelector("video"); });
    const deletion = sign({ kind: 5, created_at: now, tags: [["e", original.id], ["k", "1"]], content: "Remove original" });
    await page.evaluate(async deletion => {
      const { FeedStore } = await import("/api.js");
      const store = new FeedStore(); await store.restore(); await store.remove([deletion]);
      window.fixtureOnline = true;
    }, deletion);
    events.splice(0);
    await page.evaluate(() => document.querySelector("#refresh").click());
    await page.waitForFunction(() => !document.querySelector("#refresh").disabled);
    assert.equal(await page.locator(".post").count(), 0);
    assert.deepEqual(await page.evaluate(() => ({ open: document.querySelector("#media-gallery").open, locked: document.body.style.overflow === "hidden", cleaned: removedVideo.paused && !removedVideo.getAttribute("src") && !removedVideo.isConnected, focus: document.activeElement.id })), { open: false, locked: false, cleaned: true, focus: "feed-heading" });
  });
export { fixture, sign, photo };
