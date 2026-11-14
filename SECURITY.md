# Security Policy

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Use one of these private channels instead:

- GitHub private vulnerability reporting, if enabled for this repository
- Email: jp@trailscoffee.com

Include a short description, impact, affected version or commit, reproduction steps, and whether you believe funds, credentials, private keys, customer data, or production infrastructure are at risk.

## Scope

Security-sensitive reports include authentication bypass, secret exposure, payment or wallet flaws, server-side request forgery, injection, cross-site scripting, dependency-chain compromise, authorization mistakes, and ways to access data outside the intended user or store boundary.

## Disclosure

We aim to acknowledge credible reports within 72 hours. Please give us a reasonable remediation window before public disclosure, especially where customer data, credentials, Bitcoin/Lightning funds, or operational infrastructure could be affected.

## PWA storage and update boundary

The owner-authorized durable browser feed supersedes the former no-content-cache/source-absence policy. Same-origin IndexedDB stores public canonical signed accepted posts and event-bound historical signed profiles, exact HTTPS mapping evidence/time, monotonic revision/profile highwaters, signed tombstones, restrictive identity decisions, and authenticated raw receipt/provider/provenance evidence. Accepted history has no arbitrary age/count eviction. Quarantine is separately bounded. Cryptographic signatures, post/profile bindings, mapping/recipient contracts and receipt/invoice hashes are revalidated on restore; serialized approval flags alone cannot admit content. Historical domain/endpoint responses are local evidence, not portable signatures: same-origin code/storage integrity is a stated trust assumption. Browser storage may be denied, evicted or cleared and is not an archival guarantee.

Transient relay/HTTPS failure, identity expiry, missing source IDs or empty EOSE do not authorize deletion of accepted history. Only same-signer valid NIP-09 removal or a real authoritative identity contradiction/withdrawal can revoke projection. Deletion-before-target, restart and profile/revision highwaters must prevent replay of older bodies. Restored identity/receipt context is display-only, never current admission or spending authority. New acceptance requires a fresh exact `handle@trailscoffee.com` mapping and latest undeleted signed profile; there is no manual approval/name allowlist. New invoices retain exact post/profile/deletion/HTTPS recipient/endpoint rechecks, the fixed community Lightning recipient contract and the 60-second authority gate. Private keys, invoices, attempts, wallet state and payment sessions are never persisted.

Unread/corrupt/unsupported generations latch writes off, preserving prior data until retry/merge recovery succeeds. Recovery must preserve newer restrictive decisions and removals; independent tabs merge within the same IndexedDB read/write transaction. Failed writes/aborts/quota leave old disk state and current memory with a visible warning; never describe memory-only updates as restart-safe. Keep cryptographic/relay safety tests when changing storage or recovery.

The service worker preinstalls **only the reviewed versioned same-origin shell**: index, bundled app, stylesheet, manifest, two fixed icon assets and dedicated offline HTML/CSS. There are no runtime cache writes. Payment/invoice/identity endpoints, raw receipt HTTP data, arbitrary paths/queries and external media are never intercepted or cached. Public accepted evidence belongs in IndexedDB, not HTTP caches. Closed tabs do not poll; visible-tab automatic sync pauses during an open tip dialog. Offline cards and historical amounts never authorize an invoice.

Waiting updates cannot automatically reset invoice safety state: only explicit acknowledged update/reload may activate; an open tip dialog blocks activation and another tab cannot force reload. Shell cache revisions retain the `anmore-social-shell-` ownership prefix, bump with every reviewed shell byte/query revision, and may not broaden the allowlist without review. Cache deletion is restricted to obsolete owned shell/offline/legacy PWA prefixes, preserving unrelated caches and accepted IndexedDB generations. Earlier `PWA_READINESS.md` describes the superseded offline-landing-only release.

## Contribution Hygiene

Do not include real API keys, tokens, Nostr private keys, wallet seeds, macaroons, database dumps, customer data, or production logs in issues, pull requests, screenshots, or test fixtures.
