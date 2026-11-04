const {test}=require('node:test');
const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const {adapter}=require('./library-adapter.cjs');
test('真实 main.js 路由：工具回执、页面去重、来源通知与跨页更新',async()=>{
 const a=adapter(),messages=[],broadcasts=[],notices=[];let handler,brain;
 class BC{constructor(){brain=this;}postMessage(m){broadcasts.push(m);}close(){}}
 const context={crypto,Date,console,BroadcastChannel:BC,cindy:{library:a.library,onHostMessage:f=>{handler=f;},send:async m=>{messages.push(m);if(m.type==='notify')notices.push(m);return {ok:true};}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../plugin/main.js'),'utf8'),context);
 const wait=async condition=>{for(let i=0;i<100&&!condition();i++)await new Promise(r=>setTimeout(r,5));assert.ok(condition());};
 try{
 const requestId=crypto.randomUUID();await handler({type:'tool-call',tool:'record_bill',args:{requestId,amount:'0.29',category:'food'},callId:'call-1'});
 assert.equal(messages.find(x=>x.callId==='call-1').ok,true);assert.ok(broadcasts.some(x=>x.type==='ledger-changed'));
 brain.onmessage({data:{type:'ledger-request',requestId:'transport-1',tool:'record_bill',args:{requestId,amount:'0.29',category:'food'},mobilePageId:'phone-1'}});await wait(()=>broadcasts.some(x=>x.requestId==='transport-1'));assert.equal(a.db.prepare('SELECT COUNT(*) n FROM bills').get().n,1);
 await handler({type:'tool-call',tool:'create_subscription',callId:'call-2',args:{requestId:crypto.randomUUID(),name:'测试',amount:'1',category:'digital',cycle:'monthly',nextDue:'9990-01-01'}});
 await wait(()=>messages.some(x=>x.callId==='call-2'));
 await new Promise(r=>setTimeout(r,20));
 a.db.prepare("UPDATE subscriptions SET next_due='2020-01-01',anchor_date='2020-01-01'").run();
 brain.onmessage({data:{type:'ledger-request',requestId:'transport-2',tool:'ping',args:{},mobilePageId:'phone-2'}});await wait(()=>notices.some(x=>x.mobilePageId==='phone-2'));
 const notice=notices.find(x=>x.mobilePageId==='phone-2');assert.ok(notice.text.includes('1'));
 await handler({type:'tool-call',tool:'unknown',args:{},callId:'call-3'});assert.equal(messages.find(x=>x.callId==='call-3').ok,false);
 }finally{await new Promise(r=>setTimeout(r,20));a.close();}
});
