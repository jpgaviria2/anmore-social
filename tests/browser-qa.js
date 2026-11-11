import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { finalizeEvent } from "nostr-tools/pure";
const dir = new URL("../qa/", import.meta.url);
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const key = new Uint8Array(32).fill(3),
  now = Math.floor(Date.now() / 1000);
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
  ws.onMessage((raw) => {
    const m = JSON.parse(raw);
    requests.push(m);
    if (m[0] !== "REQ") return;
    if (mode === "relay-failure") {
      ws.send(
        JSON.stringify(["CLOSED", m[1], "restricted: fixture rejection"]),
      );
      return;
    }
    const filters = m.slice(2);
    const candidates =
      mode === "empty"
        ? []
        : [
            profile,
            ...posts,
            calendar,
            ...(mode === "deleted" ? [deletion] : []),
          ];
    const selected = new Map();
    for (const f of filters)
      for (const e of candidates
        .filter(
          (e) =>
            (!f.kinds || f.kinds.includes(e.kind)) &&
            (!f.authors || f.authors.includes(e.pubkey)) &&
            (!f.until || e.created_at <= f.until) &&
            (!f["#d"] ||
              f["#d"].includes(e.tags.find((t) => t[0] === "d")?.[1])),
        )
        .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
        .slice(0, f.limit))
        selected.set(e.id, e);
    for (const e of selected.values())
      ws.send(JSON.stringify(["EVENT", m[1], { ...e, indexed_at: now }]));
    ws.send(JSON.stringify(["EOSE", m[1]]));
  }),
);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto("http://127.0.0.1:4173");
  await page
    .getByRole("heading", { name: "The neighbourhood, in the moment." })
    .waitFor({ timeout: 5000 });
  await page.locator(".post").first().waitFor();
  assert.equal(await page.locator(".post").count(), 12);
  assert.equal(
    await page.locator(".post script,.post img[onerror]").count(),
    0,
  );
  assert.ok(
    (await page.locator(".post").nth(1).innerText()).includes(
      "<img src=x onerror=alert(1)>",
    ),
  );
  assert.equal(
    await page
      .getByRole("button", { name: /login|like|follow|reply/i })
      .count(),
    0,
  );
  assert.deepEqual(
    await page
      .locator(".post")
      .evaluateAll((els) => els.map((e) => Number(e.dataset.createdAt))),
    posts.slice(0, 12).map((e) => e.created_at),
  );
  await page.getByRole("button", { name: "Load more updates" }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".post").count(), 15);
  assert.ok(requests.every((m) => ["REQ", "CLOSE"].includes(m[0])));
  const geometry = [];
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(100);
    const g = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    geometry.push(g);
    assert.equal(g.width, width);
    assert.ok(g.scroll <= width, JSON.stringify(g));
    if (width === 390)
      assert.ok(
        (await page
          .locator(".post-body")
          .first()
          .evaluate((e) => e.getBoundingClientRect().top)) < 740,
        "Mobile feed content must appear within the first viewport",
      );
    await page.screenshot({
      path: new URL(`fixture-${width}.png`, dir).pathname,
      fullPage: true,
    });
    await page.screenshot({
      path: new URL(`fixture-viewport-${width}.png`, dir).pathname,
    });
  }
  await page.locator(".provenance summary").first().click();
  assert.ok(
    (await page.locator(".provenance").first().innerText()).includes(
      posts[0].id,
    ),
  );
  await page
    .locator(".post details")
    .nth(1)
    .click()
    .catch(() => {});
  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  await writeFile(
    new URL("accessibility.json", dir),
    JSON.stringify(a11y.violations, null, 2),
  );
  assert.equal(
    a11y.violations.length,
    0,
    JSON.stringify(
      a11y.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
  assert.deepEqual(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
    { local: 0, session: 0 },
  );
  const settled = () =>
    page.waitForFunction(
      () =>
        document.querySelector("#feed").getAttribute("aria-busy") === "false",
    );
  mode = "deleted";
  await page.locator("#refresh").click();
  await settled();
  assert.equal(
    await page.locator(`[data-event-id="${posts[0].id}"]`).count(),
    0,
  );
  await page.locator("#load-more").click();
  await settled();
  assert.equal(
    await page.locator(`[data-event-id="${posts[0].id}"]`).count(),
    0,
  );
  assert.equal(await page.locator(".post").count(), 14);
  await page.reload();
  await settled();
  assert.equal(
    await page.locator(`[data-event-id="${posts[0].id}"]`).count(),
    0,
  );
  for (const state of [
    "mismatch",
    "identity-failure",
    "relay-failure",
    "empty",
  ]) {
    mode = state;
    await page.locator("#refresh").click();
    await settled();
    assert.equal(await page.locator(".post").count(), 0);
    if (state === "identity-failure")
      assert.match(
        await page.locator("#status").innerText(),
        /could not be checked/,
      );
    if (state === "relay-failure")
      assert.match(await page.locator("#status").innerText(), /declined/);
    await page.screenshot({
      path: new URL(`state-${state}.png`, dir).pathname,
    });
  }
  await context.setOffline(true);
  await page.locator("#refresh").click();
  await settled();
  assert.match(await page.locator("#status").innerText(), /offline/);
  assert.equal(await page.locator(".post").count(), 0);
  await page.screenshot({ path: new URL("state-offline.png", dir).pathname });
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("browser-results.json", dir),
    JSON.stringify(
      {
        fixture: true,
        geometry,
        requests: requests.length,
        errors,
        accessibilityViolations: a11y.violations.length,
        deletionPaginationReload: true,
        states: [
          "mismatch",
          "identity-failure",
          "relay-failure",
          "empty",
          "offline",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    "Fixture browser QA passed: chronology, dynamic identity, safe rendering, provenance, load more; 1440/768/390/320 overflow-free.",
  );
} finally {
  await browser.close();
}
