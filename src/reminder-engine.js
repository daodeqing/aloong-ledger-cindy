(function(root){
'use strict';
function create({ledger,notify,changed=()=>{},now=Date.now,timers={set:(fn,delay)=>setTimeout(fn,delay),clear:timer=>clearTimeout(timer)},idleMs=30000}){
 let timer=null,inFlight=null,closed=false,again=false;
 function later(delay){if(closed)return;timers.clear(timer);timer=timers.set(()=>{timer=null;check();},Math.max(30,Math.min(idleMs,delay)));}
 function check(){
  if(closed)return Promise.resolve();timers.clear(timer);
  if(inFlight){again=true;return inFlight;}
  inFlight=(async()=>{
   const claim=await ledger.dispatch('reminder_claim',{});
   if(claim.items.length){
    const first=claim.items[0],late=now()-Date.parse(first.due_at)>60000;
    const text=(late?'补报提醒：':'提醒：')+first.title+(first.note?' · '+first.note.slice(0,45):'')+(claim.items.length>1?'；另有 '+(claim.items.length-1)+' 项提醒，请打开工作台。':'');
    let result;try{result=await notify(text.slice(0,190));}catch{result={ok:false,message:'通知调用失败，请检查 Cindy 状态'};}
    await ledger.dispatch('reminder_delivery',{ids:claim.items.map(x=>x.id),stamp:claim.stamp,state:result?.ok?'sent':'failed',error:result?.message||''});changed();
   }
   const next=await ledger.dispatch('reminder_next',{});return next?Math.max(30,Date.parse(next)-now()):idleMs;
  })().then(delay=>{later(again?30:delay);},()=>later(10000)).finally(()=>{inFlight=null;again=false;});
  return inFlight;
 }
 function close(){closed=true;timers.clear(timer);}
 return {check,close};
}
root.LedgerReminderEngine={create};
})(globalThis);
