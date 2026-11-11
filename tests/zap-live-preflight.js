// Read-only production-contract probe. Never requests invoices or prints Cashu proofs.
import { Relay } from "../src/relay.js";
import { boundedJSON, resolveCommunity, PAY_ENDPOINT } from "../src/zaps.js";
import { writeFile, mkdir } from "node:fs/promises";
const relay = new Relay(),
  now = Math.floor(Date.now() / 1000);
const result = {
  observedAt: new Date().toISOString(),
  ready: false,
  invoiceRequests: 0,
  paymentsSent: 0,
};
try {
  await relay.open();
  const endpoint = await boundedJSON(PAY_ENDPOINT);
  result.endpoint = {
    tag: endpoint.tag,
    allowsNostr: endpoint.allowsNostr,
    receiptIssuer: endpoint.nostrPubkey,
    callback: endpoint.callback,
  };
  try {
    const authority = await resolveCommunity(relay);
    result.recipient = authority.recipient;
    result.profileId = authority.profileId;
    result.recipientResolved = true;
  } catch (error) {
    result.recipientError = error.message;
  }
  for (const kind of [9735, 9321]) {
    const events = await relay.query([
      { kinds: [kind], since: now - 172800, limit: 100 },
    ]);
    result[`recentKind${kind}`] = {
      verifiedEvents: events.length,
      atLimit: events.length >= 100,
      postReferences: events.map((e) => ({
        id: e.id,
        post: e.tags.find((t) => t[0] === "e")?.[1],
        recipient: e.tags.find((t) => t[0] === "p")?.[1],
        issuer: e.pubkey,
        createdAt: e.created_at,
      })),
    };
  }
  const issuerProfiles = await relay.query([
    { kinds: [0], authors: [endpoint.nostrPubkey], limit: 1 },
  ]);
  result.issuerSignedProfilePresent = issuerProfiles.length > 0;
  result.receiptPublicationVerified = false;
  // An empty receipt window is not proof of nonpayment or relay write rejection.
  if (!result.recentKind9735.verifiedEvents)
    result.paidAcceptance =
      "Unavailable: no recent verified Lightning receipts on the pinned relay.";
} catch (error) {
  result.error = error.message;
} finally {
  relay.close();
}
await mkdir("qa", { recursive: true });
await writeFile("qa/zap-live-preflight.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (!result.ready) process.exitCode = 1;
