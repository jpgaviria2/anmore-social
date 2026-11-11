import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
const root = new URL("../", import.meta.url);
test("public artifact is feed-first, read-only, algorithm-free and uses only the pinned relay", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const source = (
    await Promise.all(
      ["src/app.js", "src/core.js", "src/relay.js"].map((p) =>
        readFile(new URL(p, root), "utf8"),
      ),
    )
  ).join("\n");
  assert.ok(html.indexOf('id="community"') < html.indexOf('id="upcoming"'));
  assert.match(
    html,
    /connect-src 'self' wss:\/\/relay\.anmore\.me https:\/\/trailscoffee\.com;/,
  );
  assert.deepEqual(
    [...new Set(source.match(/wss:\/\/[^'"\s]+/g))],
    ["wss://relay.anmore.me"],
  );
  assert.doesNotMatch(
    source,
    /localStorage|sessionStorage|generateSecretKey|finalizeEvent|innerHTML|insertAdjacentHTML|IntersectionObserver|sentiment|personalization|engagementScore/,
  );
  assert.doesNotMatch(
    html,
    /FullCalendar|data-create|identity-login|nostr-identity/,
  );
  await assert.rejects(access(new URL("nostr-identity.js", root)));
  await assert.rejects(access(new URL("data/world-cup-2026.json", root)));
});
