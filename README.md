# Anmore Social

Standalone static deploy for https://anmore.social.

- Reads public Nostr community data from `wss://nostr-cache.trailscoffee.com` first.
- Falls back to `wss://relay.anmore.me`, then public relays.
- Hosted via GitHub Pages with `CNAME` = `anmore.social`.

## Production Readiness

See [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md) for the current review and build plan.

The main production focus is native event creation. `+ Event` now opens an Anmore Social composer and publishes NIP-52 events directly to Nostr; the next production passes should harden media upload, moderation, and admin workflows.
