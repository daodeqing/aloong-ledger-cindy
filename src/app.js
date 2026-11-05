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
let categories=globalThis.LedgerViewCategories||[],tab='recent',offset=0,total=0,items=[],summary=null,editBill=null,editSub=null,loading=false,saving=false,draftTimer,loadVersion=0;
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
function chooseTab(t){$('trashControls').hidden=t!=='trash';$('reminderControls').hidden=t!=='reminders';tab=t;offset=0;document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===t)));$('billControls').hidden=t!=='history';$('subControls').hidden=t!=='subscriptions';$('listHeading').textContent={trash:'回收站',recent:'近期账单',today:'今日账单',history:'全部账单',subscriptions:'订阅',reminders:'生活提醒',categories:'分类统计'}[t];showEditor(t==='reminders'?'reminder':t==='subscriptions'?'subscription':'bill');refresh();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>chooseTab(b.dataset.tab));
$('goDue').onclick=()=>{$('subStatus').value='due';chooseTab('subscriptions');};$('month').value=C.today().slice(0,7);$('month').onchange=()=>{offset=0;refresh();};$('trashType').onchange=()=>{offset=0;refresh();};$('reminderStatus').onchange=()=>{offset=0;refresh();};$('subStatus').onchange=()=>{offset=0;refresh();};$('searchBills').onclick=()=>{offset=0;refresh();};$('refresh').onclick=async()=>{notice('');$('connectionStatus').dataset.state='connecting';$('connectionStatus').textContent='正在连接';try{await connect();setWrites();$('connectionStatus').dataset.state='ready';$('connectionStatus').textContent='已连接账本';await refresh();if(unresolved)await recover();}catch(e){$('connectionStatus').dataset.state='failed';$('connectionStatus').textContent='连接失败';notice(e.message);}};
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

function restoreButton(x){return '<button data-write data-act="restore" data-id="'+x.id+'">恢复'+($('trashType').value==='bills'?'账单':'订阅')+'</button>'; }
function billHtml(x){return '<article class="entry" data-kind="'+esc(x.kind)+'"><img src="assets/'+esc(x.category)+'.png" alt=""><div class="entry-main"><div class="entry-title">'+esc(x.category_label)+'</div><div class="entry-meta">'+esc(x.occurred_on)+' · '+esc(x.note||'无备注')+'</div><div class="entry-actions">'+(x.deleted?restoreButton(x):'<button class="secondary" data-act="edit-bill" data-id="'+x.id+'">编辑账单</button><button data-write class="danger-action" data-act="delete-bill" data-id="'+x.id+'">删除</button>')+'</div></div><div class="entry-amount">'+(x.kind==='income'?'+':'−')+money(x.amount_cents)+'</div></article>';}
function subHtml(x){const active=x.status==='active',due=active&&x.next_due<=C.today(),button=(action,label)=>'<button data-write class="secondary" data-act="'+action+'" data-id="'+x.id+'">'+label+'</button>';return '<article class="entry"><img src="assets/'+esc(x.category)+'.png" alt=""><div class="entry-main"><div class="entry-title">'+esc(x.name)+'</div><div class="entry-meta">'+({active:'启用',paused:'暂停',archived:'归档'}[x.status])+' · '+({weekly:'每周',monthly:'每月',yearly:'每年'}[x.cycle])+' · '+esc(x.next_due)+(due?' · 到期待确认':'')+'</div><div class="entry-meta">'+esc(x.note)+'</div><div class="entry-actions">'+(x.deleted?restoreButton(x):(due?button('confirm','确认已扣款')+button('skip','跳过本期'):'')+button('edit-sub','编辑')+(active?button('pause','暂停'):button('resume','启用'))+(x.status==='archived'?'':button('archive','归档'))+button('delete-sub','删除'))+'</div></div><div class="entry-amount">'+money(x.amount_cents)+'</div></article>';}
function categoryHtml(){if(!summary.categories.length)return '<p class="empty">这个月还没有账单。记录收支后，这里会按分类汇总。</p>';return summary.categories.map(x=>{const base=x.kind==='income'?summary.income_cents:summary.expense_cents,percent=base?Math.round(x.cents/base*100):0;return '<div class="category-row"><div class="category-top"><span>'+esc(x.label)+' · '+(x.kind==='income'?'收入':'支出')+' <span class="muted">'+x.count+' 笔</span></span><strong>'+money(x.cents)+'</strong></div><div class="bar" role="img" aria-label="占'+percent+'%"><span style="width:'+percent+'%"></span></div></div>';}).join('');}
function renderDashboard(sum,reminders){
 const change=sum.previous_expense_cents?((sum.expense_cents/sum.previous_expense_cents-1)*100):null;
 $('monthFacts').innerHTML='<span>共 <strong>'+sum.bill_count+'</strong> 笔</span><span>日均支出 <strong>'+money(sum.daily_average_cents)+'</strong></span><span>最大支出 <strong>'+money(sum.max_expense_cents)+'</strong></span><span>'+(change===null?'上月无支出，暂不比较':'较上月支出 '+(change>=0?'+':'')+change.toFixed(1)+'%')+'</span>';
 LedgerCharts.trend($('trendChart'),sum.daily);
 $('trendDay').max=sum.daily.length;$('trendDay').value=Math.min(Number($('trendDay').value),sum.daily.length);updateDay();
 LedgerCharts.pie($('pieChart'),sum.categories.filter(x=>x.kind==='expense'));
 $('pieCount').textContent=sum.categories.filter(x=>x.kind==='expense').length+' 个分类';
 $('activeSubs').textContent=sum.subscriptions.active_count+' 项';$('subEstimate').textContent='估算月成本 '+money(sum.subscriptions.estimated_monthly_cents);
 $('nextSub').textContent=sum.subscriptions.next_due||'暂无订阅';
 $('activeReminders').textContent=reminders.total+' 项';$('nextReminder').textContent=reminders.items[0]?reminders.items[0].title+' · '+dueLabel(reminders.items[0].due_at,reminders.items[0].timezone):'日常安排，在这里记住';
}
function updateDay(){if(!summary)return;const d=summary.daily[Number($('trendDay').value)-1];$('trendDetail').textContent=d.date+' · 支出 '+money(d.expense_cents)+' · 收入 '+money(d.income_cents);}
$('trendDay').oninput=updateDay;let chartResize;window.addEventListener('resize',()=>{clearTimeout(chartResize);chartResize=setTimeout(()=>{if(summary)LedgerCharts.trend($('trendChart'),summary.daily);},120);});
$('agendaSub').onclick=()=>chooseTab('subscriptions');$('agendaDue').onclick=()=>chooseTab('subscriptions');$('agendaReminder').onclick=()=>chooseTab('reminders');
async function refresh(){
 const version=++loadVersion;loading=true;$('refresh').disabled=true;
 try{
 const [sum,due,reminders]=await Promise.all([send('get_summary',{month:$('month').value}),send('due_items'),send('list_reminders',{status:'active'})]);if(version!==loadVersion)return;summary=sum;
 $('expense').textContent=money(sum.expense_cents);$('income').textContent=money(sum.income_cents);$('net').textContent=money(sum.net_cents);$('due').textContent=due.total;renderDashboard(sum,reminders);
 let r;
 if(tab==='categories'){items=[];total=0;$('list').innerHTML=categoryHtml();$('pager').hidden=true;return;}
 if(tab==='trash'){r=await send($('trashType').value==='bills'?'query_bills':'list_subscriptions',{deletedOnly:true,offset});}
 else if(tab==='reminders'){r=await send('list_reminders',{status:$('reminderStatus').value,offset});}
 else if(tab==='subscriptions'){const s=$('subStatus').value;r=await send(s==='due'?'due_items':'list_subscriptions',s==='due'?{offset}:{status:s,offset});}
 else{const args={offset,limit:tab==='recent'?6:20};if(tab==='today'){args.from=C.today();args.to=C.today();}else if(tab==='history'){if($('billFrom').value)args.from=$('billFrom').value;if($('billTo').value)args.to=$('billTo').value;if($('billCategory').value)args.category=$('billCategory').value;}r=await send('query_bills',args);}
 if(version!==loadVersion)return;items=r.items;total=r.total;$('list').classList.toggle('recent-grid',tab==='recent');$('listHint').textContent=tab==='recent'?'最近 6 笔 · 共 '+total+' 笔':tab==='trash'?'可恢复的记录':'共 '+total+' 项';
 if(offset>=total&&offset>0){offset=0;return await refresh();}
 $('list').innerHTML=items.length?items.map(tab==='reminders'?reminderHtml:tab==='subscriptions'||(tab==='trash'&&$('trashType').value==='subscriptions')?subHtml:billHtml).join(''):'<p class="empty">'+(tab==='trash'?'回收站是空的。已删除的账单和订阅可以在这里恢复。':tab==='reminders'?'没有符合条件的提醒。点击“添加提醒”，或在 Cindy 对话中说“明早八点半提醒我喝药”。':tab==='subscriptions'?'没有符合条件的订阅。添加周期支出后，到期会出现在这里。':tab==='today'?'今天还没有账单。在旁边或上方表单中记录第一笔收支。':'没有符合条件的账单。试试调整日期与分类。')+'</p>';
 $('pager').hidden=tab==='recent'||total<=20;$('prev').disabled=offset===0;$('next').disabled=offset+20>=total;$('pageInfo').textContent=(total?offset+1:0)+'–'+Math.min(offset+20,total)+' / '+total;setWrites();
 }catch(e){notice(e.message);$('list').textContent='读取失败。保留原表单，请检查电脑与 Library 后点击刷新账本。';}
 finally{if(version===loadVersion){loading=false;$('refresh').disabled=false;}}
}
$('list').onclick=async e=>{
 const b=e.target.closest('[data-act]');if(!b)return;const x=items.find(v=>v.id===b.dataset.id);if(!x)return;const act=b.dataset.act;
 if(act==='delete-bill'||act==='delete-sub'||act==='restore'){try{const isBill=act==='delete-bill'||(act==='restore'&&$('trashType').value==='bills');await write(isBill?'edit_bill':'update_subscription',{id:x.id,revision:x.revision,action:act==='restore'?'restore':'delete'});resetBill();resetSub();scheduleDraft();notice(act==='restore'?'已恢复记录。':'已移入回收站，可在回收站恢复。'+(isBill?'':'历史扣款账单已保留。'));await refresh();}catch(e){notice(e.message);}return;}
 if(act==='edit-reminder'){editReminder={id:x.id,revision:x.revision};assign($('reminder'),{title:x.title,note:x.note,dueLocal:localInput(new Date(x.due_at))});$('reminderTitle').textContent='编辑提醒';$('cancelReminder').hidden=false;showEditor('reminder');$('editor').scrollIntoView({block:'nearest'});return;}
 if(act==='complete-reminder'||act==='cancel-reminder'){try{await write('update_reminder',{id:x.id,revision:x.revision,status:act==='complete-reminder'?'completed':'cancelled'});notice(act==='complete-reminder'?'已标记完成。':'已取消提醒。');await refresh();}catch(e){notice(e.message);}return;}
 if(act==='edit-bill'){editBill={id:x.id,revision:x.revision};forms.bill.elements.kind.value=x.kind;fillBillCategories();assign(forms.bill,{kind:x.kind,amount:C.money(x.amount_cents),category:x.category,note:x.note,occurredOn:x.occurred_on});$('billTitle').textContent='编辑账单';$('cancelBill').hidden=false;showEditor('bill');$('editor').scrollIntoView({block:'nearest'});forms.bill.elements.amount.focus();scheduleDraft();return;}
 if(act==='edit-sub'){editSub={id:x.id,revision:x.revision};assign(forms.subscription,{name:x.name,amount:C.money(x.amount_cents),category:x.category,note:x.note,cycle:x.cycle,nextDue:x.next_due});$('subTitle').textContent='编辑订阅';$('cancelSub').hidden=false;showEditor('subscription');$('editor').scrollIntoView({block:'nearest'});forms.subscription.elements.name.focus();scheduleDraft();return;}
 try{if(act==='confirm'||act==='skip')await write(act==='confirm'?'confirm_subscription_charge':'skip_subscription_period',{id:x.id,periodKey:x.period_key});else if(act==='pause')await write('pause_subscription',{id:x.id,revision:x.revision});else await write('update_subscription',{id:x.id,revision:x.revision,status:act==='archive'?'archived':'active'});notice({confirm:'本期已确认入账。',skip:'已跳过本期，不产生账单。',pause:'已暂停订阅。',resume:'已启用订阅。',archive:'已归档订阅。'}[act]);await refresh();}catch(e){notice(e.message);}
};
async function exportAll(){const version=await send('export_token');const data={schemaVersion:2,currency:'CNY',exportedAt:new Date().toISOString(),bills:[],subscriptions:[],periods:[],reminders:[],deleted_records:[]};for(const table of ['bills','subscriptions','periods','reminders','deleted_records']){let at=0;while(true){const part=await send('export_page',{table,offset:at});data[table].push(...part);at+=part.length;if(part.length<20)break;}}if(version!==await send('export_token'))throw Error('导出期间账本发生变化，请停止编辑后重新导出');return data;}
async function download(format){$('json').disabled=$('csv').disabled=true;try{const data=await exportAll();let content,type,name;if(format==='json'){content=JSON.stringify(data,null,2);type='application/json';name='阿龍ai记账助手-'+C.today()+'.json';}else{const rows=[['日期','收支','金额分','币种','分类','备注','账单标识','订阅标识','周期键'],...data.bills.filter(x=>!data.deleted_records.some(d=>d.record_type==='bills'&&d.record_id===x.id)).map(x=>[x.occurred_on,x.kind,x.amount_cents,'CNY',categories.find(c=>c.key===x.category)?.label||x.category,x.note,x.id,x.subscription_id,x.period_key])];content='﻿'+rows.map(r=>r.map(C.csvCell).join(',')).join('\r\n');type='text/csv;charset=utf-8';name='阿龍ai记账助手-'+C.today()+'.csv';}const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('已生成'+name+'；请在下载位置确认文件。CSV 仅包含账单，完整备份请使用 JSON。');}catch(e){notice('导出失败：'+e.message);}finally{$('json').disabled=$('csv').disabled=false;}}
$('json').onclick=()=>download('json');$('csv').onclick=()=>download('csv');
window.addEventListener('pagehide',()=>{clearTimeout(draftTimer);clearTimeout(chartResize);transport.close();});
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
  $('list').innerHTML='<div class="empty"><strong>暂时没有连上账本</strong><p>请从 Cindy 的“更多 → 阿龍ai记账助手”打开正式工作台。浏览器中的临时预览不连接真实账本。</p></div>';
 }
})();
}catch(error){const notice=document.getElementById('notice');if(notice)notice.textContent='页面初始化失败：'+error.message;const list=document.getElementById('list');if(list)list.textContent='请重新打开工作台；若仍失败，请更新插件。';console.error(error);}
})();
