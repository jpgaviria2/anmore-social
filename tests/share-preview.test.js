import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PNG } from "pngjs";
const root = new URL("../", import.meta.url);
test("share metadata explicitly uses existing branded artwork instead of leaving a crawler to select page media", async () => {
  const html = (await readFile(new URL("index.html", root), "utf8")).replace(
    /\s+/g,
    " ",
  );
  for (const name of ["og:image", "twitter:image"])
    assert.match(
      html,
      new RegExp(
        `(?:property|name)="${name}" content="https://anmore.social/icons/icon-512.png"`,
      ),
    );
  assert.match(html, /property="og:url" content="https:\/\/anmore.social\/"/);
  assert.match(html, /property="og:image:width" content="512"/);
  assert.match(html, /property="og:image:height" content="512"/);
  assert.match(html, /name="twitter:card" content="summary"/);
  const png = PNG.sync.read(
    await readFile(new URL("icons/icon-512.png", root)),
  );
  assert.equal(png.width, 512);
  assert.equal(png.height, 512);
  assert.deepEqual([...png.data.subarray(0, 4)], [36, 78, 66, 255]);
});
