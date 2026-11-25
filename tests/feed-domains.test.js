import test from 'node:test';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { finalizeEvent } from 'nostr-tools/pure';
import * as core from '../src/core.js';
import { resolveCommunity, COMMUNITY_ADDRESS, PAY_CALLBACK } from '../src/zaps.js';
const key=new Uint8Array(32).fill(9);
const sign=(nip05,extra={})=>finalizeEvent({kind:0,created_at:100,tags:[],content:JSON.stringify({nip05,...extra})},key);

test('shipping CSP admits only the exact additional HTTPS identity origin without widening relay or payment origins',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const connect=html.match(/connect-src ([^;]+);/)[1].split(/\s+/);
 assert.deepEqual(connect,["'self'",'wss://relay.anmore.me','wss://relay.primal.net','https://trailscoffee.com','https://anmorekindling.ca','https://pay.trailscoffee.com']);
});

test('feed accepts exact Kindling identity using only its own per-name HTTPS mapping',async()=>{
 const p=sign('Any.Handle-7@anmorekindling.ca');let called=0;
 const identity=await core.identify(p,async(url,options)=>{
  called++;assert.equal(url,'https://anmorekindling.ca/.well-known/nostr.json?name=Any.Handle-7');
  assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.equal(options.referrerPolicy,'no-referrer');
  return new Response(JSON.stringify({names:{'Any.Handle-7':p.pubkey}}));
 },200);
 assert.ok(identity,'exact Kindling identity must be eligible');assert.equal(called,1);
 assert.equal(identity.nip05,'Any.Handle-7@anmorekindling.ca');assert.equal(identity.proof.profile.id,p.id);assert.equal(identity.proof.checkedAt,200);
 assert.equal(core.profileIdentityStatus(p,200),'eligible');
});
test('feed identifier rejects suffixes, subdomains, lookalikes, multiple separators and trailing line endings before I/O',async()=>{
 for(const domain of ['trailscoffee.com','anmorekindling.ca']){
  assert.equal(core.feedIdentifier('A_b.7-'+ '@'+domain),true);
  for(const nip05 of ['@'+domain,'x@@'+domain,'x@y@'+domain,'x@sub.'+domain,'x@evil'+domain,'x@'+domain+'.evil','x@'+domain.toUpperCase(),'x@'+domain+' ','x@'+domain+'\n','x@'+domain+'\r\n','x+tag@'+domain,'x'.repeat(65)+'@'+domain,'х@'+domain]){
   assert.equal(core.feedIdentifier(nip05),false,JSON.stringify(nip05));
   let calls=0;assert.equal(await core.identify(sign(nip05),()=>{calls++;throw Error('must not fetch');},200),null);assert.equal(calls,0);
  }
 }
 assert.equal(core.feedIdentifier('x@anmorekіndling.ca'),false);
});
test('Kindling proof requires exact name and key, signed profile and unredirected own-domain response',async()=>{
 const p=sign('Case@anmorekindling.ca');
 for(const names of [{},{case:p.pubkey},{Other:p.pubkey},{Case:'f'.repeat(64)}]){
  assert.equal(await core.identify(p,async()=>new Response(JSON.stringify({names})),200),null);
  assert.equal((await core.identifyDecision(p,async()=>new Response(JSON.stringify({names})),200)).status,'contradiction');
 }
 let calls=0;
 assert.equal(await core.identify({...p,content:JSON.stringify({nip05:'Other@anmorekindling.ca'})},()=>{calls++;},200),null);assert.equal(calls,0);
 const body=()=>new Response(JSON.stringify({names:{Case:p.pubkey}})).body;
 for(const response of [{status:200,redirected:true,body:body()},{status:200,url:'https://trailscoffee.com/.well-known/nostr.json?name=Case',body:body()},{status:404,body:body()}]){
  assert.equal((await core.identifyDecision(p,async()=>response,200)).status,'unavailable');
 }
 for(const text of ['{',JSON.stringify({names:{Case:p.pubkey,bad:1}}),JSON.stringify({names:{Case:p.pubkey},padding:'x'.repeat(65536)})]){
  assert.equal((await core.identifyDecision(p,async()=>new Response(text),200)).status,'unavailable');
 }
});
test('community recipient remains Trails-only even if its directory also maps a Kindling profile key',async()=>{
 const p=sign('Any.Handle@anmorekindling.ca',{lud16:COMMUNITY_ADDRESS});let endpointCalls=0;
 assert.equal(core.approvedIdentifier('Any.Handle@anmorekindling.ca'),false);
 assert.equal(core.approvedIdentifier('Any.Handle@trailscoffee.com'),true);
 await assert.rejects(()=>resolveCommunity({query:async filters=>filters[0].kinds.includes(0)?[p]:[]},async url=>{
  assert.equal(url,'https://trailscoffee.com/.well-known/nostr.json');
  if(!url.includes('nostr.json'))endpointCalls++;
  return new Response(JSON.stringify({names:{'Any.Handle':p.pubkey}}));
 },200),/Community recipient is not yet verifiable/);
 assert.equal(endpointCalls,0);assert.equal(PAY_CALLBACK,'https://pay.trailscoffee.com/lnurlp/coffeeloverc2c2cd/invoice');
});
