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

Owner-authorized installation supersedes the former worker-retirement requirement only. The no-content-caching invariant remains: the service worker caches only the dedicated offline document and stylesheet, never community data, identities, receipts, invoices, payments or external media. Its exact root navigation allowlist excludes payment/wallet paths and arbitrary queries. No offline payment controls or background payment synchronization exist. The sole optional local preference is an install-dismissal timestamp, never an identifier or reading history; denied storage must not break reading. See `PWA_READINESS.md` for tests and migration limits.

A waiting update must not automatically reset a page's invoice safety state. Only explicit acknowledged update/reload may do so; another tab must never force a reload. Offline cache revisions must retain the `anmore-social-offline-` ownership prefix, bump version when landing assets change, and never broaden the static allowlist without security review. Cache deletion may remove only obsolete owned prefixes, never unrelated caches.

## Contribution Hygiene

Do not include real API keys, tokens, Nostr private keys, wallet seeds, macaroons, database dumps, customer data, or production logs in issues, pull requests, screenshots, or test fixtures.
