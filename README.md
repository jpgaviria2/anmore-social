# Anmore Social

A quiet, photo-friendly community bulletin. The community feed comes first; upcoming events are secondary. Readers need no account. Static files are served by GitHub Pages at `anmore.social`.

## The trust contract

- **Positive content is selected upstream.** Sources filter before publishing to the relay. This reader has no sentiment classifier, positivity scores, editorial approvals, moderation queues, or engagement ranking.
- **One relay only:** `wss://relay.anmore.me`. Metadata, NIP-05 responses, event tags, and source links cannot add another relay. There is no fallback relay.
- **Dynamic author eligibility:** every author must have a valid, signed kind-0 profile claiming an exact `username@trailscoffee.com` NIP-05. Any NIP-05-valid lowercase username (`a-z`, digits, `_`, `.`, `-`) is eligible; there is no hardcoded name/public-key list.
- The reader fetches **only** `https://trailscoffee.com/.well-known/nostr.json?name=EXACT_USERNAME`, rejects redirects, omits credentials, and requires `names[EXACT_USERNAME]` to equal that profile's lowercase hex public key. Suffix/lookalike domains, whitespace, mixed-case identifiers, mismatched keys, malformed JSON and network failures do not grant admission. NIP-05 is a domain association, not a guarantee of a post's accuracy.
- Every event is shape-checked, hashed and Schnorr-signature verified using the canonical NIP-01 fields. Relay extras such as `indexed_at` are excluded; a relay's verification cache flag is never trusted. Malformed events, invalid signatures and timestamps later than the reader's current clock are rejected, with no future-clock tolerance. The reader's clock therefore matters.
- Main feed: kinds 1 and 20, newest **signed `created_at`** first, lexical event-ID tie-break, ID deduplication. No algorithm, popularity, personalization, likes, replies, follows, counters, or account/key storage. Only explicit Refresh and Load more actions fetch additional snapshots; there is no infinite scroll or background content polling.
- Calendar: latest addressable revisions of kinds 31922/31923, ordered by upcoming start time and shown in Pacific Time. Four upcoming entries from the latest bounded calendar snapshot are shown, not a claim of an exhaustive calendar. All-day dates are interpreted as calendar dates, not converted through UTC midnight. Calendar identity admission is identical to feed admission.
- **Deletion:** valid same-author NIP-09 kind-5 `e` references hide the exact event; `a` references hide matching addressable revisions at or before the deletion timestamp. Foreign-author and forged requests have no authority. A newer addressable revision may legitimately appear after an `a` deletion. The latest revision is selected *before* deletion application, so older revisions cannot reappear. Deletion history is re-read on each page/refresh and retained for the in-memory reading session. No content is cached across reloads.

## Rendering, privacy, and failure states

Untrusted text is built with DOM text nodes, never HTML interpolation. HTTPS links are explicit new-tab links with `noopener noreferrer`. Credentials, local/IP hosts, non-HTTPS URLs and executable schemes are not admitted. Up to four HTTPS images per post are lazy-loaded with no referrer; unavailable images become original-image links. Photos are not cropped. External media hosts still receive the reader's IP; source navigation leaves the site. No analytics or browser identity storage is used. Public sources and original source links remain in the text; each card also exposes its relay, author key, event ID, signature and timestamp.

Relay disconnection, declined requests, timeouts, oversize responses and identity-endpoint failures are visible. Failed relay/deletion checks fail closed rather than presenting unchecked content as current. Offline snapshots are labelled as such; an explicit retry while offline clears the feed. No demo posts are shipped in the runtime, and no content is published by this application.

The old identity manager, native composer, calendar grid, World Cup data, and fallback relays were removed. `sw.js` is a retirement worker: it removes only legacy `anmore-social-pwa-*` caches, claims clients and unregisters itself. New visitors do not register an offline worker. Existing installed clients may need an online reload for the old worker to update. `offline.html` does not promise a cached calendar.

## Local development and verification

Node 24 was used. No framework or runtime CDN dependency is required: the committed `app.js` bundles the pinned `nostr-tools` verifier.

```sh
npm ci
npm test
npm run build
python3 -m http.server 4173 --bind 127.0.0.1
# In another terminal:
npm run qa
node tests/live-qa.js
```

Browser QA uses Playwright with `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`; set `CHROME_PATH` for another installed Chromium path. Fixture QA is explicitly synthetic and includes an intercepted relay, invented identities and a generated landscape image. It tests 1440/768/390/320 CSS-pixel layouts, chronological pagination, malicious content, provenance, dynamic identity, no browser storage, deletion across pagination/reload, failed identity resolution, key mismatch, relay refusal, empty and offline states. Axe checks WCAG A/AA rules. Live QA makes real read-only requests to the sole relay and actual HTTPS NIP-05 endpoint, captures separate `qa/live-*` evidence, and never publishes. Screenshots and JSON evidence stay in ignored `qa/`, not production content.

Limits are deliberate: 12 raw posts per first page, inclusive timestamp cursors with growing boundary windows, at most 600 boundary records, 60 initial calendar records, batches of 20 authors/address lookups, four simultaneous identity HTTPS checks, a 500-deletion response ceiling, and a 1,200-item session safety ceiling. Safety-limit/timeout states stop visibly rather than silently switching relays or skipping tied timestamps. Relay history can be incomplete or withheld; no single-relay client can prove global deletion or discover records the relay does not serve. A snapshot may become outdated until the next explicit refresh.

## Release boundary

This candidate is local and uncommitted. No push, merge or deployment was performed. See `PRODUCTION_READINESS.md` and `qa/production-baseline.json` for the verified GitHub Pages mapping, rollback baseline, test evidence and remaining release gates. The separate, narrowly authorized disposable-event live deletion probe is owned by the parent release process, not this read-only browser.

Protocol references: official `nostr-protocol/nips` repository, NIP-01, NIP-05, NIP-09 and NIP-52, read directly from their current source during implementation.
