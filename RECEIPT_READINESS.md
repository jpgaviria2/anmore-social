# Compact UI + receipt-only Primal candidate

## Scope and immutable base

Local worktree: `/Users/trails/anmore-social-receipts`. This candidate starts from the exact frozen compact tree `f1e71a373fa260b1b3acf31f43d64a5fd9ae3ad4`, represented by local synthetic base commit `44d3ac657b5715de0debe87398d41c63a5dac9ec` (parent `7b2ecf2dfb9f1ab395bc686b7d1e51683ebbf3b6`). The original compact review worktree was not edited. Final staged tree and file hashes are recorded separately in ignored local `qa/receipt-freeze.json` to avoid a self-referential tree hash.

No live relay writes, invoice callbacks, payments, wallet actions, production service/configuration changes, pushes, merges or deployment were performed by this workstream. All actual-network acceptance was read-only. Browser fixture callbacks are synthetic, intercepted locally, and never sent to the provider.

## Actual receipts, not NIP-11 inference

A read-only Primal query for exact verified Anmore post IDs found three canonical, signature-valid receipts. Anmore returned zero receipts for the same checked posts. The current client initially rejected **all three** solely because their signed requests omit the optional `lnurl` tag. Their invoices already pass the existing strict BOLT11 parser; no invoice-parser relaxation was needed. Signed request notification lists were already ignored as authority by the old verifier; that behavior is unchanged and no destinations from them are followed.

Official NIP-57 Appendix A explicitly makes request `lnurl` recommended but optional; Appendix F binds receipts to the recipient provider's HTTPS-advertised public key, invoice amount and original description hash. The retrieved primary reference is `nostr-protocol/nips`, `57.md`; exact local fetched bytes are outside the repository at `/Users/trails/.hermes/cache/scratch/nip57-receipt-reference.md`. No NIP-11 advertisement was treated as storage/admission evidence.

Current verification accepts absence of `lnurl` only while preserving approved issuer, separately resolved community recipient, both canonical Nostr signatures, exact visible post binding, raw description SHA256 → BOLT11 `h`, invoice signature/amount/payment hash/timing, and optional amount/k/sender consistency. If present, `lnurl` must still exactly match; duplicate or incorrect values fail closed. Request bytes are never normalized. Post-author payments or other recipients are not labelled community receipts.

Community destination remains `coffeeloverc2c2cd@pay.trailscoffee.com`; recipient `3b8a0f47a947a5a4f22578f691c39735abb11cedd0e415d872437fdd902ce9a9`; distinct approved issuer `60563a7699d1de2651dce8d4179a17d605037fdfc197765e1e7fa1840435ca6e`.

| Receipt ID | Exact Anmore post ID | Verified sats |
| --- | --- | ---: |
| `fdbef5e6a124ec8d4d0efe0f62b4e9f738306e2fe40d56c56a5988222b441c2a` | `4c5a5c9d3973ff11ca4ea687fb41583780d0141e9c18413175bf425ffd4db35b` | 50 |
| `c84ed2cee36dd16e8463553d0b0dc98c5bd77d3109f828c3f146af12759b2cae` | `c6ba79d2604f2d912ba69856dead693e8a729af6ad99137d208a9532c08ab1f7` | 42 |
| `8e08c04a98e438f65581867a2629c469533d766d470e673bcfd81bbb673d5c24` | `ba29587bedfa5327265622d3545958377eed38a5012214297c91cb967574ebeb` | 21 |

Combined verified snapshot: **113 sats**. These are provider-attested receipts, not independent settlement proofs. No new payments were made to obtain them.

## Narrow transport boundary

- Posts, profiles, NIP-05 admission, deletions and calendar content remain **Anmore-only**. No generic relay URL parameter was added to the content client.
- `src/receipts.js` adds only hardcoded `wss://relay.primal.net`, with no arbitrary-filter or arbitrary-destination API. It sends only `REQ`/`CLOSE`; each query is kind 9735, approved issuer, approved recipient and exact already-verified visible post IDs. Public-relay content injection is ignored.
- At most 1,200 target IDs and one filter per source, limit 1,000 receipts per source. A source reaching 1,000 raw EVENT frames is discarded as potentially truncated **before** signature/filter checks or event-ID deduplication; duplicate and invalid frames still count. This is explicitly enabled only for receipt reads on Anmore, preserving ordinary content-query behavior. The public peer additionally has a 1.2-million-character frame ceiling and 8 MiB aggregate UTF-8 ceiling. Both source receipt reads start concurrently with independent four-second deadlines. No serial per-post connections or unbounded subscription fanout.
- Content renders as soon as Anmore identity/deletion checks complete, before receipt resolution finishes. Existing sort-disable/in-flight and failure-count safeguards remain.
- Event-ID merging retains source provenance internally; strict payment-hash deduplication then prevents duplicate receipts/events across the two relays from increasing totals. Conflicting payment-hash bindings are excluded by the retained verifier.
- One healthy receipt source remains usable if the other fails. Partial positive amounts show `≥N sats`; absent partial totals show `—`, never verified zero. Tooltip and Top note identify partial/lower-bound status and available source(s). Both failing sources show unavailable, with newest fallback. Even a complete two-relay snapshot does not prove global receipt completeness.
- The CSP permits exactly the additional Primal host. No other relay, invoice-generation endpoint, authority relaxation or backend receipt import was added.

## Acceptance and retained evidence

- `npm test`: 33 tests pass, including raw-frame ceiling admission on each actual transport (1,000 duplicate/invalid frames rejected; 999-frame complete controls), both-source unavailability, real Schnorr/BOLT11 fixtures, optional-LNURL acceptance and duplicate/wrong-LNURL rejection, cross-relay event/payment-hash deduplication, either peer failing, deadline/socket closure, aggregate bytes and invalid/over-cap target zero-I/O admission.
- `npm run build`: clean; generated `app.js` is rebuilt from candidate source. Freeze verification separately checks exact generated bundle byte identity.
- `npm audit --registry=https://registry.npmjs.org --fetch-timeout=15000 --fetch-retries=0`: **0 vulnerabilities**, including dev dependencies. The initial default audit request timed out; the bounded official-registry retry completed.
- `QA_URL=http://127.0.0.1:4187 node tests/browser-qa.js`: full synthetic integration suite passes, including public-only receipts, simultaneous duplicate receipts on both sources, either source unavailable and honest partial UI, both unavailable, all existing dialog/serialization/padding/security checks, 320/390/768/1440 layouts and zero Axe A/AA violations. Synthetic callbacks are intercepted.
- The prior compact review's B6 missing acceptance is covered: after deleting the **highest tipped post** (2,000 sats), select Top and assert **every remaining card's amount plus complete ordering**, after pagination (14 cards), reload (11 cards) and further pagination (14 cards). Retained receipt data cannot resurrect the deleted event.
- `node tests/receipt-live-qa.js`: actual browser bundle + actual relay/HTTPS reads; initial **8** verified posts, pagination **14**; Top order and amounts exactly **50, 42, 21 sats**, all three real receipts represented. **Zero invoice callbacks, zero page errors**, overflow-free at **320/390/768/1440**. This test fences the callback URL off.
- `node tests/receipt-reconcile.js`: optional bounded read-only diagnostic, 100 raw Anmore post ceiling. Persists exact signed receipt evidence only in ignored `qa/receipt-live-private.json` with mode 0600; do not publish it, since signed receipt envelopes may contain payment proof material. Sanitized counts/IDs/totals are in `qa/receipt-reconcile.json` and `qa/receipt-verified.json`. Do not print raw invoices, descriptions, relay bearer-paths or preimages.

Remaining gate: independent parent-owned OpenCode review of this exact combined candidate, followed only by separately authorized release actions. Anmore's lack of stored historical receipts is not silently relabelled a backend fix; this candidate reads the existing receipts from the explicitly authorized peer.
