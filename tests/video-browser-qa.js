import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { finalizeEvent } from "nostr-tools/pure";
const live = process.argv.includes("--live");
const dir = new URL("../qa/", import.meta.url);
await mkdir(dir, { recursive: true });
const actual = live ? JSON.parse(await readFile(new URL("live-video-posts.json", dir)))[0] : null;
const key = new Uint8Array(32).fill(19), now = Math.floor(Date.now()/1000);
const sign = (v) => finalizeEvent({kind:1,created_at:now-5,tags:[],content:"",...v},key);
const profile = actual?.profile || sign({kind:0,content:JSON.stringify({name:"Video neighbour",nip05:"video@trailscoffee.com"})});
const firstURL = actual?.event.content.match(/https:\/\/\S+\.mp4/)[0] || "https://media.example/clip.mp4?token=A%2FB&case=Keep";
const posts = actual ? [actual.event] : [
  sign({content:`A local moment.\n${firstURL}\nSource: https://facebook.com/stories/123`}),
  sign({created_at:now-6,content:"Another clip",tags:[["imeta","url https://media.example/second.mp4","m video/mp4","alt A village walk"]]}),
  sign({created_at:now-7,content:'<video src="https://media.example/injected.mp4" autoplay> https://localhost/private.mp4 https://user:pass@media.example/private.mp4 https://media.example:444/private.mp4 https://media.example./private.mp4 javascript:alert(1)'}),
];
const browser = process.argv.includes("--webkit") ? await webkit.launch() : await chromium.launch({executablePath:process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
// WebKit's worker-controlled media requests bypass Playwright route mocking.
// Keep fixture playback deterministic as documented by Playwright; actual worker
// install/offline/update/migration is exercised separately in sw-browser-qa.js.
const context = await browser.newContext(process.argv.includes("--webkit") ? {serviceWorkers:"block"} : {});
const requests=[], errors=[], violations=[];
await context.route("**/*", async route => {
  const url = route.request().url(); requests.push({url,type:route.request().resourceType()});
  if (url.startsWith("http://127.0.0.1:")) return route.continue();
  if (url.startsWith("https://trailscoffee.com/.well-known/nostr.json?name=")) return route.fulfill({json:{names:{[actual?.identity.nip05.split("@")[0] || "video"]:profile.pubkey}}});
  if (url.startsWith("https://media.example/clip.mp4") || url === "https://media.example/second.mp4") return route.fulfill({contentType:"video/mp4",body:await readFile(new URL("fixtures/community-video.mp4",import.meta.url))});
  if(live && url===firstURL) return route.continue();
  return route.abort();
});
await context.routeWebSocket("wss://relay.anmore.me", ws => ws.onMessage(raw=>{
  const m=JSON.parse(raw); assert.ok(["REQ","CLOSE"].includes(m[0])); if(m[0]!=="REQ")return;
  const selected=new Map();
  for(const f of m.slice(2)) for(const e of [profile,...posts].filter(e=>(!f.kinds||f.kinds.includes(e.kind))&&(!f.authors||f.authors.includes(e.pubkey))&&(!f.ids||f.ids.includes(e.id))).slice(0,f.limit)) selected.set(e.id,e);
  for(const e of selected.values())ws.send(JSON.stringify(["EVENT",m[1],e]));ws.send(JSON.stringify(["EOSE",m[1]]));
}));
const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
await page.addInitScript(()=>document.addEventListener("securitypolicyviolation",e=>(window.__csp ||= []).push({directive:e.effectiveDirective,blocked:e.blockedURI,source:e.sourceFile,line:e.lineNumber,sample:e.sample})));
try {
  await page.goto(process.env.QA_URL || "http://127.0.0.1:4173");
  await page.waitForFunction(()=>document.querySelector("#feed").getAttribute("aria-busy")==="false");
  assert.equal(await page.locator(".post-video video").count(),live?1:2,"Direct post media must render inline native players");
  assert.equal(await page.locator(".post img").count(),0,"Video imeta must not become broken images");
  assert.equal(await page.locator(".post-body").first().innerText().then(t=>t.includes(firstURL)),false);
  assert.match(await page.locator(".post-body").first().innerText(),/Facebook story|Source:/);
  assert.equal(await page.locator(".post iframe,.post script,video[autoplay],video[loop]").count(),0);
  assert.equal(requests.filter(r=>r.type==="media").length,0,"preload none prevents eager media downloads");
  const video=page.locator("video").first();
  const attrs=await video.evaluate(e=>({controls:e.controls,inline:e.hasAttribute("playsinline"),preload:e.preload,crossorigin:e.getAttribute("crossorigin"),src:e.getAttribute("src")}));
  assert.deepEqual(attrs,{controls:true,inline:true,preload:"none",crossorigin:null,src:firstURL});
  const geometry=[];
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:844});
    const g=await video.evaluate(e=>{const r=e.getBoundingClientRect();return{width:innerWidth,scroll:document.documentElement.scrollWidth,left:r.left,right:r.right,height:r.height,fit:getComputedStyle(e).objectFit}});
    assert.ok(g.scroll<=width&&g.left>=0&&g.right<=width&&g.height<=420,JSON.stringify(g));assert.equal(g.fit,"contain");geometry.push(g);
    const accessibility = await new AxeBuilder({page}).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(accessibility.violations, [], `Unloaded video accessibility at ${width}px`);
    g.axeViolations = accessibility.violations.length;
    if (!process.argv.includes("--webkit")) await page.screenshot({caret:"initial",path:new URL(`${live?"video-live":"video-fixture"}-${width}.png`,dir).pathname});
  }
  // Explicit user action followed by the real HTMLMediaElement playback pipeline.
  await video.evaluate(e=>e.load());
  await page.waitForFunction(()=>document.querySelector("video").readyState>=1,{},{timeout:45000}).catch(async error => {
    console.log('MEDIA_DIAGNOSTIC', {engine:browser.version(), requests:requests.filter(r=>r.type==='media'), errors, csp:await page.evaluate(()=>window.__csp||[]), state:await video.evaluate(e=>({error:e.error?.code,message:e.error?.message,network:e.networkState,ready:e.readyState,canPlay:e.canPlayType('video/mp4; codecs="avc1.42E01E"'),controlled:!!navigator.serviceWorker?.controller}))});
    throw error;
  });
  const metadata=await video.evaluate(e=>({width:e.videoWidth,height:e.videoHeight,duration:e.duration}));
  assert.ok(metadata.width>0&&metadata.height>0&&metadata.duration>0);
  await video.evaluate(e=>e.play());
  await page.waitForFunction(()=>document.querySelector("video").currentTime>0.1);
  const playback = await video.evaluate(e=>({currentTime:e.currentTime,paused:e.paused}));
  assert.ok(playback.currentTime>0.1);assert.equal(playback.paused,false);
  if(!live){
    const other=page.locator("video").nth(1);await other.evaluate(e=>e.play());
    await page.waitForFunction(()=>document.querySelectorAll("video")[0].paused&&!document.querySelectorAll("video")[1].paused);
    await other.evaluate(e=>e.pause());
  }
  await video.evaluate(e=>e.pause());assert.equal(await video.evaluate(e=>e.paused),true);
  const loadedGeometry=[];
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:844});
    await video.scrollIntoViewIfNeeded();
    const g=await video.evaluate(e=>{const r=e.getBoundingClientRect();return{width:innerWidth,scroll:document.documentElement.scrollWidth,left:r.left,right:r.right,height:r.height,fit:getComputedStyle(e).objectFit}});
    assert.ok(g.scroll<=width&&g.left>=0&&g.right<=width&&g.height<=420,JSON.stringify(g));
    assert.equal(g.fit,"contain");loadedGeometry.push(g);
    const accessibility = await new AxeBuilder({page}).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    assert.deepEqual(accessibility.violations, [], `Loaded video accessibility at ${width}px`);
    g.axeViolations = accessibility.violations.length;
    // Playwright WebKit screenshot plumbing injects an inline stylesheet and causes
    // artificial CSP violations; test that engine without weakening the real CSP.
    if(!process.argv.includes("--webkit"))await page.screenshot({caret:"initial",path:new URL(`${live?"video-live":"video-fixture"}-loaded-${width}.png`,dir).pathname});
  }
  await page.locator(".zap-button").first().click();
  assert.equal(await page.locator("#zap-post-id").textContent(),posts[0].id);
  await page.keyboard.press("Escape");
  // Actual load failure, not a fake play overlay; original remains available.
  if(!live){await context.route(firstURL,route=>route.fulfill({contentType:"video/mp4",body:"unsupported media fixture"}));await video.evaluate(e=>{e.src=e.src;e.load()});await page.waitForFunction(()=>document.querySelector("video").error!==null);await page.getByText("Video unavailable in this browser.",{exact:true}).first().waitFor();}
  assert.equal(await page.getByRole("link",{name:"Open original video (new tab)",exact:true}).first().getAttribute("href"),firstURL);
  assert.equal(requests.filter(r=>r.url.includes("/callback")||r.url.includes("nostr=")).length,0);
  assert.deepEqual(await page.evaluate(()=>window.__csp||[]),[]);assert.deepEqual(errors,[]);
  const result={live,engine:process.argv.includes("--webkit")?"webkit":"chrome",metadata,playback,pausedAfterAction:await video.evaluate(e=>e.paused),browserVersion:browser.version(),geometry,loadedGeometry,errors,csp:await page.evaluate(()=>window.__csp||[]),mediaRequests:requests.filter(r=>r.type==="media"),financialCallbacks:0};
  await writeFile(new URL(`${live?"video-live":"video-fixture"}${process.argv.includes("--webkit")?"-webkit":""}-results.json`,dir),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}finally{await browser.close()}
