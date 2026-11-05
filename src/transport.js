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
