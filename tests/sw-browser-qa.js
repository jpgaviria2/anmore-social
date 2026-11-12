import http from "node:http";
import { readFile, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
let revision = 1,
  mode = "current",
  networkDown = false;
const legacyCommit = "9e89c6ae178e6a934a0637bbdfbd951cf7d68602";
const retirementCommit = "d5f5870";
const server = http.createServer(async (req, res) => {
  if (networkDown) {
    req.socket.destroy();
    return;
  }
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/migration") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html lang="en"><title>Local migration fixture</title><h1>Worker migration</h1></html>',
    );
    return;
  }
  const file = path === "/" ? "index.html" : path.slice(1);
  if (file.includes("..")) {
    res.writeHead(400).end();
    return;
  }
  try {
    let body =
      mode === "legacy"
        ? execFileSync("git", ["show", `${legacyCommit}:${file}`], {
            stdio: ["ignore", "pipe", "ignore"],
          })
        : await readFile(new URL(file, root));
    if (file === "sw.js") {
      if (mode !== "current")
        body = execFileSync("git", [
          "show",
          `${mode === "legacy" ? legacyCommit : retirementCommit}:sw.js`,
        ]);
      else
        body = Buffer.from(
          body
            .toString()
            .replaceAll(
              "anmore-social-offline-v1",
              `anmore-social-offline-v${revision}`,
            ),
        );
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "application/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".html")
            ? "text/html"
            : file.endsWith(".webmanifest")
              ? "application/manifest+json"
              : "image/png",
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir(new URL("qa/", root), { recursive: true });
const evidence = {};
const contextFor = async () => {
  const context = await browser.newContext();
  await context.route("https://**", (route) => route.abort());
  await context.routeWebSocket(/wss:\/\/.*/, (ws) => ws.close());
  return context;
};
const controlled = (page) =>
  page.waitForFunction(
    () => navigator.serviceWorker.controller?.state === "activated",
    { timeout: 5000 },
  );
const cacheState = (page) =>
  page.evaluate(async () => {
    const keys = await caches.keys();
    const entries = {};
    for (const key of keys)
      entries[key] = (await (await caches.open(key)).keys()).map(
        (r) => new URL(r.url).pathname,
      );
    return entries;
  });
try {
  const context = await contextFor();
  const page = await context.newPage();
  await page.goto(origin);
  await controlled(page);
  assert.equal(
    await page.locator("#app-update").isVisible(),
    false,
    "First worker activation is not an update invitation",
  );
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send("Page.getAppManifest");
  assert.deepEqual(manifest.errors, []);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  assert.deepEqual(
    installability.installabilityErrors.map((e) => e.errorId),
    ["in-incognito"],
    "Isolated fixture context reports only private-mode installation restriction",
  );
  const profile = await mkdtemp(new URL("qa/pwa-profile-", root).pathname);
  const normal = await chromium.launchPersistentContext(profile, {
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  try {
    await normal.route("https://**", (route) => route.abort());
    await normal.routeWebSocket(/wss:\/\/.*/, (ws) => ws.close());
    const installTab = await normal.newPage();
    await installTab.goto(origin);
    await controlled(installTab);
    const protocol = await normal.newCDPSession(installTab);
    const errors = (await protocol.send("Page.getInstallabilityErrors"))
      .installabilityErrors;
    assert.deepEqual(
      errors,
      [],
      "Normal-profile Chromium installability has no errors",
    );
    evidence.installability = {
      manifestErrors: manifest.errors,
      errors,
      privateModeErrors: installability.installabilityErrors,
      browser: browser.version(),
    };
  } finally {
    await normal.close();
    await rm(profile, { recursive: true, force: true });
  }
  assert.deepEqual(await cacheState(page), {
    "anmore-social-offline-v1": ["/offline.html", "/offline.css"],
  });
  await page.evaluate(async () => {
    for (const url of [
      "/profiles",
      "/receipts",
      "/payment",
      "/wallet",
      "/app.js",
    ])
      await fetch(url);
    await caches.open("unrelated-cache");
  });
  assert.deepEqual((await cacheState(page))["anmore-social-offline-v1"], [
    "/offline.html",
    "/offline.css",
  ]);
  networkDown = true;
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "A moment offline." }).waitFor();
  assert.equal(
    await page.locator("script,button,canvas,form").count(),
    0,
    "Offline document has no zap actions/runtime",
  );
  assert.match(
    await page.locator("main").innerText(),
    /payments.*connection|connection.*payments/i,
  );
  assert.equal(
    await page
      .locator("h1")
      .evaluate((el) => getComputedStyle(el).fontFamily.includes("Georgia")),
    true,
    "Dedicated stylesheet available offline",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const offlineAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(offlineAxe.violations, []);
    await page.screenshot({
      path: new URL(`qa/pwa-offline-${width}.png`, root).pathname,
    });
  }
  evidence.offline = await cacheState(page);
  networkDown = false;
  await context.setOffline(false);
  await page.getByRole("link", { name: /Try again/ }).click();
  await page.locator("#feed").waitFor({ state: "attached" });
  const second = await context.newPage();
  await second.goto(origin);
  await controlled(second);
  await second.evaluate(() => (window.__invoiceSession = "preserved"));
  revision = 2;
  await page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration()).update(),
  );
  await page.waitForFunction(
    async () => (await navigator.serviceWorker.getRegistration())?.waiting,
  );
  await page.locator("#app-update").waitFor({ timeout: 3000 });
  assert.equal(
    await page.locator("#update-reload").isDisabled(),
    true,
    "No disruptive auto update",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(axe.violations, []);
  }
  await page.locator("#update-confirm").focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#update-reload").isEnabled(), true);
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#update-reload").isDisabled(), true);
  await page.evaluate(() => document.querySelector("#zap-dialog").showModal());
  await page.evaluate(() => {
    document.querySelector("#update-confirm").checked = true;
    document
      .querySelector("#update-confirm")
      .dispatchEvent(new Event("change"));
    document.querySelector("#update-reload").click();
  });
  assert.equal(
    await page.evaluate(
      async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
    ),
    true,
    "Open zap dialog blocks update activation",
  );
  await page.evaluate(() => document.querySelector("#zap-dialog").close());
  await page.locator("#update-confirm").uncheck();
  await page.locator("#update-confirm").check();
  await Promise.all([
    page.waitForEvent("load"),
    page.locator("#update-reload").click(),
  ]);
  await page.waitForFunction(async () =>
    (await caches.keys()).includes("anmore-social-offline-v2"),
  );
  assert.deepEqual(await cacheState(page), {
    "anmore-social-offline-v2": ["/offline.html", "/offline.css"],
    "unrelated-cache": [],
  });
  assert.equal(
    await second.evaluate(() => window.__invoiceSession),
    "preserved",
    "No forced reload of another tab/invoice session",
  );
  evidence.update = {
    explicitConsent: true,
    dialogBlocked: true,
    otherTabPreserved: true,
    cache: await cacheState(page),
  };
  await context.close();
  for (const oldMode of ["legacy", "retirement"]) {
    mode = oldMode;
    revision = 1;
    const migration = await contextFor();
    const tab = await migration.newPage();
    await tab.goto(origin + "/migration");
    await tab.evaluate(async () => {
      await caches.open("unrelated-cache");
      await caches.open("anmore-social-pwa-obsolete-fixture");
      await navigator.serviceWorker.register("/sw.js");
    });
    await controlled(tab);
    if (oldMode === "retirement")
      await tab.waitForFunction(
        async () =>
          (await navigator.serviceWorker.getRegistrations()).length === 0,
      );
    const before = await cacheState(tab);
    mode = "current";
    await tab.goto(origin);
    if (oldMode === "legacy") {
      await tab.evaluate(async () =>
        (await navigator.serviceWorker.getRegistration()).update(),
      );
      await tab.locator("#app-update").waitFor();
      await tab.locator("#update-confirm").check();
      await Promise.all([
        tab.waitForEvent("load"),
        tab.locator("#update-reload").click(),
      ]);
    }
    await controlled(tab);
    await tab.waitForFunction(async () =>
      (await caches.keys()).includes("anmore-social-offline-v1"),
    );
    assert.deepEqual(await cacheState(tab), {
      "unrelated-cache": [],
      "anmore-social-offline-v1": ["/offline.html", "/offline.css"],
    });
    assert.equal(
      await tab.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
      1,
    );
    evidence[oldMode] = {
      oldWorker: oldMode === "legacy" ? legacyCommit : retirementCommit,
      before,
      after: await cacheState(tab),
      registered: true,
    };
    await migration.close();
  }
  await writeFile(
    new URL("qa/worker-migration.json", root),
    JSON.stringify(evidence, null, 2),
  );
  console.log("PWA worker browser QA passed", evidence);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
