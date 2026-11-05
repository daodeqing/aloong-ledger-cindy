const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
require('../src/core.js');require('../src/service.js');
const {adapter}=require('./library-adapter.cjs');
const cats=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/categories.json'),'utf8'));
const C=LedgerCore,uid=()=>crypto.randomUUID();
function fixture(clock=()=> '2028-04-01'){const a=adapter();const s=LedgerService.createService(a.library,cats,clock);return {a,s,d:(op,x)=>s.dispatch(op,x)};}
const bill=(extra={})=>({requestId:uid(),amount:'0.29',category:'food',kind:'expense',...extra});
const sub=(extra={})=>({requestId:uid(),name:'测试会员',amount:'25.50',category:'digital',cycle:'monthly',nextDue:'2028-01-31',...extra});
test('金额：分精确解析、零负数、小数、溢出、NaN、科学计数法',()=>{
 for(const [v,c]of [['0.01',1],['0.29',29],['99.99',9999],['1000000000.00',100000000000]])assert.equal(C.amount(v),c);
 for(const v of ['0','-1','1.001','1e3','NaN',NaN,Infinity,'1000000000.01',{},' 1','01.00'])assert.throws(()=>C.amount(v));
});
test('页面标识在 randomUUID 不可用时仍能生成合法 UUID',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/core.js'),'utf8');
 const context=vm.createContext({crypto:{getRandomValues(bytes){bytes.fill(7);return bytes;}}});
 vm.runInContext(source,context);
 assert.match(context.LedgerCore.id(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const withoutCrypto=vm.createContext({});
 vm.runInContext(source,withoutCrypto);
 assert.match(withoutCrypto.LedgerCore.id(),/^[0-9a-f-]{36}$/);
});

test('自然周期：31 日锚点恢复、闰年 2 月 29 日恢复、周跨年',()=>{
 assert.equal(C.nextDue('2027-01-31','monthly',1),'2027-02-28');assert.equal(C.nextDue('2027-01-31','monthly',2),'2027-03-31');
 assert.equal(C.nextDue('2028-01-31','monthly',1),'2028-02-29');assert.equal(C.nextDue('2028-01-31','monthly',2),'2028-03-31');
 assert.equal(C.nextDue('2028-02-29','yearly',1),'2029-02-28');assert.equal(C.nextDue('2028-02-29','yearly',4),'2032-02-29');
 assert.equal(C.nextDue('2027-12-29','weekly',1),'2028-01-05');
 for(const d of ['2027-02-29','2028-13-01','2028-04-31','2028-1-01'])assert.throws(()=>C.date(d));
});
test('分类、汇总、账单编辑版本冲突、SQL 文本原样保存',async()=>{
 const {a,d}=fixture();try{
 const x=await d('record_bill',bill({note:"x'; DROP TABLE bills;--"}));await d('record_bill',bill({amount:'10.01'}));await d('record_bill',bill({kind:'income',category:'salary',amount:'20.30'}));
 let sum=await d('get_summary',{month:'2028-04'});assert.equal(sum.expense_cents,1030);assert.equal(sum.income_cents,2030);assert.equal(sum.net_cents,1000);assert.equal(sum.categories.find(x=>x.category==='food').cents,1030);
 await assert.rejects(d('record_bill',bill({kind:'income',category:'food'})),{code:'INVALID_CATEGORY'});
 const y=await d('edit_bill',bill({id:x.id,revision:1,amount:'1.01'}));assert.equal(y.revision,2);
 await assert.rejects(d('edit_bill',bill({id:x.id,revision:1,amount:'2'})),{code:'STALE_REVISION'});
 const q=await d('query_bills',{from:'2028-04-01',to:'2028-04-01'});assert.equal(q.total,3);
 }finally{a.close();}
});
test('同 requestId 并发、内容冲突、故障事务全回滚、回查',async()=>{
 const {a,d}=fixture();try{const req=bill();const all=await Promise.all(Array.from({length:10},()=>d('record_bill',req)));assert.equal(new Set(all.map(x=>x.id)).size,1);assert.equal((await d('query_bills',{})).total,1);
 await assert.rejects(d('record_bill',{...req,amount:'2'}),{code:'REQUEST_CONFLICT'});
 const pending=bill();a.failNextBatch();await assert.rejects(d('record_bill',pending),{code:'DB_ERROR'});assert.equal((await d('query_bills',{})).total,1);assert.equal((await d('query_request',{requestId:pending.requestId})).state,'not_found');await d('record_bill',pending);assert.equal((await d('query_request',{requestId:pending.requestId})).state,'completed');
 }finally{a.close();}
});
test('订阅确认/跳过：唯一周期、不同 requestId、暂停、归档、未来拒绝',async()=>{
 const {a,d}=fixture();try{const x=await d('create_subscription',sub());const args={id:x.id,periodKey:x.period_key,requestId:uid()};const r=await d('confirm_subscription_charge',args);assert.equal(r.nextDue,'2028-02-29');assert.equal((await d('query_bills',{})).total,1);
 const again=await d('confirm_subscription_charge',{...args,requestId:uid()});assert.equal(again.already_processed,true);assert.equal((await d('query_bills',{})).total,1);
 let s=(await d('list_subscriptions',{})).items[0];await d('skip_subscription_period',{id:s.id,periodKey:s.period_key,requestId:uid()});s=(await d('list_subscriptions',{})).items[0];assert.equal(s.next_due,'2028-03-31');assert.equal((await d('query_bills',{})).total,1);
 await d('pause_subscription',{id:s.id,revision:s.revision,requestId:uid()});assert.equal((await d('due_items',{})).total,0);await assert.rejects(d('confirm_subscription_charge',{id:s.id,periodKey:s.period_key,requestId:uid()}),{code:'INACTIVE_SUBSCRIPTION'});
 s=(await d('list_subscriptions',{})).items[0];await d('update_subscription',{id:s.id,revision:s.revision,status:'archived',requestId:uid()});assert.equal((await d('list_subscriptions',{status:'archived'})).total,1);
 const f=await d('create_subscription',sub({nextDue:'2030-01-01'}));await assert.rejects(d('confirm_subscription_charge',{id:f.id,periodKey:f.period_key,requestId:uid()}),{code:'NOT_DUE'});
 }finally{a.close();}
});
test('提醒去重，日期切换后可再提醒；暂停不提醒',async()=>{
 let day='2028-04-01';const {a,d}=fixture(()=>day);try{const s=await d('create_subscription',sub());assert.equal((await d('reminder_candidates',{})).length,1);await d('mark_reminders',{ids:[s.id]});assert.equal((await d('reminder_candidates',{})).length,0);day='2028-04-02';assert.equal((await d('reminder_candidates',{})).length,1);await d('pause_subscription',{id:s.id,revision:1,requestId:uid()});assert.equal((await d('reminder_candidates',{})).length,0);}finally{a.close();}
});
test('重启后数据库/幂等回执/草稿恢复，不可用库不重建',async()=>{
 const filename=path.join(__dirname,'../.cache/restart-'+uid()+'.sqlite');let a=adapter(filename),s=LedgerService.createService(a.library,cats,()=> '2028-04-01');const req=bill();const x=await s.dispatch('record_bill',req);await s.dispatch('save_draft',{requestId:uid(),clientId:'phone',value:{bill:{amount:'3'}}});a.close();
 a=adapter(filename);s=LedgerService.createService(a.library,cats,()=> '2028-04-02');try{assert.equal((await s.dispatch('record_bill',req)).id,x.id);assert.equal((await s.dispatch('query_bills',{})).total,1);assert.equal((await s.dispatch('get_draft',{clientId:'phone'})).bill.amount,'3');}finally{a.close();}
 const f=fixture();f.a.unavailable();await assert.rejects(f.d('query_bills',{}),{code:'LIBRARY_UNAVAILABLE'});assert.equal(f.a.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='bills'").get().n,0);f.a.close();
});
test('导出和查询分页完整；手机单帧小于 48 KiB；CSV 公式注入',async()=>{
 const {a,d}=fixture();try{for(let i=0;i<55;i++)await d('record_bill',bill({note:'测'.repeat(300)}));let all=[];for(let offset=0;;offset+=20){const r=await d('export_page',{table:'bills',offset});assert.ok(Buffer.byteLength(JSON.stringify(r))<48*1024);all.push(...r);if(r.length<20)break;}assert.equal(all.length,55);const q=await d('query_bills',{});assert.equal(q.items.length,20);assert.equal(q.total,55);assert.ok(Buffer.byteLength(JSON.stringify(q))<48*1024);assert.equal(C.csvCell('=1+1'),'"\'=1+1"');assert.equal(C.csvCell('a"b'),'"a""b"');}finally{a.close();}
});
