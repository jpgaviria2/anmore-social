import { safeURL } from "./core.js";

// Query/fragment punctuation is author data, except a syntactic wrapping closer.
export function bodyURLs(text) {
  return [
    ...text.matchAll(/(?<![^\s([{"'<`])https:\/\/[^\s<>"`\u0000-\u001f]+/gi),
  ].map((m) => {
    let raw = m[0];
    const closer = { "(": ")", "[": "]", "{": "}", "'": "'" }[
      text[m.index - 1]
    ];
    const end = closer ? raw.lastIndexOf(closer) : -1;
    if (end !== -1 && /^[.,!;:]*$/.test(raw.slice(end + 1)))
      raw = raw.slice(0, end);
    if (!/[?#]/.test(raw)) raw = raw.replace(/[.,!;:)\]}]+$/, "");
    return { raw, index: m.index };
  });
}
const directVideo = (url) => /\.(mp4|webm|mov)$/i.test(new URL(url).pathname);
const mediaURL = (raw) =>
  typeof raw === "string" &&
  /^https:\/\//i.test(raw) &&
  !/^https:\/\/[^/?#]*:/i.test(raw) &&
  !/[\s\\\u0000-\u001f\u007f]/.test(raw) &&
  safeURL(raw)
    ? raw
    : null;

// Called only for posts admitted by the signed-event and domain identity gates.
export function postVideos(e) {
  const videos = new Map();
  const add = (raw, label) => {
    const url = mediaURL(raw);
    if (url && directVideo(url) && !videos.has(url) && videos.size < 4)
      videos.set(url, {
        url,
        label: label || "Video attached to this community update",
      });
  };
  for (const { raw } of bodyURLs(e.content)) add(raw);
  for (const t of e.tags) {
    if (t[0] !== "imeta") continue;
    const urls = t.slice(1).filter((v) => v.startsWith("url "));
    if (urls.length !== 1) continue;
    const alt = t
      .slice(1)
      .find((v) => v.startsWith("alt "))
      ?.slice(4, 204);
    add(urls[0].slice(4), alt);
  }
  return [...videos.values()];
}
// Pure discovery for already-admitted signed events (not an authenticity gate).
// Order: JSON declaration properties/arrays, event tags, then body URL order.
// Exact-URL conflicts or ambiguous imeta reject that URL across all sources;
// they stay ordinary body links, without an unsupported attachment/diagnostic.
// Only standalone accepted URL lines are removed; inline prose is preserved.
// Preview limits belong to UI; discovery never fetches media or generates posters.
export function parsePost(event) {
  if (
    !event ||
    typeof event.content !== "string" ||
    event.content.length > 100000 ||
    !Array.isArray(event.tags) ||
    event.tags.length > 2000 ||
    event.tags.some(
      (t) =>
        !Array.isArray(t) ||
        t.length === 0 ||
        t.some((v) => typeof v !== "string"),
    )
  )
    return { text: "", title: "", attachments: [] };
  let content = event.content,
    title = "",
    payload;
  try {
    const decoded = JSON.parse(content);
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
      payload = decoded;
      content =
        [decoded.body, decoded.content, decoded.description].find(
          (v) => typeof v === "string",
        ) ?? "";
      title =
        typeof decoded.title === "string" ? decoded.title.slice(0, 200) : "";
    }
  } catch {
    /* Plain text, including malformed JSON, remains plain text. */
  }
  const candidates = [],
    seen = new Map(),
    rejected = new Set();
  const extensions = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    m3u8: "application/vnd.apple.mpegurl",
  };
  const mimeTypes = new Map(
    Object.values(extensions).map((m) => [
      m,
      m.startsWith("image/") ? "image" : "video",
    ]),
  );
  mimeTypes.set("application/x-mpegurl", "video");
  for (const mime of [
    "video/ogg",
    "video/mpeg",
    "video/mp2t",
    "video/3gpp",
    "video/av1",
    "video/x-matroska",
  ])
    mimeTypes.set(mime, "video");
  const add = (raw, mime, label, declared) => {
    const url = mediaURL(raw);
    if (!url) return;
    const parsed = new URL(url),
      ext = parsed.pathname.match(/\.([^./]+)$/)?.[1].toLowerCase();
    const extMime = extensions[ext];
    if (
      /^(.*\.)?(facebook\.com|instagram\.com|fb\.watch)$/.test(parsed.hostname)
    )
      return;
    if (
      mime !== undefined &&
      (!mimeTypes.has(mime) ||
        (ext &&
          mime !== extMime &&
          !(ext === "m3u8" && mime === "application/x-mpegurl")))
    ) {
      rejected.add(url);
      return;
    }
    const type =
      mimeTypes.get(mime || extMime) ||
      (declared === "image" && !ext ? "image" : null);
    if (!type) return;
    const previous = seen.get(url);
    if (previous) {
      if (
        previous.type !== type ||
        (mime && previous.mime && previous.mime !== mime)
      )
        rejected.add(url);
      // Retain typed duplicate evidence even when discovery began untyped.
      if (mime && !previous.mime) previous.mime = mime;
      return;
    }
    const attachment = {
      type,
      url,
      label:
        typeof label === "string" && label.trim()
          ? label.slice(0, 200)
          : `${type === "image" ? "Photo" : "Video"} attached to this community update`,
      ...(mime ? { mime } : {}),
    };
    seen.set(url, attachment);
    candidates.push(attachment);
  };
  if (payload)
    for (const key of Object.keys(payload)) {
      if (key !== "images" && key !== "videos") continue;
      const values = Array.isArray(payload[key])
        ? payload[key]
        : [payload[key]];
      for (const value of values)
        add(value, undefined, undefined, key === "images" ? "image" : "video");
    }
  for (const tag of event.tags) {
    if (tag[0] === "image") add(tag[1], undefined, undefined, "image");
    if (tag[0] !== "imeta") continue;
    const urls = tag
      .slice(1)
      .filter((v) => typeof v === "string" && v.startsWith("url "));
    const mimes = tag
      .slice(1)
      .filter((v) => typeof v === "string" && v.startsWith("m "));
    if (urls.length !== 1 || mimes.length > 1) {
      for (const raw of urls) rejected.add(raw.slice(4));
      continue;
    }
    const mime = mimes[0]?.slice(2).trim().toLowerCase();
    const label = tag
      .slice(1)
      .find((v) => typeof v === "string" && v.startsWith("alt "))
      ?.slice(4);
    add(urls[0].slice(4), mime, label);
  }
  for (const { raw } of bodyURLs(content)) add(raw);
  const attachments = candidates.filter((a) => !rejected.has(a.url));
  const urls = new Set(attachments.map((a) => a.url));
  const text = content
    .split("\n")
    .filter((line) => {
      const found = bodyURLs(line);
      if (found.length !== 1 || !urls.has(found[0].raw)) return true;
      const { raw, index } = found[0];
      return !/^[\s()[\]{}<>"'`.,!;:]*$/.test(
        line.slice(0, index) + line.slice(index + raw.length),
      );
    })
    .join("\n")
    .trim();
  return { text, title, attachments };
}

export function withoutVideos(text, videos) {
  const urls = new Set(videos.map((v) => v.url));
  for (const { raw, index } of bodyURLs(text).reverse())
    if (urls.has(raw))
      text = text.slice(0, index) + text.slice(index + raw.length);
  return text.trim();
}
