/* Small, dependency-free SVG charts. No polling, canvas, animation or CDN. */
(function(root){
'use strict';
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'¥'+root.LedgerCore.money(n),num=n=>Number(n.toFixed(2));
function trend(node,days){
 const w=Math.max(260,Math.min(700,node.clientWidth||560)),h=94,left=48,right=12,top=12,bottom=24,plot=w-left-right,height=h-top-bottom;
 const max=Math.max(100,...days.flatMap(d=>[d.expense_cents,d.income_cents]));
 const x=i=>left+i/(days.length-1)*plot,y=v=>top+(1-v/max)*height;
 let svg='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="每日收入和支出折线图，单位元。详细金额可用下方日期滑块查看"><title>每日收支，单位元</title>';
 for(let i=0;i<=2;i++){const v=max*i/2,py=y(v);svg+='<line class="chart-grid" x1="'+left+'" x2="'+(w-right)+'" y1="'+py+'" y2="'+py+'"/><text class="chart-axis" text-anchor="end" x="'+(left-8)+'" y="'+(py+4)+'">'+esc(v>=100000?((v/100000).toFixed(1)+'千'):(v/100).toFixed(v<1000?2:0))+'</text>';}
 for(const i of [0,Math.floor((days.length-1)/2),days.length-1])svg+='<text class="chart-axis" text-anchor="middle" x="'+x(i)+'" y="'+(h-7)+'">'+(i+1)+'日</text>';
 for(const kind of ['expense','income']){svg+='<polyline class="chart-line '+kind+'-line" points="'+days.map((d,i)=>num(x(i))+','+num(y(d[kind+'_cents']))).join(' ')+'"/>';
 for(let i=0;i<days.length;i++)if(days[i][kind+'_cents'])svg+='<circle class="'+kind+'-point" cx="'+x(i)+'" cy="'+y(days[i][kind+'_cents'])+'" r="3"><title>'+days[i].date+' '+(kind==='expense'?'支出':'收入')+' '+money(days[i][kind+'_cents'])+'</title></circle>';}
 node.innerHTML=svg+'</svg>';
}
function pie(node,rows){
 if(!rows.length){node.innerHTML='<div class="chart-empty"><strong>还没有支出</strong><p>记一笔账后，在这里查看分类占比。</p></div>';return;}
 const groups=rows.length>6?[...rows.slice(0,5),{label:'其他',cents:rows.slice(5).reduce((s,x)=>s+x.cents,0)}]:rows;
 const total=groups.reduce((s,x)=>s+x.cents,0);let angle=-Math.PI/2;
 let svg='<svg viewBox="0 0 180 180" role="img" aria-label="支出分类扇形图，右侧列表包含金额和占比"><title>支出分类占比</title>';
 groups.forEach((r,i)=>{const sweep=r.cents/total*Math.PI*2,end=angle+sweep,tx=90+78*Math.cos(angle),ty=90+78*Math.sin(angle),ex=90+78*Math.cos(end),ey=90+78*Math.sin(end);
 const attrs=' class="slice slice-'+i+'"';svg+=sweep>=Math.PI*2-1e-10?'<circle cx="90" cy="90" r="78"'+attrs+'><title>'+esc(r.label)+' 100%</title></circle>':'<path'+attrs+' d="M90 90 L'+num(tx)+' '+num(ty)+' A78 78 0 '+(sweep>Math.PI?1:0)+' 1 '+num(ex)+' '+num(ey)+' Z"><title>'+esc(r.label)+' '+(r.cents/total*100).toFixed(1)+'%</title></path>';angle=end;});
 node.innerHTML=svg+'</svg><ul class="pie-legend">'+groups.map((r,i)=>'<li><span class="legend-name"><i class="slice-'+i+'"></i>'+esc(r.label)+'</span><span>'+money(r.cents)+' <small>'+(r.cents/total*100).toFixed(1)+'%</small></span></li>').join('')+'</ul>';
}
root.LedgerCharts={trend,pie};
})(globalThis);
