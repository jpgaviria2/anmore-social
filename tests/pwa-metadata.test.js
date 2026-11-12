import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
const root = new URL("../", import.meta.url);
test("install metadata has stable identity, explicit worker CSP, Apple icon, theme consistency and dedicated safe maskable artwork", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("manifest.webmanifest", root)),
  );
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /worker-src 'self';/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.lang, "en-CA");
  assert.equal(manifest.theme_color, "#244e42");
  assert.equal(manifest.background_color, "#faf9f5");
  assert.equal(manifest.orientation, "any");
  const maskable = manifest.icons.find((i) => i.purpose === "maskable");
  assert.equal(maskable.src, "/icons/maskable-512.png");
  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
    ["maskable-512.png", 512],
  ]) {
    const image = PNG.sync.read(await readFile(new URL("icons/" + file, root)));
    assert.equal(image.width, size);
    assert.equal(image.height, size);
    const background = [...image.data.subarray(0, 4)];
    assert.equal(background[3], 255);
    if (file.startsWith("maskable")) {
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const pixel = [
            ...image.data.subarray((y * size + x) * 4, (y * size + x) * 4 + 4),
          ];
          if (Math.hypot(x - size / 2, y - size / 2) > size * 0.4)
            assert.deepEqual(
              pixel,
              background,
              "Artwork must remain inside maskable safe circle",
            );
        }
    }
  }
});
