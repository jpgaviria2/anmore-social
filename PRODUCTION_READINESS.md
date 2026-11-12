# Feed-first release candidate — local only

> **PWA policy supersession (owner authorized):** The historical worker-retirement assertions/results below are retained as history, not current requirements. The installable successor now preserves the no-community-content-caching invariant while registering a minimal dedicated offline landing worker. `PWA_READINESS.md` is the current PWA implementation/test record, and `tests/worker.test.js` / `tests/sw-browser-qa.js` now assert installation, privacy, controlled updates and both legacy migration paths instead of unregistration.
>
> Historical feed-first release evidence. Current compact + receipt-only Primal scope, source boundary, test results and gates are in `RECEIPT_READINESS.md`. Historical “one relay” assertions below apply to content/profile/deletion events; the current candidate has one explicit hardcoded receipt-only Primal exception.

## Artifact and scope

- Worktree: `/Users/trails/anmore-social-feed-first`
- Branch: `feat/feed-first-local`
- Base: `9e89c6ae178e6a934a0637bbdfbd951cf7d68602` (`origin/main` at worktree creation)
- No commit, push, merge, deployment, existing-content deletion, or relay publish was performed by this implementation worker. Main remains clean at the base SHA.
- Replaces the old calendar/composer product with a read-only chronological community bulletin. Positive-content selection belongs upstream; there is no reader-side scoring, sentiment processing or approval system. The old production-readiness recommendations are superseded by this document.

## Verified deployment mapping (read-only discovery)

GitHub API `GET repos/jpgaviria2/anmore-social/pages` reported:

- `build_type: legacy`
- source branch **main**, source path **/**
- CNAME **anmore.social**, HTTPS enforced, Pages status `built`
- One active dynamic `pages-build-deployment` workflow; no custom repository deployment workflow was added or changed.
- Latest Pages build returned commit **850cf663c673f66371c7022eafde001588136b14**, completed **2026-08-07T22:47:08Z**. The newer base `9e89c6a` changes security documentation; public `index.html`, `app.js`, `styles.css`, and `sw.js` fetched on **2026-11-11 UTC** exactly matched their bytes in base `9e89c6a`.

`qa/production-baseline.json` records full SHA-256 and byte sizes of those public assets. This distinguishes the last Pages build commit from the current source base; do not assume the Pages build SHA equals HEAD. The pre-revamp public implementation can be recovered from base **9e89c6ae178e6a934a0637bbdfbd951cf7d68602**, or the latest built commit above. A main-branch push may automatically publish because Pages uses the branch root. Review must precede any promotion to main.

## Executed gates

- `npm run build`: static browser bundle generated successfully; self-contained verification library, no runtime CDN scripts.
- `npm test`: **11 tests passed**, covering canonical signatures with relay `indexed_at`, invalid signatures/shapes/future timestamps, exact dynamic NIP-05 admission and spoof/mismatch rejection, profile tie-breaks, chronological deduplication, same-author/foreign/forged deletion, addressable deletion cutoff, calendar date validation, safe URL policy, one read-only pinned relay, removed legacy identity/fixture flows and worker retirement.
- `npm run qa`: real Chromium against loopback, intercepted **synthetic fixtures**, successful chronological Load more (12 → 15), safe malicious-text rendering, provenance disclosure, no account/engagement controls, no local/session storage, deletion across pagination and reload, key mismatch/identity-network/relay-refusal/empty/offline states. Verified `innerWidth === scrollWidth` at **1440, 768, 390, 320 CSS pixels**; mobile first-post content is within the first viewport. Axe WCAG A/AA: **0 violations** in the tested fixture state. Keyboard controls use native buttons/disclosures and visible focus; not a substitute for human assistive-technology review.
- `node tests/sw-browser-qa.js`: installed the **exact base HEAD service worker and old app shell** in Chromium, upgraded to the retirement worker, then read back **zero legacy caches and no registration**. The harness explicitly awaits activation and final cache/registration state instead of treating async update completion as retirement completion.
- `node tests/live-qa.js`: real read-only relay + real HTTPS identity checks. **8 visible posts / 4 upcoming events**, dynamically admitted `muse@trailscoffee.com`; Load more → **14 visible posts**. No page JS errors; no foreign relay or publish frames. Live screenshots at 1440/390/320 pixels; separate **iPhone 13 emulation** verified width/scrollWidth **390/390**, touch enabled, DPR 3. A real attached photo decoded at **720×540** and rendered uncropped. Counts are a point-in-time snapshot, not fixtures or fixed acceptance expectations.
- `npm audit --audit-level=low`: **0 vulnerabilities** for the installed lockfile at test time.
- Main readback: clean, still `9e89c6ae178e6a934a0637bbdfbd951cf7d68602`.

## Evidence paths (ignored local QA directory)

- `qa/browser-results.json`, `qa/accessibility.json`
- `qa/fixture-{1440,768,390,320}.png` (synthetic full-page layout)
- `qa/fixture-viewport-{1440,768,390,320}.png` (synthetic viewport)
- `qa/state-{mismatch,identity-failure,relay-failure,empty,offline}.png`
- `qa/live-results.json`, `qa/live-{1440,390,320}.png`
- `qa/live-iphone13.png`, `qa/live-photo-320.png`
- `qa/worker-migration.json`, `qa/production-baseline.json`
- `qa/live-deletion-readback.json`

All paths are under the worktree. Fixture content is never part of the runtime. The local preview server is bound only to `127.0.0.1:4173`.

## Important relay-deletion finding / release gate

A **read-only** live probe fetched 20 valid kind-5 requests and inspected the first 20 `e` references. They contained **15 unique target event IDs**. **All 15 unique targets were still returned by exact-ID queries**, and each served target's author matched its deletion request's author. The relay currently exposes deletion requests **and** their referenced content. This reader therefore must apply client-side NIP-09 suppression; simply assuming the relay physically removes records would resurrect content. The browser's visible count reduction from raw pages is consistent with suppression, but is not a new live write test.

This does **not** establish end-to-end deletion acceptance for a new publish, tombstone rejection of republishing, or storage erasure. The separately authorized parent-owned test must publish only a clearly marked disposable event and same-author deletion, read back the exact target and kind-5 event, and verify behavior after reconnect. Do not delete existing community content. If server-side deletion/non-serving is required, the observed historical behavior is an unresolved relay gate, not a frontend failure to hide deleted posts. This worker made **no relay writes**.

## Remaining release sequence (parent owns it)

1. Independent review of the exact uncommitted candidate tree; rerun build/tests/fixture/mobile checks after any repair. Read the trust/limits contract in README. No user re-approval is needed for the already-authorized release scope, but this worker has not promoted it.
2. Parent commits/reviews/promotes the final artifact using the existing Pages main/root mechanism, with the baseline above available for rollback. Never deploy generated fixture evidence as real content.
3. Read back the resulting Pages build's exact commit and public asset hashes, test first visit and migrated installed clients on the real origin, verify actual HTTPS CORS/NIP-05 and sole-relay behavior, and perform desktop/mobile smoke QA.
4. At the end, run the narrowly authorized disposable-event deletion test and report whether the relay both accepts the request and stops serving the target. If it only stores kind-5 requests, report that honestly; investigate the relay separately rather than claiming physical deletion from the client result.

Known bounded behavior: feed is a snapshot until explicit refresh; the calendar is a bounded latest-update sample, not exhaustive. Very large tied timestamps/deletion histories fail visibly. Network/CORS and third-party photo availability can change. A malicious/withholding sole relay can omit current profiles, revisions or deletion requests; the reader cannot prove global history completeness.
