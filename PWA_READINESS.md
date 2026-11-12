# Scoped PWA readiness — historical original implementation

> The original footer/engagement placement below is superseded by the owner-requested initial top install banner. See `TOP_INSTALL_READINESS.md` for the current correction and gates. Historical RED/GREEN and release evidence below describes the original candidate, not the new UX contract. Worker/payment/privacy invariants remain unchanged.

## Scope and authorization

- Worktree: `/Users/trails/anmore-social-pwa`.
- Base/unchanged HEAD: `d5f58705d5b2a327b527efb9ba403f355e72aed7`.
- Verification date: November 11, 2026. Final dependency/build/unit gate completed at `2026-11-11T23:32:27Z`; browser suites ran subsequently against that built bundle.
- No commit, push, merge, deployment, production configuration change, real invoice request, payment, receipt publication or relay write was performed. Browser fixtures intercept external community/payment traffic; worker fixtures serve local files and historical Git objects only.
- The owner explicitly reversed the earlier **worker-retirement product decision**. README and the historical `PRODUCTION_READINESS.md` now mark that supersession. The prior invariant **never cache community content or identity/payment state** remains in force. Retirement tests were intentionally replaced with stricter install/privacy/update/migration assertions, not silently deleted.
- Source changes to the existing reader are limited to importing/initializing the PWA module and replacing its retirement registration block. Feed, calendar normalization, source authority, receipt verification, payment parsing, invoice binding, callback admission, totals and sorting implementations remain unchanged. Existing financial/content regressions still run.

## Delivered behavior

### Optional install experience

- Always-available native disclosure in the footer, usable without JavaScript. Progressive enhancement supplies iPhone/iPad Safari, Android and desktop instructions. iPad desktop-style UA plus touch capability is recognized.
- iOS help: open in Safari → Share → Add to Home Screen → **Open as Web App if offered** → Add. In-app browsers are directed to Safari. Android uses the browser's deferred native prompt when available, otherwise browser-menu guidance. Desktop help is explicitly browser-dependent with bookmark fallback; it does not claim all browsers support installation.
- A compact invitation appears **at the end of the reading flow**, only following trusted feed/calendar interaction. It does not displace the first post, steal focus, overlay the reader, open a modal or automatically invoke the native install prompt. A first load alone does not qualify. There is deliberately no visit counter or return-visitor tracking.
- Dismissal sets a seven-day cooldown using only `anmore-install-dismissed-at`. No visit, identity, content or engagement history is stored. Nothing transmits this preference. Corrupt/future/negative values are ignored; denied reads/writes use in-memory state without breaking the reader. Merely opening/reading does not write storage.
- `beforeinstallprompt` is prevented and retained as a single-use capability, consumed only by the explicit Install app button. Pending/repeated activation cannot reuse it. Accepted, dismissed and rejected outcomes have honest messages/manual recovery. `appinstalled`, standalone display mode and Apple's `navigator.standalone` suppress prompts, including completion races. A native accepted result is described as requested, not falsely as completed installation.
- Native controls have 44px targets. Disclosure keyboard interaction and stable focus after dismiss are tested. Standalone CSS also hides install surfaces without relying solely on JavaScript.

### Minimal offline landing — not an offline reader

- `sw.js` retains the original URL and root scope; registrations use `updateViaCache: "none"`.
- The sole cache is `anmore-social-offline-v1`, with exactly **`/offline.html` and `/offline.css`**. There is no runtime `cache.put`, app-shell cache, IndexedDB, background sync or offline mutation queue.
- Only root/index **GET navigations**, with no query or the exact old `?source=pwa` launch query, use network-first `fetch(..., {cache: "no-store"})`. Transport failure returns the dedicated offline page. HTTP 404/503 responses remain honest server responses, not disguised cached success.
- The two dedicated offline resources can be served from their static cache. Other assets, arbitrary queries, all non-GET requests, external origins, media, profile/receipt routes and wallet/payment endpoints bypass `respondWith` entirely.
- Offline HTML has restrictive CSP, no JavaScript, no invoice/wallet/zap controls, truthful connection requirements and one retry link. Feed/calendar data, profiles, deletions, receipts, invoice/payment responses and external media are never persisted by this worker. Ordinary browser HTTP caching is distinct and is not represented as disabled globally.
- Activation deletes only obsolete `anmore-social-pwa-*` / `anmore-social-offline-*` caches. The current cache and unrelated caches survive.

### Safe updates and migration

- Installation never calls `skipWaiting`. A new worker waits normally. No first-install update notice and no automatic page reload occur.
- Update and reload requires explicit acknowledgement that tips are finished and needed invoices saved. The warning explains that reload resets this page's invoice session. An open zap dialog blocks activation, including a programmatic click during that state.
- Only the initiating tab arms a controller-change reload. Another tab adopts the minimal worker **without reloading its in-memory invoice/session state**. Normal browser activation after all controlled tabs close remains available.
- The worker accepts only its named explicit same-origin update message; unrelated messages, foreign origins and missing clients cannot skip waiting.
- Exact legacy app-shell worker migration is tested from Git object `9e89c6ae178e6a934a0637bbdfbd951cf7d68602:sw.js`, including its actual precached historical files. Online navigation loads the successor UI, explicit update activates it, all owned legacy cache entries disappear, and the registration remains.
- Exact retirement worker migration is tested from `d5f58705d5b2a327b527efb9ba403f355e72aed7:sw.js`. The harness first observes its unregistration, then revisits online and verifies a new active successor registration and only the dedicated offline resources.
- An older client cannot upgrade while permanently offline. Until the successor actually activates, its old worker's behavior still applies. Users can finish tips, accept the explicit update, or close all site tabs and reopen online. This is not claimed as instantaneous erasure on every dormant device.

### Manifest and icons

- Stable manifest `id` and scope `/`; clean `start_url: "/"`, standalone display, unlocked orientation, `en-CA`, honest connection-required description, matching page theme/background and no external install/store destination.
- The existing PNGs were legacy **Trails Coffee wordmark** artwork, not the site's Anmore mountain mark. They are now generated from self-contained `icons/anmore.svg`, matching the site brand. PNG sizes: 192, 512 and Apple 180; a dedicated 512px maskable icon has opaque full bleed and meaningful artwork entirely inside the central 80%-diameter circle. Pixel tests verify this, not merely manifest labels.
- `worker-src 'self'` is explicit in page CSP. Other source/payment/media CSP boundaries remain unchanged. Asset version queries were advanced for the new bundle/styles.

## Vertical RED → GREEN evidence

Each implementation slice began with the named failing command, then the minimal implementation was run green before proceeding. Raw console logs remain in ignored `qa/`; the table records the actual failure signal rather than fabricated output. Supplemental edge-case tests expanded the final suites after the tracer bullets.

| Slice | RED command and observed output | GREEN/evidence |
| --- | --- | --- |
| Dedicated offline precache, no automatic activation | `node --test tests/worker.test.js`: expected `['./offline.html', './offline.css']`, actual `[]`; 1 failed | Same command: 1 passed; `qa/pwa-{red-worker,green-worker-install}.txt` |
| Owned-cache activation cleanup | Same command: `typeof handlers.activate` was `undefined`; 1 passed / 1 failed | 2 passed; `qa/pwa-{red-worker-activate,green-worker-activate}.txt` |
| Narrow navigation fallback/content-payment bypass | Same command: fetch handler absent; 2 passed / 1 failed | 3 passed; `qa/pwa-{red-worker-fetch,green-worker-fetch}.txt` |
| Real reachable install help | `node tests/pwa-browser-qa.js`: timeout waiting for missing `#install-help` | Browser suite passed; `qa/pwa-{red-help,green-help}.txt` |
| Platform-specific instruction policy | `node --test tests/pwa.test.js`: PWA module absent | 1 passed; `qa/pwa-{red-platform,green-platform}.txt` |
| Dismissal/cooldown preference policy | Same command: `createInstallState` undefined | 2 passed; `qa/pwa-{red-cooldown,green-cooldown}.txt` |
| Real entry-point engagement/native lifecycle wiring | `node tests/pwa-browser-qa.js`: trusted calendar interaction did not reveal invitation (`false !== true`) | Deferred/native-dismissed/rejected flows passed; `qa/pwa-{red-install-ui,green-install-ui}.txt` |
| Real worker registration/offline landing | `node tests/sw-browser-qa.js`: timeout waiting for active controller | Install, offline document/style and online retry passed; `qa/pwa-{red-real-worker,green-real-worker}.txt` |
| Explicit safe update/reload | Same command: waiting worker existed but `#app-update` absent | Waiting → consent → reload; dialog blocked; second-tab marker survived; `qa/pwa-{red-update,green-update}.txt` |
| Manifest/CSP/maskable metadata | `node --test tests/pwa-metadata.test.js`: explicit `worker-src 'self'` absent | Metadata/PNG/pixel test passed; `qa/pwa-{red-metadata,green-metadata}.txt` |
| Compact inline invitation geometry | `node tests/pwa-browser-qa.js`: invitation not in main reading flow | 44px controls and compact/overflow-free four-width layout passed; `qa/pwa-{red-invitation-layout,green-invitation-layout}.txt` |
| Keyboard dismissal focus | Same command: help summary was not active after dismissal (`false !== true`) | Focus restoration passed; `qa/pwa-{red-dismiss-focus,green-dismiss-focus}.txt` |

Additional regression found by the **unchanged existing** feed QA: first post body at 1440px was `859.09375`, violating `<540`. Instrumentation isolated a transient first-install `waiting` state incorrectly treated as an update plus an invitation above the feed. The update check now requires an existing controller and clears after activation; the invitation moved to the end of reading flow. Original assertions were retained and pass: body tops **502.78125 / 486.78125 / 461.28125 / 459.03125** at **1440 / 768 / 390 / 320** respectively. See `qa/pwa-layout-debug.txt` and `qa/browser-results.json`. No feed geometry gate was relaxed.

## Final executed gates

Runtime: Node `v24.22.2`, npm `11.19.1`, Chrome `157.0.8103.51`, Playwright WebKit `26.0`.

| Command | Actual result |
| --- | --- |
| `npm ci` | Added 49 packages; audited 50; 0 vulnerabilities. Existing npm allowScripts warnings for pinned esbuild/fsevents noted below. |
| `npm run build` | esbuild generated `app.js`, 209.3kb; exit 0. |
| `npm test` | **53 passed, 0 failed, 0 skipped**; includes unit native lifecycle/policy, worker lifecycle/network/privacy/message policy, metadata/pixels and all original financial/content tests. |
| `npm audit --audit-level=low` | **0 vulnerabilities**, exit 0. |
| `npm ls --all` | Valid pinned dependency tree, exit 0; no dependency/lockfile refresh required. |
| `npm run qa:pwa` | Install lifecycle/platform/storage/standalone/no-JS + real worker install/offline/update/both legacy migration suites passed. |
| `QA_URL=http://127.0.0.1:4279 npm run qa` | Both existing browser/feed and Top-button/adversarial receipt suites passed, original geometry/financial assertions intact. |
| `QA_URL=http://127.0.0.1:4279 npm run qa:video` | Chrome and WebKit real media metadata, advancing playback, pause, pause-other-player, failure fallback and four-width geometry/axe passed. No financial callbacks, no JS errors, no CSP violations. WebKit fixture limitation below. |
| `git diff --check` | Passed. |

The worker browser suite also runs Chrome DevTools `Page.getAppManifest` and `Page.getInstallabilityErrors` in a **fresh normal persistent test profile**: **zero manifest errors and zero installability errors**. The ordinary isolated Playwright context reports only `in-incognito`, as expected; it is not falsely treated as product installability failure. The temporary normal profile is removed after the check. No OS app installation is performed.

Widths **320 / 390 / 768 / 1440 CSS pixels** are checked for help, invitation, update and dedicated offline states. All checked axe WCAG A/AA results are **zero violations**; native disclosure/checkbox keyboard paths and focus restoration pass. Screenshots were generated and the compact 390px invitation, 320px offline landing and new maskable icon were visually inspected for clipping, padding and truthful copy. This is lab evidence, not an assistive-technology or physical-device certification.

## Evidence paths

All paths below are local, ignored QA artifacts, not deployed runtime data:

- `qa/pwa-npm-ci.txt`, `qa/pwa-build.txt`, `qa/pwa-full-unit.txt`, `qa/pwa-audit.txt`, `qa/pwa-dependency-tree.txt`.
- `qa/pwa-final-browser.txt`, `qa/pwa-browser-results.json`, `qa/worker-migration.json`.
- `qa/pwa-existing-qa.txt`, `qa/browser-results.json`, existing `qa/fixture-*` / Top-button evidence.
- `qa/pwa-video-final.txt`, `qa/video-fixture-results.json`, `qa/video-fixture-webkit-results.json`.
- `qa/pwa-help-{320,390,768,1440}.png`, `qa/pwa-invitation-{320,390,768,1440}.png`, `qa/pwa-offline-{320,390,768,1440}.png`.
- RED/GREEN logs named in the table; `qa/pwa-webkit-debug.txt` records the fixture transport finding below.
- `qa/pwa-reference-mdn.html` / `qa/pwa-reference-apple.html`: fetched official install-reference snapshots, not runtime dependencies.

## Issues investigated and limits

1. **WebKit route-mocking boundary:** With a controlling worker, Playwright WebKit never delivered the synthetic external media request to `context.route`; media reported error 4 with no mock media requests, no CSP errors, and a supported codec. Blocking workers **in that WebKit synthetic video context only** restores interception and real fixture playback. This follows Playwright's documented network-mocking guidance. Chrome video retains the actual worker. No application media/CSP/payment code was weakened. WebKit fixture video assertions remain intact, with added failure diagnostics. Actual worker lifecycle/migration acceptance runs separately in Chrome; this does **not** certify worker-controlled media on physical iOS Safari.
2. **Offline emulation boundary:** In the Chrome worker fixture, `context.setOffline(true)` alone did not stop the worker's loopback network fetch. The harness additionally destroys local-server sockets while offline, so successful styled fallback proves actual transport failure, not a warmed HTTP response. It restores transport before the retry assertion.
3. **npm warnings:** npm ci warns that esbuild/fsevents install scripts are not yet covered by allowScripts. Install, dependency-tree validation, actual esbuild execution, unit/browser suites and audit all completed successfully. No global npm policy/configuration was changed.
4. **Physical-device and release acceptance remain separate:** No actual iPhone/iPad/Android OS install, native desktop OS app install, or production-origin worker migration was performed. Native prompt lifecycle is driven by synthetic platform events in browser/unit fixtures; normal-profile Chromium's own installability audit is separately real. After review/promotion, verify Safari Share flow (including the optional Open as Web App switch), Android native prompt and standalone launch, desktop install, online/offline retry and an existing real installed client on HTTPS. Do not create or pay an invoice just to test installation. A main/root Pages push is deployment and remains outside this task.

## Reproduction and future updates

```sh
npm ci
npm run build
npm test
npm audit --audit-level=low
npm run qa:pwa  # self-hosted ephemeral loopback fixtures; no preview server needed
python3 -m http.server 4279 --bind 127.0.0.1
# Separate terminal while the local server runs:
QA_URL=http://127.0.0.1:4279 npm run qa
QA_URL=http://127.0.0.1:4279 npm run qa:video
```

Set `CHROME_PATH` to another installed Chromium executable if necessary; WebKit requires the Playwright browser installation. `npm run icons:pwa` regenerates the committed raster artwork from local SVG without remote assets. When changing offline assets, bump `OFFLINE_CACHE`'s owned version, keep its exact two-resource allowlist, rerun both migration fixtures and the explicit update/multi-tab check, and never add unconditional `skipWaiting` or automatic reload. Rebuild the bundle after source edits; rerun the unchanged financial/content suites rather than widening the worker to make them pass.

Official references verified during implementation:

- MDN install prompt lifecycle: `https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt`.
- Apple iPhone Safari web-app flow: `https://support.apple.com/en-az/guide/iphone/iphea86e5236/26/ios/26`.
- Playwright missing network events/service workers: `https://playwright.dev/docs/network#missing-network-events-and-service-workers`.
