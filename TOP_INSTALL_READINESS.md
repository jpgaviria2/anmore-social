# Top install correction — local candidate, not deployed

## Candidate and scope

- Isolated worktree: `/Users/trails/anmore-social-top-install`, branch `fix/top-install-branding`.
- Freshly fetched base: `5962d0b94c47133e082bc3072576f43e2465b552` (`origin/main`). SSH fetch failed host-key verification; one-command HTTPS transport override fetched successfully without changing remote/global configuration.
- Verification completed November 12, 2026 UTC (November 11 local MST). No commit, push, deployment, hosting change, real invoice request, payment or relay write. Existing canonical worktrees were not edited.
- This owner's correction explicitly supersedes original footer placement and engagement gating, not worker/payment/privacy invariants. Historical `PWA_READINESS.md` is marked accordingly; README describes current behavior.

## Implemented

- Compact top banner visible on the initial browser visit unless dismissed within seven days or installed/standalone. In normal reading flow, not fixed/sticky, modal or blocking overlay. Duplicate footer install surfaces removed.
- Existing mountain icon, concise invitation, How to install and Not now controls. The top action opens device-aware help; the single-use native Install app action appears in that help only when supplied by the browser. No automatic native prompt.
- Finite 450ms entrance and 700ms icon motion, one iteration, with reduced-motion animation disabled. All content remains visible without animation. No-JavaScript top disclosure remains usable.
- Seven-day optional dismissal timestamp and denied-storage fallback retained; no visit/engagement history added. Standalone and appinstalled suppression, native event consumption, pending/completion races and explicit-gesture boundary retained.
- Existing first-post body `<540px` gate retained unchanged. Compact welcome geometry and removal of redundant mobile welcome artwork/tagline make room for the requested top invitation.
- Explicit canonical, Open Graph and Twitter summary image metadata chooses **the existing** `https://anmore.social/icons/icon-512.png`, with real dimensions/type/alt text. No artwork, icon URL, manifest or worker changes.

## Firefighters image: observed versus unknown

Read-only live HTTP snapshots and actual pixel inspection found:

- `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/maskable-512.png` and `/icons/apple-touch-icon.png`: HTTP 200; all show the cream mountain outline on forest green, not firefighters. Live PNG bytes match the existing local artwork.
- The deployed page explicitly selects the correct favicon and Apple-touch asset and has the expected manifest icons. Root `/apple-touch-icon.png`, `/apple-touch-icon-precomposed.png` and `/favicon.ico` return 404, but explicit paths work. They were deliberately **not** changed after the owner confirmed the installed home-screen logo is correct.
- Concrete metadata gap: deployed HTML had no `og:image` or Twitter image/card metadata. The candidate supplies an explicit existing brand image rather than leaving image selection unspecified.
- The reported firefighters surface remains unidentified. A feed-photo/link-preview fallback is plausible, **not proven**; stale browser icon caching is **not proven**. The owner confirms the home-screen logo works. Screenshot clarification is optional and does not block this scoped UX correction. No hosting limitation was found requiring migration.

## RED / GREEN and final gates

- `qa/red-initial.txt`: initial-eligibility regression failed `false !== true`, then passed after removing engagement gating.
- `qa/red-placement.txt`: top-placement regression failed against footer placement, then passed with the top finite-animation surface.
- `qa/red-share.txt`: explicit share image regression failed on absent `og:image`, then passed with existing-icon preview metadata.
- Temporary icon-version/root-fallback changes were withdrawn after the owner's clarification. Final manifest/icon files and URLs are unchanged; these are not part of the candidate.

Executed production build and local fixture gates:

| Gate | Result |
| --- | --- |
| `npm ci` | Installed pinned lockfile; 0 vulnerabilities; existing npm esbuild/fsevents allowScripts warnings only |
| `npm run build` | Real esbuild bundle generated successfully |
| `npm test` | 55 passed, 0 failed, 0 skipped |
| `npm audit --audit-level=low` | 0 vulnerabilities |
| `npm ls --all` | Valid dependency tree |
| `npm run qa:pwa` | Browser lifecycle/platform/storage/standalone/no-JS/keyboard/axe and actual worker install/offline/update/both legacy migrations passed |
| `QA_URL=http://127.0.0.1:8769 npm run qa` | Original feed/payment fixtures and Top/adversarial receipt suite passed without relaxing geometry assertions |
| `QA_URL=http://127.0.0.1:8769 npm run qa:video` | Chrome and WebKit playback/pause/fallback/geometry/axe passed; 0 financial callbacks, JS errors and CSP violations |
| `git diff --check` | Passed |

Top initial layout checked at 320/360/390/768/1440px, help and invitation at 320/390/768/1440px; no horizontal overflow, 44px controls, zero checked axe violations. Normal animation iteration count is 1, reduced-motion computed animation is none. Settled 320px and 1440px screenshots were visually inspected; initial 320px banner is unclipped and desktop banner is compact. Native prompt lifecycle events are synthetic fixtures, not a physical installation claim. Fresh normal-profile Chromium's own manifest/installability audit returned zero errors separately.

Original populated-feed first body tops at 1440/768/390/320px: **537.45 / 538.25 / 531.48 / 529.23px**, all under the unchanged 540px threshold. Narrow geometry was repaired after the original suite caught displacement; assertions were not widened.

## Evidence / review handoff

Ignored local `qa/` contains `build.txt`, `unit.txt`, `audit.txt`, `dependency-tree.txt`, `browser.txt`, `pwa.txt`, `pwa-top-final.txt`, `video.txt`, `browser-results.json`, `pwa-browser-results.json`, `worker-migration.json`, video results, RED logs, top/help/invitation screenshots and `live/results.json` plus original live bytes. `qa/unchanged-boundaries.json` pins 17 unchanged manifest/artwork/worker/payment/dependency paths to the base.

Freeze files and hashes are recorded in `qa/review/` after the final gates: staged binary full-index delta, tree ID, per-file SHA-256 manifest and a concise source-review prompt. The required independent reviewer is the **actual OpenCode CLI using `openai/gpt-6.1-sol`**; review must cover this delta against base, not the whole historical implementation. It has not been run in this task. No review approval or publication is claimed.

Remaining release gates: completed exact-tree independent review, scoped commit/push/deploy authorization, and post-publication acceptance. Physical-device native installation and the user's exact firefighters preview surface are not certified by local fixtures.
