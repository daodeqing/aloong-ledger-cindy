const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {adapter}=require('./library-adapter.cjs');

function boot(reply){
 const storage=adapter(),messages=[],requests=[];
 let hostMessage;
 class Channel{postMessage(){}close(){}}
 const context={
  crypto,Date,console,BroadcastChannel:Channel,
  cindy:{
   library:storage.library,
   onHostMessage:handler=>{hostMessage=handler;},
   send:async message=>{
    if(message.type==='cindy-request'){requests.push(message);return reply(message);}
    messages.push(message);return {ok:true};
   },
  },
 };
 vm.createContext(context);
 const sources=['core.js','service.js','brain.js'];
 context.LedgerCategories=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/categories.json'),'utf8'));
 context.LEDGER_TOOLS=['parse_ledger_text'];
 for(const source of sources)vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',source),'utf8'),context);
 return {storage,messages,requests,call:async args=>{await hostMessage({type:'tool-call',tool:'parse_ledger_text',args,callId:'ai-call-1'});await new Promise(resolve=>setTimeout(resolve,0));return messages.at(-1);}};
}

test('AI 账单草稿透传 callId、规范化金额且不写入账本',async()=>{
 const fixture=boot(()=>({ok:true,model:'test-model',text:JSON.stringify({type:'bill',kind:'expense',amount:'23.50',category:'food',note:'午饭',occurredOn:'2026-11-05'})}));
 try{
  const result=await fixture.call({text:'今天午饭 23.5 元'});
  assert.equal(result.ok,true);
  assert.equal(result.result.draft.amount,'23.50');
  assert.equal(result.result.draft.category,'food');
  assert.equal(fixture.requests[0].callId,'ai-call-1');
  assert.equal(fixture.requests[0].expectJson,true);
  assert.equal(fixture.storage.db.prepare('SELECT COUNT(*) AS count FROM bills').get().count,0);
 }finally{fixture.storage.close();}
});

test('AI 订阅草稿保留自然周期与到期日',async()=>{
 const fixture=boot(()=>({ok:true,text:JSON.stringify({type:'subscription',name:'视频会员',amount:'25',category:'digital',cycle:'monthly',nextDue:'2026-12-01',note:''})}));
 try{
  const result=await fixture.call({text:'视频会员每月 25 元，12 月 1 日'});
  assert.equal(result.result.draft.cycle,'monthly');
  assert.equal(result.result.draft.nextDue,'2026-12-01');
  assert.equal(fixture.storage.db.prepare('SELECT COUNT(*) AS count FROM subscriptions').get().count,0);
 }finally{fixture.storage.close();}
});

test('模型不可用、错误分类和非法日期都不会产生草稿或写入',async()=>{
 const unavailable=boot(()=>({ok:false,errorCode:'NO_CANDIDATE',message:'没有可用模型'}));
 try{const result=await unavailable.call({text:'午饭 20'});assert.equal(result.ok,false);assert.equal(result.errorCode,'NO_CANDIDATE');}finally{unavailable.storage.close();}
 const invalid=boot(()=>({ok:true,text:JSON.stringify({type:'bill',kind:'expense',amount:'20',category:'salary',occurredOn:'2026-02-30'})}));
 try{
  const result=await invalid.call({text:'午饭 20'});
  assert.equal(result.ok,false);
  assert.equal(result.errorCode,'AI_INVALID_CATEGORY');
  assert.equal(invalid.storage.db.prepare('SELECT COUNT(*) AS count FROM bills').get().count,0);
 }finally{invalid.storage.close();}
});
