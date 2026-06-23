(() => {
  'use strict';

  const RELAYS = ['wss://nostr-cache.trailscoffee.com', 'wss://relay.anmore.me', 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
  const APPROVED_URL = 'https://nostr-cache.trailscoffee.com/approved';
  const WORLD_CUP_FIXTURES_URL = './data/world-cup-2026.json?v=20260621-3';
  const CONTENT_CACHE_KEY = 'anmore-social-content-cache-v2';
  const OLD_WORLD_CUP_COPY_RE = /\s*(?:Result|Status|Broadcast|Schedule source):\s*[^.]*\./gi;
  const APPROVED_DOMAINS = new Set(['anmore.me', 'trailscoffee.com', 'anmore.cash']);
  const KINDS = { profile: 0, post: 1, dateEvent: 31922, timeEvent: 31923, fundraiser: 9041, listing: 30402 };
  const CREATE_ROUTES = { event: 'https://trailscoffee.com/events.html', post: 'https://trailscoffee.com/feed.html', fundraiser: 'https://trailscoffee.com/fundraiser.html', listing: 'https://trailscoffee.com/marketplace.html' };
  const PUBLISH_RELAYS = ['wss://relay.anmore.me', 'wss://relay.damus.io', 'wss://nos.lol'];
  const EVENT_TEMPLATES = {
    meetup: { title: 'Community meetup', location: 'Trails Coffee, Anmore BC', description: 'A casual gathering for neighbours to connect, share updates, and meet other people in the community.' },
    outdoors: { title: 'Outdoor community event', location: 'Anmore, BC', description: 'A local outdoor gathering. Add the meeting point, route or activity details, age range, and anything people should bring.' },
    fundraiser: { title: 'Community fundraiser', location: 'Anmore, BC', description: 'A local fundraiser. Add the cause, suggested donation, schedule, and how people can participate or help.' },
    school: { title: 'School / family event', location: 'Anmore, BC', description: 'A family-friendly community event. Add who it is for, timing, cost if any, and what families should know before arriving.' }
  };
  const SOCIAL_KINDS = [KINDS.post, KINDS.dateEvent, KINDS.timeEvent, KINDS.fundraiser, KINDS.listing];
  const PARAMETERIZED_KINDS = new Set([KINDS.dateEvent, KINDS.timeEvent, KINDS.fundraiser, KINDS.listing]);
  const KNOWN = {
    c2c2cda6f2dbc736da8542d1742067de91ae287e96c9695550ff37e0117d61f2: { displayName: 'Anmore Trails Coffee', nip05: 'trails@trailscoffee.com' },
    '4123fb4c449d8a48a954fe25ce6b171bda595ff83fecdd8e2588f8ea00634e05': { displayName: 'Trails Manager', nip05: 'manager@trailscoffee.com' },
    '88ee46231382525f784e607913b7efd5943fc107eb97de505937e802e968e955': { displayName: 'JP', nip05: 'jp@trailscoffee.com' },
    '999e95385ce9171039dfbc0e2665aa0ea62644ab17dbf51f3597ef89807780c4': { displayName: 'JP', nip05: 'jp@trailscoffee.com' },
    e0a59f043d07866991ce3457f39c561009c4ca73f9e697e6c9d920b4b39090e8: { displayName: 'Birchy', nip05: 'birchy@trailscoffee.com' },
    '17c122ebefc64979940a1aca3e16612b9c428659c5a246a26e1f432391fc0e62': { displayName: 'PAC', nip05: 'pac@trailscoffee.com' },
    f4c9457d2a710aec0bab80cc82d2350c964c732570aabc9d80f25390bc53bb4f: { displayName: 'Coffee Lover', nip05: 'coffeelover635280@trailscoffee.com' },
    f3f3a288b9551deed41c8e9241dab89583411d99d3b493abb6b908b08adb9864: { displayName: 'Torca', nip05: 'torca@trailscoffee.com' },
    '3176ffec038ffb0e016818ecb541b382add3b6c6ba148b22a1fd4ddf5d8b94af': { displayName: 'Coffee Lover', nip05: 'coffeelover339076@trailscoffee.com' },
    be82529a6c42986ab8e20bd6c47fc69e14fa1e04f4ac0f74aeac42bd5840c1e8: { displayName: 'Charlene', nip05: 'charlene@trailscoffee.com' },
    ce07b6293ef1889eb80234240673e257bc159e7b79219adbc0726c5c7b220c22: { displayName: 'World Cup at Trails Coffee', nip05: 'world-cup@trailscoffee.com' }
  };

  const state = { calendar: null, relay: null, approved: new Set(Object.keys(KNOWN)), profiles: {}, posts: new Map(), events: new Map(), fundraisers: new Map(), listings: new Map(), selectedDate: null };
  const $ = (id) => document.getElementById(id);
  const els = { pulse: $('connection-pulse'), label: $('connection-label'), detail: $('connection-detail'), stats: { events: $('stat-events'), posts: $('stat-posts'), fundraisers: $('stat-fundraisers'), listings: $('stat-listings') }, feed: $('feed-list'), events: $('events-list'), fundraisers: $('fundraiser-list'), listings: $('marketplace-list'), dayTitle: $('selected-day-title'), dayEvents: $('selected-day-events') };

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('click', (event) => {
    const tabButton = event.target.closest?.('[data-tab]');
    if (tabButton) return activateTab(tabButton.dataset.tab);
    const createButton = event.target.closest?.('[data-create]');
    if (createButton?.dataset.create === 'event') return openEventComposer(createButton.dataset.template);
    if (createButton) return openCreateIdentityGate(createButton.dataset.create);
    const socialCard = event.target.closest?.('[data-card-kind][data-card-id]');
    if (socialCard) return openItemDetails(socialCard.dataset.cardKind, socialCard.dataset.cardId);
  });

  async function init() {
    registerServiceWorker();
    syncOnlineState();
    window.addEventListener('online', syncOnlineState);
    window.addEventListener('offline', syncOnlineState);
    initCalendar();
    setSelectedDate(new Date());
    const cached = loadContentCache();
    await loadWorldCupFixtures();
    if (cached || state.events.size) {
      renderAll();
      setConnection('connected', cached ? 'Loaded saved calendar' : 'Calendar ready', cached ? `${cached} saved items loaded. Refreshing from relays in the background.` : 'World Cup fixtures loaded. Refreshing local activity in the background.');
    } else {
      setConnection('', 'Connecting to Nostr…', 'Checking Trails cache and live relays.');
    }
    refreshSocialData();
  }

  async function refreshSocialData() {
    try {
      setConnection('', state.events.size ? 'Refreshing local activity…' : 'Connecting to Nostr…', 'Checking Trails cache and live relays.');
      await loadApproved();
      const events = dedupe(await fetchSocialEvents());
      const pubkeys = Array.from(new Set(events.map((event) => event.pubkey)));
      state.profiles = { ...state.profiles, ...await fetchProfiles(pubkeys) };
      ingestAll(events);
      await loadWorldCupFixtures();
      saveContentCache();
      renderAll();
      if (events.length) setConnection('connected', 'Anmore Social is live', `${events.length} relay events loaded from ${state.relay}. Saved locally for next visit.`);
      else setConnection('connected', 'Saved calendar loaded', 'No new relay events matched yet. Showing saved calendar data.');
    } catch (error) {
      console.error(error);
      await loadWorldCupFixtures();
      saveContentCache();
      renderAll();
      setConnection(state.events.size ? 'connected' : 'error', state.events.size ? 'Showing saved calendar' : 'Relay data unavailable', state.events.size ? 'Could not refresh relays, so the browser is using saved events.' : 'Could not read the cache or fallback relays right now.');
    }
  }

  function setConnection(status, label, detail) {
    els.pulse.className = `pulse ${status === 'connected' ? 'connected' : status === 'error' ? 'error' : ''}`;
    els.label.textContent = label;
    els.detail.textContent = detail;
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      console.warn('Anmore Social service worker registration failed', error);
    });
  }

  function syncOnlineState() {
    document.documentElement.classList.toggle('is-offline', navigator.onLine === false);
  }

  async function loadApproved() {
    try {
      const res = await fetch(APPROVED_URL, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return;
      const json = await res.json();
      const list = Array.isArray(json) ? json : Array.isArray(json.pubkeys) ? json.pubkeys : Array.isArray(json.approved) ? json.approved : [];
      list
        .map((entry) => (typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? entry.pubkey : null))
        .filter((p) => typeof p === 'string' && /^[0-9a-f]{64}$/i.test(p))
        .forEach((p) => state.approved.add(p.toLowerCase()));
    } catch {}
  }

  async function fetchSocialEvents() {
    const authors = Array.from(state.approved);
    const filters = [
      { kinds: [KINDS.post], authors, limit: 70 },
      { kinds: [KINDS.dateEvent, KINDS.timeEvent], authors, limit: 220 },
      { kinds: [KINDS.fundraiser], authors, limit: 30 },
      { kinds: [KINDS.listing], authors, limit: 40 }
    ];
    const byId = new Map();
    const sources = [];

    for (const relay of RELAYS) {
      const events = await fetchRelayEvents(relay, filters, 5200);
      if (!events.length) continue;
      sources.push(`${events.length} from ${new URL(relay).hostname}`);
      events.forEach((event) => byId.set(event.id, event));
      if (byId.size >= 160) break;
    }

    state.relay = sources.length ? sources.join(' + ') : RELAYS[0];
    return Array.from(byId.values());
  }

  async function fetchProfiles(pubkeys) {
    const profiles = {};
    const unknown = pubkeys.filter((p) => !KNOWN[p]);
    if (!unknown.length) return profiles;
    for (const relay of RELAYS) {
      const events = await fetchRelayEvents(relay, [{ kinds: [KINDS.profile], authors: unknown, limit: unknown.length }], 2800);
      for (const event of events) {
        const profile = safeJson(event.content);
        if (profile && !looksDeleted(profile.name) && !looksDeleted(profile.display_name)) profiles[event.pubkey] = profile;
      }
      if (Object.keys(profiles).length) break;
    }
    return profiles;
  }

  function fetchRelayEvents(relayUrl, filters, timeoutMs) {
    return new Promise((resolve) => {
      if (typeof WebSocket === 'undefined') return resolve([]);
      const subId = `anmore_social_${Math.random().toString(36).slice(2)}`;
      const events = [];
      let socket;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        try { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(['CLOSE', subId])); socket?.close(); } catch {}
        resolve(events);
      };
      const timer = setTimeout(finish, timeoutMs);
      try {
        socket = new WebSocket(relayUrl);
        socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subId, ...filters])));
        socket.addEventListener('message', (message) => {
          try {
            const parsed = JSON.parse(String(message.data));
            if (parsed[0] === 'EVENT' && parsed[1] === subId && parsed[2]) events.push(parsed[2]);
            if (parsed[0] === 'EOSE' && events.length > 0) { clearTimeout(timer); finish(); }
          } catch {}
        });
        socket.addEventListener('error', () => { clearTimeout(timer); finish(); });
      } catch { clearTimeout(timer); finish(); }
    });
  }

  function ingestAll(events) {
    for (const event of events) {
      if (!SOCIAL_KINDS.includes(event.kind) || !isApproved(event.pubkey)) continue;
      if (event.kind === KINDS.post && isHumanPost(event)) state.posts.set(event.id, parsePost(event));
      if (event.kind === KINDS.dateEvent || event.kind === KINDS.timeEvent) { const parsed = parseCalendarEvent(event); if (parsed) state.events.set(parsed.id, parsed); }
      if (event.kind === KINDS.fundraiser) { const parsed = parseFundraiser(event); if (parsed) state.fundraisers.set(parsed.id, parsed); }
      if (event.kind === KINDS.listing) { const parsed = parseListing(event); if (parsed) state.listings.set(parsed.id, parsed); }
    }
  }

  function loadContentCache() {
    try {
      if (typeof localStorage === 'undefined') return 0;
      const cached = safeJson(localStorage.getItem(CONTENT_CACHE_KEY));
      if (!cached || cached.version !== 1) return 0;
      state.profiles = { ...cached.profiles };
      restoreCachedMap(state.posts, cached.posts);
      restoreCachedMap(state.events, cached.events);
      restoreCachedMap(state.fundraisers, cached.fundraisers);
      restoreCachedMap(state.listings, cached.listings);
      return state.posts.size + state.events.size + state.fundraisers.size + state.listings.size;
    } catch {
      return 0;
    }
  }

  function saveContentCache() {
    try {
      if (typeof localStorage === 'undefined') return;
      const payload = {
        version: 1,
        savedAt: Date.now(),
        profiles: state.profiles,
        posts: sortByCreated(state.posts).slice(0, 90),
        events: Array.from(state.events.values()).sort((a, b) => a.start - b.start).slice(-220),
        fundraisers: sortByCreated(state.fundraisers).slice(0, 60),
        listings: sortByCreated(state.listings).slice(0, 80)
      };
      localStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Could not save Anmore Social cache', error);
    }
  }

  function restoreCachedMap(map, items) {
    if (!Array.isArray(items)) return;
    for (const item of items) if (item?.id) map.set(item.id, item);
  }

  async function loadWorldCupFixtures() {
    try {
      const response = await fetch(WORLD_CUP_FIXTURES_URL, { cache: 'no-store' });
      if (!response.ok) return 0;
      const json = await response.json();
      const matches = Array.isArray(json.matches) ? json.matches : [];
      matches.forEach(ingestWorldCupFixture);
      return matches.length;
    } catch (error) {
      console.warn('World Cup fixtures unavailable', error);
      return 0;
    }
  }

  function ingestWorldCupFixture(match) {
    const start = parseEventStart(match.start);
    if (!start) return;
    const end = parseEventStart(match.end) || start + 7200;
    state.events.set(match.id, {
      id: match.id,
      pubkey: 'world-cup-2026',
      source: 'world-cup',
      sourceLabel: 'FIFA World Cup 2026',
      sourceUrl: '',
      stage: match.stage || 'World Cup',
      status: match.status || 'Scheduled',
      title: match.title || 'World Cup match',
      description: cleanWorldCupDescription(match.description || 'FIFA World Cup 2026 fixture.', match.title, Boolean(match.broadcastAtTrails)),
      broadcastAtTrails: Boolean(match.broadcastAtTrails),
      location: match.location || '',
      start,
      end,
      created_at: start
    });
  }

  function isApproved(pubkey) {
    if (state.approved.has(pubkey) || KNOWN[pubkey]) return true;
    const nip05 = state.profiles[pubkey]?.nip05;
    const domain = nip05?.split('@')[1]?.toLowerCase();
    return domain ? APPROVED_DOMAINS.has(domain) : false;
  }

  function isHumanPost(event) {
    const tags = tagValues(event, 't').map((t) => t.toLowerCase());
    if (tags.includes('constitute')) return false;
    const json = safeJson(event.content);
    if (json?.type && String(json.type).startsWith('gateway_')) return false;
    return event.content.trim().length > 0;
  }

  function parsePost(event) { const media = mediaUrls(event); return { id: event.id, pubkey: event.pubkey, content: stripMedia(contentText(event), media), media, created_at: event.created_at }; }
  function parseCalendarEvent(event) {
    const tags = tagMap(event.tags); const json = safeJson(event.content);
    const dTag = tags.d || tagValue(event, 'd');
    const isWorldCup = dTag?.startsWith('world-cup-2026-') || tagValues(event, 't').map((tag) => tag.toLowerCase()).includes('worldcup');
    const rawStart = tags.start || tags.starts || tags.date || str(json?.start) || str(json?.date);
    const start = parseEventStart(rawStart, event.kind === KINDS.dateEvent);
    if (!start) return null;
    const rawEnd = tags.end || tags.ends || str(json?.end);
    const end = parseEventStart(rawEnd, event.kind === KINDS.dateEvent) || start + (event.kind === KINDS.dateEvent ? 86400 : 3600);
    const rawDescription = tags.summary || tags.description || str(json?.description) || str(json?.content) || (json ? '' : event.content);
    const broadcastAtTrails = tags.trails_broadcast === 'true' || json?.broadcastAtTrails === true || /Showing at Trails Coffee|Trails Coffee is broadcasting/i.test(String(rawDescription || ''));
    const description = isWorldCup ? cleanWorldCupDescription(rawDescription, tags.title || tags.name || str(json?.title) || str(json?.name), broadcastAtTrails) : rawDescription;
    return { id: isWorldCup && dTag ? dTag : event.id, pubkey: event.pubkey, source: isWorldCup ? 'world-cup' : undefined, sourceLabel: isWorldCup ? 'FIFA World Cup 2026' : undefined, sourceUrl: isWorldCup ? '' : tags.source || str(json?.sourceUrl), stage: tags.stage || str(json?.stage), status: isWorldCup ? '' : tags.status || str(json?.status), title: tags.title || tags.name || str(json?.title) || str(json?.name) || firstLine(event.content) || 'Community event', description, broadcastAtTrails, location: tags.location || str(json?.location) || '', start, end, created_at: event.created_at };
  }
  function parseFundraiser(event) { const tags = tagMap(event.tags); const json = safeJson(event.content); const title = tags.title || tags.name || str(json?.name) || str(json?.title) || firstLine(event.content); if (!title) return null; const media = mediaUrls(event); const description = tags.summary || tags.description || str(json?.description) || str(json?.about) || str(json?.content) || (json ? '' : event.content); return { id: event.id, pubkey: event.pubkey, title, description: stripMedia(description, media), media, goal: str(json?.goal) || tags.goal || '', created_at: event.created_at }; }
  function parseListing(event) { const tags = tagMap(event.tags); const json = safeJson(event.content); const title = tags.title || tags.name || str(json?.title) || firstLine(event.content); if (!title) return null; const media = mediaUrls(event); const description = tags.summary || tags.description || str(json?.summary) || str(json?.description) || (json ? '' : event.content); return { id: event.id, pubkey: event.pubkey, title, description: stripMedia(description, media), media, price: tags.price || str(json?.price) || '', location: tags.location || str(json?.location) || '', created_at: event.created_at }; }

  function dedupe(events) { const byKey = new Map(); for (const event of events.sort((a, b) => b.created_at - a.created_at)) { const dTag = tagValue(event, 'd') || event.id; const key = PARAMETERIZED_KINDS.has(event.kind) ? `${event.kind}:${event.pubkey}:${dTag}` : event.id; if (!byKey.has(key)) byKey.set(key, event); } return Array.from(byKey.values()).sort((a, b) => b.created_at - a.created_at); }
  function tagMap(tags = []) { const map = {}; for (const tag of tags) if (tag?.[0] && tag?.[1] && !map[tag[0]]) map[tag[0]] = tag[1]; return map; }
  function tagValue(event, name) { return event.tags?.find((tag) => tag[0] === name && tag[1])?.[1]; }
  function tagValues(event, name) { return (event.tags || []).filter((tag) => tag[0] === name && tag[1]).map((tag) => tag[1]); }
  function cleanWorldCupDescription(description = '', title = '', showingAtTrails = false) {
    const matchup = String(title || '').replace(/^World Cup:\s*/i, '').trim();
    const base = String(description || '')
      .replace(OLD_WORLD_CUP_COPY_RE, ' ')
      .replace(/\b(?:FOX|FS1|ESPN|Peacock|Tele|Universo|FOX One)\b[,. ]*/gi, '')
      .replace(/Trails Coffee is broadcasting this match during opening hours\.?/gi, 'Showing at Trails Coffee.')
      .replace(/\s+/g, ' ')
      .trim();
    if (showingAtTrails && matchup) return `FIFA World Cup 2026 fixture. ${matchup} is showing at Trails Coffee.`;
    if (matchup) return `FIFA World Cup 2026 fixture. ${matchup}.`;
    return base || 'FIFA World Cup 2026 fixture.';
  }
  function parseEventStart(value, allDay) { if (!value) return 0; if (/^\d+$/.test(String(value))) return Number(value); const date = new Date(allDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value); return Number.isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000); }
  function safeJson(text) { try { const parsed = JSON.parse(text); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null; } catch { return null; } }
  function str(value) { return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined; }
  function firstLine(text = '') { return text.trim().split('\n').find(Boolean)?.slice(0, 88) || ''; }
  function contentText(event) { const json = safeJson(event.content); return str(json?.body) || str(json?.content) || str(json?.description) || event.content; }
  const IMAGE_HOSTS = new Set(['image.nostr.build', 'nostr.build', 'cdn.nostr.build', 'void.cat', 'i.imgur.com', 'imgur.com']);
  const URL_RE = /https?:\/\/[^\s<>()"']+/gi;
  const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|heic|svg)(?:$|[?#])/i;
  function normalizeUrl(url = '') { return String(url).replace(/[.,;:!?]+$/g, ''); }
  function isImageUrl(url) { try { const parsed = new URL(normalizeUrl(url)); const host = parsed.hostname.toLowerCase().replace(/^www\./, ''); return IMAGE_HOSTS.has(host) || IMAGE_EXT_RE.test(parsed.pathname + parsed.search); } catch { return false; } }
  function jsonStrings(json, key) { const value = json?.[key]; if (Array.isArray(value)) return value.filter((item) => typeof item === 'string' && item); return typeof value === 'string' && value ? [value] : []; }
  function mediaUrls(event) { const json = safeJson(event.content); const candidates = [...tagValues(event, 'image'), ...tagValues(event, 'thumb'), ...jsonStrings(json, 'image'), ...jsonStrings(json, 'images'), ...jsonStrings(json, 'picture'), ...jsonStrings(json, 'url')]; for (const imeta of tagValues(event, 'imeta')) { const part = imeta.split(' ').find((value) => value.startsWith('url ')); if (part) candidates.push(part.slice(4)); } for (const match of String(event.content || '').matchAll(URL_RE)) candidates.push(match[0]); return Array.from(new Set(candidates.map(normalizeUrl).filter(isImageUrl))).slice(0, 4); }
  function stripMedia(text = '', media = []) { return media.reduce((copy, url) => copy.replaceAll(url, '').replaceAll(`${url}/`, ''), String(text || '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
  function mediaMarkup(media = []) { if (!media.length) return ''; return `<div class="card-media-grid">${media.map((url) => `<img src="${escapeHtml(url)}" alt="" loading="lazy">`).join('')}</div>`; }
  function looksDeleted(value) { return String(value || '').trim().toLowerCase() === 'deleted'; }
  function escapeHtml(text = '') { return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])); }
  function truncate(text = '', length = 150) { const clean = String(text).replace(/\s+/g, ' ').trim(); return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean; }
  function fmtDate(ts) { return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ts * 1000)); }
  function profileName(pubkey) { const p = state.profiles[pubkey]; return p?.display_name || p?.displayName || p?.name || KNOWN[pubkey]?.displayName || p?.nip05 || KNOWN[pubkey]?.nip05 || `${pubkey.slice(0, 8)}…`; }
  function sortByCreated(map) { return Array.from(map.values()).sort((a, b) => (b.created_at || 0) - (a.created_at || 0)); }

  function renderAll() {
    const posts = sortByCreated(state.posts).slice(0, 6);
    const events = Array.from(state.events.values()).filter((e) => e.end * 1000 >= Date.now() - 86400000).sort((a, b) => a.start - b.start).slice(0, 6);
    const fundraisers = sortByCreated(state.fundraisers).slice(0, 4);
    const listings = sortByCreated(state.listings).slice(0, 4);
    els.stats.events.textContent = state.events.size; els.stats.posts.textContent = state.posts.size; els.stats.fundraisers.textContent = state.fundraisers.size; els.stats.listings.textContent = state.listings.size;
    renderCards(els.feed, posts, renderPostCard, 'No approved local posts yet.');
    renderCards(els.events, events, renderEventCard, renderEventEmpty);
    renderCards(els.fundraisers, fundraisers, renderFundraiserCard, 'No active approved fundraisers yet.');
    renderCards(els.listings, listings, renderListingCard, 'No approved marketplace listings yet.');
    updateCalendar(); renderSelectedDay();
  }
  function renderCards(container, items, renderer, emptyContent) { container.classList.remove('loading-list'); container.innerHTML = items.length ? items.map(renderer).join('') : (typeof emptyContent === 'function' ? emptyContent() : `<p class="empty">${escapeHtml(emptyContent)}</p>`); }
  function renderEventEmpty() { return `<div class="empty-action"><h3>Start the calendar</h3><p>No upcoming approved events are listed yet. Add the first community event, then use the templates to quickly add meetups, fundraisers, outdoor events, and school/family events.</p><div class="quick-template-row">${renderTemplateButtons()}</div></div>`; }
  function renderTemplateButtons() { return Object.entries(EVENT_TEMPLATES).map(([key, item]) => `<button class="secondary-button template-button" type="button" data-create="event" data-template="${escapeHtml(key)}">${escapeHtml(item.title)}</button>`).join(''); }
  function renderPostCard(post) { return `<article class="item-card clickable-card" data-card-kind="post" data-card-id="${escapeHtml(post.id)}"><h3>${escapeHtml(profileName(post.pubkey))}</h3>${mediaMarkup(post.media)}<p>${escapeHtml(truncate(post.content, 210))}</p><div class="meta"><span class="badge">${fmtDate(post.created_at)}</span><span class="badge">verified local</span><span class="badge">details →</span></div></article>`; }
  function renderEventCard(event) {
    const isWorldCup = event.source === 'world-cup';
    return `<article class="item-card event-card clickable-card ${isWorldCup ? 'world-cup-card' : ''}" data-card-kind="event" data-card-id="${escapeHtml(event.id)}"><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(truncate(event.description || 'Tap for details', 170))}</p><div class="meta">${isWorldCup ? `<span class="badge world-cup-badge">World Cup</span>` : ''}${event.broadcastAtTrails ? `<span class="badge world-cup-badge">At Trails Coffee</span>` : ''}${event.stage ? `<span class="badge">${escapeHtml(event.stage)}</span>` : ''}<span class="badge">${fmtDate(event.start)}</span>${event.location ? `<span class="badge">${escapeHtml(event.location)}</span>` : ''}<span class="badge">details →</span></div></article>`;
  }
  function renderFundraiserCard(item) { return `<article class="item-card clickable-card" data-card-kind="fundraiser" data-card-id="${escapeHtml(item.id)}"><h3>${escapeHtml(item.title)}</h3>${mediaMarkup(item.media)}<p>${escapeHtml(truncate(item.description, 170))}</p><div class="meta">${item.goal ? `<span class="badge">Goal: ${escapeHtml(item.goal)}</span>` : ''}<span class="badge">${escapeHtml(profileName(item.pubkey))}</span><span class="badge">details →</span></div></article>`; }
  function renderListingCard(item) { return `<article class="item-card clickable-card" data-card-kind="listing" data-card-id="${escapeHtml(item.id)}"><h3>${escapeHtml(item.title)}</h3>${mediaMarkup(item.media)}<p>${escapeHtml(truncate(item.description, 170))}</p><div class="meta">${item.price ? `<span class="badge">${escapeHtml(item.price)}</span>` : ''}${item.location ? `<span class="badge">${escapeHtml(item.location)}</span>` : ''}<span class="badge">details →</span></div></article>`; }

  function activateTab(tab) {
    document.querySelectorAll('[data-tab]').forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      const active = panel.id === `${tab}-panel`;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  }

  function initCalendar() { const el = $('calendar-grid'); if (!el || !window.FullCalendar) return; state.calendar = new FullCalendar.Calendar(el, { initialView: 'dayGridMonth', height: 'auto', fixedWeekCount: false, dayMaxEvents: 3, moreLinkClick(info) { openDayView(info.date); return 'none'; }, headerToolbar: { left: 'prev,next today', center: 'title', right: '' }, eventClick(info) { info.jsEvent.preventDefault(); openEventDetails(info.event.id); }, dateClick(info) { openDayView(info.date); } }); state.calendar.render(); }
  function updateCalendar() { if (!state.calendar) return; state.calendar.removeAllEvents(); state.calendar.addEventSource(Array.from(state.events.values()).map((event) => { const isWorldCup = event.source === 'world-cup'; const color = isWorldCup ? '#8f2638' : '#173f35'; return { id: event.id, title: event.title, start: new Date(event.start * 1000), end: new Date(event.end * 1000), allDay: isAllDay(event), backgroundColor: color, borderColor: color, textColor: '#fff' }; })); }
  function isAllDay(event) { const start = new Date(event.start * 1000); const end = new Date(event.end * 1000); return start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 0 && end.getMinutes() === 0; }
  function setSelectedDate(date) { state.selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()); renderSelectedDay(); }
  function eventsForDay(date) { const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toDateString(); return Array.from(state.events.values()).filter((event) => new Date(event.start * 1000).toDateString() === day).sort((a, b) => a.start - b.start); }
  function renderSelectedDay() { if (!els.dayEvents || !state.selectedDate) return; const events = eventsForDay(state.selectedDate); els.dayTitle.textContent = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(state.selectedDate); if (!events.length) { const upcoming = Array.from(state.events.values()).filter((e) => e.start * 1000 >= Date.now()).sort((a, b) => a.start - b.start).slice(0, 3); els.dayEvents.innerHTML = upcoming.length ? upcoming.map(renderEventCard).join('') : renderEventEmpty(); if (upcoming.length) els.dayTitle.textContent = 'Upcoming events'; return; } els.dayEvents.innerHTML = events.map(renderEventCard).join(''); }

  function openDayView(date) { setSelectedDate(date); const events = eventsForDay(date); const title = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(date); openModal(`<div class="modal-head"><button class="back-button" data-modal-close>×</button><p class="eyebrow">Day view</p><h2>${escapeHtml(title)}</h2></div><div class="modal-list">${events.length ? events.map(renderEventCard).join('') : `<div class="empty-action"><p>No events on this day yet.</p><button class="create-button" data-create="event">Create event on this date</button></div>`}</div>`); }
  function openItemDetails(kind, id) { if (kind === 'event') return openEventDetails(id); const collections = { post: state.posts, fundraiser: state.fundraisers, listing: state.listings }; const item = collections[kind]?.get(id); if (!item) return; const title = kind === 'post' ? profileName(item.pubkey) : item.title; const copy = kind === 'post' ? item.content : item.description; const meta = kind === 'post' ? `<div><strong>Posted</strong><span>${escapeHtml(fmtDate(item.created_at))}</span></div><div><strong>Author</strong><span>${escapeHtml(profileName(item.pubkey))}</span></div>` : `<div><strong>Author</strong><span>${escapeHtml(profileName(item.pubkey))}</span></div>${item.goal ? `<div><strong>Goal</strong><span>${escapeHtml(item.goal)}</span></div>` : ''}${item.price ? `<div><strong>Price</strong><span>${escapeHtml(item.price)}</span></div>` : ''}${item.location ? `<div><strong>Location</strong><span>${escapeHtml(item.location)}</span></div>` : ''}`; openModal(`<div class="modal-head"><button class="back-button" data-modal-close>×</button><p class="eyebrow">${escapeHtml(kind)} details</p><h2>${escapeHtml(title || 'Details')}</h2></div>${mediaMarkup(item.media)}<div class="detail-grid">${meta}</div><p class="detail-copy">${escapeHtml(copy || 'No description provided.')}</p>`); }
  function openEventDetails(eventId) {
    const event = state.events.get(eventId);
    if (!event) return;
    const isWorldCup = event.source === 'world-cup';
    const host = event.sourceLabel || profileName(event.pubkey);
    const sourceLink = event.sourceUrl ? `<a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener">source</a>` : '';
    openModal(`<div class="modal-head"><button class="back-button" data-modal-close>×</button><p class="eyebrow">${isWorldCup ? 'World Cup fixture' : 'Event details'}</p><h2>${escapeHtml(event.title)}</h2></div>${event.image ? `<img class="event-image" src="${escapeHtml(event.image)}" alt="">` : ''}<div class="detail-grid"><div><strong>When</strong><span>${escapeHtml(fmtDate(event.start))}</span></div>${event.location ? `<div><strong>Where</strong><span>${escapeHtml(event.location)}</span></div>` : ''}${event.broadcastAtTrails ? `<div><strong>Trails Coffee</strong><span>Showing at Trails Coffee</span></div>` : ''}${event.stage ? `<div><strong>Stage</strong><span>${escapeHtml(event.stage)}</span></div>` : ''}${event.status ? `<div><strong>Status</strong><span>${escapeHtml(event.status)}</span></div>` : ''}${isWorldCup ? '' : `<div><strong>Host</strong><span>${escapeHtml(host)} ${sourceLink}</span></div>`}</div><p class="detail-copy">${escapeHtml(event.description || 'No description provided.')}</p><div class="modal-actions"><button class="create-button" data-create="event">Create another event</button></div>`);
  }
  function closeModal() { document.querySelector('.modal-overlay')?.remove(); document.body.classList.remove('modal-open'); }
  function openModal(html) { closeModal(); const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.innerHTML = `<div class="modal-card">${html}</div>`; overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-modal-close]')) closeModal(); }); document.body.classList.add('modal-open'); document.body.appendChild(overlay); overlay.querySelector('.modal-card')?.scrollTo(0, 0); }

  function openEventComposer(templateKey) {
    const baseDate = state.selectedDate || new Date();
    const start = new Date(baseDate);
    start.setHours(Math.max(new Date().getHours() + 1, 9), 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const template = EVENT_TEMPLATES[templateKey] || {};
    openModal(`<form id="event-composer-form" class="composer-form"><div class="modal-head"><button class="back-button" type="button" data-modal-close>×</button><p class="eyebrow">Create event</p><h2>Add to Anmore Social</h2></div><p class="detail-copy">Publish a community calendar event directly to Anmore Social. Existing approved identities appear fastest; new community identities may take a moment to show publicly.</p><div class="quick-template-row composer-templates">${renderTemplateButtons()}</div><div class="form-grid"><label class="field-label">Event title<input class="text-input" name="title" required maxlength="90" placeholder="Coffee meetup, school fundraiser, trail day" value="${escapeHtml(template.title || '')}"></label><label class="field-label">Organizer<input class="text-input" name="author" maxlength="80" placeholder="Your name or group"></label><label class="field-label">Start<input class="text-input" type="datetime-local" name="start" required value="${escapeHtml(datetimeLocalValue(start))}"></label><label class="field-label">End<input class="text-input" type="datetime-local" name="end" required value="${escapeHtml(datetimeLocalValue(end))}"></label><label class="field-label form-grid-full">Location<input class="text-input" name="location" maxlength="120" placeholder="Spirit Park, Buntzen Lake, Trails Coffee, online" value="${escapeHtml(template.location || '')}"></label><label class="field-label form-grid-full">Description<textarea class="text-input textarea-input" name="description" required rows="5" maxlength="1200" placeholder="What should people know? Include cost, registration, age range, and anything people should bring.">${escapeHtml(template.description || '')}</textarea></label><label class="field-label form-grid-full">Community identity<input id="composer-username" class="text-input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="optional, e.g. anmore-events"></label></div><p class="hint">Identity usernames use lowercase letters, numbers, and dashes. Leave blank to use your existing identity or create an automatic one.</p><p id="composer-feedback" class="username-feedback" aria-live="polite"></p><div class="modal-actions"><button class="create-button" type="submit">Publish event</button><button class="secondary-button" type="button" id="composer-login">Login with nsec</button></div></form>`);
    const form = document.getElementById('event-composer-form');
    document.getElementById('composer-login')?.addEventListener('click', async () => {
      try {
        await promptForComposerLogin();
        updateComposerIdentityState();
      } catch (error) {
        if (error?.message) setComposerFeedback(error.message, 'error');
      }
    });
    updateComposerIdentityState();
    form?.addEventListener('submit', submitEventComposer);
  }

  async function submitEventComposer(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Publishing...';
    try {
      if (!window.NostrIdentity) throw new Error('Nostr identity tools did not load.');
      const data = Object.fromEntries(new FormData(form).entries());
      const start = Math.floor(new Date(data.start).getTime() / 1000);
      const end = Math.floor(new Date(data.end).getTime() / 1000);
      if (!data.title?.trim()) throw new Error('Event title is required.');
      if (!data.description?.trim()) throw new Error('Description is required.');
      if (!start || !end || end <= start) throw new Error('End time must be after start time.');

      if (!window.NostrIdentity.hasIdentity?.()) {
        button.textContent = 'Waiting for login...';
        setComposerFeedback('Log in with your nsec to publish this event.', 'checking');
        await promptForComposerLogin();
        updateComposerIdentityState();
        button.textContent = 'Publishing...';
      }
      const username = cleanUsername(data.username);
      const pubkey = await ensurePublishingIdentity(username);
      const nip05 = await ensureNip05(pubkey, username);
      await publishProfile(pubkey, nip05, data.author || username || 'Anmore Social');
      const signedEvent = await createSignedCalendarEvent({ ...data, start, end, pubkey });
      await publishToRelays(signedEvent);
      state.approved.add(pubkey);
      state.profiles[pubkey] = { name: data.author || username || 'Anmore Social', nip05 };
      ingestAll([signedEvent]);
      saveContentCache();
      renderAll();
      setSelectedDate(new Date(start * 1000));
      openModal(`<div class="modal-head"><button class="back-button" data-modal-close>×</button><p class="eyebrow">Published</p><h2>${escapeHtml(data.title)}</h2></div><p class="detail-copy">The event was published to Nostr and added to this calendar. If this is a new identity, the public cache may take a moment to index it.</p><div class="modal-actions"><button class="create-button" data-modal-close>Done</button><button class="secondary-button" data-create="event">Create another event</button></div>`);
      window.NostrIdentity.promptToSave?.();
    } catch (error) {
      setComposerFeedback(error.message || 'Publish failed.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function ensurePublishingIdentity(username) {
    if (!window.NostrIdentity.hasIdentity?.()) {
      throw new Error('Log in with your nsec before publishing.');
    }
    const pubkey = window.NostrIdentity.getPublicKey?.();
    if (!pubkey) throw new Error('Could not create a Nostr identity.');
    if (username) {
      const format = validateNip05Username(username);
      if (!format.valid) throw new Error(format.message.replace(/^✗\s*/, ''));
    }
    return pubkey;
  }

  function updateComposerIdentityState() {
    const loginButton = document.getElementById('composer-login');
    if (!loginButton || !window.NostrIdentity) return;
    const pubkey = window.NostrIdentity.getPublicKey?.();
    const mode = window.NostrIdentity.getMode?.();
    if (pubkey) {
      loginButton.textContent = mode === 'anonymous' ? 'Anonymous identity loaded' : 'nsec loaded';
      setComposerFeedback(`Identity ready: ${pubkey.slice(0, 8)}...`, 'success');
      return;
    }
    loginButton.textContent = 'Login with nsec';
  }

  async function promptForComposerLogin() {
    if (window.NostrIdentity?.showNsecLogin) return window.NostrIdentity.showNsecLogin();
    return window.NostrIdentity?.showIdentityPrompt?.();
  }

  async function ensureNip05(pubkey, requestedUsername) {
    const existing = await lookupNip05(pubkey);
    if (existing?.nip05) return existing.nip05;
    const username = requestedUsername || `anmore-${pubkey.slice(0, 8)}`;
    const check = await checkNip05Availability(username);
    if (!check.available) throw new Error(check.reason || 'That username is not available.');
    await claimNip05(pubkey, username);
    return `${username}@trailscoffee.com`;
  }

  async function lookupNip05(pubkey) {
    try {
      const response = await fetch(`https://api.trailscoffee.com/api/v1/nip05/lookup?pubkey=${encodeURIComponent(pubkey)}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }

  async function claimNip05(pubkey, username) {
    setComposerFeedback(`Claiming ${username}@trailscoffee.com...`, 'checking');
    const challengeResponse = await fetch('https://api.trailscoffee.com/api/v1/nip05/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'claim', pubkey, username }),
      signal: AbortSignal.timeout(8000)
    });
    if (!challengeResponse.ok) throw new Error('Could not start identity claim.');
    const challenge = await challengeResponse.json();
    const proof = await window.NostrIdentity.signEvent({
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      pubkey,
      tags: [['action', 'claim'], ['challenge', challenge.challengeId], ['domain', 'trailscoffee.com'], ['name', username]],
      content: challenge.challenge
    });
    const claimResponse = await fetch('https://api.trailscoffee.com/api/v1/nip05/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: challenge.challengeId, username, proof }),
      signal: AbortSignal.timeout(8000)
    });
    if (!claimResponse.ok) {
      const body = await claimResponse.json().catch(() => ({}));
      throw new Error(body.error || 'Could not claim community identity.');
    }
  }

  async function publishProfile(pubkey, nip05, name) {
    const username = nip05.split('@')[0];
    const signed = await window.NostrIdentity.signEvent({
      kind: KINDS.profile,
      created_at: Math.floor(Date.now() / 1000),
      pubkey,
      tags: [],
      content: JSON.stringify({ name: username, display_name: name || username, about: 'Anmore Social community member', picture: 'https://anmore.social/TEXT-BROWN.png', nip05 })
    });
    try { await publishToRelays(signed); } catch {}
  }

  async function createSignedCalendarEvent(data) {
    const tags = [
      ['d', `event-${Date.now()}`],
      ['client', 'anmore.social'],
      ['t', 'calendar'],
      ['title', data.title.trim()],
      ['summary', data.description.trim()],
      ['start', String(data.start)],
      ['end', String(data.end)]
    ];
    if (data.location?.trim()) tags.push(['location', data.location.trim()]);
    if (data.author?.trim()) tags.push(['author', data.author.trim()]);
    return window.NostrIdentity.signEvent({
      kind: KINDS.timeEvent,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: data.pubkey,
      tags,
      content: JSON.stringify({ title: data.title.trim(), description: data.description.trim(), start: data.start, end: data.end, location: data.location?.trim() || '', author: data.author?.trim() || '' })
    });
  }

  function publishToRelays(event) {
    return new Promise((resolve, reject) => {
      const pending = PUBLISH_RELAYS.map((relay) => publishToRelay(relay, event));
      Promise.allSettled(pending).then((results) => {
        const accepted = results.filter((result) => result.status === 'fulfilled');
        if (accepted.length) resolve(accepted);
        else reject(new Error('No relay accepted the event.'));
      });
    });
  }

  function publishToRelay(relayUrl, event) {
    return new Promise((resolve, reject) => {
      let socket;
      let settled = false;
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        try { socket?.close(); } catch {}
        ok ? resolve(value) : reject(value);
      };
      const timer = setTimeout(() => finish(false, new Error(`Publish timed out on ${relayUrl}`)), 7000);
      try {
        socket = new WebSocket(relayUrl);
        socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
        socket.addEventListener('message', (message) => {
          try {
            const parsed = JSON.parse(String(message.data));
            if (parsed[0] === 'OK' && parsed[1] === event.id) {
              clearTimeout(timer);
              parsed[2] ? finish(true, relayUrl) : finish(false, new Error(parsed[3] || `Relay rejected event on ${relayUrl}`));
            }
          } catch {}
        });
        socket.addEventListener('error', () => { clearTimeout(timer); finish(false, new Error(`Relay unavailable: ${relayUrl}`)); });
      } catch (error) {
        clearTimeout(timer);
        finish(false, error);
      }
    });
  }

  function setComposerFeedback(message, stateName = '') {
    const feedback = document.getElementById('composer-feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `username-feedback ${stateName}`.trim();
  }

  function datetimeLocalValue(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  async function openCreateIdentityGate(type) {
    const route = CREATE_ROUTES[type] || 'https://trailscoffee.com/events.html';
    const label = { event: 'event', post: 'post', fundraiser: 'fundraiser', listing: 'marketplace listing' }[type] || 'content';
    if (window.NostrIdentity?.hasIdentity?.()) return goToCreate(route);
    openModal(`<div class="modal-head"><button class="back-button" data-modal-close>×</button><p class="eyebrow">Create ${escapeHtml(label)}</p><h2>Choose your identity</h2></div><p class="detail-copy">Create a local Nostr identity with a NIP-05 name, or log in with an existing nsec. Your identity is only created when you choose to post.</p><label class="field-label">NIP-05 username</label><input id="identity-username" class="text-input" placeholder="coffeelover123" autocomplete="username" autocapitalize="none" spellcheck="false"><p class="hint">This becomes username@trailscoffee.com if the Trails Coffee API says it is available. Leave blank for an auto-generated name.</p><p id="identity-username-feedback" class="username-feedback" aria-live="polite"></p><div class="modal-actions stacked"><button class="create-button" id="create-local-identity">Create identity and continue</button><button class="secondary-button" id="login-nsec-identity">Login with nsec</button></div>`);
    const input = document.getElementById('identity-username');
    const feedback = document.getElementById('identity-username-feedback');
    const createButton = document.getElementById('create-local-identity');
    let lastCheck = { username: '', available: true };
    let debounce;
    const setFeedback = (message, stateName = '') => { if (!feedback) return; feedback.textContent = message; feedback.className = `username-feedback ${stateName}`.trim(); };
    const runCheck = async () => {
      const username = cleanUsername(input?.value || '');
      if (input && input.value !== username) input.value = username;
      if (!username) { lastCheck = { username: '', available: true }; setFeedback(''); createButton.disabled = false; return lastCheck; }
      const format = validateNip05Username(username);
      if (!format.valid) { lastCheck = { username, available: false }; setFeedback(format.message, 'error'); createButton.disabled = true; return lastCheck; }
      setFeedback('Checking availability…', 'checking');
      createButton.disabled = true;
      try {
        const result = await checkNip05Availability(username);
        lastCheck = { username, available: !!result.available };
        if (result.available) { setFeedback(`✓ ${username}@trailscoffee.com is available`, 'success'); createButton.disabled = false; }
        else { setFeedback(`✗ ${result.reason || 'Username is not available'}${result.suggestion ? ` — try ${result.suggestion}` : ''}`, 'error'); }
      } catch {
        const fallback = await checkNip05AvailabilityViaWellKnown(username);
        lastCheck = { username, available: fallback.available };
        if (fallback.available) { setFeedback(`✓ ${username}@trailscoffee.com looks available`, 'success'); createButton.disabled = false; }
        else { setFeedback(`✗ ${username}@trailscoffee.com is already taken`, 'error'); createButton.disabled = true; }
      }
      return lastCheck;
    };
    input?.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(runCheck, 350); });
    document.getElementById('create-local-identity')?.addEventListener('click', async () => {
      const username = cleanUsername(input?.value || '');
      if (username) {
        const check = lastCheck.username === username ? lastCheck : await runCheck();
        if (!check.available) return;
        localStorage.setItem('trails_proposed_username', username);
      }
      if (window.NostrIdentity?.generateEphemeral) window.NostrIdentity.generateEphemeral();
      goToCreate(route);
    });
    document.getElementById('login-nsec-identity')?.addEventListener('click', async () => { try { await window.NostrIdentity?.showIdentityPrompt?.(); goToCreate(route); } catch {} });
  }
  function cleanUsername(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 20); }
  function validateNip05Username(username) { if (username.length < 3 || username.length > 20) return { valid: false, message: '✗ Must be 3–20 characters' }; if (!/^[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?$/.test(username)) return { valid: false, message: '✗ Use lowercase letters, numbers, and dashes only' }; return { valid: true, message: '' }; }
  async function checkNip05Availability(username) { const response = await fetch(`https://api.trailscoffee.com/api/v1/nip05/check?name=${encodeURIComponent(username)}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error('NIP-05 check failed'); return response.json(); }
  async function checkNip05AvailabilityViaWellKnown(username) { const response = await fetch(`https://trailscoffee.com/.well-known/nostr.json?name=${encodeURIComponent(username)}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); if (!response.ok) return { available: true }; const json = await response.json(); return { available: !json?.names?.[username] }; }
  function goToCreate(route) { const username = cleanUsername(document.getElementById('identity-username')?.value || ''); const params = new URLSearchParams({ create: '1' }); if (username) params.set('username', username); window.location.href = `${route}?${params.toString()}`; }
})();
