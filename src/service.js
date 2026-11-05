/* The only writer is the computer plugin brain. Host db.batch is atomic. */
(function(root){
'use strict';
const C=root.LedgerCore, DB='ledger.sqlite';
const SCHEMA=[
 "CREATE TABLE bills(id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('expense','income')), amount_cents INTEGER NOT NULL CHECK(amount_cents>0), category TEXT NOT NULL, note TEXT NOT NULL, occurred_on TEXT NOT NULL, source TEXT NOT NULL, subscription_id TEXT, period_key TEXT UNIQUE, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)",
 "CREATE INDEX bills_date ON bills(occurred_on,id)",
 "CREATE TABLE subscriptions(id TEXT PRIMARY KEY, name TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents>0), category TEXT NOT NULL, note TEXT NOT NULL, cycle TEXT NOT NULL CHECK(cycle IN ('weekly','monthly','yearly')), anchor_date TEXT NOT NULL, period_index INTEGER NOT NULL DEFAULT 0, next_due TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','paused','archived')), revision INTEGER NOT NULL DEFAULT 1)",
 "CREATE TABLE periods(period_key TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, due_on TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('confirmed','skipped')), bill_id TEXT, processed_on TEXT NOT NULL)",
 "CREATE TABLE requests(request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL)",
 "CREATE TABLE reminders(subscription_id TEXT NOT NULL, reminder_day TEXT NOT NULL, PRIMARY KEY(subscription_id,reminder_day))"
];
const REMINDER_SCHEMA="CREATE TABLE IF NOT EXISTS scheduled_reminders(id TEXT PRIMARY KEY,title TEXT NOT NULL,note TEXT NOT NULL,due_at TEXT NOT NULL,timezone TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',delivery_state TEXT NOT NULL DEFAULT 'pending',attempt_at TEXT,notified_at TEXT,delivery_error TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)";
const DELETED_SCHEMA="CREATE TABLE IF NOT EXISTS deleted_records(record_type TEXT NOT NULL,record_id TEXT NOT NULL,deleted_at TEXT NOT NULL,PRIMARY KEY(record_type,record_id))";
const IMAGE_SCHEMA="CREATE TABLE IF NOT EXISTS image_imports(image_hash TEXT PRIMARY KEY,response_json TEXT NOT NULL,created_at TEXT NOT NULL)";
const WRITES=new Set(['record_bill','edit_bill','create_subscription','update_subscription','pause_subscription','confirm_subscription_charge','skip_subscription_period','save_draft','create_reminder','update_reminder','record_image_bills']);
function createService(library,categories,clock=C.today,options={}){
 const now=options.now||Date.now;
 let initialization, tail=Promise.resolve();
 const cats=new Map(categories.map(x=>[x.key,x]));
 async function host(req){const r=await library(req);if(!r||!r.ok||r.state==='unavailable')C.fail(r?.errorCode||'LIBRARY_UNAVAILABLE',(r?.message||'账本存储不可用')+'；请在 Cindy 设置检查 Library 位置后重试');return r;}
 async function sql(query,params=[]){return (await host({op:'db.exec',dbPath:DB,sql:query,params})).rows||[];}
 async function batch(statements){return host({op:'db.batch',dbPath:DB,statements});}
 async function init(){if(!initialization) initialization=(async()=>{await host({op:'open'});await host({op:'db.open',dbPath:DB});const v=await sql("SELECT name FROM sqlite_master WHERE type='table' AND name='requests'");if(!v.length)await host({op:'db.migrate',dbPath:DB,targetVersion:1,steps:[{toVersion:1,sql:SCHEMA}]});await batch([{sql:DELETED_SCHEMA,params:[]},{sql:REMINDER_SCHEMA,params:[]},{sql:IMAGE_SCHEMA,params:[]},{sql:'CREATE INDEX IF NOT EXISTS scheduled_reminders_due ON scheduled_reminders(status,delivery_state,due_at)',params:[]},{sql:'CREATE TABLE IF NOT EXISTS drafts(client_id TEXT PRIMARY KEY, value_json TEXT NOT NULL)',params:[]},{sql:'CREATE TABLE IF NOT EXISTS ledger_meta(id INTEGER PRIMARY KEY, revision INTEGER NOT NULL)',params:[]},{sql:'INSERT OR IGNORE INTO ledger_meta VALUES(1,0)',params:[]}]);})().catch(e=>{initialization=null;throw e;});await initialization;}
 function category(key,kind){if(!cats.has(key)||cats.get(key).type!==kind)C.fail('INVALID_CATEGORY','分类与收支类型不匹配，请重新选择');return key;}
 function integer(n,min,max,label){if(!Number.isInteger(n)||n<min||n>max)C.fail('INVALID_INPUT',label+'无效');return n;}
 async function one(table,id){C.text(id,'记录标识',80);const r=await sql('SELECT * FROM '+table+' WHERE id=?',[id]);if(!r.length)C.fail('NOT_FOUND','记录不存在，请刷新账本');return r[0];}
 function decorate(s){return {...s,category_label:cats.get(s.category)?.label||s.category,period_key:s.id+':'+s.next_due};}
 function visible(table,deleted=false){return (deleted?'EXISTS':'NOT EXISTS')+"(SELECT 1 FROM deleted_records d WHERE d.record_type='"+table+"' AND d.record_id="+table+".id)";}
 async function deleted(table,id){return (await sql('SELECT 1 FROM deleted_records WHERE record_type=? AND record_id=?',[table,id])).length>0;}
 async function requireVisible(table,id){if(await deleted(table,id))C.fail('RECORD_DELETED','记录已移入回收站，请先恢复');}
 async function recycle(table,x,action){
  const isDeleted=await deleted(table,x.id);
  if(action==='delete'&&isDeleted)C.fail('RECORD_DELETED','记录已在回收站');
  if(action==='restore'&&!isDeleted)C.fail('NOT_DELETED','记录不在回收站，请刷新后操作');
  return {result:{...x,revision:x.revision+1,deleted:action==='delete'},statements:[
   {sql:action==='delete'?'INSERT INTO deleted_records VALUES(?,?,?)':'DELETE FROM deleted_records WHERE record_type=? AND record_id=?',params:action==='delete'?[table,x.id,new Date(now()).toISOString()]:[table,x.id]},
   {sql:'UPDATE '+table+' SET revision=revision+1 WHERE id=?',params:[x.id]}]};
 }
 async function mutate(op,a,fn){C.text(a.requestId,'requestId',100);const payload={...a};delete payload.requestId;const fingerprint=C.canonical({op,args:payload});const old=await sql('SELECT * FROM requests WHERE request_id=?',[a.requestId]);if(old.length){if(old[0].fingerprint!==fingerprint)C.fail('REQUEST_CONFLICT','同一 requestId 的内容不同；请先查询原请求');return JSON.parse(old[0].response_json);}
 const plan=await fn(); const result=plan.result;
 await batch([...plan.statements,...(op==='save_draft'?[]:[{sql:'UPDATE ledger_meta SET revision=revision+1 WHERE id=1',params:[]}]),{sql:'INSERT INTO requests VALUES(?,?,?,?)',params:[a.requestId,fingerprint,JSON.stringify(result),new Date().toISOString()]}]);return result;}
 function billInput(a){const kind=a.kind||'expense';if(!['expense','income'].includes(kind))C.fail('INVALID_INPUT','收支类型无效');return {kind,amount_cents:C.amount(a.amount),category:category(a.category,kind),note:C.text(a.note,'备注',300,true),occurred_on:C.date(a.occurredOn||clock())};}
 async function handle(op,a={}){
 await init();

 if(op==='reminder_context'||(op==='get_summary'&&a.contextOnly===true))return {now:new Date(now()).toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,localTime:new Date(now()).toString(),notification:'Cindy 屏幕轻提示；电脑唤醒、Cindy 运行且插件启用时检查；不保证响铃或手机锁屏推送'};
 if(op==='create_reminder')return mutate(op,a,async()=>{
  const due_at=C.reminderTime(a.dueAt,now()),timezone=C.timezone(a.timezone||Intl.DateTimeFormat().resolvedOptions().timeZone);
  const x={id:C.id(),title:C.text(a.title,'提醒内容',100),note:C.text(a.note,'备注',300,true),due_at,timezone,status:'active',delivery_state:'pending',revision:1};
  return {result:x,statements:[{sql:'INSERT INTO scheduled_reminders(id,title,note,due_at,timezone,created_at) VALUES(?,?,?,?,?,?)',params:[x.id,x.title,x.note,due_at,timezone,new Date(now()).toISOString()]}]};
 });
 if(op==='update_reminder')return mutate(op,a,async()=>{
  const x=await one('scheduled_reminders',a.id);if(x.revision!==a.revision)C.fail('STALE_REVISION','提醒已改变，请刷新后操作');
  const y={...x,status:a.status||x.status,revision:x.revision+1};
  if(!['active','completed','cancelled'].includes(y.status))C.fail('INVALID_INPUT','提醒状态无效');
  if(a.title!==undefined)y.title=C.text(a.title,'提醒内容',100);if(a.note!==undefined)y.note=C.text(a.note,'备注',300,true);
  if(a.dueAt!==undefined){y.due_at=C.reminderTime(a.dueAt,now());y.timezone=C.timezone(a.timezone||y.timezone);y.delivery_state='pending';y.attempt_at=null;y.notified_at=null;y.delivery_error='';}
  if(y.status==='active'&&x.status!=='active'&&a.dueAt===undefined)C.fail('NEW_TIME_REQUIRED','恢复提醒需要选择新的提醒时间');
  return {result:y,statements:[{sql:'UPDATE scheduled_reminders SET title=?,note=?,due_at=?,timezone=?,status=?,delivery_state=?,attempt_at=?,notified_at=?,delivery_error=?,revision=? WHERE id=?',params:[y.title,y.note,y.due_at,y.timezone,y.status,y.delivery_state,y.attempt_at,y.notified_at,y.delivery_error,y.revision,y.id]}]};
 });
 if(op==='list_reminders'){
  const status=a.status||'all';if(!['all','active','completed','cancelled'].includes(status))C.fail('INVALID_INPUT','提醒状态无效');const params=status==='all'?[]:[status],where=status==='all'?'':' WHERE status=?';
  const total=(await sql('SELECT count(*) n FROM scheduled_reminders'+where,params))[0].n;
  return {items:await sql('SELECT * FROM scheduled_reminders'+where+' ORDER BY CASE WHEN status=\'active\' THEN 0 ELSE 1 END,due_at,id LIMIT 20 OFFSET ?',[...params,integer(a.offset??0,0,10000000,'页码')]),total};
 }
 if(op==='reminder_claim'){
  const stamp=new Date(now()).toISOString(),cutoff=new Date(now()-60000).toISOString();
  const rows=await sql("SELECT * FROM scheduled_reminders WHERE status='active' AND due_at<=? AND (delivery_state='pending' OR (delivery_state='failed' AND attempt_at<=?)) ORDER BY due_at,id LIMIT 20",[stamp,cutoff]);
  if(rows.length)await batch(rows.map(x=>({sql:"UPDATE scheduled_reminders SET delivery_state='uncertain',attempt_at=? WHERE id=?",params:[stamp,x.id]})));
  return {items:rows,stamp};
 }
 if(op==='reminder_delivery'){
  if(!['sent','failed'].includes(a.state))C.fail('INVALID_INPUT','投递状态无效');
  await batch(a.ids.map(id=>({sql:"UPDATE scheduled_reminders SET delivery_state=?,notified_at=?,delivery_error=? WHERE id=? AND attempt_at=? AND delivery_state='uncertain'",params:[a.state,a.state==='sent'?new Date(now()).toISOString():null,String(a.error||'').slice(0,300),id,a.stamp]})));return {ok:true};
 }
 if(op==='reminder_next'){
  const r=await sql("SELECT MIN(CASE WHEN delivery_state='failed' AND julianday(attempt_at,'+60 seconds')>julianday(due_at) THEN strftime('%Y-%m-%dT%H:%M:%fZ',attempt_at,'+60 seconds') ELSE due_at END) AS next_at FROM scheduled_reminders WHERE status='active' AND delivery_state IN ('pending','failed')");return r[0]?.next_at||null;
 }
 if(op==='record_image_bills'&&a.dryRun===true){
  if(!Array.isArray(a.attachments)||!a.attachments.length||a.attachments.length>4||!a.attachments.every(h=>typeof h==='string'&&/^[a-f0-9]{64}(?:\.[a-z0-9]+)?$/.test(h)))C.fail('IMAGE_REQUIRED','请通过 ghost_call 顶层 attachments 交接原图');
  if(!Array.isArray(a.bills)||!a.bills.length||a.bills.length>20)C.fail('INVALID_INPUT','一次可校验1–20笔账单');return {dryRun:true,bills:a.bills.map(billInput),image_hashes:a.attachments};
 }
 if(op==='record_image_bills')return mutate(op,a,async()=>{
  if(!Array.isArray(a.attachments)||a.attachments.length<1||a.attachments.length>4)C.fail('IMAGE_REQUIRED','请将原始图片通过 ghost_call 顶层 attachments 交给插件；最多四张');
  const hashes=[...new Set(a.attachments.map(h=>{if(typeof h!=='string'||! /^[a-f0-9]{64}(?:\.[a-z0-9]+)?$/.test(h))C.fail('IMAGE_REQUIRED','图片指纹无效，请重新交接原始图片');return h.slice(0,64);}))].sort();
  for(const hash of hashes){const old=await sql('SELECT response_json FROM image_imports WHERE image_hash=?',[hash]);if(old.length)return {result:{...JSON.parse(old[0].response_json),already_imported:true},statements:[]};}
  if(!Array.isArray(a.bills)||!a.bills.length||a.bills.length>20)C.fail('INVALID_INPUT','一次可记录 1–20 笔可辨认的人民币账单');
  const bills=a.bills.map(b=>({id:C.id(),...billInput(b),revision:1})),stamp=new Date(now()).toISOString(),result={bills,image_hashes:hashes,already_imported:false};
  const statements=bills.map(x=>({sql:'INSERT INTO bills(id,kind,amount_cents,category,note,occurred_on,source,created_at) VALUES(?,?,?,?,?,?,?,?)',params:[x.id,x.kind,x.amount_cents,x.category,x.note,x.occurred_on,'image',stamp]}));
  statements.push(...hashes.map(hash=>({sql:'INSERT INTO image_imports VALUES(?,?,?)',params:[hash,JSON.stringify(result),stamp]})));return {result,statements};
 });

 if(op==='query_request'){C.text(a.requestId,'requestId',100);const r=await sql('SELECT response_json FROM requests WHERE request_id=?',[a.requestId]);return r.length?{state:'completed',result:JSON.parse(r[0].response_json)}:{state:'not_found'};}
 if(op==='record_bill')return mutate(op,a,async()=>{const x={id:C.id(),...billInput(a),revision:1};return {result:x,statements:[{sql:'INSERT INTO bills(id,kind,amount_cents,category,note,occurred_on,source,created_at) VALUES(?,?,?,?,?,?,?,?)',params:[x.id,x.kind,x.amount_cents,x.category,x.note,x.occurred_on,'manual',new Date().toISOString()]}]};});
 if(op==='edit_bill')return mutate(op,a,async()=>{const old=await one('bills',a.id);if(a.revision!==old.revision)C.fail('STALE_REVISION','账单已被修改，请刷新后编辑');const action=a.action||'edit';if(!['edit','delete','restore'].includes(action))C.fail('INVALID_INPUT','账单操作无效');if(action!=='edit')return recycle('bills',old,action);await requireVisible('bills',old.id);const x={id:old.id,...billInput(a),revision:old.revision+1};return {result:x,statements:[{sql:'UPDATE bills SET kind=?,amount_cents=?,category=?,note=?,occurred_on=?,revision=? WHERE id=?',params:[x.kind,x.amount_cents,x.category,x.note,x.occurred_on,x.revision,x.id]}]};});
 if(op==='query_bills'){let clauses=[visible('bills',a.deletedOnly===true)],params=[];for(const [key,cmp]of [['from','>='],['to','<=']])if(a[key]){clauses.push('occurred_on'+cmp+'?');params.push(C.date(a[key]));}if(a.category){clauses.push('category=?');params.push(a.category);}const limit=integer(a.limit??20,1,20,'每页条数'),offset=integer(a.offset??0,0,10000000,'页码');const where=clauses.length?' WHERE '+clauses.join(' AND '):'';const items=await sql('SELECT * FROM bills'+where+' ORDER BY occurred_on DESC,created_at DESC,id DESC LIMIT ? OFFSET ?',[...params,limit,offset]);const count=await sql('SELECT count(*) AS n FROM bills'+where,params);return {items:items.map(x=>({...x,deleted:a.deletedOnly===true,category_label:cats.get(x.category)?.label||x.category})),total:count[0].n,offset,limit};}
 if(op==='get_summary'){
  const month=C.month(a.month||clock().slice(0,7)),from=month+'-01',to=C.nextDue(from,'monthly',1),active=visible('bills');
  const rs=await sql('SELECT kind,category,SUM(amount_cents) AS cents,COUNT(*) AS count FROM bills WHERE '+active+' AND occurred_on>=? AND occurred_on<? GROUP BY kind,category',[from,to]);
  let income=0,expense=0;for(const r of rs){if(!Number.isSafeInteger(r.cents))C.fail('TOTAL_OVERFLOW','汇总金额过大，超出安全范围');if(r.kind==='income')income+=r.cents;else expense+=r.cents;}
  if(!Number.isSafeInteger(income)||!Number.isSafeInteger(expense))C.fail('TOTAL_OVERFLOW','汇总金额过大');
  const rows=await sql('SELECT occurred_on,kind,SUM(amount_cents) cents FROM bills WHERE '+active+' AND occurred_on>=? AND occurred_on<? GROUP BY occurred_on,kind',[from,to]);
  const days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate(),daily=Array.from({length:days},(_,i)=>({date:month+'-'+String(i+1).padStart(2,'0'),income_cents:0,expense_cents:0}));
  for(const row of rows)daily[Number(row.occurred_on.slice(-2))-1][row.kind+'_cents']=row.cents;
  const prevDate=new Date(from+'T00:00:00Z');prevDate.setUTCMonth(prevDate.getUTCMonth()-1);const previous=prevDate.toISOString().slice(0,10);
  const prev=(await sql("SELECT COALESCE(SUM(amount_cents),0) cents FROM bills WHERE "+active+" AND kind='expense' AND occurred_on>=? AND occurred_on<?",[previous,from]))[0].cents;
  const peak=(await sql("SELECT COALESCE(MAX(amount_cents),0) cents FROM bills WHERE "+active+" AND kind='expense' AND occurred_on>=? AND occurred_on<?",[from,to]))[0].cents;
  const subs=await sql("SELECT COUNT(*) count,COALESCE(SUM(CASE cycle WHEN 'monthly' THEN amount_cents WHEN 'yearly' THEN amount_cents/12.0 ELSE amount_cents*52.0/12 END),0) monthly,MIN(next_due) next_due FROM subscriptions WHERE "+visible('subscriptions')+" AND status='active'");
  const elapsed=month===clock().slice(0,7)?Number(clock().slice(-2)):days;
  return {month,currency:'CNY',income_cents:income,expense_cents:expense,net_cents:income-expense,bill_count:rs.reduce((n,x)=>n+x.count,0),daily_average_cents:Math.round(expense/elapsed),max_expense_cents:peak,previous_expense_cents:prev,daily,subscriptions:{active_count:subs[0].count,estimated_monthly_cents:Math.round(subs[0].monthly),next_due:subs[0].next_due},categories:rs.map(x=>({...x,label:cats.get(x.category)?.label||x.category})).sort((a,b)=>b.cents-a.cents)};
 }
 if(op==='list_subscriptions'){
  const status=a.status||'all';if(!['all','active','paused','archived'].includes(status))C.fail('INVALID_INPUT','订阅状态无效');
  const where=' WHERE '+visible('subscriptions',a.deletedOnly===true)+(status==='all'?'':' AND status=?'),params=status==='all'?[]:[status];
  const items=await sql('SELECT * FROM subscriptions'+where+' ORDER BY next_due,id LIMIT 20 OFFSET ?',[...params,integer(a.offset??0,0,10000000,'页码')]);
  const count=await sql('SELECT count(*) AS n FROM subscriptions'+where,params);return {items:items.map(x=>({...decorate(x),deleted:a.deletedOnly===true})),total:count[0].n};
 }
 if(op==='create_subscription')return mutate(op,a,async()=>{const x={id:C.id(),name:C.text(a.name,'订阅名称',80),amount_cents:C.amount(a.amount),category:category(a.category,'expense'),note:C.text(a.note,'备注',300,true),cycle:a.cycle,anchor_date:C.date(a.nextDue),next_due:a.nextDue,status:'active',period_index:0,revision:1};if(!['weekly','monthly','yearly'].includes(x.cycle))C.fail('INVALID_CYCLE','请选择每周、每月或每年');return {result:decorate(x),statements:[{sql:'INSERT INTO subscriptions(id,name,amount_cents,category,note,cycle,anchor_date,next_due,status) VALUES(?,?,?,?,?,?,?,?,?)',params:[x.id,x.name,x.amount_cents,x.category,x.note,x.cycle,x.anchor_date,x.next_due,x.status]}]};});
 if(op==='pause_subscription'||op==='update_subscription')return mutate(op,a,async()=>{const x=await one('subscriptions',a.id);if(a.revision!==x.revision)C.fail('STALE_REVISION','订阅已改变，请刷新后操作');const action=a.action||'update';if(!['update','delete','restore'].includes(action))C.fail('INVALID_INPUT','订阅操作无效');if(action!=='update')return recycle('subscriptions',x,action);await requireVisible('subscriptions',x.id);const y={...x};for(const k of ['name','note'])if(a[k]!==undefined)y[k]=C.text(a[k],k==='name'?'名称':'备注',k==='name'?80:300,k==='note');if(a.amount!==undefined)y.amount_cents=C.amount(a.amount);if(a.category!==undefined)y.category=category(a.category,'expense');y.status=op==='pause_subscription'?'paused':(a.status||x.status);if(!['active','paused','archived'].includes(y.status))C.fail('INVALID_INPUT','订阅状态无效');if((a.nextDue&&a.nextDue!==x.next_due)||(a.cycle&&a.cycle!==x.cycle)){y.anchor_date=C.date(a.nextDue||x.next_due);y.period_index=0;y.next_due=y.anchor_date;y.cycle=a.cycle||x.cycle;}if(!['weekly','monthly','yearly'].includes(y.cycle))C.fail('INVALID_CYCLE','周期无效');if(y.next_due!==x.next_due){const done=await sql('SELECT 1 FROM periods WHERE period_key=?',[y.id+':'+y.next_due]);if(done.length)C.fail('PROCESSED_DATE','这个到期日已经确认或跳过，请选择尚未处理的日期');}y.revision++;return {result:decorate(y),statements:[{sql:'UPDATE subscriptions SET name=?,note=?,amount_cents=?,category=?,cycle=?,anchor_date=?,period_index=?,next_due=?,status=?,revision=? WHERE id=?',params:[y.name,y.note,y.amount_cents,y.category,y.cycle,y.anchor_date,y.period_index,y.next_due,y.status,y.revision,y.id]}]};});
 if(op==='confirm_subscription_charge'||op==='skip_subscription_period')return mutate(op,a,async()=>{const x=await one('subscriptions',a.id);await requireVisible('subscriptions',x.id);C.text(a.periodKey,'周期键',120);const prior=await sql('SELECT * FROM periods WHERE period_key=?',[a.periodKey]);if(prior.length){if(prior[0].subscription_id!==x.id)C.fail('INVALID_PERIOD','周期不属于此订阅');return {result:{...prior[0],already_processed:true},statements:[]};}if(a.periodKey!==x.id+':'+x.next_due)C.fail('STALE_PERIOD','到期周期已改变，请刷新后操作');if(x.status!=='active')C.fail('INACTIVE_SUBSCRIPTION','订阅已暂停或归档，请先启用');if(x.next_due>clock())C.fail('NOT_DUE','此订阅尚未到期，请到期后确认');const confirmed=op==='confirm_subscription_charge',billId=confirmed?C.id():null,index=x.period_index+1,next=C.nextDue(x.anchor_date,x.cycle,index),action=confirmed?'confirmed':'skipped';const statements=[{sql:'INSERT INTO periods VALUES(?,?,?,?,?,?)',params:[a.periodKey,x.id,x.next_due,action,billId,clock()]},{sql:'UPDATE subscriptions SET period_index=?,next_due=?,revision=revision+1 WHERE id=?',params:[index,next,x.id]}];if(confirmed)statements.push({sql:'INSERT INTO bills(id,kind,amount_cents,category,note,occurred_on,source,subscription_id,period_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',params:[billId,'expense',x.amount_cents,x.category,x.name+(x.note?' · '+x.note:''),C.date(a.occurredOn||x.next_due),'subscription',x.id,a.periodKey,new Date().toISOString()]});return {result:{action,billId,periodKey:a.periodKey,nextDue:next},statements};});
 if(op==='due_items'){const items=await sql("SELECT * FROM subscriptions WHERE NOT EXISTS(SELECT 1 FROM deleted_records d WHERE d.record_type='subscriptions' AND d.record_id=subscriptions.id) AND status='active' AND next_due<=? ORDER BY next_due,id LIMIT 20 OFFSET ?",[clock(),integer(a.offset??0,0,10000000,'页码')]);const count=await sql("SELECT count(*) AS n FROM subscriptions WHERE NOT EXISTS(SELECT 1 FROM deleted_records d WHERE d.record_type='subscriptions' AND d.record_id=subscriptions.id) AND status='active' AND next_due<=?",[clock()]);return {items:items.map(decorate),total:count[0].n};}
 if(op==='reminder_candidates')return sql("SELECT s.id,s.name FROM subscriptions s WHERE NOT EXISTS(SELECT 1 FROM deleted_records d WHERE d.record_type='subscriptions' AND d.record_id=s.id) AND s.status='active' AND s.next_due<=? AND NOT EXISTS(SELECT 1 FROM reminders r WHERE r.subscription_id=s.id AND r.reminder_day=?) LIMIT 100",[clock(),clock()]);
 if(op==='mark_reminders'){await batch(a.ids.map(id=>({sql:'INSERT OR IGNORE INTO reminders VALUES(?,?)',params:[id,clock()]})));return {ok:true};}
 if(op==='get_draft'){const r=await sql('SELECT value_json FROM drafts WHERE client_id=?',[C.text(a.clientId,'页面标识',100)]);return r.length?JSON.parse(r[0].value_json):{};}
 if(op==='save_draft')return mutate(op,a,async()=>{C.text(a.clientId,'页面标识',100);const value=JSON.stringify(a.value||{});if(value.length>8000)C.fail('DRAFT_TOO_LARGE','草稿过大，请缩短备注');return {result:{saved:true},statements:[{sql:'INSERT OR REPLACE INTO drafts VALUES(?,?)',params:[a.clientId,value]}]};});
 if(op==='export_token')return (await sql('SELECT revision FROM ledger_meta WHERE id=1'))[0].revision;
 if(op==='export_page'){const tables={bills:'bills',subscriptions:'subscriptions',periods:'periods',reminders:'scheduled_reminders',deleted_records:'deleted_records'};if(!Object.hasOwn(tables,a.table))C.fail('INVALID_INPUT','导出类型无效');return sql('SELECT * FROM '+tables[a.table]+' ORDER BY '+(a.table==='periods'?'period_key':a.table==='deleted_records'?'record_type,record_id':'id')+' LIMIT 20 OFFSET ?',[integer(a.offset??0,0,10000000,'页码')]);}
 C.fail('UNKNOWN_TOOL','未识别操作，请刷新插件');
 }
 function dispatch(op,a){const p=tail.then(()=>handle(op,a));tail=p.catch(()=>{});return p;}
 return {dispatch,init,sql,host};
}
root.LedgerService={createService,WRITES,SCHEMA};
})(globalThis);
