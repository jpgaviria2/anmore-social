# Anmore Social Production Readiness Review

Date: 2026-06-21

## Current State

`anmore.social` is a static GitHub Pages site backed by public Nostr data.

The site currently:
- Reads approved community events, posts, fundraisers, and marketplace listings from `wss://nostr-cache.trailscoffee.com`.
- Falls back to `wss://relay.anmore.me` and public relays.
- Uses FullCalendar for the visible community calendar.
- Uses `nostr-identity.js` for local Nostr identity handling.
- Sends create actions to Trails Coffee pages:
  - Events: `https://trailscoffee.com/events.html?create=1`
  - Feed: `https://trailscoffee.com/feed.html?create=1`
  - Fundraisers: `https://trailscoffee.com/fundraiser.html?create=1`
  - Marketplace: `https://trailscoffee.com/marketplace.html?create=1`

At the start of this review, Anmore Social was production-readable, but not production-writable as its own product.

This pass added a native `+ Event` composer so the site can now publish NIP-52 calendar events directly.

It also added useful empty states and quick event templates so the live site does not feel dead while the community calendar is being seeded.

## Main Production Gap

Event creation was not native to `anmore.social`.

Before this pass, a user who tapped `+ Event` was pushed through:
1. Identity prompt on `anmore.social`.
2. Redirect to `trailscoffee.com/events.html`.
3. Trails Coffee branded form.
4. Trails Coffee NIP-05 / approval / publishing flow.
5. Cache relay eventually indexes the event if the pubkey is approved.

That was too much friction for a community calendar. It also mixed the Anmore Social product with the Trails Coffee marketing site.

The current implementation keeps post, fundraiser, and marketplace creation on the Trails Coffee redirects, but event creation is now native.

## Recommended Direction

Build Anmore Social as the owner of community publishing.

Keep `trailscoffee.com` as the coffee website. Keep `anmore.social` as the community calendar/social surface.

## Priority 1 — Native Event Composer

Add an in-site event form/modal on `anmore.social` for `+ Event`.

Status: implemented for the basic event workflow.

Also implemented:
- Empty-state call to action for the calendar.
- Quick templates for community meetups, outdoor events, fundraisers, and school/family events.

Required fields:
- Event title
- Start date/time
- End date/time
- Location
- Description
- Organizer name

Nice-to-have fields:
- Event image/poster
- Event category
- Contact link/email
- RSVP link

Behavior:
- If the user already has a Nostr identity, use it.
- If not, offer a simple "Create local identity" flow.
- Let the user claim a simple `username@trailscoffee.com` identity through the existing `api.trailscoffee.com/api/v1/nip05/*` challenge/claim endpoints.
- Publish the event directly to `wss://relay.anmore.me`.
- Optimistically add the new event to the local calendar immediately after successful publish.

Recommended event format:
- NIP-52 time-based calendar event, kind `31923`.
- Use tags:
  - `d`
  - `title`
  - `summary`
  - `start`
  - `end`
  - `location`
  - `client`, value `anmore.social`
  - `t`, value `calendar`
  - optional `image`

## Priority 2 — Remove Trails Coffee Redirect Dependency

Replace `CREATE_ROUTES` in `app.js` with native handlers.

Current:
```js
const CREATE_ROUTES = {
  event: 'https://trailscoffee.com/events.html',
  post: 'https://trailscoffee.com/feed.html',
  fundraiser: 'https://trailscoffee.com/fundraiser.html',
  listing: 'https://trailscoffee.com/marketplace.html'
};
```

Target:
- `event` opens native event composer. Implemented.
- `post` can stay disabled or become a simple native post composer.
- `fundraiser` and `listing` can remain future features until the event workflow is solid.

## Priority 3 — Identity Cleanup

Current issues:
- The UI mentions `username@trailscoffee.com`, which works technically but feels wrong for Anmore Social.
- Username validation in `anmore-social/app.js` allows underscores, but the Trails API `nip05` route allows lowercase letters, numbers, and dashes only.
- The identity flow is coupled to Trails Coffee copy.

Recommended fixes:
- For the first production pass, keep `trailscoffee.com` NIP-05 because the backend already supports it.
- Update copy so it says "community identity" rather than Trails Coffee identity.
- Align frontend username validation with the API:
  - lowercase letters
  - numbers
  - dashes
  - 3-20 characters
  - no leading/trailing dash
- Later, add first-class `anmore.social` NIP-05 identities if we want the community brand fully separated.

## Priority 4 — Moderation Model

Decide the publishing rule.

Recommended default:
- Approved/staff identities publish immediately.
- New community identities can publish immediately, but only approved-domain/pubkey content is shown in the main feed.
- Add a simple "pending submissions" lane later if moderation becomes necessary.

Why:
- The existing cache relay already filters to approved pubkeys/domains.
- Over-moderating at launch will slow down calendar population.
- For a local community calendar, the goal is low-friction publishing with recoverable moderation.

## Priority 5 — Admin/Operator Shortcut

Add an operator-friendly path for jP/Charlene/Dayana:
- Login with existing nsec.
- Click `+ Event`.
- Fill form.
- Publish.
- Event appears instantly in local UI and shortly after through cache.

This is the highest-value workflow. It lets Trails staff populate the calendar quickly before opening creation widely.

## Priority 6 — Basic Production Hygiene

Add:
- `robots.txt`
- Open Graph image sized for sharing
- Analytics event tracking for:
  - page load
  - event detail open
  - create event opened
  - event publish success/failure
- A visible empty state with a real call to action.
- Error states for:
  - relay unavailable
  - Nostr tools failed to load
  - identity creation failed
  - publish failed
- A manual smoke-test checklist.

## Recommended Build Plan

### Phase 1 — Staff-Populated Calendar

Goal: jP/Charlene/Dayana can create events with very little friction.

Build:
- Native `+ Event` composer.
- Existing nsec login support.
- Direct publish to `relay.anmore.me`.
- Optimistic calendar update after publish.
- Frontend username validation fix.
- Better event empty state.

Status: implemented locally and ready for GitHub Pages deployment. No backend change required.

### Phase 2 — Community Submissions

Goal: regular community members can submit events without understanding Nostr.

Build:
- One-click local identity creation.
- API-backed NIP-05 claim flow.
- Clear recovery-key screen.
- Optional "save identity" prompt after first post.
- Submission success screen that explains the event may take a moment to appear publicly.

Backend likely already supports the NIP-05 claim flow.

### Phase 3 — Media and Moderation

Goal: event posters/images and abuse control.

Build:
- Image upload via `media.trailscoffee.com` or a dedicated Anmore media endpoint.
- Basic report/hide tooling.
- Optional pending queue if public posting gets noisy.

## Verdict

The repo is small and recoverable. It is not production-ready as a standalone community publishing product yet, but it is close.

The first real move is not a redesign. It is native event creation.

Recommended next implementation:
1. Build the native event composer in `app.js`.
2. Wire it to `NostrIdentity.signEvent`.
3. Publish to `wss://relay.anmore.me`.
4. Add optimistic calendar insertion.
5. Keep post/fundraiser/marketplace creation out of scope until event creation works cleanly.
