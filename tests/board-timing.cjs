/** Indicadores del tablero contra historial, caché y sincronización reales del servidor simulado. */
const assert=require('node:assert/strict');
const {ctx,uuid,rows,sheets,cache,advanceTime,setEmail}=require('./server.cjs');
const task=ctx.createCommitment({titulo:'Timing task',tipo_id:'N',owner_id:'B',fecha_objetivo:'2026-11-10',request_id:uuid(950)});
const detail=()=>ctx.getAppData().details.find(d=>d.commitment.compromiso_id===task.id);
const change=changes=>ctx.updateCommitment({compromiso_id:task.id,expected_version:detail().commitment._version,changes});
let d=detail();assert.equal(d.boardTiming.ageDays,0);assert.equal(d.boardTiming.stateDays,0);assert.equal(d.boardTiming.postponed,false);
// Antes y después de medianoche en Lima: días calendario, no bloques de 24 horas ni UTC.
advanceTime(13*3600000+59*60000);assert.equal(detail().boardTiming.ageDays,0);
advanceTime(60000);assert.equal(detail().boardTiming.ageDays,1);
advanceTime(86400000);change({estado:'EN_CURSO'});
d=detail();assert.equal(d.boardTiming.ageDays,2);assert.equal(d.boardTiming.stateDays,0);
advanceTime(86400000);change({descripcion:'Solo descripción'});
ctx.addCommitmentComment({compromiso_id:task.id,comentario:'Solo comentario',request_id:uuid(951)});
ctx.saveCommitmentChecklist({compromiso_id:task.id,expected_version:detail().commitment._version,items:[{id:uuid(953),title:'Paso sin cambio de estado',done:true}]});
d=detail();assert.equal(d.boardTiming.stateDays,1);assert.equal(d.boardTiming.ageDays,3);
change({fecha_objetivo:'2026-11-09'});assert.equal(detail().boardTiming.postponed,false);
change({fecha_objetivo:'2026-11-09'});assert.equal(detail().boardTiming.postponed,false);
// La caché ampliada se actualiza al escribir, sin una lectura adicional del historial al pintar.
const reads=[];const original=sheets.HISTORIAL.getDataRange.bind(sheets.HISTORIAL);
sheets.HISTORIAL.getDataRange=()=>{reads.push('HISTORIAL');return original();};
change({fecha_objetivo:'2026-11-12'});reads.length=0;
d=detail();assert.equal(reads.length,0);assert.equal(d.boardTiming.postponed,true);assert.equal(d.boardTiming.stateDays,1);
assert.equal(typeof d.activityVersion,'string');assert.equal(d.activityVersion,ctx.getCommitmentActivity(task.id).activityVersion);
change({fecha_objetivo:'2026-11-08'});assert.equal(detail().boardTiming.postponed,true);
cache.clear();assert.equal(detail().boardTiming.postponed,true);assert.equal(detail().boardTiming.stateDays,1);
// La fecha del cambio de estado incluye también envío/cierre, devolución y anulación.
const approval=ctx.createCommitment({titulo:'Approval timing',tipo_id:'T',owner_id:'B',aprobador_id:'C',fecha_objetivo:'2026-11-10',request_id:uuid(952)});
advanceTime(86400000);
let result=ctx.submitEvidence({compromiso_id:approval.id,url:'https://drive.google.com/example',comentario:'Listo'});
assert.equal(result.detail.boardTiming.stateDays,0);
advanceTime(86400000);
setEmail('approver@example.com');
result=ctx.decideApproval({aprobacion_id:result.approvalId,decision:'DEVOLVER',comentario:'Revisar'});
setEmail('admin@example.com');
assert.equal(result.remove,true);
assert.equal(ctx.getAppData().details.find(x=>x.commitment.compromiso_id===approval.id).boardTiming.stateDays,0);
advanceTime(86400000);
result=ctx.cancelCommitment({compromiso_id:approval.id,motivo:'Cancelado'});assert.equal(result.detail.boardTiming.stateDays,0);
result=ctx.submitEvidence({compromiso_id:task.id,url:'https://drive.google.com/example',comentario:'Fin'});assert.equal(result.detail.boardTiming.stateDays,0);assert.equal(result.detail.boardTiming.postponed,true);
// El cambio de día llega como delta aun sin escrituras y la versión de edición permanece estable.
const snapshot=ctx.getAppData();d=snapshot.details.find(x=>x.commitment.compromiso_id===task.id);
advanceTime(86400000);
const delta=ctx.syncAppData({versions:Object.fromEntries(snapshot.details.map(x=>[x.commitment.compromiso_id,x._syncVersion])),metadataVersion:snapshot.metadataVersion,dataVersion:snapshot.dataVersion});
const updated=delta.details.find(x=>x.commitment.compromiso_id===task.id);
assert.equal(updated.boardTiming.ageDays,d.boardTiming.ageDays+1);assert.equal(updated.boardTiming.stateDays,1);assert.equal(updated.commitment._version,d.commitment._version);
// Registros antiguos sin trazabilidad: no inventar el inicio de un estado ya avanzado.
const legacy=ctx.boardTiming_({fecha_creacion:'2026-10-01',estado:'BLOQUEADO'},{});
assert.equal(legacy.stateDays,null);assert.equal(legacy.postponed,false);
assert.equal(ctx.boardTiming_({estado:'PENDIENTE'},{}).ageDays,null);
// El resumen interno no añade compromisos que el usuario no puede consultar.
setEmail('owner@example.com');assert.ok(ctx.getAppData().details.every(x=>x.isTask||x.approvals.some(a=>a.canDecide)));
setEmail('admin@example.com');
assert.ok(rows('HISTORIAL').some(x=>x.compromiso_id===task.id&&x.campo==='fecha_objetivo'));
console.log('PASS: Lima calendar days, state-only timer, approval/cancel/closure, persistent postponement, earlier/same date, cache reconstruction/extension, daily delta and legacy gaps.');
