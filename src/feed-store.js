import { validEvent, visibleEvents, address, canonicalEvent, approvedIdentifier, validMappingEvidence, profileIdentityStatus } from './core.js';
import { verifiedTotals, COMMUNITY_ADDRESS, PAY_CALLBACK } from './zaps.js';
// Public historical evidence, not current invoice/author authority. Same-origin
// storage integrity is assumed; all signed payloads are reverified on restore.
const empty = () => ({version:1,accepted:[],heads:[],removals:[],profiles:[],decisions:[],revoked:[],receipts:[],coverage:{},lastChecked:null});
function evidence(event,proof){return validEvent(event)&&[1,20,31922,31923].includes(event.kind)&&profileEvidence(event.pubkey,proof);}
function profileEvidence(pubkey, proof) {
 if (!proof || !validEvent(proof.profile) || proof.profile.kind!==0 || proof.profile.pubkey!==pubkey ||
     !Number.isSafeInteger(proof.checkedAt) || proof.checkedAt<0 || proof.checkedAt>Math.floor(Date.now()/1000)) return false;
 try {
  const id=JSON.parse(proof.profile.content).nip05;
  return approvedIdentifier(id) && profileIdentityStatus(proof.profile)==='eligible' && validMappingEvidence(proof) &&
    Object.hasOwn(proof.mapping?.names??{},id.split('@')[0]) && proof.mapping.names[id.split('@')[0]]===pubkey;
 } catch {return false;}
}
function currentEvidence(event,proof){return evidence(event,proof)&&Math.floor(Date.now()/1000)-proof.checkedAt<=300;}
function receiptEvidence(claim,posts) {
 try {
  const a=claim.authority,p=a.evidence.profile,m=JSON.parse(p.content),endpoint=a.evidence.endpoint;
  if(!validEvent(p)||p.kind!==0||p.id!==a.profileId||p.pubkey!==a.recipient||m.lud16!==COMMUNITY_ADDRESS||
    !approvedIdentifier(m.nip05)||!validMappingEvidence(a.evidence)||!Object.hasOwn(a.evidence.mapping.names,m.nip05.split('@')[0])||a.evidence.mapping.names[m.nip05.split('@')[0]]!==p.pubkey||
    endpoint.tag!=='payRequest'||endpoint.allowsNostr!==true||endpoint.nostrPubkey!==a.issuer||endpoint.callback!==PAY_CALLBACK||
    !Number.isSafeInteger(a.checkedAt)||a.checkedAt>Math.floor(Date.now()/1000)||!Array.isArray(claim.sources)||claim.sources.some(s=>!['wss://relay.anmore.me','wss://relay.primal.net'].includes(s))) return false;
  return verifiedTotals([claim.event],posts,a).size===1;
 }catch{return false;}
}
function validate(value) {
 if(value===undefined)return empty();
 if(value.version!==1 || !Array.isArray(value.decisions) || value.decisions.some(d=>!(/^[0-9a-f]{64}$/).test(d.pubkey)||!Number.isSafeInteger(d.checkedAt)||d.checkedAt<0||d.checkedAt>Math.floor(Date.now()/1000)||typeof d.revoked!=='boolean'||(!d.revoked&&!profileEvidence(d.pubkey,d.proof))) || !Array.isArray(value.heads) || value.heads.some(e=>![31922,31923].includes(e.kind)||!validEvent(e)) || !Array.isArray(value.accepted) || value.accepted.some(x=>!evidence(x.event,x.proof)) || !Array.isArray(value.removals) || value.removals.some(e=>e.kind!==5||!validEvent(e)) || !Array.isArray(value.profiles) || value.profiles.some(e=>e.kind!==0||!validEvent(e)) || !Array.isArray(value.revoked) || value.revoked.some(k=>!(/^[0-9a-f]{64}$/).test(k)) || !Array.isArray(value.receipts) || !value.coverage || typeof value.coverage!=='object') throw Error('Unrecognized or corrupt accepted generation');
 if(value.coverage===null||Array.isArray(value.coverage))throw Error('Corrupt coverage');
 const clock=Math.floor(Date.now()/1000),integer=n=>Number.isSafeInteger(n)&&n>=0;
 const timestamp=n=>integer(n)&&n<=clock;
 const c=value.coverage;
 if((value.lastChecked!==null&&!timestamp(value.lastChecked))||(c.latest!==undefined&&!timestamp(c.latest))||
   (c.older!==undefined&&(!timestamp(c.older?.until)||!integer(c.older?.limit)||c.older.limit<1||c.older.limit>600))||
   ['calendarOffset','receiptRemovalOffset','receiptTargetOffset'].some(k=>c[k]!==undefined&&!integer(c[k]))||
   ['olderEnded','latestComplete','reconciliationLimited'].some(k=>c[k]!==undefined&&typeof c[k]!=='boolean')||
   (c.receipts!==undefined&&(!timestamp(c.receipts?.checkedAt)||typeof c.receipts.partial!=='boolean'||!Array.isArray(c.receipts.sources)||c.receipts.sources.some(s=>!['wss://relay.anmore.me','wss://relay.primal.net'].includes(s)))))throw Error('Corrupt completion cursor');
 if(value.receipts.some(c=>!receiptEvidence(c,value.accepted.map(x=>x.event))))throw Error('Corrupt receipt ledger');
 return value;
}
function boundedRemovals(state) {
 const targets=[...state.accepted.map(x=>x.event),...state.profiles,...state.heads,...state.receipts.map(x=>x.event)];
 const ids=new Map(targets.map(e=>[e.id,e.pubkey]));
 const addresses=new Set(targets.filter(e=>e.kind===0||e.kind>=30000).map(e=>e.kind===0?`0:${e.pubkey}:`:address(e)));
 const relevant=[],unknown=[];
 for(const e of [...new Map(state.removals.map(e=>[e.id,e])).values()]) {
  if(e.kind!==5||!validEvent(e)||JSON.stringify(e).length>16384||!e.tags.some(t=>['e','a'].includes(t[0])))continue;
  const known=e.tags.some(t=>(t[0]==='e'&&ids.get(t[1])===e.pubkey)||(t[0]==='a'&&addresses.has(t[1])&&t[1].split(':')[1]===e.pubkey));
  (known?relevant:unknown).push(e);
 }
 let bytes=0;const pending=[];
 for(const e of unknown.reverse()){const size=JSON.stringify(e).length;if(pending.length>=128||bytes+size>262144)break;pending.push(e);bytes+=size;}
 return [...relevant,...pending.reverse()];
}
function profileDeleted(profile,removals){return removals.some(d=>d.pubkey===profile.pubkey&&d.tags.some(t=>(t[0]==='e'&&t[1]===profile.id)||(t[0]==='a'&&t[1]===`0:${profile.pubkey}:`&&d.created_at>=profile.created_at)));}
function eligible(proof,state){
 const p=proof?.profile;if(!p)return false;
 const head=state.profiles.filter(x=>x.pubkey===p.pubkey).sort((a,b)=>b.created_at-a.created_at||a.id.localeCompare(b.id))[0];
 return (!head||head.id===p.id)&&!profileDeleted(p,state.removals);
}
function combine(old,current,pending=new Set()) {
 const merged={...current};
 for(const field of ['accepted','heads','removals','profiles'])merged[field]=[...new Map([...old[field],...current[field]].map(x=>[x.event?.id??x.id,x])).values()];
 // A duplicate authenticated receipt adds provenance, not replacement evidence.
 // Keep the first claim intact; distinct IDs still reach replay/conflict checks.
 const receipts=new Map();
 for(const claim of [...old.receipts,...current.receipts]) {
  const prior=receipts.get(claim.event.id);
  receipts.set(claim.event.id,prior?{...prior,sources:[...new Set([...prior.sources,...claim.sources])]}:claim);
 }
 merged.receipts=[...receipts.values()];
 // Acceptance/grant evidence carries a signed version even when a caller did
 // not separately supply profiles. These versions participate in the highwater.
 merged.profiles=[...new Map([...merged.profiles,...merged.accepted.map(x=>x.proof.profile),...[...old.decisions,...current.decisions].filter(d=>!d.revoked&&profileEvidence(d.pubkey,d.proof)).map(d=>d.proof.profile)].map(p=>[p.id,p])).values()];
 const decisions=new Map();
 for(const d of [...old.decisions,...current.decisions]){if(!d.revoked&&(!profileEvidence(d.pubkey,d.proof)||!eligible(d.proof,merged)||(Math.floor(Date.now()/1000)-d.checkedAt>300&&!old.decisions.some(prev=>!prev.revoked&&prev.pubkey===d.pubkey&&prev.checkedAt===d.checkedAt&&prev.proof?.profile.id===d.proof?.profile.id))))continue;const prev=decisions.get(d.pubkey);if(!prev||d.checkedAt>prev.checkedAt||(d.checkedAt===prev.checkedAt&&d.revoked))decisions.set(d.pubkey,d);}
 const decisionList=[...decisions.values()],knownKeys=new Set(merged.accepted.map(x=>x.event.pubkey));
 merged.decisions=[...decisionList.filter(d=>knownKeys.has(d.pubkey)),...decisionList.filter(d=>!knownKeys.has(d.pubkey)).slice(-512)];merged.revoked=merged.decisions.filter(d=>d.revoked).map(d=>d.pubkey);
 merged.lastChecked=Math.max(old.lastChecked??0,current.lastChecked??0)||null;
 merged.coverage={...old.coverage,...current.coverage};
 if(old.coverage.latest!==undefined)merged.coverage.latest=Math.max(old.coverage.latest,current.coverage.latest??0);
 if(old.coverage.older&&(!current.coverage.older||old.coverage.older.until<current.coverage.older.until))merged.coverage.older=old.coverage.older;
 const latestProfiles=new Map();
 for(const profile of merged.profiles){const old=latestProfiles.get(profile.pubkey);if(!old||profile.created_at>old.created_at||(profile.created_at===old.created_at&&profile.id<old.id))latestProfiles.set(profile.pubkey,profile);}
 const knownAuthors=new Set(merged.accepted.map(x=>x.event.pubkey));
 const known=[],unknown=[];let bytes=0;
 for(const profile of [...latestProfiles.values()].reverse()){
  if(knownAuthors.has(profile.pubkey))known.push(profile);
  else{const size=JSON.stringify(profile).length;if(unknown.length<512&&bytes+size<=2097152){unknown.push(profile);bytes+=size;}}
 }
 merged.profiles=[...known,...unknown.reverse()];
 merged.removals=boundedRemovals(merged);
 const historical=new Set(old.accepted.map(x=>x.event.id));
 merged.accepted=merged.accepted.filter(x=>!pending.has(x.event.id)||historical.has(x.event.id)||(currentEvidence(x.event,x.proof)&&eligible(x.proof,merged)));
 return merged;
}
export class FeedStore {
 constructor(name='anmore-accepted-v1', factory=globalThis.indexedDB) {this.name=name;this.factory=factory;this.state=empty();this.warning=null;this.blocked=true;this.queue=Promise.resolve();this.pendingAdmissions=new Set();this.pendingDecisions=[];}
 async db() {
  if(this.connection) return this.connection;
  this.connection=await new Promise((resolve,reject)=>{
   const req=this.factory.open(this.name,1);
   req.onupgradeneeded=()=>req.result.createObjectStore('generations');
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Storage upgrade blocked'));
  }); return this.connection;
 }
 async restore() {
  try {
   const db=await this.db();
   const value=await new Promise((resolve,reject)=>{const tx=db.transaction('generations','readonly');const req=tx.objectStore('generations').get('accepted');let value;req.onsuccess=()=>{value=req.result;};tx.oncomplete=()=>resolve(value);req.onerror=()=>reject(req.error??Error('IndexedDB read failed'));tx.onabort=()=>reject(tx.error??Error('IndexedDB read aborted'));});
   this.state=combine(validate(value),{...this.state,decisions:[...this.state.decisions,...this.pendingDecisions]},this.pendingAdmissions);
   this.blocked=false;this.warning=null; return true;
  } catch(error) {this.blocked=true;this.warning='Saved history unreadable; writes blocked. Retry recovery. '+error.message;return false;}
 }
 events(){
  const accepted=new Set(this.state.accepted.map(x=>x.event.id));
  return visibleEvents([...this.state.accepted.map(x=>x.event),...this.state.heads,...this.state.removals]).filter(e=>accepted.has(e.id)&&!this.state.revoked.includes(e.pubkey));
 }
 identities(){return new Map(this.state.accepted.map(({event,proof})=>{const meta=JSON.parse(proof.profile.content);return [event.pubkey,{pubkey:event.pubkey,nip05:meta.nip05,name:(typeof meta.display_name==='string'?meta.display_name:typeof meta.name==='string'?meta.name:meta.nip05.split('@')[0]).slice(0,100)}];}));}
 save(){const task=this.queue.then(()=>this.persist());this.queue=task.catch(()=>{});return task;}
 async persist(){
  if(this.blocked) return false;
  try {
   const db=await this.db();let merged,processed,decisionCount;
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('generations','readwrite'),store=tx.objectStore('generations');
    const req=store.get('accepted');let failure;
    req.onsuccess=()=>{try{const old=validate(req.result);processed=new Set(this.pendingAdmissions);decisionCount=this.pendingDecisions.length;merged=combine(old,structuredClone({...this.state,decisions:[...this.state.decisions,...this.pendingDecisions]}),processed);store.put(merged,'accepted');}catch(error){failure=error;this.blocked=true;tx.abort();}};
    tx.oncomplete=resolve;tx.onerror=()=>reject(failure??tx.error??Error('IndexedDB transaction aborted'));tx.onabort=()=>reject(failure??tx.error??Error('IndexedDB transaction aborted'));
   });
   this.state=combine(merged,{...this.state,decisions:[...this.state.decisions,...this.pendingDecisions]},this.pendingAdmissions);this.pendingDecisions.splice(0,decisionCount);for(const id of processed)this.pendingAdmissions.delete(id);this.warning=null;return true;
  } catch(error){this.warning=this.blocked?'Saved history unreadable; writes blocked. Retry recovery. '+error.message:'History could not be saved; current updates are memory-only. '+error.message;return false;}
 }
 receiptTotals(period='all',now=Math.floor(Date.now()/1000)) {
  const claims=this.state.receipts,contexts=new Map(claims.map(c=>[c.event.id,c.authority]));
  const posts=this.state.accepted.map(x=>x.event);
  const removed=new Set(claims.filter(c=>this.state.removals.some(d=>d.pubkey===c.event.pubkey&&d.tags.some(t=>t[0]==='e'&&t[1]===c.event.id))).map(c=>c.event.id));
  return verifiedTotals(claims.map(c=>c.event),posts,e=>contexts.get(e.id),now,period,removed);
 }
 async addReceipts(events,authority,provenance=new Map(),removals=[]) {
  const claims=new Map(this.state.receipts.map(c=>[c.event.id,c]));
  for(const event of events) {
   const claim={event:canonicalEvent(event),authority:structuredClone(authority),sources:[...(provenance.get(event.id)??[])]};
   if(!receiptEvidence(claim,this.state.accepted.map(x=>x.event)))continue;
   const old=claims.get(event.id);if(old)old.sources=[...new Set([...old.sources,...claim.sources])];else claims.set(event.id,claim);
  }
  this.state.receipts=[...claims.values()];await this.remove(removals);
 }
 async recover(){
  // restore merges the live state at read completion, never a pre-await snapshot.
  if(!await this.restore())return false;
  return this.save();
 }
 async merge({events=[],profiles=[],identities=[],removals=[],revoked=[],coverage,checkedAt}){
  const byAuthor=new Map(identities);
  for(const event of events){const identity=byAuthor.get(event.pubkey);if(identity&&currentEvidence(event,identity.proof)&&!this.state.accepted.some(x=>x.event.id===event.id)){this.pendingAdmissions.add(event.id);this.state.accepted.push({event:canonicalEvent(event),proof:structuredClone(identity.proof)});}}
  const known=new Set(this.state.accepted.filter(x=>x.event.kind>=30000).map(x=>address(x.event)));
  const heads=new Map();
  for(const e of [...this.state.heads,...events])if([31922,31923].includes(e.kind)&&validEvent(e)&&known.has(address(e))){const old=heads.get(address(e));if(!old||e.created_at>old.created_at||(e.created_at===old.created_at&&e.id<old.id))heads.set(address(e),canonicalEvent(e));}
  this.state.heads=[...heads.values()];
  this.state.profiles=[...new Map([...this.state.profiles,...profiles.filter(e=>e.kind===0&&validEvent(e)).map(canonicalEvent)].map(e=>[e.id,e])).values()];
  const decisions=[];
  for(const pubkey of revoked)decisions.push({pubkey,revoked:true,checkedAt:checkedAt??Math.floor(Date.now()/1000)});
  for(const [pubkey,identity] of identities)if(profileEvidence(pubkey,identity?.proof)&&Math.floor(Date.now()/1000)-identity.proof.checkedAt<=300)decisions.push({pubkey,revoked:false,checkedAt:identity.proof.checkedAt,proof:structuredClone(identity.proof)});
  this.pendingDecisions.push(...decisions);
  this.state=combine(this.state,{...this.state,decisions:[...this.state.decisions,...this.pendingDecisions]});
  if(coverage)this.state.coverage={...this.state.coverage,...coverage};
  if(checkedAt)this.state.lastChecked=checkedAt;
  await this.remove(removals);
 }
 async remove(events){
  this.state.removals=boundedRemovals({...this.state,removals:[...this.state.removals,...events.filter(e=>e.kind===5&&validEvent(e)).map(canonicalEvent)]});
  await this.save();
 }
 async accept(event,proof){if(!currentEvidence(event,proof))return false;if(!this.state.accepted.some(x=>x.event.id===event.id)){this.pendingAdmissions.add(event.id);this.state.accepted.push({event:canonicalEvent(event),proof:structuredClone(proof)});}await this.save();return this.state.accepted.some(x=>x.event.id===event.id);}
}
