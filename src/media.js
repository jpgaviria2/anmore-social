import { safeURL } from "./core.js";

// Preserve author-supplied query bytes. Punctuation without a query is prose.
export function bodyURLs(text) {
  return [...text.matchAll(/(?<!\S)https:\/\/[^\s<>"\u0000-\u001f]+/g)].map((m) => {
    const raw = /[?#]/.test(m[0]) ? m[0] : m[0].replace(/[.,!;:)]+$/, "");
    return { raw, index: m.index };
  });
}
const directVideo = (url) => /\.(mp4|webm|mov)$/i.test(new URL(url).pathname);
const mediaURL = (raw) =>
  typeof raw === "string" && /^https:\/\//.test(raw) &&
  !/[\s\\\u0000-\u001f\u007f]/.test(raw) && safeURL(raw) ? raw : null;

// Called only for posts admitted by the signed-event and domain identity gates.
export function postVideos(e) {
  const videos = new Map();
  const add = (raw, label) => {
    const url = mediaURL(raw);
    if (url && directVideo(url) && !videos.has(url) && videos.size < 4)
      videos.set(url, { url, label: label || "Video attached to this community update" });
  };
  for (const { raw } of bodyURLs(e.content)) add(raw);
  for (const t of e.tags) {
    if (t[0] !== "imeta") continue;
    const urls = t.slice(1).filter(v => v.startsWith("url "));
    if (urls.length !== 1) continue;
    const alt = t.slice(1).find(v => v.startsWith("alt "))?.slice(4, 204);
    add(urls[0].slice(4), alt);
  }
  return [...videos.values()];
}
export function withoutVideos(text, videos) {
  const urls = new Set(videos.map(v => v.url));
  for (const { raw, index } of bodyURLs(text).reverse())
    if (urls.has(raw)) text = text.slice(0, index) + text.slice(index + raw.length);
  return text.trim();
}
