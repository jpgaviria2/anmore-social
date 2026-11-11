# Top zapped timeframe candidate — local review handoff

## Scope and source

- Worktree: `/Users/trails/anmore-social-zap-periods`; branch `feat/top-zapped-periods`.
- Fresh explicit HTTPS fetch of canonical `jpgaviria2/anmore-social` main; base and origin/main are `afa429ac65e285d242f6ae3be8ad68b942094faf` (inline-video release).
- Before edits, public `https://anmore.social/app.js` and base `app.js` both SHA-256 `5ec7f245550742b8df7f76a30efe6e1a668fd42fc7454c5f83cffc09ffc50fcf`. README/CNAME establish the existing GitHub Pages branch-root release; no deployment mechanism changed.
- No commit, push, public deployment, relay edit, service restart, real invoice creation or payment. Local loopback preview uses port 4187 only.

## Implemented contracts

- Newest stays default, adjacent to Top zapped. Top initially selects All time. This week / This month / All time are native pressed-state buttons with 44px targets; hidden in Newest, disabled during asynchronous loading.
- Selected-period card amounts and order use verified receipt `created_at`, not post age. Week starts Monday 00:00 and month starts the 1st 00:00 in America/Vancouver, inclusive start/exclusive end, no future receipts. Older posts remain eligible for fresh receipts. Empty periods retain chronological zero ties rather than claiming missing posts.
- Full available receipt verification/payment-hash conflict resolution precedes period filtering. Identical invoice reissues use earliest verified receipt time conservatively. Default/all-time validator amounts and retention-vendor interface remain compatible; transport/source rules unchanged. Anmore alone supplies content/identity/deletions; Primal remains receipts only. Coverage remains loaded-only, partial positive amounts provisional observed snapshots that can increase or decrease, absent partial totals unavailable, all-source failure newest/unavailable. The coverage note explicitly warns that totals/order may change as receipts become available; financial verification, sticky conflict exclusion and earliest verified duplicate timestamp are unchanged by this presentation repair.
- Previously retained post IDs are re-read from Anmore in sequential exact-ID batches of 100 (maximum 12 for the 1,200-entry session ceiling), before merging on Load more/Top discovery. Completed omissions evict retained content; later exact-read absence also beats an overlapping earlier page. Failed exact reads clear the snapshot/error rather than treating failure as absence. Entering Top rechecks even at end of history. Refresh rebuilds from source. No fabricated author-signed deletion or receipt-based resurrection, and no dependency on an unshipped retention API.

## Timezone issue actually found and fixed

Chrome 157 and installed Node 24 ICU disagreed on Vancouver November 2026: Chrome used UTC−7, Node UTC−8. BC's official release confirms permanent UTC−7 after March 8, 2026: `https://news.gov.bc.ca/releases/2026AG0013-000209` (read directly). The calendar helper pins the enacted post-transition offset and preserves historical America/Vancouver DST. Tests cover historical spring/fall transitions, March 2026, November 2026, leap February and year rollover. Existing unrelated calendar/display code is unchanged.

## Test-first evidence

Observed failing assertions before corresponding production repairs:

1. `node --test tests/zap-periods.test.js`: week returned `71000n` instead of `21000n` before optional window filtering.
2. `QA_URL=http://127.0.0.1:4187 node tests/top-buttons-qa.js`: Zap timeframe group invisible before UI wiring.
3. Corrected official November midnight fixture returned `undefined` instead of `21000n` in Node before permanent-offset compatibility repair; browser had independently shown a 3,600-second difference.
4. Same browser command: period targets failed `w >= 44 && h >= 44` before shared control styling.
5. Source-removal fixture retained the missing post (`true !== false`) before exact-ID source revalidation.
6. Reentering Top at end of history retained a removed post before making that entry revalidate.
7. Overlapping earlier page re-added a target missing from the later exact read before merge exclusion.

Additional regression fixtures cover signed receipt boundaries/future rejection, old post receiving new tips, all-time compatibility, empty weeks/months, duplicate payments, changed-description and cross-post payment reuse spanning periods, forged receipts and missing targets. Browser assertions check complete card amounts/order for opposing period rankings, partial/unavailable snapshots, busy controls, period keyboard activation, source administrative removal, failed exact read, Load more removal, exact `[100,14]` revalidation batches, original deletion/discovery/six-page/over-response/error recovery contracts and zero invoice callbacks on all sorting.

## Provisional partial-snapshot correction

The independent OpenCode review rejected predecessor tree `424751a2c6e188bb079e52f82eaa76f5c5e3ceb1`: a missing peer can supply an earlier duplicate outside the selected period or a conflicting binding that excludes a payment entirely. A positive partial observation is therefore not a guaranteed minimum. Only presentation and the explicitly superseded presentation assertions/docs were changed in this successor; the predecessor's financial verification, earliest-time deduplication, sticky conflicts and receipt transport remain byte-identical.

Permanent `tests/partial-snapshots.test.js` ports both independent adversaries through the real collector/verifier and checks all 6 duplicate and 24 sticky-conflict permutations. The source-presentation assertion failed before the repair. `tests/top-buttons-qa.js` also failed before implementation on **both** week-earliest and all-time-conflict cases (`21 sats` observed, then `0 sats` after missing-peer recovery), while independently verifying recovered amounts and complete order. After repair, positive partial cards say `21 sats · provisional`; unknown partial amounts stay `—` with an unavailable accessible label. Snapshot note, card tooltip and accessible labels make no guaranteed-minimum promise. Every recovery rechecks all displayed amounts/order, removes provisional labels, and the earliest case also verifies the same payment still counts once in All time. No sorting creates invoice callbacks.

RED/GREEN logs, original independent harness rerun, gate outputs and immutable successor artifacts are retained at `/Users/trails/.hermes/cache/scratch/frontend-period-provisional-fix`. Partial-state screenshots at 320 and 1440 CSS pixels cover both adversaries; no horizontal overflow or axe violations. Visual inspection confirms readable wrapping, visible first card and unclipped provisional labels. `adversarial.stdout` named in the delegation was absent; the exact supplied `adversarial.mjs` was used instead.

## Final gates exercised

```sh
npm ci
npm run build
git diff --check
npm test
npm audit --audit-level=high
QA_URL=http://127.0.0.1:4187 npm run qa
QA_URL=http://127.0.0.1:4187 node tests/video-browser-qa.js
QA_URL=http://127.0.0.1:4187 node tests/video-browser-qa.js --webkit
```

- Unit suite: **45 passed, 0 failed**. Audit: **0 vulnerabilities**.
- Browser suites passed at **320/390/768/1440 CSS px**, no overflow, pressed state/keyboard/44px targets/first-post visibility, axe zero. Existing invoice QR pixel decoding, copy/manual fallback, invoice binding/expiry and short-phone wallet geometry gates passed through `browser-qa.js`.
- Native-video fixture passed Chrome **157.0.8103.51** and WebKit **26.0**, actual metadata/currentTime advancement, pause and pause-other-player, zero CSP/page errors and zero financial callbacks. This is local synthetic MP4 coverage, not physical iOS or renewed live-media acceptance.
- Visually inspected local `qa/buttons-320.png` and `qa/buttons-1440.png`: coherent active All time and Top states, no clipped controls, first post visible. Other widths are captured in the same QA directory.
- All runtime tests use the rebuilt actual root `app.js`, not a dev-only implementation.

## Remaining release boundary

Successor candidate is **ready for parent exact-tree inspection**, not independently approved or publicly deployed. Current freeze identifiers, full base-to-successor patch, predecessor-to-successor patch, deterministic archives and per-file manifest are in `/Users/trails/.hermes/cache/scratch/frontend-period-provisional-fix/freeze.json` and sibling artifacts; the old ignored `qa/top-periods-freeze.json` describes only the rejected predecessor. Parent owns independent review and any authorized commit/push/deploy/public acceptance. No relay-retention service was touched. The original workstream's SSH remote fetch failed host-key verification; explicit HTTPS fetch succeeded without changing remote config or weakening SSH trust. This correction performs no remote fetch, commit, push, deployment, service restart, relay edit, real invoice creation or payment.
