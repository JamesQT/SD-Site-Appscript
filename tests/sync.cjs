const {ctx,rows,sheets,io,uuid,setEmail}=require('./server.cjs');const assert=require('node:assert/strict');
const initial=ctx.getAppData();
const versions=Object.fromEntries(initial.details.map(d=>[d.commitment.compromiso_id,d._syncVersion]));
let delta=ctx.syncAppData({versions,metadataVersion:initial.metadataVersion});assert.equal(delta.details.length,0);assert.equal(delta.removed.length,0);assert.equal(delta.metadata,null);
const task=rows('COMPROMISOS').find(c=>c.estado==='EN_CURSO');const original=initial.details.find(d=>d.commitment.compromiso_id===task.compromiso_id);
// Preserve untouched formulas and nonstandard columns when batching a logical update.
const header=sheets.COMPROMISOS.rows[0];header.push('custom_formula');sheets.COMPROMISOS.rows[task._row-1][header.length-1]='=1+1';
const schemaSnapshot=ctx.getAppData();const schemaVersions=Object.fromEntries(schemaSnapshot.details.map(d=>[d.commitment.compromiso_id,d._syncVersion]));
const fresh=schemaSnapshot.details.find(d=>d.commitment.compromiso_id===task.compromiso_id);
io.writes=0;
const saved=ctx.updateCommitment({compromiso_id:task.compromiso_id,expected_version:fresh.commitment._version,changes:{descripcion:'Updated via partial edit',porcentaje_avance:45,estado:'BLOQUEADO'}});
assert.equal(io.writes,2);assert.equal(saved.detail.commitment.descripcion,'Updated via partial edit');assert.equal(saved.detail.commitment.porcentaje_avance,45);assert.equal(saved.detail.commitment.estado,'BLOQUEADO');assert.equal(saved.detail.commitment.owner_id,task.owner_id);
assert.equal(sheets.COMPROMISOS.rows[task._row-1][header.length-1],'=1+1');assert.equal(saved.detail.commitment.custom_formula,2);
io.writes=0;assert.throws(()=>ctx.updateCommitment({compromiso_id:task.compromiso_id,expected_version:fresh.commitment._version,changes:{descripcion:'Stale overwrite'}}),/CONFLICT/);assert.equal(io.writes,0);assert.equal(rows('COMPROMISOS').find(c=>c.compromiso_id===task.compromiso_id).descripcion,'Updated via partial edit');
assert.throws(()=>ctx.updateCommitment({compromiso_id:task.compromiso_id,expected_version:saved.detail.commitment._version,changes:{owner_id:'B'}}),/no editable/);assert.equal(io.writes,0);
delta=ctx.syncAppData({versions:schemaVersions,metadataVersion:schemaSnapshot.metadataVersion});assert.equal(delta.details.length,1);assert.equal(delta.details[0].commitment.compromiso_id,task.compromiso_id);
const current=ctx.getAppData();const currentVersions=Object.fromEntries(current.details.map(d=>[d.commitment.compromiso_id,d._syncVersion]));
const comment=ctx.addCommitmentComment({compromiso_id:task.compromiso_id,comentario:'Synced comment',request_id:uuid(501)});assert.ok(comment.comment);assert.equal(comment.detail.activityVersion,comment.comment.historial_id);
delta=ctx.syncAppData({versions:currentVersions,metadataVersion:current.metadataVersion});assert.equal(delta.details.length,1);assert.equal(delta.details[0].activityVersion,comment.comment.historial_id);
// A client's version map never grants access to somebody else's data.
setEmail('owner@example.com');const limited=ctx.getAppData();assert.equal(limited.isAdmin,false);assert.ok(limited.details.every(d=>d.commitment.owner_id==='B'||d.collaborators.some(r=>r.usuario_id==='B')||d.approvals.some(a=>a.canDecide)));
const privateId=task.compromiso_id;assert.ok(!limited.details.some(d=>d.commitment.compromiso_id===privateId));
const filtered=ctx.syncAppData({versions:{[privateId]:'pretend'},metadataVersion:current.metadataVersion});assert.ok(filtered.removed.includes(privateId));assert.ok(!filtered.details.some(d=>d.commitment.compromiso_id===privateId));assert.equal(filtered.metadata.users.length,0);assert.equal(filtered.metadata.recurrences.length,0);
// Revoking a user's active flag is checked even when they already have a snapshot.
setEmail('admin@example.com');const owner=rows('USUARIOS').find(u=>u.usuario_id==='B');ctx.patchRecord_('USUARIOS',owner._row,{activo:false});setEmail('owner@example.com');assert.throws(()=>ctx.syncAppData({versions:{}}),/no está activo/);setEmail('admin@example.com');ctx.patchRecord_('USUARIOS',owner._row,{activo:true});
console.log('PASS: unchanged sync transfers no records, authorized deltas, partial edits, two grouped writes, formula preservation, stale-write conflicts without writes, comment invalidation and revocation.');
