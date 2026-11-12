import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
test("top install experience is compact in-flow before welcome, with no duplicate footer CTA and finite reduced-motion-safe animation", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const css = await readFile(new URL("feed.css", root), "utf8");
  assert.ok(
    html.indexOf('id="install-area"') < html.indexOf('class="welcome"'),
  );
  assert.ok(
    html.indexOf('id="install-invitation"') < html.indexOf('class="welcome"'),
  );
  assert.equal((html.match(/id="install-native"/g) || []).length, 1);
  assert.doesNotMatch(
    html.slice(html.indexOf("<footer"), html.indexOf("</footer>")),
    /install-/,
  );
  assert.match(css, /@keyframes install-enter/);
  assert.match(css, /@keyframes install-icon/);
  assert.match(
    css,
    /prefers-reduced-motion: reduce[\s\S]*\.install-icon[\s\S]*animation: none/,
  );
  assert.doesNotMatch(css, /animation:[^;]*infinite/);
});
