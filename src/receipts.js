import { RELAY, validEvent } from "./core.js";
import { verifiedTotals } from "./zaps.js";
export const RECEIPT_PEER = "wss://relay.primal.net";
const DEADLINE = 4000;
const CAP = 1000;
// No arbitrary URL or filter API: this connection can only read post-linked receipts.
function publicReceipts(filter, Socket) {
  return new Promise((resolve, reject) => {
    const socket = new Socket(RECEIPT_PEER),
      events = new Map();
    let count = 0,
      bytes = 0,
      finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (socket.readyState === 1)
        socket.send(JSON.stringify(["CLOSE", "receipts"]));
      socket.close();
      error ? reject(error) : resolve([...events.values()]);
    };
    const timer = setTimeout(
      () => finish(Error("Receipt peer deadline exceeded.")),
      DEADLINE,
    );
    socket.addEventListener("open", () => {
      if (!finished) socket.send(JSON.stringify(["REQ", "receipts", filter]));
    });
    socket.addEventListener("error", () =>
      finish(Error("Receipt peer unavailable.")),
    );
    socket.addEventListener("close", () =>
      finish(Error("Receipt peer disconnected.")),
    );
    socket.addEventListener("message", ({ data }) => {
      if (finished) return;
      if (typeof data !== "string" || data.length > 1200000)
        return finish(Error("Receipt peer response exceeded safety limit."));
      bytes += new TextEncoder().encode(data).byteLength;
      if (bytes > 8 * 1024 * 1024)
        return finish(Error("Receipt peer snapshot byte limit exceeded."));
      let m;
      try {
        m = JSON.parse(data);
      } catch {
        return;
      }
      if (!Array.isArray(m)) return;
      if (m[0] === "NOTICE") return finish(Error("Receipt peer unavailable."));
      if (m[1] !== "receipts") return;
      if (m[0] === "EOSE") return finish();
      if (m[0] === "CLOSED")
        return finish(Error("Receipt peer declined query."));
      if (m[0] !== "EVENT") return;
      // Charge raw EVENT frames before verification or event-ID deduplication.
      if (++count >= CAP)
        return finish(Error("Receipt snapshot truncated."));
      const e = m[2];
      if (
        validEvent(e) &&
        e.kind === 9735 &&
        filter.authors.includes(e.pubkey) &&
        e.tags.some((t) => t[0] === "p" && filter["#p"].includes(t[1])) &&
        e.tags.some((t) => t[0] === "e" && filter["#e"].includes(t[1]))
      )
        events.set(e.id, e);
    });
  });
}
export async function collectReceipts(
  posts,
  authority,
  relay,
  Socket = WebSocket,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    posts.length > 1200 ||
    posts.some((e) => !validEvent(e, now) || ![1, 20].includes(e.kind))
  )
    throw Error("Invalid receipt target snapshot.");
  const receipts = new Map(),
    provenance = new Map();
  if (!posts.length)
    return {
      receipts: [],
      provenance,
      totals: new Map(),
      partial: false,
      sources: [],
    };
  const filter = {
    kinds: [9735],
    authors: [authority.issuer],
    "#p": [authority.recipient],
    "#e": [...new Set(posts.map((e) => e.id))],
    limit: CAP,
  };
  // Start both reads together. A dead peer never erases a healthy peer's verified results.
  const results = await Promise.allSettled([
    relay.query([filter], DEADLINE, { rejectAtLimit: true }),
    publicReceipts(filter, Socket),
  ]);
  const sources = [];
  results.forEach((result, i) => {
    if (result.status !== "fulfilled" || result.value.length >= CAP) return;
    const source = [RELAY, RECEIPT_PEER][i];
    sources.push(source);
    for (const e of result.value) {
      // Preserve receipt provenance only. No content/profile/deletion import path exists.
      if (e.kind !== 9735) continue;
      receipts.set(e.id, e);
      if (!provenance.has(e.id)) provenance.set(e.id, new Set());
      provenance.get(e.id).add(source);
    }
  });
  if (!sources.length) throw Error("Community receipt checks unavailable.");
  return {
    receipts: [...receipts.values()],
    provenance,
    totals: verifiedTotals([...receipts.values()], posts, authority, now),
    partial: sources.length !== 2,
    sources,
  };
}
