/** Casos de cambios, caché, permisos y configuración sobre servicios simulados. */
const assert=require('node:assert/strict');
const {ctx,rows,sheets,io,props,cache,triggers,book,setEmail,advanceTime}=require('./server.cjs');
const tableReads=[];
for(const [name,sheet] of Object.entries(sheets)) {
  const original=sheet.getDataRange.bind(sheet);
  sheet.getDataRange=()=>{tableReads.push(name);return original();};
}
const syncArgs=snapshot=>({versions:Object.fromEntries(snapshot.details.map(d=>[d.commitment.compromiso_id,d._syncVersion])),metadataVersion:snapshot.metadataVersion,dataVersion:snapshot.dataVersion});
cache.clear();
let snapshot=ctx.getAppData();
assert.ok(tableReads.includes('HISTORIAL'));
tableReads.length=0;io.reads=0;
let delta=ctx.syncAppData(syncArgs(snapshot));
assert.equal(delta.details.length,0);assert.equal(delta.metadata,null);
assert.equal(io.reads,5);
assert.ok(!tableReads.includes('HISTORIAL'));assert.ok(!tableReads.includes('EVIDENCIAS'));
tableReads.length=0;
ctx.getAppData();assert.ok(!tableReads.includes('HISTORIAL'));assert.ok(!tableReads.includes('PROYECTOS'));

// La revisión de catálogos cambia al editar desde la aplicación.
const project=rows('PROYECTOS')[0];
ctx.withLock_(()=>ctx.patchRecord_('PROYECTOS',project._row,{nombre:'Versioned project'}));
delta=ctx.syncAppData(syncArgs(snapshot));assert.equal(delta.metadata.projects.find(p=>p.proyecto_id===project.proyecto_id).nombre,'Versioned project');

// Los disparadores son repetibles y solo aceptan su evento de origen.
ctx.initializeFeatures();ctx.initializeFeatures();
assert.equal(triggers.filter(t=>t.getHandlerFunction()==='trackSheetEdit_').length,1);
assert.equal(triggers.filter(t=>t.getHandlerFunction()==='trackSheetChange_').length,1);
const tracking=JSON.parse(props.SD_CHANGE_TRACKING);
snapshot=ctx.getAppData();
const projectHeader=sheets.PROYECTOS.rows[0],nameColumn=projectHeader.indexOf('nombre');
sheets.PROYECTOS.rows[project._row-1][nameColumn]='Human edit';
const revisionBefore=props.SD_REVISIONS;
ctx.trackSheetEdit_({source:book,triggerUid:'wrong',range:{getSheet:()=>({getName:()=> 'PROYECTOS'})}});
assert.equal(props.SD_REVISIONS,revisionBefore);
ctx.trackSheetEdit_({source:book,triggerUid:tracking.editTriggerId,range:{getSheet:()=>({getName:()=> 'PROYECTOS'})}});
delta=ctx.syncAppData(syncArgs(snapshot));assert.equal(delta.metadata.projects.find(p=>p.proyecto_id===project.proyecto_id).nombre,'Human edit');

// Las ediciones realizadas por otro script no activan onEdit; Actualizar fuerza la lectura.
snapshot=ctx.getAppData();sheets.PROYECTOS.rows[project._row-1][nameColumn]='External script edit';
delta=ctx.syncAppData({...syncArgs(snapshot),force:true});assert.equal(delta.metadata.projects.find(p=>p.proyecto_id===project.proyecto_id).nombre,'External script edit');
snapshot=ctx.getAppData();sheets.PROYECTOS.rows[project._row-1][nameColumn]='Untracked edit';
advanceTime(300001);
delta=ctx.syncAppData(syncArgs(snapshot));assert.equal(delta.metadata.projects.find(p=>p.proyecto_id===project.proyecto_id).nombre,'Untracked edit');

// Los cambios estructurales descartan también índices que tenían una clave anterior.
const keyBefore=ctx.performanceCacheKey_('activity-v3','HISTORIAL');
ctx.trackSheetChange_({source:book,triggerUid:tracking.changeTriggerId,changeType:'INSERT_ROW'});
assert.notEqual(ctx.performanceCacheKey_('activity-v3','HISTORIAL'),keyBefore);

// Las aprobaciones y responsabilidades se leen incluso cuando el cliente declara no cambios.
setEmail('owner@example.com');snapshot=ctx.getAppData();
const owner=rows('USUARIOS').find(u=>u.usuario_id==='B');
const activeColumn=sheets.USUARIOS.rows[0].indexOf('activo');
sheets.USUARIOS.rows[owner._row-1][activeColumn]=false;
assert.throws(()=>ctx.syncAppData(syncArgs(snapshot)),error=>error.code==='AUTH');
sheets.USUARIOS.rows[owner._row-1][activeColumn]=true;setEmail('admin@example.com');

// Las cachés son reconstruibles y nunca bloquean una lectura por su desaparición.
cache.clear();assert.ok(ctx.getAppData().details.length>0);
const savedCache=ctx.CacheService;ctx.CacheService={getScriptCache(){throw new Error('Cache unavailable');}};
assert.ok(ctx.getAppData().details.length>0);ctx.CacheService=savedCache;

// Una escritura parcial fallida libera el bloqueo y publica la invalidación.
snapshot=ctx.getAppData();const beforePartial=props.SD_REVISIONS;
assert.throws(()=>ctx.withLock_(()=>{ctx.patchRecord_('PROYECTOS',project._row,{descripcion:'Partial write'});throw new Error('Later step failed');}),/Later step failed/);
assert.notEqual(props.SD_REVISIONS,beforePartial);
delta=ctx.syncAppData(syncArgs(snapshot));assert.equal(delta.metadata.projects.find(p=>p.proyecto_id===project.proyecto_id).descripcion,'Partial write');

// PRUEBAS nunca puede apuntar al Sheet de producción por omisión.
props.SD_ENV='PRUEBAS';assert.throws(()=>ctx.spreadsheetId_(),error=>error.code==='CONFIGURATION');
props.SD_SPREADSHEET_ID='mock-test-sheet';assert.equal(ctx.spreadsheetId_(),'mock-test-sheet');
assert.equal(ctx.getClientConfig_().environment,'PRUEBAS');assert.equal(ctx.getClientConfig_().spreadsheetId,undefined);
delete props.SD_ENV;delete props.SD_SPREADSHEET_ID;
assert.throws(()=>ctx.syncAppData({versions:[]}),error=>error.code==='VALIDATION');
console.log('PASS: five-table unchanged sync, catalog invalidation, activity cache, direct-sheet triggers, forced refresh, timed fallback, access revocation, cache failure, partial-write revision and test-environment isolation.');
