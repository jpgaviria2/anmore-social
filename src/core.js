import { verifyEvent } from "nostr-tools/pure";
export const RELAY = "wss://relay.anmore.me";
export function canonicalEvent(e) {
 return {id:e.id,pubkey:e.pubkey,sig:e.sig,created_at:e.created_at,kind:e.kind,tags:e.tags.map(t=>[...t]),content:e.content};
}
export function validEvent(input, now = Math.floor(Date.now() / 1000)) {
  try {
    if (
      !input ||
      !/^[0-9a-f]{64}$/.test(input.id) ||
      !/^[0-9a-f]{64}$/.test(input.pubkey) ||
      !/^[0-9a-f]{128}$/.test(input.sig) ||
      !Number.isSafeInteger(input.created_at) ||
      input.created_at < 0 ||
      input.created_at > now ||
      !Number.isSafeInteger(input.kind) ||
      input.kind < 0 ||
      input.kind > 65535 ||
      typeof input.content !== "string" ||
      input.content.length > 100000 ||
      !Array.isArray(input.tags) ||
      input.tags.length > 2000 ||
      input.tags.some(
        (t) =>
          !Array.isArray(t) ||
          t.length === 0 ||
          t.some((v) => typeof v !== "string"),
      )
    )
      return false;
    // Never pass relay extras or a cached verification symbol to the verifier.
    return verifyEvent({
      id: input.id,
      pubkey: input.pubkey,
      sig: input.sig,
      created_at: input.created_at,
      kind: input.kind,
      tags: input.tags,
      content: input.content,
    });
  } catch {
    return false;
  }
}

export const approvedIdentifier = value => typeof value==='string' && /^[A-Za-z0-9_.-]{1,64}@trailscoffee\.com$/.test(value);
export const validNamesMap = mapping => !!mapping && typeof mapping==='object' && !Array.isArray(mapping) &&
 !!mapping.names && typeof mapping.names==='object' && !Array.isArray(mapping.names) && Object.values(mapping.names).every(v=>typeof v==='string');
export function validMappingEvidence(proof){
 try{const text=proof.mappingJSON??JSON.stringify(proof.mapping);
  return typeof text==='string'&&new TextEncoder().encode(text).byteLength<=65536&&validNamesMap(proof.mapping)&&JSON.stringify(JSON.parse(text))===JSON.stringify(proof.mapping);
 }catch{return false;}
}
// The deadline covers fetch AND every streamed byte, including a stalled body.
export async function fetchIdentityMapping(url,fetcher=fetch,timeoutMs=8000){
 const controller=new AbortController();let reader,timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Identity endpoint timeout'));},timeoutMs);});
 const work=(async()=>{
  const response=await fetcher(url,{redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json'},signal:controller.signal});
  if(response.status!==200||response.redirected||(response.url&&response.url!==url))throw Error('Identity endpoint unavailable');
  const length=response.headers?.get('content-length');
  if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)>65536))throw Error('Identity response exceeded safety limit');
  reader=response.body?.getReader();if(!reader)throw Error('Identity response body unavailable');
  let size=0;const chunks=[];
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('Identity response exceeded safety limit');chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const mappingJSON=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes),mapping=JSON.parse(mappingJSON);
  if(!validNamesMap(mapping))throw Error('Identity endpoint returned malformed mapping');
  return {mapping,mappingJSON};
 })();
 try{return await Promise.race([work,timeout]);}finally{clearTimeout(timer);controller.abort();if(reader)Promise.resolve(reader.cancel()).catch(()=>{});}
}
export function profileIdentityStatus(profile,now){
 if(!validEvent(profile,now)||profile.kind!==0)return 'unavailable';
 try{const m=JSON.parse(profile.content);if(!m||typeof m!=='object'||Array.isArray(m))return 'unavailable';
  if([m.name,m.display_name].some(v=>typeof v==='string'&&v.trim().toLowerCase()==='deleted'))return 'unavailable';
  return approvedIdentifier(m.nip05)?'eligible':'withdrawn';
 }catch{return 'unavailable';}
}
export async function identifyDecision(profile,fetcher=fetch,now){
 const status=profileIdentityStatus(profile,now);if(status!=='eligible')return {status,profile};
 try{const identity=await identify(profile,fetcher,now);return identity?{status:'verified',identity,profile}:{status:'contradiction',profile};}
 catch(error){return {status:'unavailable',profile,error};}
}
export async function identify(profile, fetcher = fetch, now) {
  if (profileIdentityStatus(profile,now)!=='eligible') return null;
  let metadata;
  try {
    metadata = JSON.parse(profile.content);
  } catch {
    return null;
  }
  if (
    !metadata ||
    !approvedIdentifier(metadata.nip05)
  )
    return null;
  const name = metadata.nip05.split("@")[0];
  const {mapping,mappingJSON}=await fetchIdentityMapping(
    `https://trailscoffee.com/.well-known/nostr.json?name=${encodeURIComponent(name)}`,fetcher);
  if (!Object.hasOwn(mapping.names,name)||mapping.names[name]!==profile.pubkey)return null;
  return {
    pubkey: profile.pubkey,
    proof: {profile: canonicalEvent(profile), mapping, mappingJSON, checkedAt: now ?? Math.floor(Date.now()/1000)},
    nip05: metadata.nip05,
    name:
      typeof metadata.display_name === "string"
        ? metadata.display_name.slice(0, 100)
        : typeof metadata.name === "string"
          ? metadata.name.slice(0, 100)
          : name,
    picture: typeof metadata.picture === "string" ? metadata.picture : null,
  };
}

export const tag = (event, name) => event.tags.find((t) => t[0] === name)?.[1];
export const address = (e) => `${e.kind}:${e.pubkey}:${tag(e, "d") ?? ""}`;
export function visibleEvents(input, now) {
  const events = [
    ...new Map(
      input.filter((e) => validEvent(e, now)).map((e) => [e.id, e]),
    ).values(),
  ];
  const deletions = events.filter((e) => e.kind === 5),
    latest = new Map();
  for (const e of events.filter((e) => [0, 31922, 31923].includes(e.kind))) {
    const key = e.kind === 0 ? e.pubkey : address(e),
      previous = latest.get(key);
    if (
      !previous ||
      e.created_at > previous.created_at ||
      (e.created_at === previous.created_at && e.id < previous.id)
    )
      latest.set(key, e);
  }
  return events
    .filter((e) => [1, 20, 31922, 31923].includes(e.kind))
    .filter((e) => e.kind < 30000 || latest.get(address(e)) === e)
    .filter(
      (e) =>
        !deletions.some(
          (d) =>
            d.pubkey === e.pubkey &&
            d.tags.some(
              (t) =>
                (t[0] === "e" && t[1] === e.id) ||
                (t[0] === "a" &&
                  e.kind >= 30000 &&
                  t[1] === address(e) &&
                  d.created_at >= e.created_at),
            ),
        ),
    )
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id));
}
export function latestProfile(events, pubkey, now) {
  return events
    .filter((e) => e.pubkey === pubkey && e.kind === 0 && validEvent(e, now))
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
}

export function safeURL(value) {
  try {
    const u = new URL(value),
      h = u.hostname;
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      h.endsWith(".") ||
      h === "localhost" ||
      h.endsWith(".localhost") ||
      h.endsWith(".local") ||
      h.includes(":") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(h) ||
      !h.includes(".")
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function calendarInfo(e, now = Math.floor(Date.now() / 1000)) {
  const title = tag(e, "title") || tag(e, "name"),
    start = tag(e, "start"),
    end = tag(e, "end");
  if (!tag(e, "d") || !title || !start) return null;
  if (e.kind === 31922) {
    const dateValid = (s) =>
      /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s;
    if (!dateValid(start) || (end && (!dateValid(end) || end <= start)))
      return null;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Vancouver",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(now * 1000));
    if ((end && end <= today) || (!end && start < today)) return null;
    return {
      title,
      date: start,
      sort: Date.parse(start) / 1000,
      allDay: true,
      location: tag(e, "location") || "Location in event details",
    };
  }
  if (
    e.kind !== 31923 ||
    !/^\d+$/.test(start) ||
    !Number.isSafeInteger(Number(start)) ||
    (end && (!/^\d+$/.test(end) || Number(end) <= Number(start))) ||
    Number(end || start) < now ||
    Number(start) > 8640000000000
  )
    return null;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Number(start) * 1000));
  return {
    title,
    date,
    sort: Number(start),
    allDay: false,
    location: tag(e, "location") || "Location in event details",
  };
}
