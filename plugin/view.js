/* Shared, dependency-free ledger rules. Amounts are always integer fen. */
(function (root) {
  'use strict';
  const MAX_CENTS = 100000000000;
  function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
  function text(value, name, max=200, optional=false) {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > max) fail('INVALID_INPUT', name+'无效，请填写不超过 '+max+' 字的内容');
    return value.trim();
  }
  function amount(value) {
    const s=String(value);
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(s)) fail('INVALID_AMOUNT','金额须大于 0，最多两位小数，且不使用科学计数法');
    const [whole, fraction='']=s.split('.');
    const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if (!Number.isSafeInteger(cents) || cents<=0 || cents>MAX_CENTS) fail('INVALID_AMOUNT','金额须大于 0 且不超过 10 亿元');
    return cents;
  }
  function date(s) {
    if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s<'1900-01-01'||s>'9998-12-31') fail('INVALID_DATE','日期须为 1900–9998 年的 YYYY-MM-DD');
    const d=new Date(s+'T00:00:00Z');
    if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==s) fail('INVALID_DATE','日期不存在，请重新选择');
    return s;
  }
  function today() { const d=new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); }
  function month(s) { if(typeof s!=='string'||!/^\d{4}-\d{2}$/.test(s)) fail('INVALID_DATE','月份须为 YYYY-MM'); date(s+'-01'); return s; }
  function nextDue(anchor, cycle, index) {
    date(anchor); if(!['weekly','monthly','yearly'].includes(cycle)||!Number.isSafeInteger(index)||index<0) fail('INVALID_CYCLE','周期或期数无效');
    const [year,mon,day]=anchor.split('-').map(Number); let d;
    if(cycle==='weekly') { d=new Date(anchor+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+index*7); }
    else { d=new Date(Date.UTC(year,mon-1+index*(cycle==='yearly'?12:1),1)); const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,last)); }
    return date(d.toISOString().slice(0,10));
  }
  function timezone(value){text(value,'时区',80);try{new Intl.DateTimeFormat('zh-CN',{timeZone:value}).format();}catch{fail('INVALID_TIMEZONE','时区无效，请使用 Asia/Shanghai 等 IANA 时区');}return value;}
  function reminderTime(value,now=Date.now()){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))fail('INVALID_TIME','提醒时间须为含时区的 ISO 时间，例如 2026-11-06T08:30:00+08:00');
    date(value.slice(0,10));const hour=+value.slice(11,13),minute=+value.slice(14,16),second=value[16]===':'?+value.slice(17,19):0;
    const offset=value.match(/[+-](\d{2}):(\d{2})$/);if(hour>23||minute>59||second>59||(offset&&(+offset[1]>14||+offset[2]>59||(+offset[1]===14&&+offset[2]!==0))))fail('INVALID_TIME','提醒时间不存在，请重新选择');
    const timestamp=Date.parse(value);if(!Number.isFinite(timestamp)||timestamp<=now)fail('PAST_REMINDER','请选择未来的提醒时间');return new Date(timestamp).toISOString();
  }
  function canonical(obj) { if(Array.isArray(obj)) return '['+obj.map(canonical).join(',')+']'; if(obj&&typeof obj==='object') return '{'+Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+canonical(obj[k])).join(',')+'}'; return JSON.stringify(obj); }
  function id() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0'));
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10).join('');
  }
  const money=c=>(c/100).toFixed(2);
  const csvCell=v=>{let s=String(v??''); if(/^[=+\-@\t\r]/.test(s))s="'"+s; return '"'+s.replaceAll('"','""')+'"';};
  root.LedgerCore={reminderTime,timezone,amount,date,today,month,nextDue,text,fail,canonical,id,money,csvCell,MAX_CENTS};
})(globalThis);

globalThis.LedgerViewCategories=[{"key": "food", "label": "餐饮", "type": "expense"}, {"key": "shopping", "label": "购物", "type": "expense"}, {"key": "transport", "label": "交通", "type": "expense"}, {"key": "phone", "label": "通讯", "type": "expense"}, {"key": "clothes", "label": "服饰", "type": "expense"}, {"key": "beauty", "label": "美容", "type": "expense"}, {"key": "housing", "label": "住房", "type": "expense"}, {"key": "travel", "label": "旅行", "type": "expense"}, {"key": "digital", "label": "数码", "type": "expense"}, {"key": "medical", "label": "医疗", "type": "expense"}, {"key": "pet", "label": "宠物", "type": "expense"}, {"key": "express", "label": "快递", "type": "expense"}, {"key": "fun", "label": "娱乐", "type": "expense"}, {"key": "sport", "label": "运动", "type": "expense"}, {"key": "family", "label": "亲子", "type": "expense"}, {"key": "social", "label": "社交", "type": "expense"}, {"key": "daily", "label": "日用", "type": "expense"}, {"key": "education", "label": "教育", "type": "expense"}, {"key": "finance", "label": "理财", "type": "expense"}, {"key": "transfer", "label": "转账", "type": "expense"}, {"key": "other_expense", "label": "其他支出", "type": "expense"}, {"key": "salary", "label": "工资", "type": "income"}, {"key": "investment", "label": "投资收益", "type": "income"}, {"key": "transfer_in", "label": "他人转入", "type": "income"}, {"key": "bonus", "label": "红包收入", "type": "income"}, {"key": "refund", "label": "退款", "type": "income"}, {"key": "credit", "label": "信用借还", "type": "income"}, {"key": "other_income", "label": "其他收入", "type": "income"}];

(function(root){
'use strict';
function create({id,onMessage=()=>{},retryMs=400,wakeTimeout=5000,connectTimeout=8000}){
 const channel=new BroadcastChannel('liang-ledger'),pending=new Map();
 let closed=false,handshake=null,waking=null,ready=null,wakeController=null;
 const error=(code,message)=>Object.assign(new Error(message),{code});
 function finish(requestId,err,result){
  const p=pending.get(requestId);if(!p)return;
  pending.delete(requestId);clearTimeout(p.timer);clearInterval(p.retry);
  err?p.reject(err):p.resolve(result);
 }
 async function wake(){
  if(waking)return waking;
  waking=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),wakeTimeout);wakeController=controller;
   try{
    const response=await fetch('/wake',{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw error('WAKE_FAILED','无法唤醒插件（HTTP '+response.status+'）。请在 Cindy 中启用阿龍记账，再重新连接。');
    let result;try{result=await response.json();}catch{throw error('INVALID_HOST','当前页面没有 Cindy 插件连接。请从 Cindy 的“更多 → 阿龍记账”打开正式工作台。');}
    if(!['running','starting'].includes(result.state))throw error('WAKE_FAILED','插件尚未运行（'+String(result.state||'未知状态')+'）。请在 Cindy 插件页检查启用状态，再重新连接。');
   }catch(e){
    if(closed)throw error('CLOSED','页面已关闭');
    if(typeof e.code==='string')throw e;
    throw error('WAKE_UNAVAILABLE','无法访问插件连接。请从 Cindy 的“更多 → 阿龍记账”打开工作台；手机使用时请确认绑定电脑在线。');
   }finally{clearTimeout(timer);wakeController=null;}
  })();
  try{return await waking;}finally{waking=null;}
 }
 function exchange(tool,args,timeout,retry=false){
  if(closed)return Promise.reject(error('CLOSED','页面已关闭'));
  const requestId=id(),message={type:'ledger-request',requestId,tool,args};
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(requestId,error('TIMEOUT',tool==='ping'?'插件已唤醒，但工作台未收到回应。请重新打开 Cindy 内的阿龍记账工作台。':'插件响应超时。写入结果可能已保存，请先查询原请求；AI 解析请勿连续提交。')),timeout);
   const p={resolve,reject,timer,retry:null};pending.set(requestId,p);
   try{channel.postMessage(message);if(retry)p.retry=setInterval(()=>{try{channel.postMessage(message);}catch(e){finish(requestId,e);}},retryMs);}
   catch(e){finish(requestId,e);}
  });
 }
 channel.onmessage=e=>{
  const m=e.data||{};
  if(m.type!=='ledger-response'){onMessage(m);return;}
  finish(m.requestId,m.ok?null:error(m.errorCode||'LEDGER_ERROR',m.message||'操作失败，请查询原请求'),m.result);
 };
 async function connect(){
  if(closed)throw error('CLOSED','页面已关闭');
  if(handshake)return handshake;
  handshake=(async()=>{await wake();if(closed)throw error('CLOSED','页面已关闭');return exchange('ping',{},connectTimeout,true);})();
  try{ready=await handshake;return ready;}catch(e){ready=null;throw e;}finally{handshake=null;}
 }
 async function send(tool,args={},timeout=12000){
  if(tool==='ping')return connect();
  if(!ready)await connect();
  try{return await exchange(tool,args,timeout);}catch(e){if(e.code==='TIMEOUT')ready=null;throw e;}
 }
 function close(){closed=true;ready=null;wakeController?.abort();for(const requestId of pending.keys())finish(requestId,error('CLOSED','页面已关闭'));channel.close();}
 return {send,connect,close};
}
root.LedgerTransport={create};
})(globalThis);

(function(){
'use strict';
window.addEventListener('error', e => {
 const n = document.getElementById('notice');
 if (n) { n.style.display = 'block'; n.style.color = '#b5534c'; n.textContent = '页面脚本异常: ' + (e.message || e); }
});
window.addEventListener('unhandledrejection', e => {
 const n = document.getElementById('notice');
 if (n) { n.style.display = 'block'; n.style.color = '#b5534c'; n.textContent = '异步调用异常: ' + (e.reason?.message || e.reason); }
});
try{
const C=LedgerCore,$=id=>document.getElementById(id);
const forms={bill:$('bill'),subscription:$('subscription')};
let categories=globalThis.LedgerViewCategories||[],tab='today',offset=0,total=0,items=[],summary=null,editBill=null,editSub=null,loading=false,saving=false,draftTimer,loadVersion=0;
let connected=false,editReminder=null,reminderZone=Intl.DateTimeFormat().resolvedOptions().timeZone;
const transport=LedgerTransport.create({id:C.id,onMessage:m=>{
 if(m.type==='ledger-changed'){if(connected&&!saving&&!loading)refresh();}
 if(m.type==='ledger-notice')notice(m.message);
}});
function storageGet(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function storageSet(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
const clientId=storageGet('ledger-client',null)||C.id();storageSet('ledger-client',clientId);
let unresolved=storageGet('ledger-pending',null);
if(!unresolved||typeof unresolved!=='object'||typeof unresolved.tool!=='string'||typeof unresolved.args?.requestId!=='string')unresolved=null;
const money=c=>'¥'+C.money(c);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const values=f=>Object.fromEntries(new FormData(f).entries());
function assign(f,v){for(const [k,value]of Object.entries(v||{}))if(f.elements.namedItem(k))f.elements.namedItem(k).value=value;}
function notice(t){$('notice').textContent=t||'';}
const send=(tool,args={},timeout)=>transport.send(tool,args,timeout);
async function connect(){const result=await transport.connect();connected=true;return result;}
function safeReqId(req){return req?.args?.requestId || req?.requestId || '';}
function setWrites(){
 try{
  document.querySelectorAll('[data-write]').forEach(b=>b.disabled=saving||Boolean(unresolved)||!connected);
  const validPending=Boolean(unresolved && safeReqId(unresolved));
  const rec=$('recovery');
  if(rec)rec.hidden=!validPending;
  const pt=$('pendingText');
  if(pt&&validPending)pt.textContent='请求 '+safeReqId(unresolved)+'；结果可能已保存，请先查询。';
 }catch(err){console.error('setWrites error',err);}
}
async function recover(){
 if(!unresolved)return;
 const reqId=safeReqId(unresolved);
 if(!reqId){unresolved=null;storageSet('ledger-pending',null);setWrites();return;}
 try{
  const r=await send('query_request',{requestId:reqId});
  if(r.state==='completed'){
   unresolved=null;storageSet('ledger-pending',null);
   $('retryPending').hidden=true;
   notice('已找到原请求，写入已完成。');
   resetAfterSave();setWrites();await refresh();
  }else{
   $('pendingText').textContent='尚未查到原请求。先核对账单或订阅，再手动重发同一请求；系统不会自动重发。';
   $('retryPending').hidden=false;
  }
 }catch(e){notice(e.message);}
}
async function write(tool,args){
 if(unresolved)throw Error('请先查询上一项写入结果，再记录新账单。');
 await connect();
 const reqId=C.id();
 const request={tool,args:{...args,requestId:reqId}};
 unresolved=request;storageSet('ledger-pending',request);saving=true;setWrites();
 try{
  const r=await send(tool,request.args);
  unresolved=null;storageSet('ledger-pending',null);return r;
 }catch(e){
  if(e.code==='TIMEOUT'){
   try{
    const status=await send('query_request',{requestId:reqId});
    if(status.state==='completed'){
     unresolved=null;storageSet('ledger-pending',null);
     return status.result;
    }
   }catch{}
  }else{
   unresolved=null;storageSet('ledger-pending',null);
  }
  throw e;
 }finally{
  saving=false;setWrites();
 }
}
$('queryPending').onclick=recover;
$('retryPending').onclick=async()=>{if(!unresolved)return;const p=unresolved;saving=true;setWrites();try{await send(p.tool,p.args);unresolved=null;storageSet('ledger-pending',null);resetAfterSave();notice('原请求已完成。');await refresh();}catch(e){notice(e.message);}finally{saving=false;setWrites();}};
function options(kind){return categories.filter(x=>x.type===kind).map(x=>'<option value="'+x.key+'">'+esc(x.label)+'</option>').join('');}
function fillBillCategories(){const old=forms.bill.elements.category.value;forms.bill.elements.category.innerHTML=options(forms.bill.elements.kind.value);if(categories.some(x=>x.key===old&&x.type===forms.bill.elements.kind.value))forms.bill.elements.category.value=old;}
function showEditor(which){forms.bill.hidden=which!=='bill';forms.subscription.hidden=which!=='subscription';$('reminder').hidden=which!=='reminder';$('showReminder').setAttribute('aria-pressed',String(which==='reminder'));$('aiEntry').hidden=which!=='ai';$('showBill').setAttribute('aria-pressed',String(which==='bill'));$('showSub').setAttribute('aria-pressed',String(which==='subscription'));$('showAi').setAttribute('aria-pressed',String(which==='ai'));}
$('showBill').onclick=()=>showEditor('bill');$('showSub').onclick=()=>showEditor('subscription');$('showAi').onclick=()=>showEditor('ai');$('showReminder').onclick=()=>showEditor('reminder');$('quickReminder').onclick=()=>{chooseTab('reminders');$('editor').scrollIntoView({block:'nearest'});$('reminder').elements.title.focus();};
$('quickAdd').onclick=()=>{showEditor('bill');$('editor').scrollIntoView({block:'nearest'});forms.bill.elements.amount.focus();};
function defaults(){if(!forms.bill.elements.occurredOn.value)forms.bill.elements.occurredOn.value=C.today();if(!forms.subscription.elements.nextDue.value)forms.subscription.elements.nextDue.value=C.nextDue(C.today(),'monthly',1);}
function resetBill(){editBill=null;forms.bill.reset();fillBillCategories();defaults();$('billTitle').textContent='记录账单';$('cancelBill').hidden=true;$('billError').textContent='';}
function resetSub(){editSub=null;forms.subscription.reset();defaults();$('subTitle').textContent='添加订阅';$('cancelSub').hidden=true;$('subError').textContent='';}
function resetAfterSave(){if(forms.subscription.hidden)resetBill();else resetSub();scheduleDraft();}
$('cancelBill').onclick=()=>{resetBill();scheduleDraft();};$('cancelSub').onclick=()=>{resetSub();scheduleDraft();};
forms.bill.elements.kind.onchange=()=>{fillBillCategories();scheduleDraft();};
function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,650);}
async function saveDraft(){if(!connected||saving||unresolved||!categories.length)return;const requestId=C.id();try{await send('save_draft',{clientId,value:{bill:values(forms.bill),subscription:values(forms.subscription),editBill,editSub},requestId});$('draftStatus').textContent='草稿已保存在电脑账本中';}catch(e){if(e.code==='TIMEOUT'){try{const r=await send('query_request',{requestId});if(r.state==='completed'){$('draftStatus').textContent='草稿已保存在电脑账本中';return;}}catch{}}$('draftStatus').textContent='草稿结果待确认，请保留输入：'+e.message;}}
for(const f of Object.values(forms))f.addEventListener('input',scheduleDraft);
forms.bill.onsubmit=async e=>{e.preventDefault();clearTimeout(draftTimer);$('billError').textContent='';try{const a=values(forms.bill);C.amount(a.amount);C.date(a.occurredOn);await write(editBill?'edit_bill':'record_bill',{...a,...(editBill||{})});resetBill();scheduleDraft();notice('账单已保存。');await refresh();}catch(e){$('billError').textContent=e.message;}};
forms.subscription.onsubmit=async e=>{e.preventDefault();clearTimeout(draftTimer);$('subError').textContent='';try{const a=values(forms.subscription);C.amount(a.amount);C.text(a.name,'订阅名称',80);C.date(a.nextDue);await write(editSub?'update_subscription':'create_subscription',{...a,...(editSub||{})});resetSub();scheduleDraft();notice('订阅已保存，到期后请确认或跳过本期。');await refresh();}catch(e){$('subError').textContent=e.message;}};
document.querySelectorAll('[data-example]').forEach(button=>button.onclick=()=>{$('aiText').value=button.dataset.example;$('aiText').focus();});
$('aiEntry').onsubmit=async event=>{
 event.preventDefault();
 const input=$('aiText').value.trim();
 if(!input){$('aiError').textContent='请先描述一笔账单或订阅';return;}
 $('aiError').textContent='';$('aiParse').disabled=true;$('aiParseLabel').textContent='AI 正在解析…';
 try{
  const result=await send('parse_ledger_text',{text:input},65000),draft=result.draft;
  if(draft.type==='bill'){
   resetBill();forms.bill.elements.kind.value=draft.kind;fillBillCategories();assign(forms.bill,{kind:draft.kind,amount:draft.amount,category:draft.category,note:draft.note,occurredOn:draft.occurredOn});showEditor('bill');notice('AI 账单草稿已填入，请核对金额、分类和日期后保存。');
  }else{
   resetSub();assign(forms.subscription,{name:draft.name,amount:draft.amount,category:draft.category,cycle:draft.cycle,nextDue:draft.nextDue,note:draft.note});showEditor('subscription');notice('AI 订阅草稿已填入，请核对周期和到期日后保存。');
  }
  $('editor').scrollIntoView({block:'nearest'});
 }catch(error){$('aiError').textContent=error.message;}
 finally{$('aiParse').disabled=false;$('aiParseLabel').textContent='生成待核对草稿';}
};
function chooseTab(t){$('reminderControls').hidden=t!=='reminders';tab=t;offset=0;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===t)));$('billControls').hidden=t!=='history';$('subControls').hidden=t!=='subscriptions';$('listHeading').textContent={today:'今日账单',history:'全部账单',subscriptions:'订阅',reminders:'生活提醒',categories:'分类统计'}[t];showEditor(t==='reminders'?'reminder':t==='subscriptions'?'subscription':'bill');refresh();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>chooseTab(b.dataset.tab));
$('goDue').onclick=()=>{$('subStatus').value='due';chooseTab('subscriptions');};$('month').value=C.today().slice(0,7);$('month').onchange=()=>{offset=0;refresh();};$('reminderStatus').onchange=()=>{offset=0;refresh();};$('subStatus').onchange=()=>{offset=0;refresh();};$('searchBills').onclick=()=>{offset=0;refresh();};$('refresh').onclick=async()=>{notice('');$('connectionStatus').dataset.state='connecting';$('connectionStatus').textContent='正在连接';try{await connect();setWrites();$('connectionStatus').dataset.state='ready';$('connectionStatus').textContent='已连接账本';await refresh();if(unresolved)await recover();}catch(e){$('connectionStatus').dataset.state='failed';$('connectionStatus').textContent='连接失败';notice(e.message);}};
$('prev').onclick=()=>{offset=Math.max(0,offset-20);refresh();};$('next').onclick=()=>{if(offset+20<total){offset+=20;refresh();}};

function localInput(d){const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());}
function dueLabel(value,zone){try{return new Intl.DateTimeFormat('zh-CN',{timeZone:zone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}catch{return value;}}
function resetReminder(){editReminder=null;$('reminder').reset();$('reminder').elements.dueLocal.value=localInput(new Date(Date.now()+3600000));$('reminderTitle').textContent='添加生活提醒';$('cancelReminder').hidden=true;$('reminderError').textContent='';}
function reminderHtml(x){const state={pending:'等待提醒',sent:'已提交屏幕提示',failed:'提示未送达，将重试',uncertain:'投递结果待核实'},active=x.status==='active';return '<article class="entry reminder-entry"><svg class="inline-icon"><use href="#icon-bell"/></svg><div class="entry-main"><div class="entry-title">'+esc(x.title)+'</div><div class="entry-time">'+esc(dueLabel(x.due_at,x.timezone))+' <span>'+esc(x.timezone)+'</span></div><div class="entry-meta">'+esc(x.note)+'</div><div class="entry-meta">'+(active?state[x.delivery_state]||'等待提醒':x.status==='completed'?'已完成':'已取消')+(x.notified_at?' · '+esc(dueLabel(x.notified_at,x.timezone)):'')+'</div>'+(x.delivery_error?'<p class="error">'+esc(x.delivery_error)+'</p>':'')+'<div class="entry-actions">'+(active?'<button data-write data-act="complete-reminder" data-id="'+x.id+'">标为完成</button><button data-act="edit-reminder" data-id="'+x.id+'">改期 / 编辑</button><button data-write data-act="cancel-reminder" data-id="'+x.id+'">取消提醒</button>':'')+'</div></div></article>';}
$('cancelReminder').onclick=resetReminder;
$('tomorrowMorning').onclick=()=>{const d=new Date();d.setDate(d.getDate()+1);d.setHours(8,30,0,0);$('reminder').elements.dueLocal.value=localInput(d);};
$('inTenMinutes').onclick=()=>{$('reminder').elements.dueLocal.value=localInput(new Date(Date.now()+600000));};
$('reminder').onsubmit=async e=>{e.preventDefault();$('reminderError').textContent='';try{const a=values($('reminder'));C.text(a.title,'提醒内容',100);if(!a.dueLocal)throw Error('请选择提醒时间');const d=new Date(a.dueLocal);if(localInput(d)!==a.dueLocal)throw Error('所选时间不存在，请重新选择');const dueAt=C.reminderTime(d.toISOString().replace('.000Z','Z'));await write(editReminder?'update_reminder':'create_reminder',{title:a.title,note:a.note,dueAt,timezone:reminderZone,...(editReminder||{})});resetReminder();notice('提醒已保存，将在电脑唤醒且 Cindy 运行时检查。');await refresh();}catch(e){$('reminderError').textContent=e.message;}};
resetReminder();$('reminderTimeHint').textContent='输入时间采用当前设备时区：'+reminderZone;

function billHtml(x){return '<article class="entry" data-kind="'+esc(x.kind)+'"><img src="assets/'+esc(x.category)+'.png" alt=""><div class="entry-main"><div class="entry-title">'+esc(x.category_label)+'</div><div class="entry-meta">'+esc(x.occurred_on)+' · '+esc(x.note||'无备注')+'</div><div class="entry-actions"><button class="secondary" data-act="edit-bill" data-id="'+x.id+'">编辑账单</button></div></div><div class="entry-amount">'+(x.kind==='income'?'+':'−')+money(x.amount_cents)+'</div></article>';}
function subHtml(x){const active=x.status==='active',due=active&&x.next_due<=C.today(),button=(action,label)=>'<button data-write class="secondary" data-act="'+action+'" data-id="'+x.id+'">'+label+'</button>';return '<article class="entry"><img src="assets/'+esc(x.category)+'.png" alt=""><div class="entry-main"><div class="entry-title">'+esc(x.name)+'</div><div class="entry-meta">'+({active:'启用',paused:'暂停',archived:'归档'}[x.status])+' · '+({weekly:'每周',monthly:'每月',yearly:'每年'}[x.cycle])+' · '+esc(x.next_due)+(due?' · 到期待确认':'')+'</div><div class="entry-meta">'+esc(x.note)+'</div><div class="entry-actions">'+(due?button('confirm','确认已扣款')+button('skip','跳过本期'):'')+button('edit-sub','编辑')+(active?button('pause','暂停'):button('resume','启用'))+(x.status==='archived'?'':button('archive','归档'))+'</div></div><div class="entry-amount">'+money(x.amount_cents)+'</div></article>';}
function categoryHtml(){if(!summary.categories.length)return '<p class="empty">这个月还没有账单。记录收支后，这里会按分类汇总。</p>';return summary.categories.map(x=>{const base=x.kind==='income'?summary.income_cents:summary.expense_cents,percent=base?Math.round(x.cents/base*100):0;return '<div class="category-row"><div class="category-top"><span>'+esc(x.label)+' · '+(x.kind==='income'?'收入':'支出')+' <span class="muted">'+x.count+' 笔</span></span><strong>'+money(x.cents)+'</strong></div><div class="bar" role="img" aria-label="占'+percent+'%"><span style="width:'+percent+'%"></span></div></div>';}).join('');}
async function refresh(){
 const version=++loadVersion;loading=true;$('refresh').disabled=true;
 try{
 const [sum,due]=await Promise.all([send('get_summary',{month:$('month').value}),send('due_items')]);if(version!==loadVersion)return;summary=sum;
 $('expense').textContent=money(sum.expense_cents);$('income').textContent=money(sum.income_cents);$('net').textContent=money(sum.net_cents);$('due').textContent=due.total;
 let r;
 if(tab==='categories'){items=[];total=0;$('list').innerHTML=categoryHtml();$('pager').hidden=true;return;}
 if(tab==='reminders'){r=await send('list_reminders',{status:$('reminderStatus').value,offset});}
 else if(tab==='subscriptions'){const s=$('subStatus').value;r=await send(s==='due'?'due_items':'list_subscriptions',s==='due'?{offset}:{status:s,offset});}
 else{const args={offset,limit:20};if(tab==='today'){args.from=C.today();args.to=C.today();}else{if($('billFrom').value)args.from=$('billFrom').value;if($('billTo').value)args.to=$('billTo').value;if($('billCategory').value)args.category=$('billCategory').value;}r=await send('query_bills',args);}
 if(version!==loadVersion)return;items=r.items;total=r.total;
 if(offset>=total&&offset>0){offset=0;return await refresh();}
 $('list').innerHTML=items.length?items.map(tab==='reminders'?reminderHtml:tab==='subscriptions'?subHtml:billHtml).join(''):'<p class="empty">'+(tab==='reminders'?'没有符合条件的提醒。点击“添加提醒”，或在 Cindy 对话中说“明早八点半提醒我喝药”。':tab==='subscriptions'?'没有符合条件的订阅。添加周期支出后，到期会出现在这里。':tab==='today'?'今天还没有账单。在旁边或上方表单中记录第一笔收支。':'没有符合条件的账单。试试调整日期与分类。')+'</p>';
 $('pager').hidden=total<=20;$('prev').disabled=offset===0;$('next').disabled=offset+20>=total;$('pageInfo').textContent=(total?offset+1:0)+'–'+Math.min(offset+20,total)+' / '+total;setWrites();
 }catch(e){notice(e.message);$('list').textContent='读取失败。保留原表单，请检查电脑与 Library 后点击刷新账本。';}
 finally{if(version===loadVersion){loading=false;$('refresh').disabled=false;}}
}
$('list').onclick=async e=>{
 const b=e.target.closest('[data-act]');if(!b)return;const x=items.find(v=>v.id===b.dataset.id);if(!x)return;const act=b.dataset.act;
 if(act==='edit-reminder'){editReminder={id:x.id,revision:x.revision};assign($('reminder'),{title:x.title,note:x.note,dueLocal:localInput(new Date(x.due_at))});$('reminderTitle').textContent='编辑提醒';$('cancelReminder').hidden=false;showEditor('reminder');$('editor').scrollIntoView({block:'nearest'});return;}
 if(act==='complete-reminder'||act==='cancel-reminder'){try{await write('update_reminder',{id:x.id,revision:x.revision,status:act==='complete-reminder'?'completed':'cancelled'});notice(act==='complete-reminder'?'已标记完成。':'已取消提醒。');await refresh();}catch(e){notice(e.message);}return;}
 if(act==='edit-bill'){editBill={id:x.id,revision:x.revision};forms.bill.elements.kind.value=x.kind;fillBillCategories();assign(forms.bill,{kind:x.kind,amount:C.money(x.amount_cents),category:x.category,note:x.note,occurredOn:x.occurred_on});$('billTitle').textContent='编辑账单';$('cancelBill').hidden=false;showEditor('bill');$('editor').scrollIntoView({block:'nearest'});forms.bill.elements.amount.focus();scheduleDraft();return;}
 if(act==='edit-sub'){editSub={id:x.id,revision:x.revision};assign(forms.subscription,{name:x.name,amount:C.money(x.amount_cents),category:x.category,note:x.note,cycle:x.cycle,nextDue:x.next_due});$('subTitle').textContent='编辑订阅';$('cancelSub').hidden=false;showEditor('subscription');$('editor').scrollIntoView({block:'nearest'});forms.subscription.elements.name.focus();scheduleDraft();return;}
 try{if(act==='confirm'||act==='skip')await write(act==='confirm'?'confirm_subscription_charge':'skip_subscription_period',{id:x.id,periodKey:x.period_key});else if(act==='pause')await write('pause_subscription',{id:x.id,revision:x.revision});else await write('update_subscription',{id:x.id,revision:x.revision,status:act==='archive'?'archived':'active'});notice({confirm:'本期已确认入账。',skip:'已跳过本期，不产生账单。',pause:'已暂停订阅。',resume:'已启用订阅。',archive:'已归档订阅。'}[act]);await refresh();}catch(e){notice(e.message);}
};
async function exportAll(){const version=await send('export_token');const data={schemaVersion:1,currency:'CNY',exportedAt:new Date().toISOString(),bills:[],subscriptions:[],periods:[],reminders:[]};for(const table of ['bills','subscriptions','periods','reminders']){let at=0;while(true){const part=await send('export_page',{table,offset:at});data[table].push(...part);at+=part.length;if(part.length<20)break;}}if(version!==await send('export_token'))throw Error('导出期间账本发生变化，请停止编辑后重新导出');return data;}
async function download(format){$('json').disabled=$('csv').disabled=true;try{const data=await exportAll();let content,type,name;if(format==='json'){content=JSON.stringify(data,null,2);type='application/json';name='阿龍记账-'+C.today()+'.json';}else{const rows=[['日期','收支','金额分','币种','分类','备注','账单标识','订阅标识','周期键'],...data.bills.map(x=>[x.occurred_on,x.kind,x.amount_cents,'CNY',categories.find(c=>c.key===x.category)?.label||x.category,x.note,x.id,x.subscription_id,x.period_key])];content='﻿'+rows.map(r=>r.map(C.csvCell).join(',')).join('\r\n');type='text/csv;charset=utf-8';name='阿龍记账-'+C.today()+'.csv';}const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已生成'+name+'；请在下载位置确认文件。CSV 仅包含账单，完整备份请使用 JSON。');}catch(e){notice('导出失败：'+e.message);}finally{$('json').disabled=$('csv').disabled=false;}}
$('json').onclick=()=>download('json');$('csv').onclick=()=>download('csv');
window.addEventListener('pagehide',()=>{clearTimeout(draftTimer);transport.close();});
(async()=>{
 try{
  setWrites();
  fillBillCategories();
  if(forms.subscription?.elements?.category){
   forms.subscription.elements.category.innerHTML=options('expense');
   forms.subscription.elements.category.value='digital';
  }
  const bcSelect=$('billCategory');
  if(bcSelect&&bcSelect.options.length<=1){
   bcSelect.insertAdjacentHTML('beforeend',categories.map(x=>'<option value="'+x.key+'">'+esc(x.label)+'</option>').join(''));
  }
  defaults();
 }catch(preErr){
  console.error('Pre-init error',preErr);
 }
 try{
  const p=await connect();
  categories=p.categories;const context=await send('get_summary',{contextOnly:true});$('reminderClock').textContent='电脑时区 '+context.timezone;
  $('connectionStatus').dataset.state='ready';$('connectionStatus').textContent='已连接账本';setWrites();
  fillBillCategories();
  try{
   const draft=await send('get_draft',{clientId},3000);
   if(draft.bill){assign(forms.bill,draft.bill);fillBillCategories();assign(forms.bill,draft.bill);}
   if(draft.subscription)assign(forms.subscription,draft.subscription);
   editBill=draft.editBill||null;editSub=draft.editSub||null;
   if(editBill){$('billTitle').textContent='编辑账单';$('cancelBill').hidden=false;}
   if(editSub){$('subTitle').textContent='编辑订阅';$('cancelSub').hidden=false;}
  }catch(draftErr){console.warn('Draft load failed',draftErr);}
  defaults();
  await refresh();
  if(unresolved)await recover();
 }catch(e){
  $('connectionStatus').dataset.state='failed';$('connectionStatus').textContent='连接失败';
  notice(e.message);
  $('list').innerHTML='<div class="empty"><strong>暂时没有连上账本</strong><p>请从 Cindy 的“更多 → 阿龍记账”打开正式工作台。浏览器中的临时预览不连接真实账本。</p></div>';
 }
})();
}catch(error){const notice=document.getElementById('notice');if(notice)notice.textContent='页面初始化失败：'+error.message;const list=document.getElementById('list');if(list)list.textContent='请重新打开工作台；若仍失败，请更新插件。';console.error(error);}
})();
