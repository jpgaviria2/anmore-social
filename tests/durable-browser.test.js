import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { build } from 'esbuild';
import { chromium, webkit } from 'playwright';
import { invoice,keys } from './zap-fixtures.js';
import { COMMUNITY_ADDRESS, PAY_CALLBACK } from '../src/zaps.js';
import { finalizeEvent } from 'nostr-tools/pure';
const key = new Uint8Array(32).fill(7), now = Math.floor(Date.now()/1000);
const sign = x => JSON.parse(JSON.stringify(finalizeEvent({kind:1,created_at:now-20,tags:[],content:'retained',...x},key)));
const profile=sign({kind:0,content:JSON.stringify({nip05:'new.handle@trailscoffee.com'})});
const event=sign({});
const proof={profile,mapping:{names:{'new.handle':profile.pubkey}},checkedAt:now};
let browser,server,page,fixtureOffline=false;
async function setup(t) {
 const bundle=await build({stdin:{contents:'import * as core from "./src/core.js"; import * as store from "./src/feed-store.js"; import * as sync from "./src/feed-sync.js"; window.api={...core,...store,...sync};',resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
 fixtureOffline=false;server=http.createServer(async(req,res)=>{if(fixtureOffline){req.socket.destroy();return;}const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html');if(path==='/api.js')res.end(bundle.outputFiles[0].text);else if(path==='/')res.end('<script src="/api.js"></script>');else {try{res.end(await readFile(new URL('..'+path,import.meta.url)));}catch{res.writeHead(404).end();}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=process.env.DURABLE_BROWSER==='webkit'?await webkit.launch({headless:true}):await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext();
 const external=[];
 // Routing alone is bypassed for worker-controlled HTTP in WebKit. Synthetic
 // identity responses belong at the DOCUMENT boundary, never in the worker.
 await context.addInitScript(({mapping})=>{
  const real=window.fetch.bind(window);
  window.fetch=async(input,options)=>{
   const url=new URL(input instanceof Request?input.url:String(input),location.href);
   const method=options?.method??(input instanceof Request?input.method:'GET');
   if(method==='GET'&&url.origin==='https://trailscoffee.com'&&url.pathname==='/.well-known/nostr.json')
    return new Response(JSON.stringify(mapping),{status:200,headers:{'content-type':'application/json'}});
   if(url.origin!==location.origin)throw Error('External fixture request blocked '+url.href);
   return real(input,options);
  };
 },{mapping:proof.mapping});
 // Defense in depth for non-fetch resources; no external HTTP is approved.
 await context.route(/^https?:\/\//,route=>{
  if(new URL(route.request().url()).origin===`http://127.0.0.1:${server.address().port}`)return route.continue();
  external.push(route.request().url());return route.abort();
 });
 page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
 t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));assert.deepEqual(external,[],'unexpected external HTTP request');});
}
test('concurrent owner tombstone fences held identity admission but preserves historical acceptance',async t=>{
 await setup(t);const fresh=sign({content:'held admission'}),deletion=sign({kind:5,tags:[['e',profile.id]]});
 const result=await page.evaluate(async({event,fresh,profile,proof,deletion,now})=>{
  const a=new api.FeedStore('held-profile'),b=new api.FeedStore('held-profile');await a.restore();await a.accept(event,proof);await b.restore();
  let release,entered;const ready=new Promise(r=>entered=r);
  const wire={open:async()=>{},close(){},query:async([f])=>f.kinds.includes(1)?[fresh]:f.kinds.includes(0)?[profile]:[]};
  const sync=new api.FeedSync(a,{relay:()=>wire,now:()=>now,identify:async()=>{entered();await new Promise(r=>release=r);return {proof};}});
  const running=sync.run();await ready;await b.remove([deletion]);release();await running;
  const r=new api.FeedStore('held-profile');await r.restore();return r.events().map(e=>e.id);
 },{event,fresh,profile,proof,deletion,now});assert.deepEqual(result,[event.id]);
});
test('stale profile proof cannot override a concurrent newer signed withdrawal',async t=>{
 await setup(t);const fresh=sign({content:'stale grant'}),withdrawal=sign({kind:0,created_at:now-1,content:'{}'});
 const result=await page.evaluate(async({event,fresh,proof,withdrawal,now})=>{
  const a=new api.FeedStore('stale-withdrawal'),b=new api.FeedStore('stale-withdrawal');await a.restore();await a.accept(event,proof);await b.restore();
  await b.merge({profiles:[withdrawal],revoked:[event.pubkey],checkedAt:now});Date.now=()=>1000*(now+2);
  const wire={open:async()=>{},close(){},query:async([f])=>f.kinds.includes(1)?[fresh]:f.kinds.includes(0)?[proof.profile]:[]};
  await new api.FeedSync(a,{relay:()=>wire,now:()=>now+2,identify:async()=>({proof:{...proof,checkedAt:now+2}})}).run();
  const r=new api.FeedStore('stale-withdrawal');await r.restore();return {revoked:r.state.revoked,ids:r.events(),accepted:r.state.accepted.length};
 },{event,fresh,proof,withdrawal,now});assert.deepEqual(result,{revoked:[event.pubkey],ids:[],accepted:1});
});
test('invalid mapping proof cannot regrant revoked historical projection',async t=>{
 await setup(t);
 const result=await page.evaluate(async({event,proof,now})=>{
  const s=new api.FeedStore('invalid-regrant');await s.restore();await s.accept(event,proof);await s.merge({revoked:[event.pubkey],checkedAt:now});Date.now=()=>1000*(now+2);
  await s.merge({identities:[[event.pubkey,{proof:{...proof,mapping:{names:{}},checkedAt:now+2}}]]});
  const r=new api.FeedStore('invalid-regrant');await r.restore();return r.events();
 },{event,proof,now});assert.deepEqual(result,[]);
});
test('recovery held read preserves ingress removals and revocations arriving during await',async t=>{
 await setup(t);const fresh=sign({content:'during recovery'}),deletion=sign({kind:5,tags:[['e',event.id]]});
 const result=await page.evaluate(async({event,fresh,proof,deletion})=>{
  const s=new api.FeedStore('held-recovery');await s.restore();await s.accept(event,proof);const db=s.connection;s.blocked=true;
  let release,entered;const ready=new Promise(r=>entered=r);
  s.connection={transaction(...args){const tx=db.transaction(...args);if(args[1]!=='readonly')return tx;return new Proxy(tx,{get(t,p){const v=t[p];return typeof v==='function'?v.bind(t):v;},set(t,p,v){if(p==='oncomplete')t.oncomplete=()=>{release=()=>v();entered();};else t[p]=v;return true;}});}};
  const recovering=s.recover();await ready;await s.accept(fresh,proof);await s.remove([deletion]);await s.merge({revoked:[event.pubkey],checkedAt:proof.checkedAt});release();await recovering;
  const r=new api.FeedStore('held-recovery');await r.restore();return {ids:r.state.accepted.map(x=>x.event.id).sort(),removals:r.state.removals.map(e=>e.id),revoked:r.state.revoked,visible:r.events()};
 },{event,fresh,proof,deletion});assert.deepEqual(result,{ids:[event.id,fresh.id].sort(),removals:[deletion.id],revoked:[event.pubkey],visible:[]});
});
test('sync preserves history on malformed placeholder and unavailable maps but revokes signed withdrawals and contradictions',async t=>{
 await setup(t);
 const contents=['{','{"name":"deleted"}','{"nip05":"new.handle@trailscoffee.com"}','{}','{"nip05":"new.handle@trailscoffee.com"}'];
 const candidates=contents.map(content=>sign({kind:0,created_at:now-1,content}));
 const result=await page.evaluate(async({event,proof,candidates})=>{
  const counts=[];for(let i=0;i<candidates.length;i++){
   const s=new api.FeedStore('outcomes-'+i);await s.restore();await s.accept(event,proof);
   const wire={open:async()=>{},close(){},query:async([f])=>f.kinds.includes(0)?[candidates[i]]:[]};
   globalThis.fetch=async()=>new Response(i===2?'{"names":{"x":3}}':'{"names":{}}');
   await new api.FeedSync(s,{relay:()=>wire}).run();const r=new api.FeedStore('outcomes-'+i);await r.restore();counts.push(r.events().length);
  }return counts;
 },{event,proof,candidates});assert.deepEqual(result,[1,1,1,0,0]);
});
test('acceptance restore and identity projection share case syntax and complete mapping validation',async t=>{
 await setup(t);const p=sign({kind:0,content:JSON.stringify({nip05:'Any.Handle@trailscoffee.com',display_name:{toString:{}},name:'safe fallback'})});
 const result=await page.evaluate(async({event,p,now})=>{
  const mapping={names:{'Any.Handle':p.pubkey,Other:'string'},padding:'x'.repeat(17000)},proof={profile:p,mapping,mappingJSON:JSON.stringify(mapping),checkedAt:now};
  const s=new api.FeedStore('case-proof');await s.restore();const accepted=await s.accept(event,proof);
  const r=new api.FeedStore('case-proof');await r.restore();const names=[...r.identities().values()].map(x=>x.name);
  const bad=new api.FeedStore('bad-map-proof');await bad.restore();const invalid=await bad.accept(event,{...proof,mapping:{names:{'Any.Handle':p.pubkey,other:7}},mappingJSON:undefined});
  return {accepted,names,invalid,count:r.events().length};
 },{event,p,now});assert.deepEqual(result,{accepted:true,names:['safe fallback'],invalid:false,count:1});
});
test('direct admission proofs establish signed profile highwaters across owners and restart',async t=>{
 await setup(t);const newer=sign({kind:0,created_at:now-1,content:profile.content}),fresh=sign({content:'stale direct proof'});
 const result=await page.evaluate(async({event,fresh,proof,newer})=>{
  const a=new api.FeedStore('proof-highwater');await a.restore();await a.accept(event,{...proof,profile:newer});
  const b=new api.FeedStore('proof-highwater');await b.restore();const admitted=await b.accept(fresh,proof);
  const r=new api.FeedStore('proof-highwater');await r.restore();return {admitted,ids:r.events().map(e=>e.id),profiles:r.state.profiles.map(e=>e.id)};
 },{event,fresh,proof,newer});assert.deepEqual(result,{admitted:false,ids:[event.id],profiles:[newer.id]});
});
test('queued admission rechecks proof expiry at the transaction boundary',async t=>{
 await setup(t);const fresh=sign({content:'expires before persistence'});
 const result=await page.evaluate(async({event,fresh,proof,now})=>{
  const s=new api.FeedStore('commit-expiry');await s.restore();await s.accept(event,proof);
  let release;s.queue=new Promise(r=>release=r);const accepting=s.accept(fresh,proof);Date.now=()=>1000*(now+301);release();await accepting;
  const r=new api.FeedStore('commit-expiry');await r.restore();return r.events().map(e=>e.id);
 },{event,fresh,proof,now});assert.deepEqual(result,[event.id]);
});
test('queued regrant rechecks proof expiry without discarding the durable revocation',async t=>{
 await setup(t);
 const result=await page.evaluate(async({event,proof,now})=>{
  const s=new api.FeedStore('grant-expiry');await s.restore();await s.accept(event,proof);await s.merge({revoked:[event.pubkey],checkedAt:now});Date.now=()=>1000*(now+2);
  let release;s.queue=new Promise(r=>release=r);const granting=s.merge({identities:[[event.pubkey,{proof:{...proof,checkedAt:now+2}}]]});Date.now=()=>1000*(now+303);release();await granting;
  const r=new api.FeedStore('grant-expiry');await r.restore();return r.events();
 },{event,proof,now});assert.deepEqual(result,[]);
});
test('recovery retains memory-only revocation when a stale grant is rejected by disk profile highwater',async t=>{
 await setup(t);const newer=sign({kind:0,created_at:now-1,content:profile.content});
 const result=await page.evaluate(async({event,proof,newer,now})=>{
  const a=new api.FeedStore('blocked-decisions'),b=new api.FeedStore('blocked-decisions');await a.restore();await a.accept(event,proof);await b.restore();
  a.blocked=true;await a.merge({revoked:[event.pubkey],checkedAt:now});await b.merge({profiles:[newer]});Date.now=()=>1000*(now+2);
  await a.merge({identities:[[event.pubkey,{proof:{...proof,checkedAt:now+2}}]]});await a.recover();
  const r=new api.FeedStore('blocked-decisions');await r.restore();return r.events();
 },{event,proof,newer,now});assert.deepEqual(result,[]);
});
test('corrupt decision evidence latches recovery and preserves the exact stored generation',async t=>{
 await setup(t);
 const result=await page.evaluate(async({event,proof})=>{
  const s=new api.FeedStore('corrupt-grant');await s.restore();await s.accept(event,proof);
  const value=structuredClone(s.state);value.decisions=[{pubkey:event.pubkey,revoked:false,checkedAt:proof.checkedAt,proof:{...proof,mapping:{names:{}}}}];const db=await s.db();
  await new Promise(r=>{const tx=db.transaction('generations','readwrite');tx.objectStore('generations').put(value,'accepted');tx.oncomplete=r;});
  const r=new api.FeedStore('corrupt-grant');const restored=await r.restore();await r.accept(event,proof);await r.recover();
  const saved=await new Promise(r=>{const q=db.transaction('generations').objectStore('generations').get('accepted');q.onsuccess=()=>r(q.result);});return {restored,blocked:r.blocked,unchanged:JSON.stringify(saved)===JSON.stringify(value)};
 },{event,proof});assert.deepEqual(result,{restored:false,blocked:true,unchanged:true});
});
test('signed deletion before target survives restart and newer revision never replays',async t=>{
 await setup(t);
 const newer=sign({kind:31923,created_at:now-5,tags:[['d','walk']],content:'newer'});
 const older=sign({kind:31923,created_at:now-10,tags:[['d','walk']],content:'older'});
 const deletion=sign({kind:5,tags:[['e',newer.id]]});
 const result=await page.evaluate(async ({newer,older,deletion,proof})=>{
  const s=new api.FeedStore('delete');await s.restore();await s.remove([deletion]);
  const r=new api.FeedStore('delete');await r.restore();await r.accept(newer,proof);await r.accept(older,proof);
  const last=new api.FeedStore('delete');await last.restore();return last.events();
 },{newer,older,deletion,proof});
 assert.deepEqual(result,[]);
});
test('blocked corrupt generation preserves bytes then recovery merges memory and restrictions',async t=>{
 await setup(t);
 const fresh=sign({content:'fresh'});
 const result=await page.evaluate(async ({event,fresh,proof})=>{
  const s=new api.FeedStore('recover');await s.restore();await s.accept(event,proof);
  const db=await s.db();const original=structuredClone(s.state);
  await new Promise(r=>{const tx=db.transaction('generations','readwrite');tx.objectStore('generations').put({version:999},'accepted');tx.oncomplete=r;});
  const broken=new api.FeedStore('recover');await broken.restore();await broken.accept(fresh,proof);
  const saved=await new Promise(r=>{const q=db.transaction('generations').objectStore('generations').get('accepted');q.onsuccess=()=>r(q.result);});
  await new Promise(r=>{const tx=db.transaction('generations','readwrite');tx.objectStore('generations').put(original,'accepted');tx.oncomplete=r;});
  await broken.recover(); const restored=new api.FeedStore('recover');await restored.restore();
  return {saved,ids:restored.events().map(e=>e.id).sort()};
 },{event,fresh,proof});
 assert.equal(result.saved.version,999);assert.deepEqual(result.ids,[event.id,fresh.id].sort());
});
test('atomic sync merge retains history on failed renewal but authoritative mismatch revokes',async t=>{
 await setup(t);
 const newer=sign({created_at:now-1,content:'new'});
 const result=await page.evaluate(async ({event,newer,proof})=>{
  const s=new api.FeedStore('merge');await s.restore();await s.accept(event,proof);
  await s.merge({events:[newer],profiles:[proof.profile],identities:[],removals:[],revoked:[],coverage:{latest:10}});
  const ids=s.events().map(e=>e.id);
  await s.merge({events:[],profiles:[],identities:[],removals:[],revoked:[event.pubkey]});
  const r=new api.FeedStore('merge');await r.restore();return {ids,revoked:r.events()};
 },{event,newer,proof});
 assert.deepEqual(result.ids,[event.id]);assert.deepEqual(result.revoked,[]);
});
test('latest refresh preserves completed older cursor and loaded history through failure',async t=>{
 await setup(t);const newer=sign({created_at:now-1,content:'head'});
 const result=await page.evaluate(async ({event,newer,profile,proof,now})=>{
  const store=new api.FeedStore('sync');await store.restore();
  let head=false,fail=false;const requests=[];
  const relay={open:async()=>{},close(){},query:async filters=>{
   requests.push(filters);if(fail)throw Error('offline');const f=filters[0];
   if(f.kinds?.includes(0))return [profile];if(f.kinds?.includes(5))return [];
   if(f.kinds?.includes(1))return head?[newer]:[event];return [];
  }};
  const sync=new api.FeedSync(store,{relay:()=>relay,identify:async()=>({proof}),now:()=>now});
  await sync.run();const boundary=store.state.coverage.older;
  head=true;await sync.run();fail=true;await sync.run().catch(()=>{});
  return {ids:store.events().map(e=>e.id).sort(),boundary,after:store.state.coverage.older,requests};
 },{event,newer,profile,proof,now});
 assert.deepEqual(result.ids,[event.id,newer.id].sort());assert.deepEqual(result.boundary,result.after);
 assert.ok(result.requests.some(fs=>fs[0].since!==undefined));
});
test('document fixture isolates HTTP with a genuine installed service worker controller',async t=>{
 await setup(t);
 // A network fallback is denied as well; it must never substitute for the
 // document boundary (which is effective even under worker control).
 const external=[];
 await page.context().route(/^https?:\/\//,route=>{
  if(new URL(route.request().url()).origin===new URL(page.url()).origin)return route.continue();
  external.push(route.request().url());return route.abort();
 });
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;});
 await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
 const result=await page.evaluate(async()=>{
  const blocked=await fetch('https://fixture-denied.invalid/unapproved').then(()=>null,e=>e.message);
  if(!blocked?.startsWith('External fixture request blocked '))return {blocked};
  const mapping=await (await fetch('https://trailscoffee.com/.well-known/nostr.json?name=new.handle')).json();
  const directory=await (await fetch('https://trailscoffee.com/.well-known/nostr.json')).json();
  const payment=await fetch('https://pay.trailscoffee.com/lnurlp/fixture').then(()=>null,e=>e.message);
  return {blocked,mapping,directory,payment};
 });
 assert.match(result.blocked,/^External fixture request blocked /);
 assert.deepEqual(result.mapping,proof.mapping);assert.deepEqual(result.directory,proof.mapping);
 assert.match(result.payment,/^External fixture request blocked /);
 assert.deepEqual(external,[],'document fixtures must not dispatch external HTTP requests');
});
test('shipping app cold reload restores before failed relay refresh',async t=>{
 await setup(t);let online=true;const context=page.context();
 await context.routeWebSocket(/wss:\/\/.*/,ws=>{
  if(!online){ws.close();return;}
  ws.onMessage(raw=>{const m=JSON.parse(raw);if(m[0]!=='REQ')return;const f=m[2];const rows=f.kinds?.includes(0)?[profile]:f.kinds?.includes(1)?[event]:[];
   for(const e of rows)ws.send(JSON.stringify(['EVENT',m[1],e]));ws.send(JSON.stringify(['EOSE',m[1]]));});
 });
 await page.goto(new URL('/index.html',page.url()).href);await page.locator(`[data-event-id="${event.id}"]`).waitFor().catch(async error=>{throw Error(error.message+' STATUS '+await page.locator('#status').innerText()+' DB '+await page.evaluate(()=>new Promise(r=>{const q=indexedDB.open('anmore-accepted-v1');q.onsuccess=()=>{const a=q.result.transaction('generations').objectStore('generations').get('accepted');a.onsuccess=()=>r(JSON.stringify(a.result));};})));});
 await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 online=false;await page.reload();
 await page.locator(`[data-event-id="${event.id}"]`).waitFor({timeout:3000});
 await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 assert.match(await page.locator('#status').innerText(),/last checked|retained|stale/i);
 await page.locator('#refresh').click();await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 assert.equal(await page.locator('[data-event-id]').count(),1);
 await page.waitForFunction(()=>navigator.serviceWorker.controller?.state==='activated');
 // Playwright WebKit's context.setOffline intercepts even SW-served navigation
 // with an internal error (the same fixture passes in Chromium). Cut the actual
 // origin transport instead, prove it fails outside SW, then cold-open a page.
 const launchURL=page.url();
 fixtureOffline=true;
 await assert.rejects(()=>context.request.get(launchURL,{timeout:3000,maxRetries:0}));
 if(process.env.DURABLE_BROWSER!=='webkit')await context.setOffline(true);
 await page.close();page=await context.newPage();await page.goto(launchURL);
 await page.locator(`[data-event-id="${event.id}"]`).waitFor({timeout:3000});
 assert.match(await page.locator('#status').innerText(),/offline|stale|last checked/i);
 const generation=await page.evaluate(()=>new Promise(resolve=>{const q=indexedDB.open('anmore-accepted-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('generations','readwrite'),s=tx.objectStore('generations'),r=s.get('accepted');let value;r.onsuccess=()=>{value=r.result;s.put({version:999},'accepted');};tx.oncomplete=()=>{db.close();resolve(value);};};}));
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 assert.match(await page.locator('#status').innerText(),/writes blocked/);
 await page.evaluate(generation=>new Promise(resolve=>{const q=indexedDB.open('anmore-accepted-v1');q.onsuccess=()=>{const db=q.result,tx=db.transaction('generations','readwrite');tx.objectStore('generations').put(generation,'accepted');tx.oncomplete=()=>{db.close();resolve();};};}),generation);
 await page.locator('#refresh').click();await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
 await page.locator(`[data-event-id="${event.id}"]`).waitFor({timeout:3000});
});
test('two stale IndexedDB owners union duplicate receipt sources without replacing authenticated evidence on cold restore',async t=>{
 await setup(t);
 const community=JSON.parse(JSON.stringify(finalizeEvent({kind:0,created_at:now-100,tags:[],content:JSON.stringify({nip05:'community@trailscoffee.com',lud16:COMMUNITY_ADDRESS})},keys.recipient)));
 const issuer=finalizeEvent({kind:1,created_at:now-100,tags:[],content:''},keys.issuer).pubkey;
 const authority={recipient:community.pubkey,issuer,profileId:community.id,checkedAt:now,evidence:{profile:community,mapping:{names:{community:community.pubkey}},endpoint:{tag:'payRequest',allowsNostr:true,nostrPubkey:issuer,callback:PAY_CALLBACK}}};
 const description=JSON.stringify(finalizeEvent({kind:9734,created_at:now-100,tags:[['e',event.id],['p',community.pubkey],['amount','21000']],content:''},keys.sender));
 const receipt=JSON.parse(JSON.stringify(finalizeEvent({kind:9735,created_at:now-10,tags:[['e',event.id],['p',community.pubkey],['description',description],['bolt11',invoice(description,{msats:21000n,time:now-50,expiry:1000,paymentHash:'42'.repeat(32)})]],content:''},keys.issuer)));
 const result=await page.evaluate(async({event,proof,authority,receipt})=>{
  const a=new api.FeedStore('duplicate-provenance'),b=new api.FeedStore('duplicate-provenance');
  await a.restore();await a.accept(event,proof);await b.restore();
  await a.addReceipts([receipt],authority,new Map([[receipt.id,new Set(['wss://relay.anmore.me'])]]));
  const original=structuredClone(a.state.receipts[0]);
  // Both authorities authenticate the same claim, but the first retained evidence
  // must remain immutable rather than being replaced by the stale owner's copy.
  await b.addReceipts([receipt],{...authority,checkedAt:authority.checkedAt-1},new Map([[receipt.id,new Set(['wss://relay.primal.net'])]]));
  const afterStaleOwner=structuredClone(b.state.receipts[0]);
  await a.save();
  a.connection.close();b.connection.close();
  const r=new api.FeedStore('duplicate-provenance');const restored=await r.restore();
  return {restored,count:r.state.receipts.length,sources:r.state.receipts[0].sources.slice().sort(),event:r.state.receipts[0].event,authority:r.state.receipts[0].authority,original,afterStaleOwner,total:String(r.receiptTotals().get(event.id))};
 },{event,proof,authority,receipt});
 assert.equal(result.restored,true);assert.equal(result.count,1);
 assert.deepEqual(result.sources,['wss://relay.anmore.me','wss://relay.primal.net']);
 assert.deepEqual(result.afterStaleOwner.sources.slice().sort(),result.sources);
 assert.deepEqual(result.afterStaleOwner.event,result.original.event);assert.deepEqual(result.afterStaleOwner.authority,result.original.authority);
 assert.deepEqual(result.event,result.original.event);assert.deepEqual(result.authority,result.original.authority);
 assert.equal(result.total,'21000');
});
test('verified receipt ledger restores provenance and suppresses replay conflicts before periods',async t=>{
 await setup(t);
 const community=JSON.parse(JSON.stringify(finalizeEvent({kind:0,created_at:now-100,tags:[],content:JSON.stringify({nip05:'community@trailscoffee.com',lud16:COMMUNITY_ADDRESS})},keys.recipient)));
 const issuer=finalizeEvent({kind:1,created_at:now-100,tags:[],content:''},keys.issuer).pubkey;
 const authority={recipient:community.pubkey,issuer,profileId:community.id,checkedAt:now,evidence:{profile:community,mapping:{names:{community:community.pubkey}},endpoint:{tag:'payRequest',allowsNostr:true,nostrPubkey:issuer,callback:PAY_CALLBACK,minSendable:1000,maxSendable:1000000}}};
 const make=(target,amount)=>{const request=finalizeEvent({kind:9734,created_at:now-100,tags:[['e',target.id],['p',community.pubkey],['amount',String(amount)]],content:''},keys.sender);const description=JSON.stringify(request);return JSON.parse(JSON.stringify(finalizeEvent({kind:9735,created_at:now-10,tags:[['e',target.id],['p',community.pubkey],['description',description],['bolt11',invoice(description,{msats:BigInt(amount),time:now-50,expiry:1000,paymentHash:'ab'.repeat(32)})]],content:''},keys.issuer)));};
 const other=sign({content:'other'}),a=make(event,21000),b=make(other,22000);
 const result=await page.evaluate(async ({event,other,proof,a,b,authority})=>{
  const s=new api.FeedStore('ledger');await s.restore();await s.accept(event,proof);await s.accept(other,proof);
  await s.addReceipts([a],authority,new Map([[a.id,new Set(['wss://relay.anmore.me'])]]));
  const r=new api.FeedStore('ledger');await r.restore();const before=String(r.receiptTotals().get(event.id));
  await r.addReceipts([b,a],authority,new Map([[b.id,new Set(['wss://relay.primal.net'])]]));
  const last=new api.FeedStore('ledger');await last.restore();return {before,after:last.receiptTotals().size,count:last.state.receipts.length,source:last.state.receipts[0].sources};
 },{event,other,proof,a,b,authority});
 assert.equal(result.before,'21000');assert.equal(result.after,0);assert.equal(result.count,2);assert.ok(result.source.includes('wss://relay.anmore.me'));
});
test('older EOSE advances inclusive boundary without head refresh changing it; failed page keeps it',async t=>{
 await setup(t);
 const rows=Array.from({length:30},(_,i)=>sign({created_at:now-30-i,content:'row '+i}));
 const result=await page.evaluate(async ({rows,proof,profile,now})=>{
  const s=new api.FeedStore('older');await s.restore();s.state.coverage.older={until:now-30,limit:12};let failed=false;
  const relay={open:async()=>{},close(){},query:async ([f])=>{if(failed)throw Error('interrupted');if(f.kinds.includes(0))return [profile];if(f.kinds.includes(5))return [];if(f.kinds.includes(1))return rows.filter(e=>e.created_at<=f.until).slice(0,f.limit);return [];}};
  const sync=new api.FeedSync(s,{relay:()=>relay,identify:async()=>({proof}),now:()=>now});
  await sync.run({older:true});const completed=structuredClone(s.state.coverage.older);failed=true;await sync.run({older:true}).catch(()=>{});
  return {completed,after:s.state.coverage.older,count:s.events().length};
 },{rows,proof,profile,now});
 assert.equal(result.completed.until,now-41);assert.equal(result.completed.limit,13);assert.deepEqual(result.after,result.completed);assert.equal(result.count,12);
});
test('concurrent browser owners merge accepted generations without losing either post',async t=>{
 await setup(t);const other=sign({content:'other owner'});
 const ids=await page.evaluate(async ({event,other,proof})=>{
  const a=new api.FeedStore('tabs'),b=new api.FeedStore('tabs');await a.restore();await b.restore();
  await Promise.all([a.accept(event,proof),b.accept(other,proof)]);
  const r=new api.FeedStore('tabs');await r.restore();return r.events().map(e=>e.id).sort();
 },{event,other,proof});assert.deepEqual(ids,[event.id,other.id].sort());
});
test('deleted newer candidate restricts older calendar even without reusable identity proof',async t=>{
 await setup(t);const older=sign({kind:31923,created_at:now-10,tags:[['d','walk']]});const newer=sign({kind:31923,created_at:now-5,tags:[['d','walk']]});const deletion=sign({kind:5,tags:[['e',newer.id]]});
 const result=await page.evaluate(async({older,newer,deletion,proof})=>{
  const s=new api.FeedStore('heads');await s.restore();await s.accept(older,proof);await s.merge({events:[newer],removals:[deletion]});
  const r=new api.FeedStore('heads');await r.restore();return r.events();
 },{older,newer,deletion,proof});assert.deepEqual(result,[]);
});
test('historical evidence is not reusable current author authority for new admission',async t=>{
 await setup(t);
 const result=await page.evaluate(async ({event,proof})=>{
  const s=new api.FeedStore('expiry');await s.restore();const old={...proof,checkedAt:proof.checkedAt-301};
  return {accepted:await s.accept(event,old),ids:s.events().map(e=>e.id)};
 },{event,proof});assert.equal(result.accepted,false);assert.deepEqual(result.ids,[]);
});
test('retired callbacks cannot commit or clear a successor single-flight owner',async t=>{
 await setup(t);const fresh=sign({content:'successor'});
 const result=await page.evaluate(async ({event,fresh,proof,profile,now})=>{
  const s=new api.FeedStore('fences');await s.restore();let release,entered;const start=new Promise(r=>entered=r);let count=0;
  const sync=new api.FeedSync(s,{now:()=>now,identify:async()=>({proof}),relay:()=>{
   const first=++count===1;return {open:async()=>{},close(){},query:async([f])=>{if(f.kinds.includes(1)){if(first){entered();return new Promise(r=>release=r);}return [fresh];}if(f.kinds.includes(0))return [profile];return [];}};
  }});
  const old=sync.run().catch(()=>{});await start;sync.cancel();const next=sync.run();const same=next===sync.run();
  release([event]);await old;await next;return {same,count,ids:s.events().map(e=>e.id)};
 },{event,fresh,proof,profile,now});assert.equal(result.count,2);assert.equal(result.same,true);assert.deepEqual(result.ids,[fresh.id]);
});
test('unrelated same-signer tombstones remain bounded across durable merges',async t=>{
 await setup(t);const removals=Array.from({length:140},(_,i)=>sign({kind:5,tags:[['e',i.toString(16).padStart(64,'0')]],content:''}));
 const count=await page.evaluate(async({event,proof,removals})=>{
  const s=new api.FeedStore('bounded');await s.restore();await s.accept(event,proof);
  await s.remove(removals.slice(0,100));await s.remove(removals.slice(100));
  const r=new api.FeedStore('bounded');await r.restore();return r.state.removals.length;
 },{event,proof,removals});assert.ok(count<=128);
});
test('signed receipt removal cannot make a conflicting payment hash replay eligible',async t=>{
 await setup(t);
 // The existing ledger test verifies authenticated claims. Here the same browser
 // production verifier receives a deleted claim and its conflicting reissue.
 const community=JSON.parse(JSON.stringify(finalizeEvent({kind:0,created_at:now-100,tags:[],content:JSON.stringify({nip05:'community@trailscoffee.com',lud16:COMMUNITY_ADDRESS})},keys.recipient)));
 const issuer=finalizeEvent({kind:1,created_at:now-100,tags:[],content:''},keys.issuer).pubkey;
 const authority={recipient:community.pubkey,issuer,profileId:community.id,checkedAt:now,evidence:{profile:community,mapping:{names:{community:community.pubkey}},endpoint:{tag:'payRequest',allowsNostr:true,nostrPubkey:issuer,callback:PAY_CALLBACK}}};
 const other=sign({content:'other claim'});
 const make=(target,amount)=>{const description=JSON.stringify(finalizeEvent({kind:9734,created_at:now-100,tags:[['e',target.id],['p',community.pubkey],['amount',String(amount)]],content:''},keys.sender));return JSON.parse(JSON.stringify(finalizeEvent({kind:9735,created_at:now-10,tags:[['e',target.id],['p',community.pubkey],['description',description],['bolt11',invoice(description,{msats:BigInt(amount),time:now-50,expiry:1000,paymentHash:'cd'.repeat(32)})]],content:''},keys.issuer)));};
 const a=make(event,21000),b=make(other,22000),del=JSON.parse(JSON.stringify(finalizeEvent({kind:5,created_at:now-1,tags:[['e',a.id]],content:''},keys.issuer)));
 const size=await page.evaluate(async({event,other,proof,authority,a,b,del})=>{const s=new api.FeedStore('receipt-removal');await s.restore();await s.accept(event,proof);await s.accept(other,proof);await s.addReceipts([a,b],authority);await s.remove([del]);const r=new api.FeedStore('receipt-removal');await r.restore();const single=new api.FeedStore('single-removed');await single.restore();await single.accept(event,proof);await new api.FeedSync(single).commitReceipts({receipts:[a],provenance:new Map()},authority,{query:async()=>[del]});const restored=new api.FeedStore('single-removed');await restored.restore();const late=new api.FeedStore('late-receipt-removal');await late.restore();await late.accept(event,proof);await late.addReceipts([a],authority);const wire={open:async()=>{},close(){},query:async([f])=>f.kinds.includes(0)?[proof.profile]:f['#e']?.includes(a.id)?[del]:[]};await new api.FeedSync(late,{relay:()=>wire,identify:async()=>({proof})}).run();return {conflict:r.receiptTotals().size,single:restored.receiptTotals().size,late:late.receiptTotals().size};},{event,other,proof,authority,a,b,del});assert.deepEqual(size,{conflict:0,single:0,late:0});
});
test('historical deletion reads use exact targets so unrelated history cannot starve removal',async t=>{
 await setup(t);const deletion=sign({kind:5,tags:[['e',event.id]]});
 const result=await page.evaluate(async({event,profile,proof,deletion,now})=>{
  const s=new api.FeedStore('exact-removal');await s.restore();await s.accept(event,proof);const requests=[];
  const relay={open:async()=>{},close(){},query:async fs=>{requests.push(fs);const f=fs[0];if(f.kinds.includes(1))return [];if(f.kinds.includes(0))return [profile];if(f.kinds.includes(5))return f['#e']?.includes(event.id)?[deletion]:[];return [];}};
  const sync=new api.FeedSync(s,{relay:()=>relay,identify:async()=>({proof}),now:()=>now});await sync.run();return {ids:s.events(),exact:requests.some(fs=>fs.some(f=>f['#e']?.includes(event.id)))};
 },{event,profile,proof,deletion,now});assert.equal(result.exact,true);assert.deepEqual(result.ids,[]);
});
test('fresh exact mapping can restore eligibility after authoritative withdrawal without human approval',async t=>{
 await setup(t);const next=sign({content:'revalidated'});
 const ids=await page.evaluate(async({event,next,proof})=>{
  const s=new api.FeedStore('reapprove');await s.restore();await s.accept(event,proof);await s.merge({revoked:[event.pubkey],checkedAt:proof.checkedAt});
  const time=(proof.checkedAt+2)*1000;Date.now=()=>time;
  await s.merge({events:[next],identities:[[event.pubkey,{proof:{...proof,checkedAt:proof.checkedAt+2}}]],checkedAt:proof.checkedAt+2});
  const r=new api.FeedStore('reapprove');await r.restore();return r.events().map(e=>e.id).sort();
 },{event,next,proof});assert.deepEqual(ids,[event.id,next.id].sort());
});
test('failed first identity lookup retries held signed candidate on later lifecycle sync',async t=>{
 await setup(t);
 const result=await page.evaluate(async({event,profile,proof,now})=>{
  const s=new api.FeedStore('pending');await s.restore();let round=0,available=false;
  const relay={open:async()=>{},close(){},query:async([f])=>f.kinds.includes(1)?(++round===1?[event]:[]):f.kinds.includes(0)?[profile]:[]};
  const sync=new api.FeedSync(s,{relay:()=>relay,now:()=>now,identify:async()=>{if(!available)throw Error('identity timeout');return {proof};}});
  await sync.run();const before=s.events().length;available=true;await sync.run();return {before,ids:s.events().map(e=>e.id)};
 },{event,profile,proof,now});assert.equal(result.before,0);assert.deepEqual(result.ids,[event.id]);
});
test('real IndexedDB aborted write preserves prior disk generation and memory plus visible warning',async t=>{
 await setup(t);const large=sign({content:'x'.repeat(90000)});
 const result=await page.evaluate(async({event,large,proof})=>{
  const s=new api.FeedStore('write-abort');await s.restore();await s.accept(event,proof);
  const db=s.connection;
  s.connection={transaction(...args){const tx=db.transaction(...args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;}};
  await s.accept(large,proof);const memory=s.events().length,warning=s.warning;
  const r=new api.FeedStore('write-abort');await r.restore();const disk=r.events().length;
  s.connection=db;await s.save();const recovered=new api.FeedStore('write-abort');await recovered.restore();
  return {memory,warning,disk,recovered:recovered.events().length};
 },{event,large,proof});
 assert.equal(result.memory,2);assert.equal(result.disk,1);assert.match(result.warning,/memory-only/);assert.equal(result.recovered,2);
});
test('real aborted read latches writes and recovery preserves restrictive memory decisions',async t=>{
 await setup(t);const other=sign({content:'during unreadability'});
 const result=await page.evaluate(async({event,other,proof})=>{
  const original=new api.FeedStore('read-abort');await original.restore();await original.accept(event,proof);const db=original.connection;
  const s=new api.FeedStore('read-abort');s.connection={transaction(...args){const tx=db.transaction(...args),getStore=tx.objectStore.bind(tx);tx.objectStore=(name)=>{const store=getStore(name),get=store.get.bind(store);store.get=(key)=>{const request=get(key);request.addEventListener('success',()=>tx.abort());return request;};return store;};return tx;}};
  const read=await s.restore();await s.accept(other,proof);await s.merge({revoked:[event.pubkey],checkedAt:proof.checkedAt});
  const untouched=new api.FeedStore('read-abort');await untouched.restore();const disk=untouched.events().length;
  s.connection=db;await s.recover();const r=new api.FeedStore('read-abort');await r.restore();return {read,disk,ids:r.events(),accepted:r.state.accepted.length};
 },{event,other,proof});assert.equal(result.read,false);assert.equal(result.disk,1);assert.equal(result.accepted,2);assert.deepEqual(result.ids,[]);
});
test('durable evidence stores canonical signed fields only, never relay extras',async t=>{
 await setup(t);const result=await page.evaluate(async({event,proof})=>{const s=new api.FeedStore('canonical');await s.restore();await s.accept({...event,indexed_at:99,invoice:'untrusted extra'},proof);const r=new api.FeedStore('canonical');await r.restore();return Object.keys(r.state.accepted[0].event).sort();},{event,proof});assert.deepEqual(result,['content','created_at','id','kind','pubkey','sig','tags']);
});
test('retained calendar addresses refresh newest revision even outside latest calendar page',async t=>{
 await setup(t);const older=sign({kind:31923,created_at:now-50,tags:[['d','walk']],content:'old walk'}),newer=sign({kind:31923,created_at:now-10,tags:[['d','walk']],content:'new walk'});
 const result=await page.evaluate(async({older,newer,profile,proof,now})=>{
  const s=new api.FeedStore('calendar-head');await s.restore();await s.accept(older,proof);
  const wire={open:async()=>{},close(){},query:async([f])=>f['#d']?[newer]:f.kinds.includes(0)?[profile]:[]};
  await new api.FeedSync(s,{relay:()=>wire,identify:async()=>({proof}),now:()=>now}).run();const r=new api.FeedStore('calendar-head');await r.restore();return r.events().map(e=>e.id);
 },{older,newer,profile,proof,now});assert.deepEqual(result,[newer.id]);
});
test('receipt target windows rotate durably instead of starving loaded posts beyond 1200',async t=>{
 await setup(t);
 const result=await page.evaluate(async()=>{
  const posts=Array.from({length:1300},(_,i)=>({id:i.toString(16).padStart(64,'0')}));
  const s=new api.FeedStore('receipt-fairness');await s.restore();const owner=new api.FeedSync(s);const first=owner.receiptTargets(posts);
  await owner.commitReceipts({receipts:[],provenance:new Map(),nextTargetOffset:first.nextTargetOffset},null,{});
  const r=new api.FeedStore('receipt-fairness');await r.restore();const second=new api.FeedSync(r).receiptTargets(posts);
  return {first:first.posts.length,second:second.posts.length,total:new Set([...first.posts,...second.posts].map(e=>e.id)).size};
 });assert.deepEqual(result,{first:1200,second:100,total:1300});
});
test('profile highwaters compact revisions without pruning historical event-bound evidence',async t=>{
 await setup(t);const profiles=Array.from({length:10},(_,i)=>sign({kind:0,created_at:now-15+i,content:JSON.stringify({nip05:'new.handle@trailscoffee.com',name:'revision '+i})}));
 const result=await page.evaluate(async({event,proof,profiles})=>{const s=new api.FeedStore('profile-heads');await s.restore();await s.accept(event,proof);await s.merge({profiles});const r=new api.FeedStore('profile-heads');await r.restore();return {profiles:r.state.profiles.map(e=>e.id),historical:r.state.accepted[0].proof.profile.id};},{event,proof,profiles});assert.deepEqual(result,{profiles:[profiles[9].id],historical:profile.id});
});
test('unaccepted profile quarantine is bounded without imposing an accepted-history cap',async t=>{
 await setup(t);const profiles=Array.from({length:520},(_,i)=>{const key=new Uint8Array(32);new DataView(key.buffer).setUint32(28,i+1);return JSON.parse(JSON.stringify(finalizeEvent({kind:0,created_at:now-20,tags:[],content:'{}'},key)));});
 const count=await page.evaluate(async profiles=>{const s=new api.FeedStore('profile-quarantine');await s.restore();await s.merge({profiles,revoked:profiles.map(e=>e.pubkey)});const r=new api.FeedStore('profile-quarantine');await r.restore();return {profiles:r.state.profiles.length,decisions:r.state.decisions.length};},profiles);assert.ok(count.profiles<=512);assert.ok(count.decisions<=512);
});
test('malformed completion cursors latch restore failure rather than silently overwriting history',async t=>{
 await setup(t);const result=await page.evaluate(async({event,proof})=>{const s=new api.FeedStore('bad-coverage');await s.restore();await s.accept(event,proof);const db=await s.db(),value=structuredClone(s.state);value.coverage.older={until:'not-a-timestamp',limit:12};await new Promise(r=>{const tx=db.transaction('generations','readwrite');tx.objectStore('generations').put(value,'accepted');tx.oncomplete=r;});const r=new api.FeedStore('bad-coverage');return {restored:await r.restore(),blocked:r.blocked};},{event,proof});assert.deepEqual(result,{restored:false,blocked:true});
});
test('inclusive timestamp ties and periodic backdated reconciliation do not move completed older cursor',async t=>{
 await setup(t);const tied=Array.from({length:25},(_,i)=>sign({created_at:now-20,content:'tie '+i}));const backdated=sign({created_at:now-1000,content:'late insertion'});
 const result=await page.evaluate(async({tied,backdated,profile,proof,now})=>{
  const s=new api.FeedStore('ties');await s.restore();let arrival=false;
  const requests=[];const wire={open:async()=>{},close(){},query:async([f])=>{requests.push(f);if(f.kinds.includes(0))return [profile];if(!f.kinds.includes(1))return [];return [...tied,...(arrival?[backdated]:[])].filter(e=>e.created_at<=f.until&&(f.since===undefined||e.created_at>=f.since)).slice(0,f.limit);}};
  const sync=new api.FeedSync(s,{relay:()=>wire,identify:async()=>({proof}),now:()=>now});
  await sync.run();await sync.run({older:true});await sync.run({older:true});const boundary=structuredClone(s.state.coverage.older);arrival=true;
  for(let i=0;i<4;i++)await sync.run();
  return {ids:s.events().map(e=>e.id).sort(),boundary,after:s.state.coverage.older,reconciled:requests.filter(f=>f.kinds.includes(1)&&f.since===undefined).length};
 },{tied,backdated,profile,proof,now});assert.deepEqual(result.ids,[...tied,backdated].map(e=>e.id).sort());assert.deepEqual(result.boundary,result.after);assert.ok(result.reconciled>3);
});
test('accepted history has no former 1200-item or age pruning ceiling across restart',async t=>{
 await setup(t);const events=Array.from({length:1205},(_,i)=>sign({created_at:i+1,content:'durable '+i}));
 const count=await page.evaluate(async({events,proof})=>{const s=new api.FeedStore('unpruned');await s.restore();await s.merge({events,identities:[[proof.profile.pubkey,{proof}]]});const r=new api.FeedStore('unpruned');await r.restore();return r.events().length;},{events,proof});assert.equal(count,1205);
});
test('real IndexedDB cold restore revalidates event-bound evidence and keeps history',async t=>{
 await setup(t);
 const result=await page.evaluate(async ({event,proof})=>{
  const store=new api.FeedStore('cold'); await store.restore(); await store.accept(event,proof);
  const restored=new api.FeedStore('cold');await restored.restore();
  return {ids:restored.events().map(e=>e.id),proof:restored.state.accepted[0].proof};
 },{event,proof});
 assert.deepEqual(result.ids,[event.id]);assert.deepEqual(result.proof,proof);
});
