import { Relay } from "./relay.js";
import { sortPosts, resolveCommunity, verifiedTotals } from "./zaps.js";
import { setupZaps } from "./zap-ui.js";
import {
  RELAY,
  identify,
  latestProfile,
  visibleEvents,
  tag,
  address,
  calendarInfo,
  safeURL,
} from "./core.js";
const $ = (id) => document.getElementById(id);
let currentPosts = new Map(),
  currentIdentities = new Map(),
  totals = new Map();
let zapState = {
  authority: null,
  error: "Community zap verification has not completed.",
};
const zapUI = setupZaps({
  getPost: (id) => currentPosts.get(id),
  getState: () => zapState,
  recheck: recheckZap,
});
function renderFeed() {
  $("sort-note").hidden = $("feed-order").value !== "top";
  $("sort-note").textContent = zapState.error
    ? "Zap checks unavailable · showing newest first."
    : `Top zapped among loaded posts only · ${currentPosts.size} posts. Load more to compare earlier updates.`;
  $("feed").replaceChildren(
    ...sortPosts([...currentPosts.values()], totals, $("feed-order").value).map(
      (e) => post(e, currentIdentities.get(e.pubkey)),
    ),
  );
}
async function recheckZap(id) {
  const target = currentPosts.get(id);
  if (!target || busy)
    throw Error("The post is no longer available. Refresh to recheck.");
  const relay = new Relay();
  try {
    await relay.open();
    const profiles = await relay.query([
      { kinds: [0], authors: [target.pubkey], limit: 1 },
    ]);
    const deletions = await relay.query([
      { kinds: [5], authors: [target.pubkey], limit: 500 },
    ]);
    const exact = await relay.query([
      { ids: [id], kinds: [target.kind], limit: 1 },
    ]);
    const profile = latestProfile(profiles, target.pubkey);
    if (
      deletions.length >= 500 ||
      !profile ||
      deletions.some((d) =>
        d.tags.some(
          (t) =>
            (t[0] === "e" && t[1] === profile.id) ||
            (t[0] === "a" &&
              t[1] === `0:${target.pubkey}:` &&
              d.created_at >= profile.created_at),
        ),
      ) ||
      !visibleEvents([...exact, ...deletions]).some((e) => e.id === id) ||
      !(await identify(profile))
    )
      throw Error(
        "The post or its author could not be reverified. No invoice was requested.",
      );
    const authority = await resolveCommunity(relay);
    if (currentPosts.get(id) !== target || busy)
      throw Error(
        "The feed changed during verification. No invoice was requested.",
      );
    return authority;
  } finally {
    relay.close();
  }
}
const el = (name, cls, text) => {
  const n = document.createElement(name);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const link = (text, url) => {
  const a = el("a", "", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
};
const format = (ts, options) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    ...options,
  }).format(new Date(ts * 1000));
let stored = [],
  cursor,
  limit = 12,
  busy = false,
  ended = false;
function richText(text) {
  const p = el("p");
  let last = 0;
  for (const m of text.matchAll(/https:\/\/[^\s<>"\u0000-\u001f]+/g)) {
    p.append(document.createTextNode(text.slice(last, m.index)));
    const raw = m[0].replace(/[.,!;:)]+$/, "");
    const url = safeURL(raw);
    p.append(url ? link(raw, url) : document.createTextNode(raw));
    p.append(document.createTextNode(m[0].slice(raw.length)));
    last = m.index + m[0].length;
  }
  p.append(document.createTextNode(text.slice(last)));
  return p;
}
function provenance(e, identity) {
  const details = el("details", "provenance");
  details.append(el("summary", "", "Source"));
  const dl = el("dl");
  for (const [label, value] of [
    ["Community identity", identity.nip05],
    ["Relay", RELAY],
    [
      "Published",
      format(e.created_at, { dateStyle: "medium", timeStyle: "short" }) +
        " Pacific",
    ],
    ["Event ID", e.id],
    ["Author public key", e.pubkey],
    ["Event kind", String(e.kind)],
    ["Signature", e.sig],
  ]) {
    dl.append(el("dt", "", label), el("dd", "", value));
  }
  details.append(
    dl,
    el(
      "p",
      "",
      "Signature and domain association checked for this snapshot. This is not a guarantee of the post’s accuracy.",
    ),
  );
  return details;
}
function imageURLs(e) {
  const urls = [];
  for (const t of e.tags) {
    if (t[0] === "image") urls.push(t[1]);
    if (t[0] === "imeta")
      for (const v of t.slice(1))
        if (v.startsWith("url ")) urls.push(v.slice(4));
  }
  for (const m of e.content.matchAll(/https:\/\/[^\s<>"\u0000-\u001f]+/g)) {
    const u = safeURL(m[0]);
    if (u && /\.(jpe?g|png|webp|gif|avif)$/i.test(new URL(u).pathname))
      urls.push(u);
  }
  return [...new Set(urls.map(safeURL).filter(Boolean))].slice(0, 4);
}
function post(e, identity) {
  const article = el("article", "post");
  article.dataset.createdAt = e.created_at;
  article.dataset.eventId = e.id;
  const top = el("header", "post-top");
  const avatar = el(
    "span",
    "avatar",
    Array.from(identity.name)[0]?.toUpperCase() || "A",
  );
  avatar.setAttribute("aria-hidden", "true");
  const author = el("div", "author");
  author.append(
    el("strong", "", identity.name),
    el("span", "identity", identity.nip05),
  );
  const time = el(
    "time",
    "post-time",
    format(e.created_at, { month: "short", day: "numeric" }),
  );
  time.dateTime = new Date(e.created_at * 1000).toISOString();
  time.title =
    format(e.created_at, { dateStyle: "full", timeStyle: "short" }) +
    " Pacific";
  top.append(avatar, author, time);
  article.append(top);
  const images = imageURLs(e);
  let text = e.content;
  // Only remove standalone image URL lines; prose and source links remain intact.
  for (const url of images)
    text = text
      .split("\n")
      .filter((line) => line.trim() !== url)
      .join("\n");
  text = text.trim();
  const body = el("div", "post-body");
  if (text.length > 700) {
    body.append(richText(text.slice(0, 650)));
    const more = el("details");
    more.append(
      el("summary", "", "Read the full update"),
      richText(text.slice(650)),
    );
    body.append(more);
  } else if (text) body.append(richText(text));
  article.append(body);
  if (images.length) {
    const media = el("div", "post-media");
    for (const url of images) {
      const img = el("img");
      img.src = url;
      img.alt = tag(e, "alt") || "Photo attached to this community update";
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.addEventListener(
        "error",
        () => {
          const p = el("p", "media-failure", "Photo unavailable. ");
          p.append(link("Open original image (new tab)", url));
          img.replaceWith(p);
        },
        { once: true },
      );
      media.append(img);
    }
    article.append(media);
  }
  const tipping = el("div", "post-zap");
  const confirmed = totals.get(e.id) ?? 0n;
  const amount = el(
    "span",
    "zap-total",
    zapState.error
      ? "—"
      : `${new Intl.NumberFormat("en-CA").format(confirmed / 1000n)} sats`,
  );
  amount.title = zapState.error
    ? "Zap checks unavailable — not proof that no payments exist."
    : "Verified post-bound Lightning receipts in this loaded snapshot; provider-attested payments, not independent settlement proofs.";
  amount.setAttribute(
    "aria-label",
    zapState.error
      ? "Zap total unavailable"
      : `${amount.textContent} verified to community`,
  );
  const zap = el("button", "zap-button");
  zap.type = "button";
  zap.setAttribute("aria-label", "Zap this post");
  zap.title = "Zap this post · Tips support community";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(icon.namespaceURI, "path");
  path.setAttribute("d", "m13 2-9 12h7l-1 8 10-13h-7l0-7Z");
  icon.append(path);
  zap.append(icon);
  zap.addEventListener("click", () => zapUI.open(e.id, zap));
  tipping.append(zap, amount, provenance(e, identity));
  article.append(tipping);
  return article;
}
function eventCard(e, identity, info) {
  const item = el("article", "event"),
    date = el("div", "event-date"),
    day = new Date(info.date + "T12:00:00Z");
  date.append(
    el("b", "", String(day.getUTCDate())),
    el(
      "span",
      "",
      new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
        day,
      ),
    ),
  );
  const content = el("div");
  content.append(
    el("h3", "", info.title),
    el(
      "p",
      "",
      info.allDay
        ? "All day"
        : format(info.sort, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          }),
    ),
    el("p", "", info.location),
  );
  const details = el("details");
  details.append(
    el("summary", "", "Event details"),
    richText(e.content),
    el("p", "", identity.nip05),
    provenance(e, identity),
  );
  item.append(date, content, details);
  return item;
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
async function batches(items, size, fn) {
  const result = [];
  for (let i = 0; i < items.length; i += size)
    result.push(...(await fn(items.slice(i, i + size))));
  return result;
}
async function load(reset = false) {
  if (busy) return;
  busy = true;
  zapUI.invalidate();
  currentPosts = new Map();
  currentIdentities = new Map();
  totals = new Map();
  zapState = { authority: null, error: "Zap checks unavailable." };
  $("refresh").disabled = true;
  $("feed-order").disabled = true;
  $("load-more").disabled = true;
  $("feed").setAttribute("aria-busy", "true");
  status(
    reset
      ? "Checking the latest stories and community identities…"
      : "Checking earlier updates and refreshing identity associations…",
  );
  const relay = new Relay();
  try {
    if (!navigator.onLine)
      throw Error(
        "You’re offline. Community updates need an internet connection.",
      );
    await relay.open();
    const until = reset
      ? Math.floor(Date.now() / 1000)
      : (cursor ?? Math.floor(Date.now() / 1000));
    const requested = reset ? 12 : limit;
    const page = await relay.query([
      { kinds: [1, 20], until, limit: requested },
    ]);
    const calendar = reset
      ? await relay.query([
          {
            kinds: [31922, 31923],
            until: Math.floor(Date.now() / 1000),
            limit: 60,
          },
        ])
      : [];
    let candidates = [...(reset ? [] : stored), ...page, ...calendar];
    if (candidates.length > 1200)
      throw Error(
        "This reading session has reached its safety limit. Refresh to start again.",
      );
    // Refresh each address against its newest known revision before showing a calendar entry.
    const coordinates = [
      ...new Map(
        candidates.filter((e) => e.kind >= 30000).map((e) => [address(e), e]),
      ).values(),
    ];
    const revisions = await batches(coordinates, 20, (chunk) =>
      relay.query(
        chunk.map((e) => ({
          authors: [e.pubkey],
          kinds: [e.kind],
          "#d": [tag(e, "d") ?? ""],
          limit: 1,
        })),
      ),
    );
    candidates.push(...revisions);
    const authors = [
      ...new Set(candidates.filter((e) => e.kind !== 5).map((e) => e.pubkey)),
    ];
    const profiles = await batches(authors, 20, (chunk) =>
      relay.query(
        chunk.map((pubkey) => ({ kinds: [0], authors: [pubkey], limit: 1 })),
      ),
    );
    const deletions = await batches(authors, 20, async (chunk) => {
      const d = await relay.query([{ kinds: [5], authors: chunk, limit: 500 }]);
      if (d.length >= 500)
        throw Error(
          "Deletion history is too large to verify safely. Please retry later.",
        );
      return d;
    });
    candidates = [
      ...new Map([...candidates, ...deletions].map((e) => [e.id, e])).values(),
    ];
    let unavailable = 0;
    const identities = new Map();
    // Bounded HTTPS concurrency. No persistent identity cache or hardcoded names.
    await batches(authors, 4, async (chunk) => {
      await Promise.all(
        chunk.map(async (pubkey) => {
          const profile = latestProfile(profiles, pubkey);
          if (
            !profile ||
            deletions.some(
              (d) =>
                d.pubkey === pubkey &&
                d.tags.some(
                  (t) =>
                    (t[0] === "e" && t[1] === profile.id) ||
                    (t[0] === "a" &&
                      t[1] === `0:${pubkey}:` &&
                      d.created_at >= profile.created_at),
                ),
            )
          )
            return;
          try {
            const identity = await identify(profile);
            if (identity) identities.set(pubkey, identity);
          } catch {
            unavailable++;
          }
        }),
      );
      return [];
    });
    const visible = visibleEvents(candidates).filter((e) =>
      identities.has(e.pubkey),
    );
    const feed = visible.filter((e) => [1, 20].includes(e.kind));
    try {
      const authority = await resolveCommunity(relay),
        receipts = [];
      for (let i = 0; i < feed.length; i += 20) {
        const page = await relay.query([
          {
            kinds: [9735],
            authors: [authority.issuer],
            "#p": [authority.recipient],
            "#e": feed.slice(i, i + 20).map((e) => e.id),
            limit: 500,
          },
        ]);
        if (page.length >= 500 || receipts.length + page.length > 1000)
          throw Error(
            "Receipt history exceeds this reading session’s safety limit.",
          );
        receipts.push(...page);
      }
      totals = verifiedTotals(receipts, feed, authority);
      zapState = { authority, error: null };
    } catch (error) {
      zapState = {
        authority: null,
        error: error.message || "Community zap verification is unavailable.",
      };
    }
    currentPosts = new Map(feed.map((e) => [e.id, e]));
    currentIdentities = identities;
    renderFeed();
    $("empty").hidden = feed.length > 0;
    const events = visible
      .filter((e) => e.kind >= 30000)
      .map((e) => ({ e, info: calendarInfo(e) }))
      .filter((x) => x.info)
      .sort((a, b) => a.info.sort - b.info.sort || a.e.id.localeCompare(b.e.id))
      .slice(0, 4);
    $("events").replaceChildren(
      ...(events.length
        ? events.map(({ e, info }) =>
            eventCard(e, identities.get(e.pubkey), info),
          )
        : [
            el(
              "p",
              "small muted",
              "No upcoming events in the latest verified calendar updates. Check back soon.",
            ),
          ]),
    );
    stored = candidates;
    const oldest = page.length
      ? Math.min(...page.map((e) => e.created_at))
      : until;
    // Inclusive cursor preserves timestamp ties; grow the boundary window rather than skip a second.
    limit =
      oldest === until
        ? requested + 12
        : page.filter((e) => e.created_at === oldest).length + 12;
    cursor = oldest;
    ended = page.length < requested;
    if (limit > 600) {
      ended = true;
      status(
        "Many updates share one timestamp. The reading limit was reached; no older timestamps were skipped.",
        true,
      );
    } else
      status(
        unavailable
          ? `Some author identities could not be checked (${unavailable}). Their posts are hidden. Refresh to retry.`
          : `Updated ${format(Math.floor(Date.now() / 1000), { hour: "numeric", minute: "2-digit" })} PT · identities checked.`,
        unavailable > 0,
      );
    $("connection").textContent = "Connected";
    $("connection").dataset.state = "ready";
    $("page-note").textContent = ended
      ? "You’ve reached the end of this relay page. Refresh for new updates."
      : "No endless scroll. Take your time.";
  } catch (error) {
    zapUI.invalidate();
    currentPosts = new Map();
    currentIdentities = new Map();
    totals = new Map();
    zapState = {
      authority: null,
      error: "Feed checks unavailable. No invoice can be created.",
    };
    // Fail closed rather than retaining a stale identity/deletion assertion after a failed refresh.
    renderFeed();
    $("empty").hidden = true;
    $("events").replaceChildren(
      el(
        "p",
        "small muted",
        "Events could not be verified. Please refresh to retry.",
      ),
    );
    status(
      error.message || "Community updates could not be verified. Please retry.",
      true,
    );
    $("connection").textContent = navigator.onLine
      ? "Relay check unavailable"
      : "Offline";
    $("connection").dataset.state = "error";
    ended = false;
  } finally {
    relay.close();
    busy = false;
    $("refresh").disabled = false;
    $("feed-order").disabled = false;
    $("load-more").disabled = ended;
    $("feed").setAttribute("aria-busy", "false");
  }
}
$("refresh").addEventListener("click", () => load(true));
$("feed-order").addEventListener("change", renderFeed);
$("load-more").addEventListener("click", () => load(false));
window.addEventListener("offline", () => {
  status(
    "You’re offline. These are the last checked updates, not a live feed. Refresh when you’re back online.",
    true,
  );
  $("connection").textContent = "Offline · last snapshot";
  $("connection").dataset.state = "error";
});
// Retire the former app-shell cache without creating a new offline content store.
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const r of registrations)
        if (r.active?.scriptURL === new URL("./sw.js", location.href).href)
          r.update().catch(() => {});
    })
    .catch(() => {});
load(true);
