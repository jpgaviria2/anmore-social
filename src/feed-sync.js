import { Relay } from './relay.js';
import { identifyDecision, profileIdentityStatus, latestProfile, validEvent, address } from './core.js';
const nowSeconds=()=>Math.floor(Date.now()/1000);
const deleted=(e,removals)=>removals.some(d=>d.pubkey===e.pubkey&&d.tags.some(t=>(t[0]==='e'&&t[1]===e.id)||(t[0]==='a'&&t[1]===(e.kind===0?`0:${e.pubkey}:`:address(e))&&d.created_at>=e.created_at)));
// One owner for bounded relay reads. Creation timestamps are NOT insertion cursors.
export class FeedSync {
 constructor(store, options={}) {this.store=store;this.relay=options.relay??(()=>new Relay());this.identify=options.identify??identifyDecision;this.now=options.now??nowSeconds;this.epoch=0;this.round=0;this.authorOffset=0;this.pending=new Map();}
 run(options={}) {if(this.flight)return this.flight;const epoch=++this.epoch;const flight=this.perform(options,epoch).finally(()=>{if(this.flight===flight)this.flight=null;});this.flight=flight;return flight;}
 cancel(){this.epoch++;this.flight=null;this.active?.close();}
 receiptTargets(posts){
  const sorted=[...posts].sort((a,b)=>a.id.localeCompare(b.id));
  const offset=Math.min(this.store.state.coverage.receiptTargetOffset??0,sorted.length);
  return {posts:sorted.slice(offset,offset+1200),nextTargetOffset:offset+1200>=sorted.length?0:offset+1200,partial:sorted.length>1200};
 }
 async commitReceipts(snapshot,authority,relay,epoch=this.epoch){
  const removals=[],ids=[...new Set(snapshot.receipts.map(e=>e.id))];
  for(let i=0;i<ids.length;i+=64){
   const part=await relay.query([{kinds:[5],authors:[authority.issuer],'#e':ids.slice(i,i+64),limit:500}]);
   if(epoch!==this.epoch)throw Error('Retired receipt sync');
   if(part.length>=500)throw Error('Receipt deletion history incomplete');
   removals.push(...part);
  }
  if(epoch!==this.epoch)throw Error('Retired receipt sync');
  if(Number.isSafeInteger(snapshot.nextTargetOffset)&&snapshot.nextTargetOffset>=0)this.store.state.coverage.receiptTargetOffset=snapshot.nextTargetOffset;
  this.store.state.coverage.receipts={checkedAt:this.now(),sources:snapshot.sources??[],partial:snapshot.partial??true};
  await this.store.addReceipts(snapshot.receipts,authority,snapshot.provenance,removals);
 }
 async perform({older=false,top=false}={},epoch){
  const relay=this.relay();this.active=relay;
  const guard=()=>{if(epoch!==this.epoch)throw Error('Retired feed sync');};
  const query=async filters=>{const value=await relay.query(filters);guard();return value;};
  try {
   if(this.store.blocked)await this.store.recover();guard();
   await relay.open();guard();const now=this.now(), prior=this.store.state.coverage;
   const reconcile=!older && (++this.round%5===0);
   let until=older?(prior.older?.until??now):now;
   let size=older?(prior.older?.limit??12):12;
   const since=!older&&!reconcile&&prior.latest!==undefined?Math.max(0,prior.latest-300):undefined;
   const events=[];let completed=false,next;
   for(let i=0;i<(top?6:older?1:prior.older?6:1);i++) {
    if(size>600||events.length+size>600)break;
    const chunk=await query([{kinds:[1,20],until,limit:size,...(since===undefined?{}:{since})}]);
    if(chunk.length>size)throw Error('Relay content read exceeded limit');
    events.push(...chunk);
    const oldest=chunk.length?Math.min(...chunk.map(e=>e.created_at)):until;
    next={until:oldest,limit:oldest===until?size+12:chunk.filter(e=>e.created_at===oldest).length+12};
    if(chunk.length<size){completed=true;break;}
    until=oldest;size=next.limit;
   }
   if(!older)events.push(...await query([{kinds:[31922,31923],until:now,limit:60}]));
   const calendars=[...new Map([...this.store.state.accepted.map(x=>x.event),...events].filter(e=>[31922,31923].includes(e.kind)).map(e=>[address(e),e])).values()].sort((a,b)=>address(a).localeCompare(address(b)));
   const calendarOffset=prior.calendarOffset??0;
   for(const e of calendars.slice(calendarOffset,calendarOffset+64))events.push(...await query([{kinds:[e.kind],authors:[e.pubkey],'#d':[e.tags.find(t=>t[0]==='d')?.[1]??''],limit:1}]));
   const accepted=new Set(this.store.state.accepted.map(x=>x.event.id));
   for(const e of events)if(validEvent(e)&&!accepted.has(e.id))this.pending.set(e.id,e);
   let pendingBytes=0;const pending=[];
   for(const e of [...this.pending.values()].reverse()){const bytes=JSON.stringify(e).length;if(pending.length>=500||pendingBytes+bytes>2097152)break;pendingBytes+=bytes;pending.push(e);}
   this.pending=new Map(pending.reverse().map(e=>[e.id,e]));
   events.push(...this.pending.values());
   const allKnown=[...new Set(this.store.state.accepted.map(x=>x.event.pubkey))].sort();
   const rotating=allKnown.slice(this.authorOffset,this.authorOffset+32);this.authorOffset=(this.authorOffset+32)>=allKnown.length?0:this.authorOffset+32;
   const authors=[...new Set([...events.map(e=>e.pubkey),...rotating])];
   const profiles=[],removals=[],identities=[],revoked=[];let unavailable=0;
   for(const pubkey of authors){
    const found=await query([{kinds:[0],authors:[pubkey],limit:1}]);profiles.push(...found);
    const profile=latestProfile([...this.store.state.profiles,...found],pubkey);
    // Reconcile exact retained/new targets independently from the head window.
    const targets=[...events,...this.store.state.accepted.map(x=>x.event),...this.store.state.heads,...(profile?[profile]:[])].filter(e=>e.pubkey===pubkey);
    const ids=[...new Set(targets.map(e=>e.id))],addresses=[...new Set(targets.filter(e=>e.kind===0||e.kind>=30000).map(e=>e.kind===0?`0:${pubkey}:`:address(e)))];
    const ds=[];
    for(let i=0;i<ids.length;i+=64){const part=await query([{kinds:[5],authors:[pubkey],'#e':ids.slice(i,i+64),limit:500}]);if(part.length>=500)throw Error('Deletion history incomplete; retained history unchanged');ds.push(...part);}
    for(let i=0;i<addresses.length;i+=64){const part=await query([{kinds:[5],authors:[pubkey],'#a':addresses.slice(i,i+64),limit:500}]);if(part.length>=500)throw Error('Deletion history incomplete; retained history unchanged');ds.push(...part);}
    removals.push(...ds);
    if(!profile||deleted(profile,[...this.store.state.removals,...ds]))continue;
    try{
     const profileStatus=profileIdentityStatus(profile);
     const outcome=profileStatus==='eligible'?await this.identify(profile):{status:profileStatus};guard();
     const decision=outcome?.status?outcome:outcome?{status:'verified',identity:outcome}:{status:'contradiction'};
     if(decision.status==='verified')identities.push([pubkey,decision.identity]);
     else if(['withdrawn','contradiction'].includes(decision.status))revoked.push(pubkey);
     else unavailable++;
    }
    catch(error){guard();unavailable++;}
   }
   // Historical provider claims remain removable after issuer rotation or a
   // current pay-endpoint outage. Only canonical-relay signed exact removals.
   const claims=this.store.state.receipts;
   const offset=prior.receiptRemovalOffset??0;
   const selected=claims.slice(offset,offset+64),issuers=[...new Set(selected.map(c=>c.event.pubkey))];
   for(const issuer of issuers){const ids=selected.filter(c=>c.event.pubkey===issuer).map(c=>c.event.id);const part=await query([{kinds:[5],authors:[issuer],'#e':ids,limit:500}]);if(part.length>=500)throw Error('Receipt deletion history incomplete');removals.push(...part);}
   guard();const coverage={calendarOffset:calendarOffset+64>=calendars.length?0:calendarOffset+64,receiptRemovalOffset:offset+64>=claims.length?0:offset+64,latestComplete:completed,reconciliationLimited:reconcile&&!completed};
   if(completed&&!older)coverage.latest=now;
   if(next&&(older||!prior.older))coverage.older=next;
   // EOSE completes this bounded older page, not all history. Retain the
   // inclusive tie boundary; a failed query never reaches this commit.
   if(older&&next?.limit>600)delete coverage.older;
   if(older)coverage.olderEnded=completed;
   await this.store.merge({events,profiles,identities,removals,revoked,coverage,checkedAt:now});guard();
   const admitted=new Set(this.store.state.accepted.map(x=>x.event.id));
   for(const [id,e] of this.pending)if(admitted.has(id)||revoked.includes(e.pubkey))this.pending.delete(id);
   return {relay,unavailable,completed};
  } finally{relay.close();if(this.active===relay)this.active=null;}
 }
}
