import test from "node:test";
import assert from "node:assert/strict";
import { finalizeEvent } from "nostr-tools/pure";
const core = await import("../src/core.js").catch(() => ({}));
const key = new Uint8Array(32).fill(1);
export const signed = (fields = {}) =>
  finalizeEvent(
    { kind: 1, created_at: 100, tags: [], content: "Hello Anmore", ...fields },
    key,
  );
test("canonical event accepts relay indexed_at but rejects changed signatures and future dates", () => {
  assert.equal(
    typeof core.validEvent,
    "function",
    "validation implementation is missing",
  );
  const e = signed();
  assert.ok(core.validEvent({ ...e, indexed_at: 999 }, 200));
  assert.equal(core.validEvent({ ...e, content: "forged" }, 200), false);
  assert.equal(core.validEvent(signed({ created_at: 201 }), 200), false);
  assert.equal(core.validEvent({ ...e, tags: [[null]] }, 200), false);
  assert.equal(core.validEvent({ ...e, created_at: 1.2 }, 200), false);
});

test("identity admission is dynamic, exact, signed and bound to HTTPS names mapping", async () => {
  assert.equal(typeof core.identify, "function");
  const profile = signed({
    kind: 0,
    content: JSON.stringify({
      name: "River neighbour",
      nip05: "new.name-7@trailscoffee.com",
    }),
  });
  let url, options;
  const fetcher = async (u, o) => {
    url = u;
    options = o;
    return new Response(JSON.stringify({names:{'new.name-7':profile.pubkey},relays:{[profile.pubkey]:['wss://evil.example']}}));
  };
  const admitted = await core.identify(profile, fetcher, 200);
  assert.deepEqual(admitted.proof, {profile: JSON.parse(JSON.stringify(profile)), mapping: {names:{'new.name-7':profile.pubkey},relays:{[profile.pubkey]:['wss://evil.example']}}, mappingJSON:JSON.stringify({names:{'new.name-7':profile.pubkey},relays:{[profile.pubkey]:['wss://evil.example']}}), checkedAt:200});
  assert.equal(
    admitted.nip05,
    "new.name-7@trailscoffee.com",
  );
  assert.equal(
    url,
    "https://trailscoffee.com/.well-known/nostr.json?name=new.name-7",
  );
  assert.equal(options.redirect, "error");
  assert.equal(options.credentials, "omit");
  for (const nip05 of [
    "x@eviltrailscoffee.com",
    "x@trailscoffee.com.evil",
    "x@TRAILSCOFFEE.COM",
    "x@trailscoffee.com ",
    "x@@trailscoffee.com",
    "a+b@trailscoffee.com",
  ]) {
    assert.equal(
      await core.identify(
        signed({ kind: 0, content: JSON.stringify({ nip05 }) }),
        () => {
          throw Error("must not fetch");
        },
        200,
      ),
      null,
    );
  }
  assert.equal(
    await core.identify(
      profile,
      async () => new Response(JSON.stringify({names:{'new.name-7':'f'.repeat(64)}})),
      200,
    ),
    null,
  );
  assert.equal(
    await core.identify({ ...profile, content: "{}" }, fetcher, 200),
    null,
  );
  await assert.rejects(
    () =>
      core.identify(
        profile,
        async () => {
          throw Error("network unavailable");
        },
        200,
      ),
    /network unavailable/,
  );
});

test('community recipient uses shared case-preserving bounded HTTP identity contract without fixed names',async()=>{
 const {resolveCommunity,COMMUNITY_ADDRESS,PAY_CALLBACK}=await import('../src/zaps.js');
 const name='Arbitrary.UPPER',p=signed({kind:0,content:JSON.stringify({nip05:name+'@trailscoffee.com',lud16:COMMUNITY_ADDRESS})});
 const mapping={names:{[name]:p.pubkey,unused:'not-a-pubkey'},relays:{keep:['evidence']}};
 const endpoint={tag:'payRequest',allowsNostr:true,nostrPubkey:p.pubkey,callback:PAY_CALLBACK,minSendable:1000,maxSendable:100000};
 const relay={query:async fs=>fs[0].kinds.includes(0)?[p]:[]};
 const authority=await resolveCommunity(relay,async url=>new Response(JSON.stringify(url.includes('nostr.json')?mapping:endpoint)),200);
 assert.equal(authority.recipient,p.pubkey);assert.deepEqual(authority.evidence.mapping,mapping);assert.equal(authority.evidence.mappingJSON,JSON.stringify(mapping));
 await assert.rejects(()=>resolveCommunity(relay,async()=>new Response(JSON.stringify(mapping),{status:206}),200));
 await assert.rejects(()=>resolveCommunity(relay,async()=>new Response(JSON.stringify({names:{[name]:p.pubkey,invalid:4}})),200));
});
test('identity deadline spans stalled fetch and streamed body with exact byte ceiling',async()=>{
 const url='https://trailscoffee.com/.well-known/nostr.json?name=x';
 for(const stage of ['fetch','body']){
  let signal,cancelled=false;
  const fetcher=async(u,o)=>{signal=o.signal;if(stage==='fetch')return new Promise(()=>{});return new Response(new ReadableStream({pull:()=>new Promise(()=>{}),cancel(){cancelled=true;}}));};
  await assert.rejects(()=>core.fetchIdentityMapping(url,fetcher,25),/timeout/);assert.equal(signal.aborted,true);if(stage==='body')assert.equal(cancelled,true);
 }
 const base=JSON.stringify({names:{x:'key'},padding:''}),text=base.slice(0,-2)+'a'.repeat(65536-new TextEncoder().encode(base).length)+'"}';
 assert.equal(new TextEncoder().encode(text).length,65536);
 assert.equal((await core.fetchIdentityMapping(url,async()=>new Response(text))).mappingJSON,text);
 let cancelled=false;const chunks=[new Uint8Array(40000),new Uint8Array(25537)];
 await assert.rejects(()=>core.fetchIdentityMapping(url,async()=>new Response(new ReadableStream({pull(c){if(chunks.length)c.enqueue(chunks.shift());else return new Promise(()=>{});},cancel(){cancelled=true;}}),{headers:{'content-length':'1'}})),/safety limit/);
 assert.equal(cancelled,true);
 await assert.rejects(()=>core.fetchIdentityMapping(url,async()=>new Response('{"names":{}}',{headers:{'content-length':'65537'}})),/safety limit/);
});
test('typed identity outcomes distinguish unavailable placeholders from signed withdrawal and mapping contradiction',async()=>{
 const decide=async content=>core.identifyDecision(signed({kind:0,content}),async()=>new Response('{"names":{}}'),200);
 for(const content of ['{','null','[]','{"name":" deleted "}','{"display_name":"DELETED","nip05":"a@trailscoffee.com"}'])assert.equal((await decide(content)).status,'unavailable');
 for(const content of ['{}','{"name":"real person"}','{"nip05":"x@elsewhere.test"}'])assert.equal((await decide(content)).status,'withdrawn');
 assert.equal((await decide('{"nip05":"a@trailscoffee.com"}')).status,'contradiction');
 assert.equal((await core.identifyDecision(signed({kind:0,content:'{"nip05":"a@trailscoffee.com"}'}),async()=>new Response('{"names":{"a":3}}'),200)).status,'unavailable');
});
test('identity HTTP contract requires exact 200 and bounded complete string-map evidence',async()=>{
 const p=signed({kind:0,content:JSON.stringify({nip05:'Case@trailscoffee.com'})});
 const text=' {"names": '+JSON.stringify({Case:p.pubkey,Other:'other-string'})+', "relays": {"extra": []}, "padding": "'+'x'.repeat(17000)+'"} ';
 let options;
 const good=await core.identify(p,async(u,o)=>{options=o;return new Response(text);},200);
 assert.equal(good.proof.mappingJSON,text);assert.deepEqual(good.proof.mapping,JSON.parse(text));
 assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Accept,'application/json');assert.equal(options.referrerPolicy,'no-referrer');
 for(const status of [201,204,206,404,429,500])await assert.rejects(()=>core.identify(p,async()=>new Response(status===204?null:text,{status}),200));
 for(const names of [null,[],{'Case':p.pubkey,other:1},'invalid'])await assert.rejects(()=>core.identify(p,async()=>new Response(JSON.stringify({names})),200));
 for(const data of ['not-json',JSON.stringify({names:{Case:p.pubkey},padding:'x'.repeat(65536)})])await assert.rejects(()=>core.identify(p,async()=>new Response(data),200));
 for(const names of [{},{case:p.pubkey},{Case:'wrong'}])assert.equal(await core.identify(p,async()=>new Response(JSON.stringify({names})),200),null);
 await assert.rejects(()=>core.identify(p,async()=>({status:200,redirected:true,url:'https://other.test',body:new Response(text).body}),200));
});
test('identity response is byte bounded before JSON decoding',async()=>{
 const profile=signed({kind:0,content:JSON.stringify({nip05:'new.name-7@trailscoffee.com'})});let cancelled=false;
 const fetcher=async()=>({status:200,body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(65537)}),cancel:async()=>{cancelled=true;}})},json:async()=>({names:{'new.name-7':profile.pubkey}})});
 await assert.rejects(()=>core.identify(profile,fetcher,200),/safety limit/);assert.equal(cancelled,true);
});
test("chronology deduplicates, rejects invalid input, applies author deletions and addressable updates", () => {
  assert.equal(typeof core.visibleEvents, "function");
  const a = signed({ created_at: 90 }),
    b = signed({ created_at: 95, content: "newer" });
  const foreign = finalizeEvent(
    { kind: 5, created_at: 100, content: "", tags: [["e", b.id]] },
    new Uint8Array(32).fill(2),
  );
  assert.deepEqual(
    core.visibleEvents([a, b, a, foreign], 200).map((e) => e.id),
    [b.id, a.id],
  );
  const deletion = signed({ kind: 5, created_at: 100, tags: [["e", b.id]] });
  assert.deepEqual(
    core.visibleEvents([a, b, deletion], 200).map((e) => e.id),
    [a.id],
  );
  const old = signed({ kind: 31922, tags: [["d", "walk"]], created_at: 70 });
  const revision = signed({
    kind: 31922,
    tags: [["d", "walk"]],
    created_at: 80,
  });
  const del = signed({
    kind: 5,
    tags: [["a", `31922:${old.pubkey}:walk`]],
    created_at: 75,
  });
  assert.deepEqual(
    core.visibleEvents([old, revision, del], 200).map((e) => e.id),
    [revision.id],
  );
  const tie = signed({
    kind: 31922,
    tags: [["d", "walk"]],
    created_at: 80,
    content: "tie",
  });
  assert.equal(
    core.visibleEvents([old, revision, tie], 200)[0].id,
    [revision.id, tie.id].sort()[0],
  );
  assert.equal(
    core.visibleEvents(
      [signed({ created_at: 201 }), { ...b, sig: "0".repeat(128) }],
      200,
    ).length,
    0,
  );
});

test("calendar parser handles Pacific dates, invalid dates, upcoming times and expired events", () => {
  assert.equal(typeof core.calendarInfo, "function");
  const e = signed({
    kind: 31922,
    tags: [
      ["d", "day"],
      ["title", "Village day"],
      ["start", "2026-11-11"],
    ],
  });
  assert.equal(core.calendarInfo(e, 1794370000).date, "2026-11-11");
  assert.equal(
    core.calendarInfo(
      signed({
        kind: 31922,
        tags: [
          ["d", "x"],
          ["title", "bad"],
          ["start", "2026-02-30"],
        ],
      }),
      1794370000,
    ),
    null,
  );
  assert.equal(
    core.calendarInfo(
      signed({
        kind: 31923,
        tags: [
          ["d", "x"],
          ["title", "past"],
          ["start", "100"],
        ],
      }),
      200,
    ),
    null,
  );
  assert.equal(
    core.calendarInfo(
      signed({
        kind: 31923,
        tags: [
          ["d", "x"],
          ["title", "future"],
          ["start", "300"],
          ["end", "250"],
        ],
      }),
      200,
    ),
    null,
  );
});
test("safe HTTPS URLs reject executable URLs, credentials and local hosts", () => {
  assert.equal(typeof core.safeURL, "function");
  assert.equal(
    core.safeURL("https://example.com/photo.jpg"),
    "https://example.com/photo.jpg",
  );
  for (const u of [
    "javascript:alert(1)",
    "data:text/html,x",
    "http://example.com",
    "https://u:p@example.com",
    "https://localhost/a",
    "https://127.0.0.1/a",
    "https://192.168.1.1/a",
    "https://[::1]/a",
  ])
    assert.equal(core.safeURL(u), null);
});

test("e deletion removes an exact same-author ID regardless of its timestamp, while a deletion preserves later revisions", () => {
  const e = signed({ created_at: 100 });
  const deletion = signed({ kind: 5, created_at: 90, tags: [["e", e.id]] });
  assert.equal(core.visibleEvents([e, deletion], 200).length, 0);
  const old = signed({ kind: 31922, created_at: 70, tags: [["d", "x"]] });
  const aDelete = signed({
    kind: 5,
    created_at: 75,
    tags: [["a", `31922:${old.pubkey}:x`]],
  });
  const next = signed({ kind: 31922, created_at: 80, tags: [["d", "x"]] });
  assert.deepEqual(
    core.visibleEvents([old, aDelete, next, old], 200).map((e) => e.id),
    [next.id],
  );
  assert.equal(
    core.visibleEvents([old, aDelete, { ...next, sig: "0".repeat(128) }], 200)
      .length,
    0,
  );
});

test('NIP05 handles preserve case with the native ASCII 1..64 bound',async()=>{
 assert.equal(core.validEvent(signed({tags:[[]]}),200),false);
 for(const name of ['New','A'.repeat(64),'constructor','__proto__']){
  const p=signed({kind:0,content:JSON.stringify({nip05:name+'@trailscoffee.com'})});let requested;
  const identity=await core.identify(p,async url=>{requested=url;return new Response(JSON.stringify({names:{[name]:p.pubkey}}));},200);
  assert.equal(identity?.nip05,name+'@trailscoffee.com');assert.ok(requested.endsWith('?name='+name));
 }
 for(const name of ['', 'a'.repeat(65),'é','a+b'])assert.equal(await core.identify(signed({kind:0,content:JSON.stringify({nip05:name+'@trailscoffee.com'})}),()=>{throw Error('must not fetch');},200),null);
});
test("forged deletion signatures cannot hide real posts; latest profile tie is deterministic", () => {
  const note = signed();
  const del = signed({ kind: 5, tags: [["e", note.id]] });
  assert.deepEqual(
    core
      .visibleEvents([note, { ...del, sig: "0".repeat(128) }], 200)
      .map((e) => e.id),
    [note.id],
  );
  const a = signed({ kind: 0, content: '{"nip05":"a@trailscoffee.com"}' }),
    b = signed({ kind: 0, content: '{"nip05":"b@trailscoffee.com"}' });
  assert.equal(
    core.latestProfile([a, b], a.pubkey, 200).id,
    [a.id, b.id].sort()[0],
  );
});
