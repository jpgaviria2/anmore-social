import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const root = new URL("../", import.meta.url);
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  try {
    const file = path === "/" ? "index.html" : path.slice(1);
    if (file.includes("..")) throw Error("path");
    const data = await readFile(new URL(file, root));
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
    res.end(data);
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
try {
  const context = await browser.newContext();
  await context.route("https://**", (route) => route.abort());
  await context.routeWebSocket(/wss:\/\/.*/, (ws) => ws.close());
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator("#install-help").waitFor({ timeout: 3000 });
  assert.equal(
    await page.locator("#install-invitation").isVisible(),
    false,
    "No first-load interruption",
  );
  await page.locator("#install-help summary").click();
  assert.match(
    await page.locator("#install-instructions").innerText(),
    /browser.*install|install.*browser/i,
  );
  // Real production entry point must wire engagement and explicit native prompt.
  await page.locator('a[href="#upcoming"]').click();
  assert.equal(await page.locator("#install-invitation").isVisible(), true);
  assert.equal(
    await page.locator("main > #install-invitation").count(),
    1,
    "Compact invitation stays in reading flow, not an overlay",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    for (const selector of [
      "#install-help summary",
      "#install-show-help",
      "#install-dismiss",
    ]) {
      assert.ok(
        await page
          .locator(selector)
          .evaluate((e) => e.getBoundingClientRect().height >= 44),
        selector + " touch target",
      );
    }
    assert.ok(
      await page
        .locator("#install-invitation")
        .evaluate((e) => e.getBoundingClientRect().height < 210),
      "Compact invitation",
    );
    await page
      .locator("#install-invitation")
      .screenshot({
        path: new URL(`qa/pwa-invitation-${width}.png`, root).pathname,
      });
    const invitationAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.deepEqual(invitationAxe.violations, []);
  }
  await page.locator("#install-dismiss").focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .locator("#install-help summary")
      .evaluate((e) => e === document.activeElement),
    true,
    "Keyboard dismissal restores a stable help control",
  );
  assert.equal(await page.locator("#install-invitation").isVisible(), false);
  assert.equal(
    await page.evaluate(() => Object.keys(localStorage).join(",")),
    "anmore-install-dismissed-at",
  );
  await page.reload();
  await page.locator('a[href="#upcoming"]').click();
  assert.equal(await page.locator("#install-invitation").isVisible(), false);
  await page.evaluate(() => {
    window.__prompts = 0;
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => {
      window.__prompts++;
      return { outcome: "dismissed" };
    };
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    dispatchEvent(e);
    window.__prevented = e.defaultPrevented;
  });
  assert.equal(await page.evaluate(() => window.__prevented), true);
  assert.equal(
    await page.evaluate(() => window.__prompts),
    0,
    "Native prompt requires explicit gesture",
  );
  await page.locator("#install-help summary").click();
  await page.locator("#install-native").click();
  assert.equal(await page.evaluate(() => window.__prompts), 1);
  assert.equal(await page.locator("#install-native").isVisible(), false);
  assert.match(
    await page.locator("#install-status").innerText(),
    /not installed|dismissed/i,
  );
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => {
      window.__prompts++;
      throw Error("denied");
    };
    dispatchEvent(e);
  });
  await page.locator("#install-native").click();
  assert.match(
    await page.locator("#install-status").innerText(),
    /browser menu|instructions/i,
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
    assert.deepEqual(
      axe.violations,
      [],
      JSON.stringify(
        axe.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ),
    );
    await page.screenshot({
      path: new URL(`qa/pwa-help-${width}.png`, root).pathname,
      fullPage: true,
    });
  }
  await page.locator("#install-help summary").focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator("#install-help").getAttribute("open"), null);
  await page.keyboard.press("Enter");
  assert.notEqual(
    await page.locator("#install-help").getAttribute("open"),
    null,
  );
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => ({ outcome: "accepted" });
    dispatchEvent(e);
  });
  await page.locator("#install-native").click();
  assert.match(
    await page.locator("#install-status").innerText(),
    /Installation requested/,
  );
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () =>
      new Promise((resolve) => (window.__resolveInstall = resolve));
    dispatchEvent(e);
  });
  await page.locator("#install-native").click();
  assert.equal(
    await page.locator("#install-native").isVisible(),
    false,
    "Single-use pending event",
  );
  await page.evaluate(() => {
    dispatchEvent(new Event("appinstalled"));
    window.__resolveInstall({ outcome: "accepted" });
  });
  assert.equal(await page.locator("#install-area").isVisible(), false);
  assert.equal(await page.locator("#install-invitation").isVisible(), false);
  await page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () => {
      throw Error("must not use");
    };
    dispatchEvent(e);
  });
  assert.equal(
    await page.locator("#install-native").isVisible(),
    false,
    "Installed suppresses later prompts",
  );
  await context.close();
  for (const scenario of [
    {
      name: "ios",
      userAgent: "Mozilla/5.0 (iPhone) AppleWebKit Safari",
      text: /Safari.*Share.*Add to Home Screen.*Open as Web App/,
    },
    {
      name: "ipad",
      userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit Safari",
      touch: 5,
      text: /Safari.*Share/,
    },
    {
      name: "android",
      userAgent: "Mozilla/5.0 Android Chrome",
      text: /browser menu.*Install app/,
    },
    { name: "denied", denied: true, text: /browser.*install/i },
    { name: "no-worker", noWorker: true, text: /browser.*install/i },
    { name: "standalone-media", standalone: true },
    { name: "standalone-apple", appleStandalone: true },
  ]) {
    const device = await browser.newContext({ userAgent: scenario.userAgent });
    await device.route("https://**", (route) => route.abort());
    await device.routeWebSocket(/wss:\/\/.*/, (ws) => ws.close());
    await device.addInitScript((config) => {
      if (config.touch)
        Object.defineProperty(navigator, "maxTouchPoints", {
          value: config.touch,
        });
      if (config.appleStandalone)
        Object.defineProperty(navigator, "standalone", { value: true });
      if (config.standalone) {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (q) =>
          q === "(display-mode: standalone)"
            ? { matches: true, addEventListener() {} }
            : original(q);
      }
      if (config.noWorker) delete Navigator.prototype.serviceWorker;
      if (config.denied)
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("denied", "SecurityError");
          },
        });
    }, scenario);
    const tab = await device.newPage();
    const errors = [];
    tab.on("pageerror", (e) => errors.push(e.message));
    await tab.goto(origin);
    if (scenario.standalone || scenario.appleStandalone) {
      assert.equal(
        await tab.locator("#install-area").isVisible(),
        false,
        scenario.name,
      );
      await tab.locator('a[href="#upcoming"]').click();
      assert.equal(
        await tab.locator("#install-invitation").isVisible(),
        false,
        scenario.name,
      );
    } else {
      await tab.locator("#install-help summary").click();
      assert.match(
        await tab.locator("#install-instructions").innerText(),
        scenario.text,
        scenario.name,
      );
      if (scenario.denied) {
        await tab.locator('a[href="#upcoming"]').click();
        await tab.locator("#install-dismiss").click();
        await tab.locator('a[href="#upcoming"]').click();
        assert.equal(
          await tab.locator("#install-invitation").isVisible(),
          false,
        );
      }
    }
    assert.deepEqual(errors, [], scenario.name);
    await device.close();
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  const plain = await noScript.newPage();
  await plain.goto(origin);
  await plain.locator("#install-help summary").click();
  assert.match(
    await plain.locator("#install-instructions").innerText(),
    /Safari.*Share.*Add to Home Screen.*Open as Web App/,
  );
  assert.equal(await plain.locator("#install-native").isVisible(), false);
  assert.equal(await plain.locator("#install-invitation").isVisible(), false);
  await noScript.close();
  await writeFile(
    new URL("qa/pwa-browser-results.json", root),
    JSON.stringify(
      {
        fixture: true,
        browser: browser.version(),
        widths: [320, 390, 768, 1440],
        keyboard: true,
        axeViolations: 0,
        noFirstLoadInvitation: true,
        trustedEngagement: true,
        dismissCooldownReload: true,
        noAutomaticPrompt: true,
        nativeEventSingleUse: true,
        dismissedRecovery: true,
        rejectedRecovery: true,
        appinstalledPendingRace: true,
        suppressedAfterInstallation: true,
        deviceInstructions: ["ios", "ipad", "android", "desktop"],
        storageDenial: true,
        standalone: ["display-mode", "navigator.standalone"],
        physicalInstallationTested: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PWA browser QA passed: native deferred/dismissed/rejected/pending/appinstalled; cooldown, storage denial, platform, standalone, keyboard, widths and axe",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
