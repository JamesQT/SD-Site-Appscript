/** Fórmulas de gestión y filtros con casos conocidos, independientes del renderizado. */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const detail=(id,owner,status,due,timing={},baseline={},closed='')=>({commitment:{compromiso_id:id,owner_id:owner,owner_name:owner,estado:status,fecha_objetivo:due,fecha_cierre:closed},boardTiming:{asOfDate:'2026-10-09',...timing},baseline,approvals:[]});
const details={
  pending:detail('pending','B','PENDIENTE','2026-10-08',{stateDays:7,postponed:true}),
  blocked:detail('blocked','B','BLOQUEADO','2026-10-10',{stateDays:3}),
  approval:detail('approval','B','EN_APROBACION','2026-10-09',{stateDays:1,hasStateChange:true}),
  sameDay:detail('sameDay','A','EN_CURSO','2026-10-10',{stateDays:0,hasStateChange:true,createdOn:'2026-10-09',stateSince:'2026-10-09'}),
  new:detail('new','A','PENDIENTE','2026-10-10',{stateDays:0,hasStateChange:false}),
  onTime:detail('onTime','B','CERRADO','2026-10-20',{stateDays:9,postponed:true},{originalDate:'2026-10-05',source:'CREACION'},'2026-10-05'),
  late:detail('late','B','CERRADO','2026-10-20',{}, {originalDate:'2026-10-05',source:'HISTORIAL'},'2026-10-06'),
  unknown:detail('unknown','B','CERRADO','2026-10-20',{}, {originalDate:'2026-10-20',source:'REFERENCIA_ACTUAL'},'2026-10-05'),
  undated:detail('undated','B','CERRADO','2026-10-20',{}, {originalDate:'2026-10-05',source:'CREACION'}),
  cancelled:detail('cancelled','B','ANULADO','2026-10-01',{stateDays:99}),
  legacy:detail('legacy','Z','EN_CURSO','2026-10-20',{stateDays:null})
};
details.approval.approvals=[{estado:'PENDIENTE',aprobador_asignado_id:'A'}];
const state={details,data:{people:[{usuario_id:'A',nombre:'Admin',rol_sistema:'ADMIN'},{usuario_id:'B',nombre:'Owner',rol_sistema:'RESPONSABLE'},{usuario_id:'C',nombre:'Sin tareas',rol_sistema:'RESPONSABLE'}],commitments:Object.values(details).map(d=>d.commitment)}};
const ctx=vm.createContext({state,Date,Intl,console});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../ClientTracking.html'),'utf8').replace(/^<script>\s*|\s*<\/script>\s*$/g,''),ctx);
assert.equal(ctx.matchesFollowup(details.sameDay,'recent'),true);assert.equal(ctx.matchesFollowup(details.new,'recent'),false);
assert.equal(ctx.matchesFollowup(details.blocked,'recent'),false);assert.equal(ctx.matchesFollowup(details.pending,'stale'),true);
assert.equal(ctx.matchesFollowup(details.onTime,'stale'),false);assert.equal(ctx.matchesFollowup(details.legacy,'stale'),false);
assert.equal(ctx.matchesFollowup(details.pending,'overdue'),true);assert.equal(ctx.matchesFollowup(details.approval,'overdue'),false);
assert.equal(ctx.matchesFollowup(details.cancelled,'overdue'),false);assert.equal(ctx.matchesFollowup(details.onTime,'postponed'),true);
const metrics=ctx.teamTrackingMetrics(),owner=metrics.find(p=>p.id==='B');
assert.equal(owner.open,3);assert.equal(owner.overdue,1);assert.equal(owner.blocked,1);assert.equal(owner.postponed,1);assert.equal(owner.stale,1);
assert.equal(owner.closed,4);assert.equal(owner.onTime,1);assert.equal(owner.comparable,2);assert.equal(owner.compliance,50);
assert.equal(metrics.find(p=>p.id==='A').approvals,1);assert.equal(metrics.find(p=>p.id==='C').compliance,null);
assert.equal(metrics.find(p=>p.id==='Z').open,1);assert.equal(metrics[0].id,'B');
console.log('PASS: exact followup boundaries, same-day state changes, closed/cancelled exclusions, net load, original-date compliance denominator, pending approvals and legacy owners.');
