(() => {
  'use strict';

  const RELAYS = ['wss://nostr-cache.trailscoffee.com', 'wss://relay.anmore.me', 'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
  const APPROVED_URL = 'https://nostr-cache.trailscoffee.com/approved';
  const APPROVED_DOMAINS = new Set(['anmore.me', 'trailscoffee.com', 'anmore.cash']);
  const KINDS = { profile: 0, post: 1, dateEvent: 31922, timeEvent: 31923, fundraiser: 9041, listing: 30402 };
  const CREATE_ROUTES = { event: 'https://trailscoffee.com/events.html', post: 'https://trailscoffee.com/feed.html', fundraiser: 'https://trailscoffee.com/fundraiser.html', listing: 'https://trailscoffee.com/marketplace.html' };
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
    be82529a6c42986ab8e20bd6c47fc69e14fa1e04f4ac0f74aeac42bd5840c1e8: { displayName: 'Charlene', nip05: 'charlene@trailscoffee.com' }
  };

  const state = { calendar: null, relay: null, approved: new Set(Object.keys(KNOWN)), profiles: {}, posts: new Map(), events: new Map(), fundraisers: new Map(), listings: new Map(), selectedDate: null };
  const $ = (id) => document.getElementById(id);
  const els = { pulse: $('connection-pulse'), label: $('connection-label'), detail: $('connection-detail'), stats: { events: $('stat-events'), posts: $('stat-posts'), fundraisers: $('stat-fundraisers'), listings: $('stat-listings') }, feed: $('feed-list'), events: $('events-list'), fundraisers: $('fundraiser-list'), listings: $('marketplace-list'), dayTitle: $('selected-day-title'), dayEvents: $('selected-day-events') };

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('click', (event) => {
    const tabButton = event.target.closest?.('[data-tab]');
    if (tabButton) return activateTab(tabButton.dataset.tab);
    const createButton = event.target.closest?.('[data-create]');
    if (createButton) return openCreateIdentityGate(createButton.dataset.create);
    const socialCard = event.target.closest?.('[data-card-kind][data-card-id]');
    if (socialCard) return openItemDetails(socialCard.dataset.cardKind, socialCard.dataset.cardId);
  });

  async function init() {
    initCalendar();
    setSelectedDate(new Date());
    try {
      setConnection('', 'Connecting to Nostr…', 'Checking Trails cache and live relays.');
      await loadApproved();
      const events = dedupe(await fetchSocialEvents());
      const pubkeys = Array.from(new Set(events.map((event) => event.pubkey)));
      state.profiles = await fetchProfiles(pubkeys);
      ingestAll(events);
      renderAll();
      if (events.length) setConnection('connected', 'Anmore Social is live', `${events.length} relay events loaded from ${state.relay}.`);
      else setConnection('error', 'No local events found', 'Connected, but no approved Anmore/Trails events matched yet.');
    } catch (error) {
      console.error(error);
      renderAll();
      setConnection('error', 'Relay data unavailable', 'Could not read the cache or fallback relays right now.');
    }
  }

  function setConnection(status, label, detail) {
    els.pulse.className = `pulse ${status === 'connected' ? 'connected' : status === 'error' ? 'error' : ''}`;
    els.label.textContent = label;
    els.detail.textContent = detail;
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
      { kinds: [KINDS.dateEvent, KINDS.timeEvent], authors, limit: 60 },
      { kinds: [KINDS.fundraiser], authors, limit: 30 },
      { kinds: [KINDS.listing], authors, limit: 40 }
    ];
    for (const relay of RELAYS) {
      const events = await fetchRelayEvents(relay, filters, 5200);
      if (events.length) { state.relay = relay; return events; }
    }
    return [];
  }

  async function fetchProfiles(pubkeys) {
    const profiles = {};
    const unknown = pubkeys.filter((p) => !KNOWN[p]);
    if (!unknown.length) return profiles;
    for (const relay of [state.relay, ...RELAYS].filter(Boolean)) {
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
    const rawStart = tags.start || tags.starts || tags.date || str(json?.start) || str(json?.date);
    const start = parseEventStart(rawStart, event.kind === KINDS.dateEvent);
    if (!start) return null;
    const rawEnd = tags.end || tags.ends || str(json?.end);
    const end = parseEventStart(rawEnd, event.kind === KINDS.dateEvent) || start + (event.kind === KINDS.dateEvent ? 86400 : 3600);
    return { id: event.id, pubkey: event.pubkey, title: tags.title || tags.name || str(json?.title) || str(json?.name) || firstLine(event.content) || 'Community event', description: tags.summary || tags.description || str(json?.description) || str(json?.content) || (json ? '' : event.content), location: tags.location || str(json?.location) || '', start, end, created_at: event.created_at };
  }
  function parseFundraiser(event) { const tags = tagMap(event.tags); const json = safeJson(event.content); const title = tags.title || tags.name || str(json?.name) || str(json?.title) || firstLine(event.content); if (!title) return null; const media = mediaUrls(event); const description = tags.summary || tags.description || str(json?.description) || str(json?.about) || str(json?.content) || (json ? '' : event.content); return { id: event.id, pubkey: event.pubkey, title, description: stripMedia(description, media), media, goal: str(json?.goal) || tags.goal || '', created_at: event.created_at }; }
  function parseListing(event) { const tags = tagMap(event.tags); const json = safeJson(event.content); const title = tags.title || tags.name || str(json?.title) || firstLine(event.content); if (!title) return null; const media = mediaUrls(event); const description = tags.summary || tags.description || str(json?.summary) || str(json?.description) || (json ? '' : event.content); return { id: event.id, pubkey: event.pubkey, title, description: stripMedia(description, media), media, price: tags.price || str(json?.price) || '', location: tags.location || str(json?.location) || '', created_at: event.created_at }; }

  function dedupe(events) { const byKey = new Map(); for (const event of events.sort((a, b) => b.created_at - a.created_at)) { const dTag = tagValue(event, 'd') || event.id; const key = PARAMETERIZED_KINDS.has(event.kind) ? `${event.kind}:${event.pubkey}:${dTag}` : event.id; if (!byKey.has(key)) byKey.set(key, event); } return Array.from(byKey.values()).sort((a, b) => b.created_at - a.created_at); }
  function tagMap(tags = []) { const map = {}; for (const tag of tags) if (tag?.[0] && tag?.[1] && !map[tag[0]]) map[tag[0]] = tag[1]; return map; }
  function tagValue(event, name) { return event.tags?.find((tag) => tag[0] === name && tag[1])?.[1]; }
  function tagValues(event, name) { return (event.tags || []).filter((tag) => tag[0] === name && tag[1]).map((tag) => tag[1]); }
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
    renderCards(els.events, events, renderEventCard, 'No upcoming approved events yet.');
    renderCards(els.fundraisers, fundraisers, renderFundraiserCard, 'No active approved fundraisers yet.');
    renderCards(els.listings, listings, renderListingCard, 'No approved marketplace listings yet.');
    updateCalendar(); renderSelectedDay();
  }
  function renderCards(container, items, renderer, emptyText) { container.classList.remove('loading-list'); container.innerHTML = items.length ? items.map(renderer).join('') : `<p class="empty">${escapeHtml(emptyText)}</p>`; }
  function renderPostCard(post) { return `<article class="item-card clickable-card" data-card-kind="post" data-card-id="${escapeHtml(post.id)}"><h3>${escapeHtml(profileName(post.pubkey))}</h3>${mediaMarkup(post.media)}<p>${escapeHtml(truncate(post.content, 210))}</p><div class="meta"><span class="badge">${fmtDate(post.created_at)}</span><span class="badge">verified local</span><span class="badge">details →</span></div></article>`; }
  function renderEventCard(event) { return `<article class="item-card event-card clickable-card" data-card-kind="event" data-card-id="${escapeHtml(event.id)}"><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(truncate(event.description || 'Tap for details', 170))}</p><div class="meta"><span class="badge">${fmtDate(event.start)}</span>${event.location ? `<span class="badge">${escapeHtml(event.location)}</span>` : ''}<span class="badge">details →</span></div></article>`; }
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

  function initCalendar() { const el = $('calendar-grid'); if (!el || !window.FullCalendar) return; state.calendar = new FullCalendar.Calendar(el, { initialView: 'dayGridMonth', height: 'auto', fixedWeekCount: false, headerToolbar: { left: 'prev,next today', center: 'title', right: '' }, eventClick(info) { info.jsEvent.preventDefault(); openEventDetails(info.event.id); }, dateClick(info) { openDayView(info.date); } }); state.calendar.render(); }
  function updateCalendar() { if (!state.calendar) return; state.calendar.removeAllEvents(); state.calendar.addEventSource(Array.from(state.events.values()).map((event) => ({ id: event.id, title: event.title, start: new Date(event.start * 1000), end: new Date(event.end * 1000), allDay: isAllDay(event), backgroundColor: '#173f35', borderColor: '#173f35', textColor: '#fff' }))); }
  function isAllDay(event) { const start = new Date(event.start * 1000); const end = new Date(event.end * 1000); return start.getHours() === 0 && start.getMinutes() === 0 && end.getHours() === 0 && end.getMinutes() === 0; }
  function setSelectedDate(date) { state.selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()); renderSelectedDay(); }
  function eventsForDay(date) { const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).toDateString(); return Array.from(state.events.values()).filter((event) => new Date(event.start * 1000).toDateString() === day).sort((a, b) => a.start - b.start); }
  function renderSelectedDay() { if (!els.dayEvents || !state.selectedDate) return; const events = eventsForDay(state.selectedDate); els.dayTitle.textContent = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(state.selectedDate); if (!events.length) { const upcoming = Array.from(state.events.values()).filter((e) => e.start * 1000 >= Date.now()).sort((a, b) => a.start - b.start).slice(0, 3); els.dayEvents.innerHTML = upcoming.length ? upcoming.map(renderEventCard).join('') : '<p class="empty">No events on this day yet.</p>'; if (upcoming.length) els.dayTitle.textContent = 'Upcoming events'; return; } els.dayEvents.innerHTML = events.map(renderEventCard).join(''); }

  function openDayView(date) { setSelectedDate(date); const events = eventsForDay(date); const title = new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }).format(date); openModal(`<div class="modal-head"><button class="back-button" data-modal-close>×</button><p class="eyebrow">Day view</p><h2>${escapeHtml(title)}</h2></div><div class="modal-list">${events.length ? events.map(renderEventCard).join('') : '<p class="empty">No events on this day yet.</p><button class="create-button" data-create="event">+ Create event</button>'}</div>`); }
  function openItemDetails(kind, id) { if (kind === 'event') return openEventDetails(id); const collections = { post: state.posts, fundraiser: state.fundraisers, listing: state.listings }; const item = collections[kind]?.get(id); if (!item) return; const title = kind === 'post' ? profileName(item.pubkey) : item.title; const copy = kind === 'post' ? item.content : item.description; const meta = kind === 'post' ? `<div><strong>Posted</strong><span>${escapeHtml(fmtDate(item.created_at))}</span></div><div><strong>Author</strong><span>${escapeHtml(profileName(item.pubkey))}</span></div>` : `<div><strong>Author</strong><span>${escapeHtml(profileName(item.pubkey))}</span></div>${item.goal ? `<div><strong>Goal</strong><span>${escapeHtml(item.goal)}</span></div>` : ''}${item.price ? `<div><strong>Price</strong><span>${escapeHtml(item.price)}</span></div>` : ''}${item.location ? `<div><strong>Location</strong><span>${escapeHtml(item.location)}</span></div>` : ''}`; openModal(`<div class="modal-head"><button class="back-button" data-modal-close>×</button><p class="eyebrow">${escapeHtml(kind)} details</p><h2>${escapeHtml(title || 'Details')}</h2></div>${mediaMarkup(item.media)}<div class="detail-grid">${meta}</div><p class="detail-copy">${escapeHtml(copy || 'No description provided.')}</p>`); }
  function openEventDetails(eventId) { const event = state.events.get(eventId); if (!event) return; openModal(`<div class="modal-head"><button class="back-button" data-modal-close>×</button><p class="eyebrow">Event details</p><h2>${escapeHtml(event.title)}</h2></div>${event.image ? `<img class="event-image" src="${escapeHtml(event.image)}" alt="">` : ''}<div class="detail-grid"><div><strong>When</strong><span>${escapeHtml(fmtDate(event.start))}</span></div>${event.location ? `<div><strong>Where</strong><span>${escapeHtml(event.location)}</span></div>` : ''}<div><strong>Host</strong><span>${escapeHtml(profileName(event.pubkey))}</span></div></div><p class="detail-copy">${escapeHtml(event.description || 'No description provided.')}</p><div class="modal-actions"><button class="create-button" data-create="event">Create another event</button></div>`); }
  function openModal(html) { document.querySelector('.modal-overlay')?.remove(); const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.innerHTML = `<div class="modal-card">${html}</div>`; overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-modal-close]')) overlay.remove(); }); document.body.appendChild(overlay); }

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
        lastCheck = { username, available: false };
        setFeedback('Could not validate with Trails Coffee API. Try again in a moment.', 'error');
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
  function cleanUsername(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20); }
  function validateNip05Username(username) { if (username.length < 3 || username.length > 20) return { valid: false, message: '✗ Must be 3–20 characters' }; if (!/^[a-z0-9_]+$/.test(username)) return { valid: false, message: '✗ Use lowercase letters, numbers, and underscores only' }; return { valid: true, message: '' }; }
  async function checkNip05Availability(username) { const response = await fetch(`https://api.trailscoffee.com/api/v1/nip05/check?name=${encodeURIComponent(username)}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) }); if (!response.ok) throw new Error('NIP-05 check failed'); return response.json(); }
  function goToCreate(route) { window.location.href = `${route}?create=1`; }
})();
