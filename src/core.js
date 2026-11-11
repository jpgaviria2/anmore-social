import { verifyEvent } from "nostr-tools/pure";
export const RELAY = "wss://relay.anmore.me";
export function validEvent(input, now = Math.floor(Date.now() / 1000)) {
  try {
    if (
      !input ||
      !/^[0-9a-f]{64}$/.test(input.id) ||
      !/^[0-9a-f]{64}$/.test(input.pubkey) ||
      !/^[0-9a-f]{128}$/.test(input.sig) ||
      !Number.isSafeInteger(input.created_at) ||
      input.created_at < 0 ||
      input.created_at > now ||
      !Number.isSafeInteger(input.kind) ||
      input.kind < 0 ||
      input.kind > 65535 ||
      typeof input.content !== "string" ||
      input.content.length > 100000 ||
      !Array.isArray(input.tags) ||
      input.tags.length > 2000 ||
      input.tags.some(
        (t) =>
          !Array.isArray(t) ||
          t.length === 0 ||
          t.some((v) => typeof v !== "string"),
      )
    )
      return false;
    // Never pass relay extras or a cached verification symbol to the verifier.
    return verifyEvent({
      id: input.id,
      pubkey: input.pubkey,
      sig: input.sig,
      created_at: input.created_at,
      kind: input.kind,
      tags: input.tags,
      content: input.content,
    });
  } catch {
    return false;
  }
}

export async function identify(profile, fetcher = fetch, now) {
  if (!validEvent(profile, now) || profile.kind !== 0) return null;
  let metadata;
  try {
    metadata = JSON.parse(profile.content);
  } catch {
    return null;
  }
  if (
    !metadata ||
    typeof metadata.nip05 !== "string" ||
    !/^[a-z0-9_.-]+@trailscoffee\.com$/.test(metadata.nip05)
  )
    return null;
  const name = metadata.nip05.split("@")[0];
  const response = await fetcher(
    `https://trailscoffee.com/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
    {
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok) throw Error("Identity endpoint unavailable");
  const mapping = await response.json();
  if (
    !mapping?.names ||
    !Object.hasOwn(mapping.names, name) ||
    mapping.names[name] !== profile.pubkey
  )
    return null;
  return {
    pubkey: profile.pubkey,
    nip05: metadata.nip05,
    name:
      typeof metadata.display_name === "string"
        ? metadata.display_name.slice(0, 100)
        : typeof metadata.name === "string"
          ? metadata.name.slice(0, 100)
          : name,
    picture: typeof metadata.picture === "string" ? metadata.picture : null,
  };
}

export const tag = (event, name) => event.tags.find((t) => t[0] === name)?.[1];
export const address = (e) => `${e.kind}:${e.pubkey}:${tag(e, "d") ?? ""}`;
export function visibleEvents(input, now) {
  const events = [
    ...new Map(
      input.filter((e) => validEvent(e, now)).map((e) => [e.id, e]),
    ).values(),
  ];
  const deletions = events.filter((e) => e.kind === 5),
    latest = new Map();
  for (const e of events.filter((e) => [0, 31922, 31923].includes(e.kind))) {
    const key = e.kind === 0 ? e.pubkey : address(e),
      previous = latest.get(key);
    if (
      !previous ||
      e.created_at > previous.created_at ||
      (e.created_at === previous.created_at && e.id < previous.id)
    )
      latest.set(key, e);
  }
  return events
    .filter((e) => [1, 20, 31922, 31923].includes(e.kind))
    .filter((e) => e.kind < 30000 || latest.get(address(e)) === e)
    .filter(
      (e) =>
        !deletions.some(
          (d) =>
            d.pubkey === e.pubkey &&
            d.tags.some(
              (t) =>
                (t[0] === "e" && t[1] === e.id) ||
                (t[0] === "a" &&
                  e.kind >= 30000 &&
                  t[1] === address(e) &&
                  d.created_at >= e.created_at),
            ),
        ),
    )
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
}
export function latestProfile(events, pubkey, now) {
  return events
    .filter((e) => e.pubkey === pubkey && e.kind === 0 && validEvent(e, now))
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
}

export function safeURL(value) {
  try {
    const u = new URL(value),
      h = u.hostname;
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      h.endsWith(".") ||
      h === "localhost" ||
      h.endsWith(".localhost") ||
      h.endsWith(".local") ||
      h.includes(":") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(h) ||
      !h.includes(".")
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function calendarInfo(e, now = Math.floor(Date.now() / 1000)) {
  const title = tag(e, "title") || tag(e, "name"),
    start = tag(e, "start"),
    end = tag(e, "end");
  if (!tag(e, "d") || !title || !start) return null;
  if (e.kind === 31922) {
    const dateValid = (s) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s;
    if (!dateValid(start) || (end && (!dateValid(end) || end <= start)))
      return null;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now * 1000));
    if ((end && end <= today) || (!end && start < today)) return null;
    return {
      title,
      date: start,
      sort: Date.parse(start) / 1000,
      allDay: true,
      location: tag(e, "location") || "Location in event details",
    };
  }
  if (
    e.kind !== 31923 ||
    !/^\d+$/.test(start) ||
    !Number.isSafeInteger(Number(start)) ||
    (end && (!/^\d+$/.test(end) || Number(end) <= Number(start))) ||
    Number(end || start) < now ||
    Number(start) > 8640000000000
  )
    return null;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Number(start) * 1000));
  return {
    title,
    date,
    sort: Number(start),
    allDay: false,
    location: tag(e, "location") || "Location in event details",
  };
}
