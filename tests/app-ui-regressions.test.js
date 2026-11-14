import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import vm from 'node:vm';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { finalizeEvent } from 'nostr-tools/pure';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('src/app.js', root), 'utf8');
const executable = source.replace(/^import[\s\S]*?;\n/gm, '').replace(/startFeed\(\);\s*$/, 'globalThis.api={startFeed,load,resume,renderFeed,getState:()=>zapState};');
function harness(visibility = 'visible') {
  let time = 1000000, runs = 0, fail = false;
  const nodes = new Map(), listeners = {}, timers = [], trace = [];
  class Node {
    constructor() { this.dataset={}; this.attrs={}; this.children=[]; this.textContent=''; this.classList={toggle(){}}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children=nodes; this.replacements=(this.replacements||0)+1; }
    setAttribute(k,v) { this.attrs[k]=v; }
    addEventListener() {}
  }
  const node = id => { if(!nodes.has(id)) nodes.set(id,new Node()); return nodes.get(id); };
  const post={id:'paid',pubkey:'author',kind:1,created_at:100,content:'Retained',tags:[],sig:'fixture'};
  const ledger=[{sources:['fixture']}];
  const box={console,Map,Set,Intl,URL,Date:class extends Date { static now(){return time;} }, navigator:{onLine:true},
    document:{visibilityState:visibility,getElementById:node,createElement:()=>new Node(),createElementNS:()=>new Node(),createTextNode:text=>({textContent:text}),addEventListener:(k,f)=>listeners[k]=f},
    window:{addEventListener:(k,f)=>listeners[k]=f},setInterval:f=>timers.push(f),setupInstall(){},setupWorker(){},
    setupZaps:()=>({invalidate(){},open(){}}),postVideos:()=>[],withoutVideos:x=>x,tag:()=>'',safeURL:x=>x,RELAY:'fixture',sortPosts:x=>x,
    FeedStore:class { constructor(){this.state={receipts:ledger,coverage:{}};} async restore(){trace.push('restore');} events(){trace.push('project');return [post,{...post,id:'zero'}];} identities(){return new Map([['author',{name:'Synthetic',nip05:'synthetic@trailscoffee.com'}]]);} receiptTotals(){return new Map([['paid',1250000n]]);} },
    FeedSync:class { constructor(){this.epoch=0;} async run(){runs++;trace.push('network');if(fail)throw Error('content offline');return {completed:true};} receiptTargets(){return {posts:[],partial:false};} async commitReceipts(){} cancel(){} },
    Relay:class {async open(){} close(){}},resolveCommunity:async()=>({issuer:'fixture'}),collectReceipts:async()=>({partial:false,sources:['fixture']})};
  vm.createContext(box);vm.runInContext(executable,box);
  return {box,node,timers,listeners,trace,ledger,api:box.api,get runs(){return runs;},advance(){time+=61000;},fail(){fail=true;time+=61000;},settle:async()=>{for(let i=0;i<30;i++)await Promise.resolve();}};
}
function descendants(node) { return [node,...(node.children||[]).flatMap(descendants)]; }
test('content failure clears authority and labels retained amounts and Top provisional',async()=>{
  const h=harness();await h.api.startFeed();await h.settle();
  assert.equal(h.api.getState().snapshot.partial,false);assert.ok(h.api.getState().authority);
  h.fail();await h.api.resume();await h.settle();
  assert.equal(h.api.getState().authority,null);
  assert.equal(h.api.getState().snapshot.partial,true);
  assert.equal(h.ledger.length,1,'retain receipt evidence');
  const amounts=descendants(h.node('feed')).filter(n=>n.className==='zap-total');
  assert.equal(amounts[0].textContent,'1,250 sats · provisional');
  assert.match(amounts[0].attrs['aria-label'],/partial receipt check; totals\/order may change/);
  assert.equal(amounts[1].textContent,'—');assert.equal(amounts[1].attrs['aria-label'],'Zap total unavailable');
  assert.match(h.node('sort-note').textContent,/Partial receipt check · totals\/order may change/);
});
test('unchanged timer projection preserves feed nodes during throttled and identical sync passes',async()=>{
  const h=harness();await h.api.startFeed();await h.settle();
  const original=h.node('feed').children, first=original[0];
  first.open=true; // Stand-in for expanded details/focus/media state on retained DOM.
  h.timers[0]();await h.settle();
  assert.equal(h.node('feed').children,original);
  assert.equal(h.node('feed').children[0].open,true);
  h.advance();h.timers[0]();await h.settle();
  assert.equal(h.runs,2);assert.equal(h.node('feed').children,original,'Identical successful sync keeps all existing card nodes');
  h.advance(); // Suppress networking with an open payment dialog.
  h.node('zap-dialog').open=true;h.timers[0]();await h.settle();
  assert.equal(h.node('feed').children,original);assert.equal(h.runs,2);
});

test('saved-feed help and receipt disclosure describe durable provisional observations',async()=>{
  const html=await readFile(new URL('index.html',root),'utf8');
  assert.doesNotMatch(html,/No saved feed|lower bounds/i);
  assert.match(html,/saved (?:feed|updates)[\s\S]{0,160}offline/i);
  assert.match(html,/provisional[\s\S]{0,100}(?:totals|order) may change/i);
});

test('shipping app cold restores signed object/null/array profile names without crashing or erasing history',async t=>{
  // Default exercises the shipped artifact. Source-only mode lets independent
  // fixers verify without rewriting the shared generated root bundle.
  const [appBytes,api]=await Promise.all([
    process.env.APP_UI_SOURCE === '1'
      ? build({entryPoints:[new URL('src/app.js',root).pathname],bundle:true,write:false,format:'esm'}).then(b=>b.outputFiles[0].text)
      : readFile(new URL('app.js',root),'utf8'),
    build({stdin:{contents:'import {FeedStore} from "./src/feed-store.js";window.FeedStore=FeedStore;',resolveDir:root.pathname},bundle:true,write:false})
  ]);
  const server=http.createServer(async(req,res)=>{
    const path=new URL(req.url,'http://local').pathname;
    res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':'text/html');
    if(path==='/seed')return res.end('<script src="/api.js"></script>');
    if(path==='/api.js')return res.end(api.outputFiles[0].text);
    if(path==='/app.js')return res.end(appBytes);
    try{res.end(await readFile(new URL(path==='/'?'index.html':path.slice(1),root)));}catch{res.writeHead(404).end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  t.after(async()=>{await browser.close();await new Promise(r=>server.close(r));});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route(/^https:\/\//,r=>r.abort());
  await context.routeWebSocket(/wss:\/\/.*/,ws=>ws.close());
  await context.addInitScript(()=>{
    Object.defineProperty(navigator,'onLine',{get:()=>false});
    const original=setInterval;window.__minuteTimers=[];
    window.setInterval=(fn,ms,...args)=>{if(ms===60000)window.__minuteTimers.push(fn);return original(fn,ms,...args);};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin+'/seed');
  const now=Math.floor(Date.now()/1000);
  const fixtures=[{toString:null},null,[]].map((display_name,i)=>{
    const key=new Uint8Array(32).fill(17+i);
    const sign=x=>JSON.parse(JSON.stringify(finalizeEvent({kind:1,created_at:now-20-i,tags:[],content:'Synthetic long update. '.repeat(45)+'\nhttps://example.com/video.mp4',...x},key)));
    const profile=sign({kind:0,content:JSON.stringify({nip05:`synthetic${i}@trailscoffee.com`,display_name,name:display_name})});
    return {event:sign({}),proof:{profile,mapping:{names:{['synthetic'+i]:profile.pubkey}},checkedAt:now}};
  });
  assert.equal(await page.evaluate(async fixtures=>{const s=new FeedStore();await s.restore();for(const f of fixtures)await s.accept(f.event,f.proof);return s.state.accepted.length;},fixtures),3);
  for(let pass=0;pass<2;pass++){
    await page.goto(origin+'/index.html');
    await page.waitForFunction(()=>document.querySelectorAll('.post').length===3,{},{timeout:3000}).catch(error=>{throw Error(`${error.message}; page errors: ${errors.join('; ')}`);});
    assert.deepEqual(await page.locator('.post').evaluateAll(nodes=>nodes.map(n=>n.dataset.eventId).sort()),fixtures.map(f=>f.event.id).sort());
    assert.deepEqual(await page.locator('.author strong').allTextContents(),['synthetic0','synthetic1','synthetic2']);
    assert.equal(await page.locator('#feed').getAttribute('aria-busy'),'false');
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>{
      const card=document.querySelector('.post'),details=card.querySelector('details'),video=card.querySelector('video'),button=card.querySelector('button');
      details.open=true;button.focus();window.scrollTo(0,500);const y=scrollY;
      for(const tick of window.__minuteTimers)tick();
      return card===document.querySelector('.post')&&details.open&&video===card.querySelector('video')&&document.activeElement===button&&scrollY===y;
    }),true,'unchanged minute tick preserves real DOM details/focus/video/scroll');
  }
  await page.goto(origin+'/seed');
  assert.equal(await page.evaluate(async()=>{const s=new FeedStore();await s.restore();return s.state.accepted.length;}),3);
});

test('hidden cold startup restores immediately without networking until visible',async()=>{
  const h=harness('hidden');await h.api.startFeed();await h.settle();
  assert.equal(h.node('feed').children.length,2);assert.deepEqual(h.trace.slice(0,2),['restore','project']);
  assert.equal(h.runs,0);
  h.box.document.visibilityState='visible';h.listeners.visibilitychange();await h.settle();assert.equal(h.runs,1);
});
