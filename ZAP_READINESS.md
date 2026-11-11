# Per-post community zap candidate — release gate

## Status

Local frontend implemented and fixture-tested; one actual **unpaid post-bound invoice and browser QR passed** after constructing producer-compatible request bytes. **NOT production-ready** until receipt delivery/admission and parent OpenCode review/release gates are accepted. No commit, push, merge, deployment, wallet creation, transfer, mint/swaps/redemption, relay admission change, or protected configuration change was performed by this workstream.

Base: `dfeeaf95e3804e70fe570ef6740364abc303ffae` from freshly fetched `origin/main`. Isolated worktree `/Users/trails/anmore-social-donations`, branch `feat/community-donations`. The parent owns actual OpenCode review and deployment.

## Exact destination and independently resolved identity

- Address: `coffeeloverc2c2cd@pay.trailscoffee.com` (unchanged).
- Community recipient: `3b8a0f47a947a5a4f22578f691c39735abb11cedd0e415d872437fdd902ce9a9`.
- Signed kind-0 profile: `23fd8e7b11499aa41a97197bf2c14f9ee20928e0311ab54c81549fa419d1617f`, `created_at=1794381228`, obtained from the sole relay, independently hash/signature verified.
- That profile claims `muse@trailscoffee.com` and the exact supplied `lud16`. Canonical `trailscoffee.com` directory maps `muse` to the same key. The full signed event is retained locally in `qa/live-post-invoice.json`.
- **Distinct receipt issuer**, obtained over HTTPS from the exact pay endpoint: `60563a7699d1de2651dce8d4179a17d605037fdfc197765e1e7fa1840435ca6e`.
- No key was inferred from the address suffix, and the receipt issuer was never substituted as recipient.
- An initial one-request discovery with too many OR filters was incomplete. It is superseded by the production resolver's bounded batches of 16, which successfully resolve the profile. Do not treat the initial probe as evidence that the profile was absent.

## Historical producer failures (retained, superseded by canonical-request acceptance)

Two earlier bounded **unpaid** invoice requests were made, at 1 sat then 21 sats. Both were rejected before any wallet handoff or QR exposure. A separately authorized third overall probe is recorded below; there were no payments.

At `2026-11-11T07:36:45Z`, the second producer probe used real visible post:

`c6ba79d2604f2d912ba69856dead693e8a729af6ad99137d208a9532c08ab1f7`

The parsed, signature-verified mainnet invoice had:

- Requested amount: **21,000 msats**; invoice amount: **21,000 msats** — match.
- Exact serialized signed kind-9734 request SHA-256: `91efecb44d1810f10371df114d560cdde275905669246949cb72272ea30680df`.
- Invoice `h` description hash: `71ffd1803c8f6c562c2b157c0fc0592b3804de9f76dae0755ac3ef0d892590c0` — **mismatch**.
- Ordinary LNURL metadata SHA-256: `8e802377e413d81e0e609aab8259bba7660595863ec938a01391bf0966340f81` — also not the invoice hash.
- Fresh timestamp and unexpired lifetime — pass.

Exact gate: the producer must issue the invoice with `h = SHA256(exact UTF-8 serialized signed zap request supplied in nostr)`. Advertising `allowsNostr: true` is insufficient. Do not weaken the client to accept an unrelated hash or silently fall back to an ordinary donation invoice.

Historical local evidence: `qa/live-post-invoice.json`, `qa/producer-binding-diagnosis.json`. Those invalid invoices remain rejected, not retrospectively relabelled as accepted.

## Canonical request repair and actual unpaid invoice/QR acceptance

The public producer source `breez/spark-sdk` tree `17eefd256cd672c911287a25e7bebea5b517797b` parses Nostr requests then hashes/stores `event.as_json()`. Its pinned Rust `nostr 0.43.1` serializes `id,pubkey,created_at,kind,tags,content,sig`. The frontend now constructs that exact field order **before** sending. Its content remains empty and all emitted tag strings are normative ASCII; no arbitrary caller content or alternate JSON escaping is admitted to this producer-compatibility claim. Nostr signature semantics and tags are unchanged. The invoice is still bound only to SHA256 of the exact sent UTF-8 string, with no reserialization/metadata fallback at verification.

Executed the real Rust `nostr 0.43.1` `Event::from_json`, `verify`, and `as_json` in an isolated scratch toolchain; exact output equals the production-generated input bytes. Repeated byte equality/signature verification for both the static fixture and exact retained live request with `serde_json 1.0.149`, matching the public producer lockfile. A retained synthetic fixture lives at `tests/fixtures/nostr-0.43.1-request.txt`. Source/runner/build evidence is private local scratch under `/Users/trails/.hermes/cache/scratch/zap-frontend-repair/`.

At `2026-11-11T08:00:54Z`, exactly **one additional unpaid 21,000-msat callback** was permitted through the actual browser bundle and dialog for post `c6ba79d2604f2d912ba69856dead693e8a729af6ad99137d208a9532c08ab1f7`. Fresh production recipient resolution and HTTPS endpoint issuer/callback checks passed. Before dispatch, Rust verified the fresh signed request and byte equality. The callback had a 10-second timeout, no redirects or retries, and a one-call fence.

- Exact sent request SHA256 and returned BOLT11 h both: `454e33094f47d384d042b7933ae8fa40aba32542d28e80b895162d6383da8b1c`.
- Signature-verified mainnet invoice amount: **21,000 msats**, exact request/post/community destination, fresh timestamp `1794384058`, expiry `1796976058` — all production guards passed.
- Actual `#zap-qr` canvas screenshot independently decoded with jsQR to the exact `lightning:<validated invoice>` at **320, 390, 768, 1440** pixels. Dialog overflow checks passed. Wallet link equality checked without navigating it.
- Private evidence: `live-acceptance.json`, `private-unpaid-invoice.json` and `private-live-qr-*.png` in the scratch directory above. **Do not publish the unpaid invoice or QR**; none is in tracked source.
- Zero payments, wallet navigation, receipt publication, deployment or relay edits. This proves invoice construction/handoff only, not settlement or live receipt delivery.

## OpenCode payment-secret padding repair

The rejected predecessor tree `22d6e2287274c53aa7040c7edf0de6e5aa3c8c44` checked only the secret's u5 length. A freshly signed/checksummed malformed-secret regression was written and observed failing (missing expected exception) before production edits. The reader now strictly decodes every fixed-size p/s/h/n tag, including zero-tail-padding and decoded-byte lengths. Added regressions cover every padding bit, canonical positive controls, createZap denial before QR/wallet exposure, and exclusion from verified receipt totals. Canonical serialization had its own observed RED before implementation. Existing exact hash, amount, timestamp and expiry mismatch rejection stays enforced.

## Receipt acceptance remains separate

Separate read-only queries for each of kind 9735 and kind 9321 over the latest 48 hours returned **zero verified events** on the pinned relay. The approved receipt issuer has no signed kind-0 profile served there. These observations do **not** prove no user payment occurred and do not prove relay rejection by themselves. No monetary totals were invented, and no paid acceptance is claimed.

Before production completion, establish that the producer publishes correctly signed kind-9735 receipts to the request's `wss://relay.anmore.me` relay and that the relay admits the approved issuer without pretending it is an ordinary NIP-05-qualified post author. Do not broaden general relay admission or resume the paused relay rollout as a frontend workaround. Coordinate with the actual producer/relay owner.

The frontend can then reconcile already-paid public receipts read-only. Real payment is not authorized or required by this candidate.

## Delivered client contract

- Only per-post **Zap this post**, prominently **all sats to the community group, not the author**. No generic donation QR or Lightning-address handoff.
- Explicit whole-satoshi amount and one invoice attempt per post per page session; max 32. Reading, sorting, opening a dialog and refreshing never create invoices.
- Rechecks current signed post, identity and deletions before signing/callback; response is exposed only while that post/dialog generation is current.
- Fresh anonymous signing key in memory only; original key buffer cleared; no account/key persistence, wallet SDK, payment sending, receipt publication, or Cashu side effects.
- Strict mainnet/whole-sat BOLT11 reader validates checksum, field framing/cardinality, payment hash/secret, hashed description, supported mandatory features, invoice signature/recovery and expiry. Exact request-hash/amount and fresh timing required before display.
- Canvas QR encodes exactly `lightning:<validated post-bound invoice>`; local encoder only. Copy fallback, wallet navigation, expiration, dialog keyboard focus/Escape/restoration, no overflow.
- Newest default; explicit Top zapped sorts verified community Lightning msats descending among loaded posts only; deterministic newest/ID ties; no personalization or hidden engagement score. Load-more cursor remains chronological and independent of sort.
- Receipts verify approved issuer, canonical signatures, embedded request, exact post/recipient/LNURL, invoice amount/hash. Deduplicate by payment hash; conflicting reuse excluded. Sender NIP-05 is not a receipt prerequisite. No claimed-amount shortcuts. Cashu/nutzaps explicitly unsupported, not silently mixed in.
- Refresh/loading recheck receipt totals from bounded snapshots; no polling. Unavailable checks distinguished from verified zero.

## Verification and evidence

Commands (use the isolated worktree):

```sh
npm ci
npm test
npm run build
python3 -m http.server 4184 --bind 127.0.0.1
QA_URL=http://127.0.0.1:4184 npm run qa
QA_URL=http://127.0.0.1:4184 node tests/live-qa.js
node tests/sw-browser-qa.js
npm audit
node tests/zap-live-preflight.js # read-only report; nonzero while release gates remain unmet
```

Fixture QA covers valid synthetic cryptographic receipts and invoice flow, exact independent QR pixel decode at 320/390/768/1440, zero Axe A/AA violations on page and dialog, amount validation, current-post deletion before callback, missing recipient, mismatched invoice hash, one-attempt/reopen reuse, clipboard denial, native dialog keyboard containment/Escape/opener focus, independent sorting/pagination, no browser storage, and retained identity/deletion/failure states. Evidence: `qa/browser-results.json`, `qa/zap-dialog-*.png`, `qa/accessibility.json`. Fixture sats are never shipped as runtime data.

Live browser QA uses real relay/identity/pay metadata reads, with zero invoice callbacks. It showed verified community posts, working images, no page errors and no horizontal overflow including touch-enabled iPhone 13 emulation. Evidence: `qa/live-results.json` and `qa/live-*.png`.

The legacy service-worker migration fixture is pinned to pre-feed commit `9e89c6ae178e6a934a0637bbdfbd951cf7d68602` rather than the moving HEAD, which now already contains the retirement worker. The worker implementation itself is unchanged.

## Official protocol sources examined

Fetched official current raw specifications during implementation; local content hashes:

- `nostr-protocol/nips/57.md`: `3fb731a77f9222e5dcdf0bbdffade639c753e693867e40eb33cc226de7e4edd6`.
- `nostr-protocol/nips/61.md`: `cb39e202e5816bb08a01f5c0b4662b4190cbabc675f725d4b7715f07fa06de65`.
- `lightning/bolts/11-payment-encoding.md`: `c659da1bc08091f7fe691cd4ce661e578dfbe1f77a0b9cd9c53d1839010ae029`.

The BOLT11 reader is deliberately a strict zap-specific subset, not a general Lightning wallet implementation. Older/spec-optional encodings outside that subset fail closed. Producer compatibility must be verified, never assumed from fixture success.
