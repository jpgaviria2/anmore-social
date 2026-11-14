import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { finalizeEvent } from "nostr-tools/pure";
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
export { fixture, sign, photo };
