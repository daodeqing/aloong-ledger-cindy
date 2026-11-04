/* Test-only host adapter. The shipped plugin has no Node code or SQLite binding. */
const {DatabaseSync}=require('node:sqlite');
function adapter(filename=':memory:'){
 const db=new DatabaseSync(filename);let failBatch=false,failOpen=false;
 const plain=rows=>rows.map(x=>({...x}));
 async function library(r){
  try{
   if(r.op==='open')return failOpen?{ok:true,state:'unavailable',reason:'disk-missing'}:{ok:true,state:'ready'};
   if(r.op==='db.open')return {ok:true};
   if(r.op==='db.migrate'){for(const step of r.steps){db.exec('BEGIN');try{step.sql.forEach(s=>db.exec(s));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}return {ok:true};}
   if(r.op==='db.exec'){const s=db.prepare(r.sql);if(/^\s*(SELECT|WITH)/i.test(r.sql))return {ok:true,rows:plain(s.all(...(r.params||[])))};return {ok:true,...s.run(...(r.params||[]))};}
   if(r.op==='db.batch'){db.exec('BEGIN');try{for(const s of r.statements)db.prepare(s.sql).run(...(s.params||[]));if(failBatch){failBatch=false;throw Error('injected commit failure');}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {ok:true};}
   throw Error('Unsupported '+r.op);
  }catch(e){return {ok:false,errorCode:'DB_ERROR',message:e.message};}
 }
 return {db,library,close:()=>db.close(),failNextBatch:()=>{failBatch=true;},unavailable:()=>{failOpen=true;}};
}
module.exports={adapter};
