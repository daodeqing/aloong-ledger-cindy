const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/transport.js'),'utf8');
function harness({wake=async()=>({ok:true,json:async()=>({state:'running'})}),respond=true,delayedPing=0}={}){
 let channel,n=0,wakes=0,pings=0;const sent=[];
 class BC{constructor(){channel=this;}postMessage(m){sent.push(m);if(respond&&(m.tool!=='ping'||++pings>delayedPing))queueMicrotask(()=>this.onmessage({data:{type:'ledger-response',requestId:m.requestId,ok:true,result:m.tool==='ping'?{ready:true}:{saved:true}}}));}close(){this.closed=true;}}
 const context={BroadcastChannel:BC,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,Error,fetch:async(...args)=>{wakes++;return wake(...args);}};
 vm.createContext(context);vm.runInContext(source,context);
 const client=context.LedgerTransport.create({id:()=>String(++n),retryMs:5,wakeTimeout:25,connectTimeout:45});
 return {client,sent,get wakes(){return wakes;},get channel(){return channel;}};
}
test('先等 /wake 成功，再广播；迟启动只重发 ping',async()=>{
 let release;const h=harness({wake:()=>new Promise(r=>release=r),delayedPing:1});
 try{const p=h.client.send('record_bill',{requestId:'original'});assert.equal(h.sent.length,0);release({ok:true,json:async()=>({state:'running'})});await p;assert.ok(h.sent.filter(x=>x.tool==='ping').length>=2);assert.equal(h.sent.filter(x=>x.tool==='record_bill').length,1);assert.equal(h.sent.at(-1).args.requestId,'original');}finally{h.client.close();}
});
test('唤醒 HTTP 错误直接显示，不发账单；可以重新连接',async()=>{
 let fail=true;const h=harness({wake:async()=>fail?{ok:false,status:503}:{ok:true,json:async()=>({state:'running'})}});
 try{await assert.rejects(h.client.send('record_bill',{}),e=>e.code==='WAKE_FAILED'&&e.message.includes('503'));assert.equal(h.sent.length,0);fail=false;assert.equal((await h.client.connect()).ready,true);}finally{h.client.close();}
});
test('普通静态页 /wake 返回 HTML 时给出正式入口',async()=>{
 const h=harness({wake:async()=>({ok:true,json:async()=>{throw Error('HTML');}})});
 try{await assert.rejects(h.client.connect(),e=>e.code==='INVALID_HOST'&&e.message.includes('更多 → 阿龍记账'));assert.equal(h.sent.length,0);}finally{h.client.close();}
});
test('插件 off 与 fused 状态不盲目广播',async()=>{
 for(const state of ['off','fused']){const h=harness({wake:async()=>({ok:true,json:async()=>({state})})});try{await assert.rejects(h.client.connect(),e=>e.code==='WAKE_FAILED'&&e.message.includes(state));assert.equal(h.sent.length,0);}finally{h.client.close();}}
});
test('宿主已在 starting 时仍等待只读握手',async()=>{
 const h=harness({wake:async()=>({ok:true,json:async()=>({state:'starting'})}),delayedPing:1});
 try{assert.equal((await h.client.connect()).ready,true);}finally{h.client.close();}
});
test('并行请求共用握手，写入与 AI 超时只发送一次',async()=>{
 const h=harness();try{await Promise.all([h.client.send('query_bills'),h.client.send('get_summary')]);assert.equal(h.wakes,1);assert.equal(h.sent.filter(x=>x.tool==='ping').length,1);
 h.channel.postMessage=m=>{h.sent.push(m);if(m.tool==='ping')queueMicrotask(()=>h.channel.onmessage({data:{type:'ledger-response',requestId:m.requestId,ok:true,result:{ready:true}}}));};
 for(const tool of ['record_bill','parse_ledger_text']){await assert.rejects(h.client.send(tool,{requestId:'keep-me'},35),e=>e.code==='TIMEOUT');assert.equal(h.sent.filter(x=>x.tool===tool).length,1);}
 }finally{h.client.close();}
});
test('关闭页面清除定时器；关闭后不能发送',async()=>{
 const h=harness({respond:false});const p=h.client.connect();await new Promise(r=>setTimeout(r,8));h.client.close();await assert.rejects(p,e=>e.code==='CLOSED');const n=h.sent.length;await new Promise(r=>setTimeout(r,15));assert.equal(h.sent.length,n);await assert.rejects(h.client.send('get_summary'),e=>e.code==='CLOSED');
});
test('正式包只加载同源外部脚本，符合宿主 CSP',()=>{
 const path=require('node:path'),html=fs.readFileSync(path.join(__dirname,'../plugin/main-view.html'),'utf8');
 const tags=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];assert.equal(tags.length,1);assert.match(tags[0][1],/src="view.js"/);assert.equal(tags[0][2],'');assert.ok(fs.statSync(path.join(__dirname,'../plugin/view.js')).size>0);
});
