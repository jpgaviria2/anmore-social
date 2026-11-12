// Deterministic local source-art renderer; no remote fonts, images or services.
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const svg = await readFile(
    new URL("../icons/anmore.svg", import.meta.url),
    "utf8",
  );
  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
    ["maskable-512.png", 512],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>body{margin:0}svg{display:block;width:100%;height:100%}</style>${svg}`,
    );
    await page.screenshot({
      path: new URL("../icons/" + file, import.meta.url).pathname,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
