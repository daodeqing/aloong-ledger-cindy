'use strict';
const ledger=LedgerService.createService(req=>cindy.library(req),LedgerCategories);
const channel=new BroadcastChannel('liang-ledger');
const publicTools=new Set(LEDGER_TOOLS);
const pageTools=new Set([...publicTools,'ping','due_items','get_draft','save_draft','export_page','export_token']);
let reminderTail=Promise.resolve();
function checkReminders(mobilePageId){
 reminderTail=reminderTail.then(async()=>{
  const candidates=await ledger.dispatch('reminder_candidates',{});
  if(!candidates.length)return;
  // Persist before notification: at most one attempt per subscription/day even after a crash.
  await ledger.dispatch('mark_reminders',{ids:candidates.map(x=>x.id)});
  const result=await cindy.send({type:'notify',text:candidates.length+' 项订阅到期待确认，请打开阿龍记账。确认已扣款后才会入账。',tone:'warning',...(mobilePageId?{mobilePageId}:{})});
  if(!result?.ok)channel.postMessage({type:'ledger-notice',message:'到期项已保留在工作台，本次轻提示未送达'});
 }).catch(e=>channel.postMessage({type:'ledger-notice',message:e.message}));
}
async function execute(op,args){
 if(op==='ping'){await ledger.init();return {ready:true,today:LedgerCore.today(),currency:'CNY',categories:LedgerCategories};}
 return ledger.dispatch(op,args||{});
}
channel.onmessage=async event=>{
 const m=event.data;if(!m||m.type!=='ledger-request'||typeof m.requestId!=='string'||!pageTools.has(m.tool))return;
 try{
  const result=await execute(m.tool,m.args);
  channel.postMessage({type:'ledger-response',requestId:m.requestId,ok:true,result});
  if(LedgerService.WRITES.has(m.tool)&&m.tool!=='save_draft')channel.postMessage({type:'ledger-changed'});
  if(m.tool==='ping')checkReminders(m.mobilePageId);
 }catch(e){channel.postMessage({type:'ledger-response',requestId:m.requestId,ok:false,errorCode:e.code||'LEDGER_ERROR',message:e.message||'操作失败，请查询原请求'});}
};
cindy.onHostMessage(async msg=>{
 if(msg.type!=='tool-call')return;
 try{
  if(!publicTools.has(msg.tool))LedgerCore.fail('UNKNOWN_TOOL','未知工具，请重新发现插件工具');
  const result=await execute(msg.tool,msg.args);
  await cindy.send({type:'tool-result',callId:msg.callId,ok:true,result});
  if(LedgerService.WRITES.has(msg.tool)&&msg.tool!=='save_draft')channel.postMessage({type:'ledger-changed'});
  checkReminders(msg.mobilePageId);
 }catch(e){await cindy.send({type:'tool-result',callId:msg.callId,ok:false,errorCode:e.code||'LEDGER_ERROR',message:e.message||'记账失败，请刷新账本并查询原请求'});}
});
ledger.init().then(()=>checkReminders()).catch(e=>channel.postMessage({type:'ledger-notice',message:e.message}));
