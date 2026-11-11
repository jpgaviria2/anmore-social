import test from 'node:test';
import assert from 'node:assert/strict';
import { Relay } from '../src/relay.js';
import { collectReceipts, RECEIPT_PEER } from '../src/receipts.js';
import { RELAY } from '../src/core.js';
import { sign, keys, NOW, invoice } from './zap-fixtures.js';

const post = sign({});
const authority = { issuer: sign({}, keys.issuer).pubkey, recipient: sign({}, keys.recipient).pubkey };
const request = sign({ kind: 9734, tags: [['p', authority.recipient], ['e', post.id]] }, keys.sender);
const description = JSON.stringify(request);
const receipt = sign({ kind: 9735, created_at: NOW - 1, tags: [['p', authority.recipient], ['e', post.id], ['description', description], ['bolt11', invoice(description)]] }, keys.issuer);

function socketFor(counts) {
  return class extends EventTarget {
    constructor(url) {
      super(); this.url = url; this.readyState = 0;
      queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); });
    }
    send(raw) {
      const [type, id] = JSON.parse(raw);
      if (type !== 'REQ') return;
      queueMicrotask(() => {
        const count = counts[this.url] ?? 1;
        for (let i = 0; i < count && this.readyState === 1; i++) {
          // Two identical valid receipts plus invalid frames: retained map size is one.
          const event = i === 0 || i === count - 1 ? receipt : { kind: 9735 };
          this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(['EVENT', id, event]) }));
        }
        if (this.readyState === 1) this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(['EOSE', id]) }));
      });
    }
    close() { this.readyState = 3; }
  };
}

for (const source of [RELAY, RECEIPT_PEER]) {
  test(`receipt cap counts raw frames before filtering/deduplication on ${source}`, async () => {
    const Socket = socketFor({ [source]: 1000 });
    const local = new Relay(Socket); await local.open();
    try {
      const result = await collectReceipts([post], authority, local, Socket, NOW);
      assert.equal(result.partial, true);
      assert.deepEqual(result.sources, [source === RELAY ? RECEIPT_PEER : RELAY]);
      assert.equal(result.totals.get(post.id), 21000n);
    } finally { local.close(); }
  });
}

test('both capped raw receipt snapshots are unavailable rather than complete zero', async () => {
  const Socket = socketFor({ [RELAY]: 1000, [RECEIPT_PEER]: 1000 });
  const local = new Relay(Socket); await local.open();
  try { await assert.rejects(collectReceipts([post], authority, local, Socket, NOW), /unavailable/); }
  finally { local.close(); }
});

test('raw frame count just below cap remains complete despite duplicates and invalid claims', async () => {
  const Socket = socketFor({ [RELAY]: 999, [RECEIPT_PEER]: 999 });
  const local = new Relay(Socket); await local.open();
  try {
    const result = await collectReceipts([post], authority, local, Socket, NOW);
    assert.equal(result.partial, false);
    assert.equal(result.totals.get(post.id), 21000n);
  } finally { local.close(); }
});
