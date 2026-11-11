import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import assert from "node:assert/strict";
let baseline = true;
const legacyCommit = "9e89c6ae178e6a934a0637bbdfbd951cf7d68602";
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (path === "/migration") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><title>Worker migration fixture</title><p>Local migration fixture</p><script>navigator.serviceWorker.register("/sw.js")</script>',
    );
    return;
  }
  const file = path === "/" ? "index.html" : path.slice(1);
  if (file.includes("..")) {
    res.writeHead(400).end();
    return;
  }
  try {
    const body = baseline
      ? execFileSync("git", ["show", `${legacyCommit}:${file}`], {
          stdio: ["ignore", "pipe", "ignore"],
        })
      : await readFile(new URL("../" + file, import.meta.url));
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "application/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".html")
            ? "text/html"
            : "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/migration`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(
    () => navigator.serviceWorker.controller?.state === "activated",
  );
  const before = await page.evaluate(() => caches.keys());
  assert.ok(before.some((k) => k.startsWith("anmore-social-pwa-")));
  baseline = false;
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  let state;
  for (let i = 0; i < 100; i++) {
    state = await page.evaluate(async () => ({
      registrations: (await navigator.serviceWorker.getRegistrations()).length,
      keys: await caches.keys(),
    }));
    if (
      state.registrations === 0 &&
      state.keys.filter((k) => k.startsWith("anmore-social-pwa-")).length === 0
    )
      break;
    await page.waitForTimeout(50);
  }
  const after = state.keys;
  assert.equal(state.registrations, 0);
  assert.equal(
    after.filter((k) => k.startsWith("anmore-social-pwa-")).length,
    0,
  );
  const result = {
    oldWorker: `Exact legacy ${legacyCommit}:sw.js`,
    before,
    after,
    unregistered: true,
  };
  await writeFile("qa/worker-migration.json", JSON.stringify(result, null, 2));
  console.log(result);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
