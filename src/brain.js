'use strict';
const ledger=LedgerService.createService(req=>cindy.library(req),LedgerCategories);
const channel=new BroadcastChannel('liang-ledger');
const publicTools=new Set(LEDGER_TOOLS);
const pageTools=new Set([...publicTools,'ping','due_items','get_draft','save_draft','export_page','export_token']);
let reminderTail=Promise.resolve();
function validateAiDraft(draft){
 if(!draft||typeof draft!=='object')LedgerCore.fail('AI_INVALID_DRAFT','AI 没有返回可识别的内容，请换个说法');
 const category=LedgerCategories.find(item=>item.key===draft.category);
 if(draft.type==='bill'){
  const kind=draft.kind==='income'?'income':'expense';
  if(!category||category.type!==kind)LedgerCore.fail('AI_INVALID_CATEGORY','AI 返回的分类不匹配，请手动选择分类');
  return {type:'bill',kind,amount:LedgerCore.money(LedgerCore.amount(draft.amount)),category:category.key,note:LedgerCore.text(draft.note,'备注',300,true),occurredOn:draft.occurredOn?LedgerCore.date(draft.occurredOn):LedgerCore.today()};
 }
 if(draft.type==='subscription'){
  if(!category||category.type!=='expense')LedgerCore.fail('AI_INVALID_CATEGORY','订阅只能使用支出分类，请手动选择');
  if(!['weekly','monthly','yearly'].includes(draft.cycle))LedgerCore.fail('AI_INVALID_CYCLE','请补充每周、每月或每年的周期');
  return {type:'subscription',name:LedgerCore.text(draft.name,'订阅名称',80),amount:LedgerCore.money(LedgerCore.amount(draft.amount)),category:category.key,cycle:draft.cycle,nextDue:draft.nextDue?LedgerCore.date(draft.nextDue):'',note:LedgerCore.text(draft.note,'备注',300,true)};
 }
 LedgerCore.fail('AI_INVALID_DRAFT','请说明要记一笔账单，还是添加一个周期订阅');
}
async function parseLedgerText(args,context){
 const input=LedgerCore.text(args.text,'记账描述',1000);
 const categories=LedgerCategories.map(item=>({key:item.key,label:item.label,type:item.type}));
 const prompt=[
  '你是本地记账解析器。把用户的一句话解析成一条账单或一条周期订阅草稿，只输出 JSON，不执行写入。',
  '账单格式：{"type":"bill","kind":"expense|income","amount":"正数元","category":"分类key","note":"简短备注","occurredOn":"YYYY-MM-DD"}。',
  '订阅格式：{"type":"subscription","name":"名称","amount":"正数元","category":"支出分类key","cycle":"weekly|monthly|yearly","nextDue":"YYYY-MM-DD或空字符串","note":"备注"}。',
  '分类必须原样选择：'+JSON.stringify(categories)+'。无法确定支出分类用 other_expense，收入分类用 other_income。',
  '电脑本地今天是 '+LedgerCore.today()+'。金额最多两位小数，不要根据上下文编造付款事实。',
  '用户输入：'+input,
 ].join('\n');
 const response=await cindy.send({type:'cindy-request',kind:'oneshot_text',prompt,expectJson:true,maxTokens:500,...(context.callId?{callId:context.callId}:{})});
 if(!response?.ok)LedgerCore.fail(response?.errorCode||'AI_UNAVAILABLE',response?.message||'AI 暂时不可用，请检查模型配置后重试');
 let draft;
 try{draft=JSON.parse(response.text);}catch{LedgerCore.fail('AI_INVALID_JSON','模型返回格式无法识别，请重试或手动填写');}
 return {draft:validateAiDraft(draft),model:response.model||''};
}
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
async function execute(op,args,context={}){
 if(op==='ping'){await ledger.init();return {ready:true,today:LedgerCore.today(),currency:'CNY',categories:LedgerCategories};}
 if(op==='parse_ledger_text')return parseLedgerText(args,context);
 return ledger.dispatch(op,args||{});
}
channel.onmessage=async event=>{
 const m=event.data;if(!m||m.type!=='ledger-request'||typeof m.requestId!=='string'||!pageTools.has(m.tool))return;
 try{
  const result=await execute(m.tool,m.args,{mobilePageId:m.mobilePageId});
  channel.postMessage({type:'ledger-response',requestId:m.requestId,ok:true,result});
  if(LedgerService.WRITES.has(m.tool)&&m.tool!=='save_draft')channel.postMessage({type:'ledger-changed'});
  if(m.tool==='ping')checkReminders(m.mobilePageId);
 }catch(e){channel.postMessage({type:'ledger-response',requestId:m.requestId,ok:false,errorCode:e.code||'LEDGER_ERROR',message:e.message||'操作失败，请查询原请求'});}
};
cindy.onHostMessage(async msg=>{
 if(msg.type!=='tool-call')return;
 try{
  if(!publicTools.has(msg.tool))LedgerCore.fail('UNKNOWN_TOOL','未知工具，请重新发现插件工具');
  const result=await execute(msg.tool,msg.args,{callId:msg.callId,mobilePageId:msg.mobilePageId});
  await cindy.send({type:'tool-result',callId:msg.callId,ok:true,result});
  if(LedgerService.WRITES.has(msg.tool)&&msg.tool!=='save_draft')channel.postMessage({type:'ledger-changed'});
  checkReminders(msg.mobilePageId);
 }catch(e){await cindy.send({type:'tool-result',callId:msg.callId,ok:false,errorCode:e.code||'LEDGER_ERROR',message:e.message||'记账失败，请刷新账本并查询原请求'});}
});
ledger.init().then(()=>checkReminders()).catch(e=>channel.postMessage({type:'ledger-notice',message:e.message}));
