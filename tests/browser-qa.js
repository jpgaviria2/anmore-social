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
const zapReceipt = (post, sats) => {
  const request = finalizeEvent(
    {
      kind: 9734,
      created_at: now - 10,
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
      created_at: now - 1,
      content: "",
      tags: [
        ["p", communityProfile.pubkey],
        ["e", post.id],
        ["description", description],
        [
          "bolt11",
          invoice(description, {
            msats: BigInt(sats) * 1000n,
            time: now - 5,
            paymentHash: post.id,
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
        .slice(0, f.limit))
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
    for (const e of receipts.filter((r) =>
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
const chooseOrder = async (order) => {
  await page.locator(`#order-${order}`).click();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
};
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:4173");
  await page
    .getByRole("heading", { name: "The neighbourhood, in the moment." })
    .waitFor({ timeout: 5000 });
  await page.locator(".post").first().waitFor();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  assert.equal(await page.locator(".post").count(), 12);
  assert.ok(
    publicRequests.length > 0,
    "Production must query the receipt-only peer",
  );
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
  assert.equal(
    await page.locator("#order-newest").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(callbacks, 0, "Reading and sorting must not create invoices");
  const firstTip = page
    .locator(".post")
    .first()
    .getByRole("button", { name: "Zap this post", exact: true });
  assert.equal(
    await firstTip.locator("svg").count(),
    1,
    "Tip action is a self-contained SVG lightning icon",
  );
  assert.equal(
    await firstTip.innerText(),
    "",
    "Icon action has no bulky visible label",
  );
  assert.equal(await page.locator(".zap-total").first().innerText(), "7 sats");
  assert.equal(await page.locator(".zap-total").nth(1).innerText(), "0 sats");
  await chooseOrder("top");
  assert.equal(
    await page.locator(".post").first().getAttribute("data-event-id"),
    posts[14].id,
  );
  assert.match(await page.locator(".post").first().innerText(), /1,250 sats/);
  assert.match(await page.locator("#sort-note").innerText(), /loaded posts/);
  await page
    .locator(`[data-event-id="${posts[2].id}"]`)
    .getByRole("button", { name: "Zap this post" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.match(
    await dialog.innerText(),
    /Tips support community, not the author/i,
  );
  assert.equal(await page.locator("#zap-post-id").textContent(), posts[2].id);
  assert.equal(await page.locator("#zap-post-id").isVisible(), false);
  await page.locator("#zap-amount").fill("1.5");
  await page.locator("#create-zap").click();
  await page.waitForFunction(() =>
    document.querySelector("#zap-message").textContent.includes("whole sats"),
  );
  assert.equal(callbacks, 0);
  assert.equal(
    await page.locator("#create-zap").isEnabled(),
    true,
    "Invalid local input must be editable without a new invoice attempt",
  );
  await page.locator("#zap-amount").fill("21");
  await page.locator("#create-zap").click();
  await page.locator("#zap-invoice").waitFor({ state: "visible" });
  assert.equal(
    await page.locator("#zap-qr").isVisible(),
    false,
    "QR is optional, not the default dialog",
  );
  assert.equal(
    await page.locator("#zap-invoice-text").isVisible(),
    false,
    "Raw invoice is hidden by default",
  );
  assert.equal(
    await page.locator(".zap-create").isVisible(),
    false,
    "Hide the amount form after invoice validation",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Copy invoice", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page.locator("#copy-zap").getAttribute("class"),
    "primary-button",
  );
  assert.equal(await page.locator("#zap-wallet").innerText(), "Open wallet");
  assert.equal(
    await page
      .locator(".zap-actions")
      .locator(":scope > *")
      .first()
      .getAttribute("id"),
    "copy-zap",
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 480 });
    const compact = await dialog.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, height: r.height };
    });
    assert.ok(
      compact.top >= 0 && compact.bottom <= 480,
      JSON.stringify(compact),
    );
    for (const selector of ["#copy-zap", "#zap-wallet", "#close-zap"]) {
      assert.equal(
        await page.locator(selector).evaluate((e) => {
          const r = e.getBoundingClientRect();
          return (
            r.height >= 44 &&
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
              e
          );
        }),
        true,
        selector,
      );
    }
    const compactAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(compactAxe.violations, []);
    await page.screenshot({
      path: new URL(`zap-simple-${width}-480.png`, dir).pathname,
    });
  }
  await page.evaluate(() => {
    navigator.clipboard.writeText = async (text) => {
      window.__copiedInvoice = text;
    };
  });
  await page.locator("#copy-zap").click();
  assert.equal(
    await page.evaluate(() => window.__copiedInvoice),
    lastInvoice,
    "Copy the exact validated raw BOLT11",
  );
  await page.getByText("Show QR", { exact: true }).click();
  await page.locator("#zap-qr").waitFor({ state: "visible" });
  assert.equal(callbacks, 1);
  assert.equal(
    await page.locator("#zap-wallet").getAttribute("href"),
    "lightning:" + lastInvoice,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    const image = PNG.sync.read(await page.locator("#zap-qr").screenshot());
    assert.equal(
      jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data,
      "lightning:" + lastInvoice,
      "Independent QR pixel decode",
    );
    await page.screenshot({
      path: new URL(`zap-dialog-${width}.png`, dir).pathname,
    });
  }
  const zapA11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.equal(
    zapA11y.violations.length,
    0,
    JSON.stringify(
      zapA11y.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ),
  );
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await dialog.evaluate((e) => e.contains(document.activeElement)),
      true,
      "Native dialog must contain keyboard focus",
    );
  }
  await page.locator("#copy-zap").click();
  await page.waitForFunction(() =>
    /copied|copy/i.test(document.querySelector("#zap-message").textContent),
  );
  assert.match(await page.locator("#zap-message").innerText(), /copied|copy/i);
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), false);
  assert.equal(
    await page
      .locator(`[data-event-id="${posts[2].id}"]`)
      .getByRole("button", { name: "Zap this post" })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page
    .locator(`[data-event-id="${posts[2].id}"]`)
    .getByRole("button", { name: "Zap this post" })
    .click();
  await page.locator("#zap-invoice").waitFor({ state: "visible" });
  assert.equal(await page.locator("#zap-qr").isVisible(), false);
  await page.getByText("Show QR", { exact: true }).click();
  await page.locator("#zap-qr").waitFor({ state: "visible" });
  assert.equal(
    callbacks,
    1,
    "Reopening must reuse the same invoice, never create another",
  );
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw Error("denied");
    };
  });
  await page.locator("#copy-zap").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#zap-message")
      .textContent.includes("Clipboard unavailable"),
  );
  assert.equal(
    await page.locator("#zap-copy-fallback").getAttribute("open"),
    "",
  );
  assert.equal(
    await page.locator("#zap-invoice-text").inputValue(),
    lastInvoice,
  );
  assert.equal(
    await page
      .locator("#zap-invoice-text")
      .evaluate(
        (e) => e.selectionStart === 0 && e.selectionEnd === e.value.length,
      ),
    true,
  );
  await page.keyboard.press("Escape");
  // Newest pagination retains the independent chronological cursor.
  await chooseOrder("newest");
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  holdNextFeed = true;
  await page.locator("#refresh").click();
  assert.equal(
    await page.locator("#order-top").isDisabled(),
    true,
    "Sorting is disabled while retained history is reconciled",
  );
  assert.equal(typeof resumeFeed, "function");
  resumeFeed();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  assert.equal(await page.locator(".post").count(), 15);
  let post0Amount = 7;
  const assertSnapshot = async (expectedCount, excluded = []) => {
    const cards = await page.locator(".post").evaluateAll((els) =>
      els.map((e) => ({
        id: e.dataset.eventId,
        amount: e.querySelector(".zap-total").textContent,
      })),
    );
    assert.equal(cards.length, expectedCount);
    const values = new Map([
      [posts[0].id, post0Amount],
      [posts[2].id, 21],
      [posts[14].id, 1250],
    ]);
    for (const card of cards)
      assert.equal(
        card.amount,
        `${(values.get(card.id) || 0).toLocaleString("en-CA")} sats`,
      );
    const expected = posts
      .slice(0, expectedCount + excluded.length)
      .filter((e) => !excluded.includes(e.id))
      .toSorted(
        (a, b) =>
          (values.get(b.id) || 0) - (values.get(a.id) || 0) ||
          b.created_at - a.created_at ||
          a.id.localeCompare(b.id),
      );
    assert.deepEqual(
      cards.map((c) => c.id),
      expected.map((e) => e.id),
    );
  };
  await chooseOrder("top");
  await assertSnapshot(15);
  assert.match(await page.locator("#sort-note").innerText(), /15 posts/);
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  await assertSnapshot(15);
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  await assertSnapshot(15);
  for (const state of [
    "public-only",
    "public-failure",
    "local-receipts-failure",
    "receipts-failure",
  ]) {
    mode = state;
    await page.locator("#refresh").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#feed").getAttribute("aria-busy") === "false",
    );
    const amounts = await page.locator(".zap-total").allTextContents();
    if (state === "public-only") await assertSnapshot(15);
    else {
      assert.equal(amounts[0], "1,250 sats · provisional");
      assert.equal(amounts[1], "21 sats · provisional");
      assert.equal(amounts[2], "7 sats · provisional");
      assert.ok(amounts.slice(3).every((a) => a === "—"));
      assert.match(
        await page.locator("#sort-note").innerText(),
        /Partial receipt check · totals\/order may change/,
      );
    }
  }
  mode = "normal";
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  // A conflicting reissue cannot erase the durable original payment binding.
  const previousReceipt = receipts[1];
  receipts[1] = zapReceipt(posts[0], 2000);
  post0Amount = 0;
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  assert.equal(
    await page.locator(".post").first().getAttribute("data-event-id"),
    posts[14].id,
  );
  assert.equal(
    await page.locator(".zap-total").first().innerText(),
    "1,250 sats",
  );
  receipts[1] = previousReceipt;
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  await assertSnapshot(15);
  await page.locator("#refresh").click();
  await page.waitForFunction(
    () => document.querySelector("#feed").getAttribute("aria-busy") === "false",
  );
  await assertSnapshot(15);
  // A failed refresh retains verified historical content, explicitly stale.
  const settleTop = () =>
    page.waitForFunction(
      () =>
        document.querySelector("#feed").getAttribute("aria-busy") === "false",
    );
  // Top pagination failure with unexhausted history is covered in top-buttons-qa.
  for (const trigger of ["#refresh"]) {
    mode = "relay-failure";
    await page.locator(trigger).click();
    await settleTop();
    assert.equal(await page.locator(".post").count(), 15);
    assert.match(await page.locator("#status").innerText(), /stale retained history/i);
    mode = "normal";
    await page.locator("#refresh").click();
    await settleTop();
    await assertSnapshot(15);
    assert.match(await page.locator("#sort-note").innerText(), /15 posts/);
  }
  await page.locator("#refresh").click();
  await settleTop();
  await assertSnapshot(15);
  await chooseOrder("newest");
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
    g.firstBodyTop = await page
      .locator(".post-body")
      .first()
      .evaluate((e) => e.getBoundingClientRect().top);
    g.tip = await page
      .locator(".zap-button")
      .first()
      .evaluate((e) => ({
        width: e.getBoundingClientRect().width,
        height: e.getBoundingClientRect().height,
      }));
    assert.ok(
      g.firstBodyTop < 540,
      `Compact content-first feed at every viewport: ${JSON.stringify(g)}`,
    );
    assert.ok(
      g.tip.width >= 44 && g.tip.height >= 44,
      "44px lightning touch target",
    );
    const viewportA11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.equal(
      viewportA11y.violations.length,
      0,
      JSON.stringify(viewportA11y.violations),
    );
    g.accessibilityViolations = viewportA11y.violations.length;
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
  await chooseOrder("top");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: new URL("top-390.png", dir).pathname,
    fullPage: true,
  });
  await chooseOrder("newest");
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
  mode = "recipient-missing";
  await page.locator("#refresh").click();
  await settled();
  await chooseOrder("top");
  assert.equal(
    await page.locator(".post").first().getAttribute("data-event-id"),
    posts[14].id,
    "Previously verified ledger amounts remain display-only",
  );
  assert.match(await page.locator(".zap-total").first().innerText(), /1,250 sats.*provisional/);
  assert.equal(
    await page.locator(".zap-total").first().getAttribute("aria-label"),
    "1,250 sats · provisional partial receipt check; totals/order may change",
  );
  assert.match(
    await page.locator("#sort-note").innerText(),
    /Partial receipt check/,
  );
  await page
    .locator(".post")
    .first()
    .getByRole("button", { name: "Zap this post" })
    .click();
  assert.equal(await page.locator("#create-zap").isDisabled(), true);
  assert.equal(await page.locator("#zap-qr").isVisible(), false);
  assert.match(
    await page.locator("#zap-message").innerText(),
    /recipient.*not yet verifiable/i,
  );
  assert.equal(callbacks, 1);
  await page.keyboard.press("Escape");
  mode = "invoice-mismatch";
  await page.reload();
  await settled();
  await chooseOrder("top");
  await page
    .locator(`[data-event-id="${posts[2].id}"]`)
    .getByRole("button", { name: "Zap this post" })
    .click();
  await page.locator("#create-zap").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#zap-message")
      .textContent.includes("binding failed"),
  );
  assert.equal(await page.locator("#zap-qr").isVisible(), false);
  assert.equal(callbacks, 2);
  assert.equal(await page.locator("#create-zap").isDisabled(), true);
  await page.keyboard.press("Escape");
  mode = "normal";
  await page.reload();
  await settled();
  await page
    .locator(".post")
    .first()
    .getByRole("button", { name: "Zap this post" })
    .click();
  mode = "deleted";
  await page.locator("#create-zap").click();
  await page.waitForFunction(() =>
    document
      .querySelector("#zap-message")
      .textContent.includes("could not be reverified"),
  );
  assert.equal(callbacks, 2, "Deleted posts must not reach invoice callback");
  await page.keyboard.press("Escape");
  mode = "deleted";
  receipts[1] = zapReceipt(posts[0], 2000); // Deleted highest tip must not resurrect/rank.
  await page.locator("#refresh").click();
  await settled();
  assert.equal(
    await page.locator(`[data-event-id="${posts[0].id}"]`).count(),
    0,
  );
  await page.locator("#refresh").click();
  await settled();
  assert.equal(
    await page.locator(`[data-event-id="${posts[0].id}"]`).count(),
    0,
  );
  assert.equal(await page.locator(".post").count(), 14);
  await chooseOrder("top");
  await assertSnapshot(14, [posts[0].id]);
  assert.equal(
    await page.locator(".post").first().getAttribute("data-event-id"),
    posts[14].id,
  );
  await page.reload();
  await settled();
  assert.equal(
    await page.locator(`[data-event-id="${posts[0].id}"]`).count(),
    0,
  );
  await chooseOrder("top");
  await assertSnapshot(14, [posts[0].id]);
  await page.locator("#refresh").click();
  await settled();
  await assertSnapshot(14, [posts[0].id]);
  receipts[1] = previousReceipt;
  for (const state of [
    "identity-failure",
    "relay-failure",
    "empty",
    "mismatch",
  ]) {
    mode = state;
    await page.locator("#refresh").click();
    await settled();
    assert.equal(await page.locator(".post").count(), state === "mismatch" ? 0 : 14);
    if (state === "identity-failure")
      assert.match(
        await page.locator("#status").innerText(),
        /current identity checks unavailable/,
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
        postZaps: {
          syntheticInvoiceCallbacks: callbacks,
          qrPixelDecodeWidths: [320, 390, 768, 1440],
          dialogAccessibilityViolations: zapA11y.violations.length,
          newestDefault: true,
          explicitLoadedPostAmountSort: true,
          amountsAndOrderShareVerifiedSnapshot: true,
          topPreservedAcrossRefreshAndPagination: true,
          refreshedReceiptsChangeOrderAndAmounts: true,
          inFlightSortDisabled: true,
          clipboardDeniedFallback: true,
          cachedInvoiceReused: true,
          recipientUnavailableFailsClosed: true,
          invoiceHashMismatchRejected: true,
          deletedPostZeroCallbacks: true,
          deletedHighestTipCompleteTopOrderAndAmounts: true,
          receiptOnlyPublicPeerAndCrossRelayDeduplication: true,
          publicOnlyAndEitherPeerFailure: true,
          partialLowerBoundVersusUnavailable: true,
        },
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
