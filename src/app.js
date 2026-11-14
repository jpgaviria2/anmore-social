import { FeedStore } from "./feed-store.js";
import { FeedSync } from "./feed-sync.js";
import { setupInstall, setupWorker } from "./pwa.js";
setupInstall();
import { parsePost, bodyURLs } from "./media.js";
import { mediaGrid, reconcileGallery } from "./gallery.js";
import { Relay } from "./relay.js";
import { sortPosts, resolveCommunity } from "./zaps.js";
import { collectReceipts } from "./receipts.js";
import { setupZaps } from "./zap-ui.js";
import {
  RELAY,
  identify,
  latestProfile,
  visibleEvents,
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
let feedOrder = "newest", zapPeriod = "all", feedProjectionKey;
const periodLabels = { week: "This week · since Monday 00:00", month: "This month · since the 1st 00:00", all: "All time" };
function renderFeed() {
  $("zap-periods").hidden = feedOrder !== "top";
  for (const period of ["week", "month", "all"]) {
    $("period-" + period).setAttribute("aria-pressed", String(zapPeriod === period));
    $("period-" + period).disabled = busy;
  }
  totals = feedStore.receiptTotals(feedOrder === "top" ? zapPeriod : "all");
  $("order-newest").setAttribute(
    "aria-pressed",
    String(feedOrder === "newest"),
  );
  $("order-top").setAttribute("aria-pressed", String(feedOrder === "top"));
  $("sort-note").hidden = feedOrder !== "top";
  $("sort-note").textContent = busy
    ? "Checking earlier updates…"
    : zapState.error && !feedStore.state.receipts.length
      ? "Zap checks unavailable · showing newest first."
      : `Top zapped among loaded posts · ${currentPosts.size} posts. ${periodLabels[zapPeriod]}${zapPeriod === "all" ? "" : " America/Vancouver"} · verified receipts received in this period. ${zapState.snapshot?.partial ? "Partial receipt check · totals/order may change as receipts become available. " : ""}${ended ? "Refresh to recheck." : "Load more to widen coverage."}`;
  const ordered = sortPosts([...currentPosts.values()], totals, feedOrder);
  // Busy/throttle/status-only changes must not reset details, focus or video.
  // Signed event IDs identify immutable content; identities and receipt labels
  // can change independently, so include their actual projected values too.
  const projectionKey = JSON.stringify([
    ordered.map(e => [e.id, currentIdentities.get(e.pubkey), String(totals.get(e.id) ?? 0n)]),
    !!(zapState.error && !feedStore.state.receipts.length),
    !!zapState.snapshot?.partial, zapState.snapshot?.sources,
  ]);
  if (projectionKey !== feedProjectionKey) {
    const feed=$("feed");
    const existing=new Map([...feed.children].map(card=>[card.dataset.eventId,card]));
    let cursor=feed.firstElementChild;
    for(const e of ordered){
      const identity=currentIdentities.get(e.pubkey);
      const card=existing.get(e.id)||post(e,identity);
      existing.delete(e.id);
      if(card!==cursor){
        const focused=card.contains(document.activeElement)?document.activeElement:null;
        feed.insertBefore(card,cursor);
        if(focused?.isConnected && document.activeElement!==focused)focused.focus({preventScroll:true});
      }
      cursor=card.nextElementSibling;
      card.querySelector(".author strong").textContent=identity.name;
      card.querySelector(".avatar").textContent=Array.from(identity.name)[0]?.toUpperCase()||"A";
      card.querySelector(".identity").textContent=identity.nip05;
      card.querySelector(".provenance dd").textContent=identity.nip05;
      const amount=updateZapTotal(e,card.querySelector(".zap-total"));
      card.querySelector(".receipt-warning").textContent=amount.title;
    }
    for(const card of existing.values()){card._captionObserver?.disconnect();card.remove();}
    reconcileGallery();
    feedProjectionKey = projectionKey;
  }
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
let busy = false, ended = false;
function richText(text) {
  const p = el("p");
  let last = 0;
  for (const {raw,index} of bodyURLs(text)) {
    p.append(document.createTextNode(text.slice(last,index)));
    p.append(safeURL(raw) ? link(raw, raw) : document.createTextNode(raw));
    last=index+raw.length;
  }
  p.append(document.createTextNode(text.slice(last)));
  return p;
}
function provenance(e, identity) {
  const details = el("details", "provenance");
  details.append(el("summary", "", "Details"));
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
function updateZapTotal(e, amount) {
  const confirmed = totals.get(e.id) ?? 0n;
  const unavailable = zapState.error && !feedStore.state.receipts.length;
  amount.textContent = unavailable || (zapState.snapshot?.partial && confirmed === 0n)
      ? "—"
      : `${new Intl.NumberFormat("en-CA").format(confirmed / 1000n)} sats${zapState.snapshot?.partial ? " · provisional" : ""}`;
  amount.title = unavailable
    ? "Zap checks unavailable — not proof that no payments exist."
    : `${zapState.snapshot?.partial ? "Partial receipt check · totals/order may change as receipts become available. Missing receipts are not zero payments. " : ""}Verified community receipts · ${zapState.snapshot?.sources.join(" + ")}. Provider-attested payments, not independent settlement proofs.`;
  amount.setAttribute(
    "aria-label",
    unavailable || (zapState.snapshot?.partial && confirmed === 0n)
      ? "Zap total unavailable"
      : `${amount.textContent} ${zapState.snapshot?.partial ? "partial receipt check; totals/order may change" : "verified to community"}`,
  );
  return amount;
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
  const parsed = parsePost(e);
  const media = mediaGrid(parsed.attachments);
  if (media) article.append(media);
  const body = el("div", "post-body");
  if (parsed.title) body.append(el("h3", "post-title", parsed.title));
  if (parsed.text) {
    const caption=richText(parsed.text);
    caption.className="post-caption";caption.id="caption-"+e.id;
    const more=el("button","caption-toggle","Read more");more.type="button";
    more.setAttribute("aria-controls",caption.id);more.setAttribute("aria-expanded","false");
    const expand = expanded => {
      more.setAttribute("aria-expanded",String(expanded));
      more.textContent=expanded?"Read less":"Read more";
      caption.classList.toggle("expanded",expanded);
    };
    more.addEventListener("click",()=>expand(more.getAttribute("aria-expanded")!=="true"));
    caption.addEventListener("focusin",()=>expand(true));
    body.append(caption,more);
    // Measure after attachment and on resizing, without slicing author text.
    if(typeof ResizeObserver!=="undefined"){
      const measure=new ResizeObserver(()=>{if(more.getAttribute("aria-expanded")==="false")more.hidden=caption.scrollHeight<=caption.clientHeight+1;});
      measure.observe(caption);
      article._captionObserver=measure;
    }
  }
  article.append(body);
  const tipping = el("div", "post-zap");
  const amount = updateZapTotal(e, el("span", "zap-total"));
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
  zap.append(icon, document.createTextNode("Zap"));
  zap.addEventListener("click", () => zapUI.open(e.id, zap));
  const details=provenance(e, identity);
  details.append(el("p","receipt-warning",amount.title));
  tipping.append(zap, amount, details);
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
const feedStore = new FeedStore();
const feedSync = new FeedSync(feedStore);
let lastAttempt = 0, retryAfter = 0, failures = 0;
function projectSaved() {
  const visible = feedStore.events();
  currentPosts = new Map(visible.filter(e => [1,20].includes(e.kind)).map(e=>[e.id,e]));
  currentIdentities = feedStore.identities();
  renderFeed();
  $("empty").hidden = currentPosts.size > 0;
  const events = visible.filter(e=>e.kind>=30000).map(e=>({e,info:calendarInfo(e)}))
    .filter(x=>x.info).sort((a,b)=>a.info.sort-b.info.sort||a.e.id.localeCompare(b.e.id)).slice(0,4);
  $("events").replaceChildren(...(events.length ? events.map(({e,info})=>eventCard(e,currentIdentities.get(e.pubkey),info)) : [el("p","small muted","No upcoming events in the loaded verified calendar history.")]));
}
function checkedLabel() {
  return feedStore.state.lastChecked
    ? `Last checked ${format(feedStore.state.lastChecked,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} PT`
    : "No completed relay check yet";
}
async function load(reset = false, automatic = false) {
  if (busy || (automatic && ($("zap-dialog").open || document.visibilityState !== "visible" || !navigator.onLine || Date.now() < retryAfter || Date.now()-lastAttempt < 15000))) return;
  busy = true; lastAttempt = Date.now();
  zapUI.invalidate();
  for (const id of ["refresh","order-newest","order-top","load-more"]) $(id).disabled=true;
  $("feed").setAttribute("aria-busy","true");
  renderFeed();
  status(`${checkedLabel()} · checking relay; retained history remains visible.`);
  try {
    if(feedStore.blocked){await feedStore.recover();projectSaved();}
    if (!navigator.onLine) throw Error("You’re offline");
    const result = await feedSync.run({older:!reset,top:feedOrder==="top"});
    projectSaved();
    // Cached history never supplies fresh payment authority. The invoice flow
    // still performs its own exact post/profile/deletion/HTTPS recheck.
    const relay = new Relay(),receiptEpoch=feedSync.epoch;
    try {
      await relay.open();
      const authority=await resolveCommunity(relay);
      const targets=feedSync.receiptTargets([...currentPosts.values()]);
      const snapshot=await collectReceipts(targets.posts,authority,relay);
      snapshot.nextTargetOffset=targets.nextTargetOffset;
      snapshot.partial ||= targets.partial;
      await feedSync.commitReceipts(snapshot,authority,relay,receiptEpoch);
      zapState={authority,error:null,snapshot};totals=feedStore.receiptTotals();
    } catch(error) {
      zapState={authority:null,error:error.message||"Community zap verification unavailable.",snapshot:zapState.snapshot?{...zapState.snapshot,partial:true}:undefined};
    } finally { relay.close(); }
    failures=0;retryAfter=Date.now()+60000;
    ended=!!feedStore.state.coverage.olderEnded;
    status(`${checkedLabel()} · ${result.unavailable ? "Some current identity checks unavailable; accepted history retained. " : ""}${!result.completed ? "Bounded sync. " : ""}${feedStore.warning??""}`,!!feedStore.warning||result.unavailable>0);
    $("connection").textContent="Last checked · not live";$("connection").dataset.state="ready";
    $("page-note").textContent="Retained on this browser · Load more widens history; no global coverage guarantee.";
  } catch(error) {
    zapState={authority:null,error:error.message||"Community zap verification unavailable.",snapshot:zapState.snapshot?{...zapState.snapshot,partial:true}:undefined};
    zapUI.invalidate();
    failures++;retryAfter=Date.now()+Math.min(300000,15000*2**Math.min(failures,5));
    status(`${checkedLabel()} · stale retained history. ${error.message}. ${feedStore.warning??""}`,true);
    $("connection").textContent=navigator.onLine?"Relay check unavailable":"Offline · last checked";
    $("connection").dataset.state="error";
  } finally {
    busy=false;
    for (const id of ["refresh","order-newest","order-top"]) $(id).disabled=false;
    projectSaved();$("load-more").disabled=ended;$("feed").setAttribute("aria-busy","false");
  }
}
$("refresh").addEventListener("click", () => load(true));
$("order-newest").addEventListener("click", () => {
  if (busy) return;
  feedOrder = "newest";
  renderFeed();
});
$("order-top").addEventListener("click", () => {
  if (busy || feedOrder === "top") return;
  feedOrder = "top";
  load(false);
});
for (const period of ["week", "month", "all"])
  $("period-" + period).addEventListener("click", () => {
    if (busy || feedOrder !== "top") return;
    zapPeriod = period;
    renderFeed();
  });
$("load-more").addEventListener("click", () => load(false));
window.addEventListener("offline", () => {
  status(
    "You’re offline. These are the last checked updates, not a live feed. Refresh when you’re back online.",
    true,
  );
  $("connection").textContent = "Offline · last snapshot";
  $("connection").dataset.state = "error";
});
setupWorker();
async function startFeed() {
  await feedStore.restore();
  if(feedStore.state.receipts.length)zapState={authority:null,error:null,snapshot:{partial:true,sources:[...new Set(feedStore.state.receipts.flatMap(c=>c.sources))]}};
  projectSaved();
  if(!navigator.onLine){$("connection").textContent="Offline · retained updates";$("connection").dataset.state="error";}
  // Restore is complete even when offline/hidden startup defers relay work.
  $("feed").setAttribute("aria-busy", "false");
  status(`${checkedLabel()} · stale saved history. ${feedStore.warning??""}`,!!feedStore.warning);
  load(true,true);
}
const resume=()=>load(true,true);
window.addEventListener("focus",resume);
window.addEventListener("online",resume);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")resume();});
window.addEventListener("pagehide",()=>{feedSync.cancel();zapUI.invalidate();});
// No closed-tab/server polling. Visible, runnable tab only; shared single flight.
setInterval(()=>{if(document.visibilityState==="visible"&&!$("zap-dialog").open){renderFeed();resume();}},60000);
startFeed();
