import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
const root = new URL("../", import.meta.url);
test("content stays pinned to Anmore; only a hardcoded receipt-only Primal peer is allowlisted", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const source = (
    await Promise.all(
      ["src/app.js", "src/core.js", "src/relay.js", "src/receipts.js"].map(
        (p) => readFile(new URL(p, root), "utf8"),
      ),
    )
  ).join("\n");
  assert.ok(html.indexOf('id="community"') < html.indexOf('id="upcoming"'));
  assert.match(
    html,
    /connect-src 'self' wss:\/\/relay\.anmore\.me wss:\/\/relay\.primal\.net https:\/\/trailscoffee\.com https:\/\/pay\.trailscoffee\.com;/,
  );
  assert.deepEqual(
    [...new Set(source.match(/wss:\/\/[^'"\s]+/g))],
    ["wss://relay.anmore.me", "wss://relay.primal.net"],
  );
  assert.doesNotMatch(
    source,
    /localStorage|sessionStorage|generateSecretKey|finalizeEvent|innerHTML|insertAdjacentHTML|IntersectionObserver|sentiment|personalization|engagementScore/,
  );
  assert.doesNotMatch(
    html,
    /FullCalendar|data-create|identity-login|nostr-identity/,
  );
  assert.match(html, /value="newest" selected/);
  assert.match(html, /value="top">Top zapped/);
  assert.match(html, /Top zapped among loaded posts only/);
  assert.match(html, /All sats go to the community group, not the author/);
  assert.doesNotMatch(html, /lightning:coffeelover|api\.qrserver|quickchart/);
  const zaps = await readFile(new URL("src/zaps.js", root), "utf8");
  const ui = await readFile(new URL("src/zap-ui.js", root), "utf8");
  assert.doesNotMatch(
    source + zaps + ui,
    /localStorage|sessionStorage|window\.nostr|webln|sendPayment|meltProofs|mintProofs|nsec/,
  );
  assert.match(zaps, /finally\s*\{\s*key\.fill\(0\);?\s*\}/);
  await assert.rejects(access(new URL("nostr-identity.js", root)));
  await assert.rejects(access(new URL("data/world-cup-2026.json", root)));
});
