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
  root.LedgerCore={amount,date,today,month,nextDue,text,fail,canonical,id,money,csvCell,MAX_CENTS};
})(globalThis);
