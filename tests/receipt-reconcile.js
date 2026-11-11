// Read-only reconciliation: never follows request relays or prints invoices/preimages.
import { mkdir, writeFile } from "node:fs/promises";
import { Relay } from "../src/relay.js";
import {
  validEvent,
  visibleEvents,
  latestProfile,
  identify,
} from "../src/core.js";
import {
  resolveCommunity,
  verifiedTotals,
  readInvoice,
  COMMUNITY_LNURL,
} from "../src/zaps.js";
const relay = new Relay();
async function publicQuery(ids) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket("wss://relay.primal.net");
    const events = new Map();
    const timer = setTimeout(() => {
      socket.close();
      reject(Error("Primal deadline"));
    }, 10000);
    const done = () => {
      clearTimeout(timer);
      socket.close();
      resolve([...events.values()]);
    };
    socket.addEventListener("open", () =>
      socket.send(
        JSON.stringify([
          "REQ",
          "reconcile",
          { kinds: [9735], "#e": ids, limit: 500 },
        ]),
      ),
    );
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      socket.close();
      reject(Error("Primal unavailable"));
    });
    socket.addEventListener("message", ({ data }) => {
      if (typeof data !== "string" || data.length > 1200000) return;
      const m = JSON.parse(data);
      if (
        m[0] === "EVENT" &&
        events.size < 500 &&
        validEvent(m[2]) &&
        m[2].kind === 9735 &&
        m[2].tags.some((t) => t[0] === "e" && ids.includes(t[1]))
      )
        events.set(m[2].id, m[2]);
      if (m[0] === "EOSE") done();
    });
  });
}
try {
  await relay.open();
  const posts = await relay.query([{ kinds: [1, 20], limit: 100 }]);
  const authors = [...new Set(posts.map((e) => e.pubkey))];
  const profiles = await relay.query(
    authors.map((p) => ({ kinds: [0], authors: [p], limit: 1 })),
  );
  const deletions = await relay.query([{ kinds: [5], authors, limit: 500 }]);
  const approved = new Set();
  for (const p of authors) {
    const profile = latestProfile(profiles, p);
    if (profile && (await identify(profile))) approved.add(p);
  }
  const visible = visibleEvents([...posts, ...deletions]).filter(
    (e) => [1, 20].includes(e.kind) && approved.has(e.pubkey),
  );
  const authority = await resolveCommunity(relay);
  const receipts = await publicQuery(visible.map((e) => e.id));
  const local = await relay.query([
    { kinds: [9735], "#e": visible.map((e) => e.id), limit: 500 },
  ]);
  const rows = receipts.map((r) => {
    const d = r.tags.find((t) => t[0] === "description")?.[1];
    const q = JSON.parse(d);
    let invoice;
    let error;
    try {
      invoice = readInvoice(r.tags.find((t) => t[0] === "bolt11")?.[1]);
    } catch (e) {
      error = e.message;
    }
    return {
      id: r.id,
      postId: r.tags.find((t) => t[0] === "e")?.[1],
      issuerMatches: r.pubkey === authority.issuer,
      recipientMatches:
        r.tags.find((t) => t[0] === "p")?.[1] === authority.recipient,
      requestRecipientMatches:
        q.tags.find((t) => t[0] === "p")?.[1] === authority.recipient,
      lnurlPresent: q.tags.some((t) => t[0] === "lnurl"),
      lnurlMatches:
        q.tags.find((t) => t[0] === "lnurl")?.[1] === COMMUNITY_LNURL,
      requestRelayCount: q.tags
        .filter((t) => t[0] === "relays")
        .flatMap((t) => t.slice(1)).length,
      invoiceValid: !!invoice,
      invoiceError: error,
      msats: invoice?.msats.toString(),
      accepted: verifiedTotals([r], visible, authority).size > 0,
    };
  });
  await mkdir("qa", { recursive: true });
  // Private, gitignored evidence: exact signed bytes cannot be redacted without invalidating signatures.
  await writeFile(
    "qa/receipt-live-private.json",
    JSON.stringify({ posts: visible, receipts, local, authority }),
    { mode: 0o600 },
  );
  const result = {
    visiblePostIds: visible.map((e) => e.id),
    primalCount: receipts.length,
    anmoreCount: local.length,
    rows,
    totals: [
      ...verifiedTotals([...receipts, ...local], visible, authority),
    ].map(([id, n]) => ({ id, msats: n.toString() })),
  };
  await writeFile("qa/receipt-reconcile.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  relay.close();
}
