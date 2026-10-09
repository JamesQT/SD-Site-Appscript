const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const NOW='2026-10-03T15:00:00Z';
const io={opens:0,reads:0,writes:0};
let nowMs=Date.parse(NOW);
class ClockDate extends Date {constructor(...args){super(...(args.length?args:[nowMs]));}static now(){return nowMs;}}
class Sheet {
  constructor(headers=[],rows=[]){this.rows=[headers,...rows];this.maxCols=26;}
  getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
  getMaxColumns(){return this.maxCols;}
  getLastRow(){return this.rows.length;}
  getMaxRows(){return this.maxRows||1000;}
  insertRowsAfter(_,n){this.maxRows=this.getMaxRows()+n;}
  insertColumnsAfter(_,n){this.maxCols+=n;}
  getDataRange(){io.reads++;return this.getRange(1,1,this.rows.length,Math.max(1,this.getLastColumn()));}
  getRange(row,col,rows=1,cols=1){
    return {getValues:()=>Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>{const v=this.rows[row+i-1]?.[col+j-1]??'';return v==='=1+1'?2:v;})),getFormulas:()=>Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>{const v=this.rows[row+i-1]?.[col+j-1];return typeof v==='string'&&v.startsWith('=')?v:'';})),setValues:values=>{io.writes++;values.forEach((v,i)=>{this.rows[row+i-1]??=[];v.forEach((x,j)=>this.rows[row+i-1][col+j-1]=x);});},setValue:v=>{io.writes++;this.rows[row-1]??=[];this.rows[row-1][col-1]=v;}};
  }
  appendRow(row){io.writes++;this.rows.push(row);}
}
const sheets={};const props={};let email='admin@example.com',uuidCount=0,mailError=false,quota=100,triggerCount=0;const sent=[],triggers=[];
const book={getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=new Sheet())};
book.getId=()=>ctx.spreadsheetId_();
const uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const ctx=vm.createContext({Date:ClockDate,console,Session:{getActiveUser:()=>({getEmail:()=>email})},SpreadsheetApp:{openById:()=>{io.opens++;return book;},flush:()=>{}},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v})},Utilities:{getUuid:()=>require('node:crypto').randomUUID(),formatDate:(date,tz,pattern)=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return pattern==='yyyy-MM-dd'?`${p.year}-${p.month}-${p.day}`:pattern==='yyyyMMdd-HHmmss'?`${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`:`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
},DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,value,encoding)=>Array.from(require('node:crypto').createHash(algorithm).update(Array.isArray(value)?Buffer.from(value.map(b=>(b+256)%256)):value,encoding).digest())},MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:m=>{if(mailError) throw new Error('Delivery denied');sent.push(m);}},ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:name=>({timeBased(){return this},everyHours(){return this},create(){const t={getHandlerFunction:()=>name,getUniqueId:()=>String(++triggerCount)};const id=t.getUniqueId();t.getUniqueId=()=>id;triggers.push(t);return t;}}),deleteTrigger:t=>triggers.splice(triggers.indexOf(t),1)}});
const cache=new Map();
ctx.CacheService={getScriptCache:()=>({get:key=>{const entry=cache.get(key);return entry&&entry.until>nowMs?entry.value:null;},put:(key,value,seconds)=>cache.set(key,{value,until:nowMs+seconds*1000})})};
ctx.ScriptApp.newTrigger=name=>({timeBased(){return this;},everyHours(){return this;},forSpreadsheet(id){this.sheetId=id;return this;},onEdit(){return this;},onChange(){return this;},create(){const id=String(++triggerCount),t={getHandlerFunction:()=>name,getUniqueId:()=>id};triggers.push(t);return t;}});
vm.runInContext(require('../tools/project.cjs').serverSource(),ctx);
const schemas=vm.runInContext('EXTRA_SCHEMAS',ctx);
Object.entries(schemas).forEach(([n,h])=>sheets[n]=new Sheet([...h]));
sheets.USUARIOS=new Sheet(['usuario_id','nombre','correo_corporativo','rol_sistema','activo','campo_existente']);
const commitmentHeaders='compromiso_id titulo descripcion tipo_id subtipo proyecto_id recurrencia_id criticidad estado fecha_creacion fecha_inicio fecha_objetivo fecha_cierre porcentaje_avance owner_id aprobador_actual_id nivel_aprobacion requiere_aprobacion ultima_actualizacion creado_por created_at updated_at updated_by activo'.split(' ');
sheets.COMPROMISOS=new Sheet(commitmentHeaders);
sheets.APROBACIONES=new Sheet('aprobacion_id compromiso_id version aprobador_asignado_id aprobador_efectivo_id delegado_por_id estado fecha_envio fecha_respuesta comentario created_at created_by'.split(' '));
sheets.EVIDENCIAS=new Sheet('evidencia_id compromiso_id aprobacion_id usuario_id fecha_subida tipo_evidencia nombre_archivo drive_file_id url_drive comentario'.split(' '));
sheets.HISTORIAL=new Sheet('historial_id compromiso_id fecha_evento usuario_id accion campo valor_anterior valor_nuevo detalle'.split(' '));
sheets.COMPROMISO_USUARIO=new Sheet('compromiso_id usuario_id rol activo'.split(' '));sheets.CATALOGOS=new Sheet(['nombre','valor']);
function rows(n){return ctx.readTable_(n);}
function record(n,r){ctx.appendRecord_(n,r);}
record('USUARIOS',{usuario_id:'A',nombre:'Admin',correo_corporativo:email,rol_sistema:'ADMIN',activo:true,campo_existente:'Conservar'});
record('USUARIOS',{usuario_id:'B',nombre:'Owner',correo_corporativo:'owner@example.com',rol_sistema:'RESPONSABLE',activo:true});
record('USUARIOS',{usuario_id:'C',nombre:'Approver',correo_corporativo:'approver@example.com',rol_sistema:'RESPONSABLE',activo:true});
record('TIPOS_COMPROMISO',{tipo_id:'T',nombre:'Approval',requiere_aprobacion:true,activo:true});record('TIPOS_COMPROMISO',{tipo_id:'N',nombre:'Direct',requiere_aprobacion:false,activo:true});
ctx.initializeFeatures();assert.equal(rows('USUARIOS').length,3);assert.equal(rows('USUARIOS')[0].campo_existente,'Conservar');assert.ok(sheets.USUARIOS.rows[0].includes('updated_at'));
const newUser={section:'users',request_id:uuid(100),nombre:'New user',correo_corporativo:'new@example.com',rol_sistema:'RESPONSABLE',activo:true};
const user=ctx.saveAdminRecord(newUser);ctx.saveAdminRecord(newUser);assert.equal(rows('USUARIOS').length,4);
assert.throws(()=>ctx.saveAdminRecord({...newUser,request_id:uuid(101)}),/correo ya/);
assert.throws(()=>ctx.saveAdminRecord({...newUser,id:'A',correo_corporativo:'admin@example.com',rol_sistema:'RESPONSABLE'}),/administrador activo/);
email='owner@example.com';
for(const name of ['initializeFeatures','saveAdminRecord','reassignCommitment','saveAutomationSettings','runOperationsNow','retryNotification'].filter(n=>ctx[n]))assert.throws(()=>ctx[name]({}),/ADMIN/);
email='admin@example.com';
const project=ctx.saveAdminRecord({section:'projects',request_id:uuid(102),nombre:'Project',descripcion:'Details',activo:true});
const type=ctx.saveAdminRecord({section:'types',request_id:uuid(103),nombre:'Simple',requiere_aprobacion:false,activo:true});
assert.equal(rows('PROYECTOS')[0].proyecto_id,project.id);assert.equal(rows('TIPOS_COMPROMISO').length,3);
assert.throws(()=>ctx.isoDateInput_('2026-02-30'),/calendario/);
assert.equal(ctx.nextRecurrenceDate_('2026-01-31','MENSUAL','2026-01-31'),'2026-02-28');
assert.equal(ctx.nextRecurrenceDate_('2026-02-28','MENSUAL','2026-01-31'),'2026-03-31');
assert.equal(ctx.nextRecurrenceDate_('2024-02-29','ANUAL','2024-02-29'),'2025-02-28');
const delegation={section:'delegations',request_id:uuid(104),delegante_id:'C',delegado_id:'B',alcance_tipo:'GLOBAL',fecha_inicio:'2026-10-01',fecha_fin:'2026-10-31',activo:true};
const del=ctx.saveAdminRecord(delegation);assert.equal(rows('DELEGACIONES')[0].nivel_aprobacion,'NIVEL_1');
assert.throws(()=>ctx.saveAdminRecord({...delegation,request_id:uuid(105),fecha_fin:'2026-09-30'}),/anterior/);
ctx.saveAutomationSettings({enabled:true,email:true});ctx.saveAutomationSettings({enabled:true,email:true});assert.equal(triggers.filter(t=>t.getHandlerFunction()==='scheduledTasks_').length,1);
const base={titulo:'Task',descripcion:'Result',tipo_id:'T',owner_id:'B',aprobador_id:'C',fecha_objetivo:'2026-10-10',request_id:uuid(106)};
const task=ctx.createCommitment(base);ctx.createCommitment(base);assert.equal(rows('COMPROMISOS').length,1);assert.equal(rows('NOTIFICACIONES').length,1);
ctx.submitEvidence({compromiso_id:task.id,url:'https://drive.google.com/example',comentario:'Done'});
assert.equal(rows('APROBACIONES')[0].estado,'PENDIENTE');assert.equal(rows('NOTIFICACIONES').length,2);
ctx.reassignCommitment({compromiso_id:task.id,owner_id:user.id,aprobador_id:'A',motivo:'Handover'});
assert.equal(rows('APROBACIONES')[0].aprobador_asignado_id,'A');assert.equal(rows('COMPROMISOS')[0].owner_id,user.id);
email='owner@example.com';assert.throws(()=>ctx.decideApproval({aprobacion_id:rows('APROBACIONES')[0].aprobacion_id,decision:'APROBAR'}),/vigente/);
email='admin@example.com';ctx.decideApproval({aprobacion_id:rows('APROBACIONES')[0].aprobacion_id,decision:'DEVOLVER',comentario:'Fix'});
assert.equal(rows('COMPROMISOS')[0].estado,'EN_CURSO');
assert.throws(()=>ctx.saveAdminRecord({...newUser,id:user.id,activo:false}),/Reasigna/);
const comment={compromiso_id:task.id,comentario:'Progress',request_id:uuid(107)};ctx.addCommitmentComment(comment);ctx.addCommitmentComment(comment);assert.equal(rows('HISTORIAL').filter(h=>h.accion==='COMMENT').length,1);
const second=ctx.createCommitment({...base,request_id:uuid(108)});ctx.submitEvidence({compromiso_id:second.id,url:'https://drive.google.com/example',comentario:'Done'});
ctx.cancelCommitment({compromiso_id:second.id,motivo:'No longer needed'});assert.equal(rows('APROBACIONES').find(a=>a.compromiso_id===second.id).estado,'ANULADO');
assert.throws(()=>ctx.decideApproval({aprobacion_id:rows('APROBACIONES').find(a=>a.compromiso_id===second.id).aprobacion_id,decision:'APROBAR'}),/atendida/);
const direct=ctx.createCommitment({...base,tipo_id:'N',aprobador_id:'',request_id:uuid(109)});assert.equal(ctx.submitEvidence({compromiso_id:direct.id,url:'https://drive.google.com/example',comentario:'Done'}).state,'CERRADO');
const recurrence={section:'recurrences',request_id:uuid(110),nombre:'Weekly task',tipo_id:'T',owner_id:'B',aprobador_id:'C',nivel_aprobacion:'NIVEL_1',criticidad:'MEDIA',frecuencia:'SEMANAL',fecha_inicio:'2026-09-26',proxima_generacion:'2026-09-26',fecha_fin:'2026-10-03',dias_plazo:3,activo:true};
ctx.saveAdminRecord(recurrence);const generation=ctx.generateRecurrences_('A');assert.equal(generation.generated,2);assert.equal(ctx.generateRecurrences_('A').generated,0);assert.equal(rows('RECURRENCIAS')[0].activo,false);
// Replay an occurrence after a cursor rollback: deterministic commitment IDs prevent duplicates.
const rec=rows('RECURRENCIAS')[0];ctx.setField_('RECURRENCIAS',rec._row,'activo',true);ctx.setField_('RECURRENCIAS',rec._row,'proxima_generacion','2026-09-26');assert.equal(ctx.generateRecurrences_('A').generated,0);
quota=0;assert.equal(ctx.deliverNotifications_(),0);quota=100;mailError=true;ctx.deliverNotifications_();ctx.deliverNotifications_();ctx.deliverNotifications_();assert.ok(rows('NOTIFICACIONES').some(n=>n.estado==='ERROR'));assert.ok(rows('NOTIFICACIONES').some(n=>n.estado==='OMITIDO'));
mailError=false;const queued=rows('NOTIFICACIONES').find(n=>n.estado==='ERROR');ctx.retryNotification({notificacion_id:queued.notificacion_id,motivo:'Retry after transport fixed'});assert.equal(ctx.deliverNotifications_(),1);assert.equal(sent.length,1);assert.equal(ctx.deliverNotifications_(),0);
const data=ctx.getAdminData();assert.ok(data.automation);assert.equal(data.notifications.length,rows('NOTIFICACIONES').length);
assert.ok(ctx.getAppData().isAdmin);assert.ok(ctx.getCommitmentActivity(task.id).history.some(h=>h.accion==='COMMENT'));
const baseline=vm.createContext(Object.fromEntries(['Date','console','Session','SpreadsheetApp','LockService','PropertiesService','Utilities','MailApp','ScriptApp'].map(k=>[k,ctx[k]])));
vm.runInContext(fs.readFileSync(path.join(__dirname,'baseline-detail.gs'),'utf8'),baseline);
io.opens=io.reads=0;baseline.getCommitmentDetail(task.id);const before={...io};
io.opens=io.reads=0;const optimizedDetail=ctx.getCommitmentDetail(task.id);const after={...io};
assert.equal(before.reads,10);assert.equal(before.opens,10);assert.ok(after.reads<=7);assert.equal(after.opens,1);assert.equal(optimizedDetail.history,undefined);
console.log('Legacy detail endpoint service calls:',JSON.stringify({before,after}));
// Fresh authorization on every endpoint, including activity; never reuse another actor's cache.
email='owner@example.com';assert.throws(()=>ctx.getCommitmentDetail(task.id),/acceso/);assert.throws(()=>ctx.getCommitmentActivity(task.id),/acceso/);email='admin@example.com';
for(let i=0;i<95;i++)ctx.logEvent_(task.id,'A','COMMENT','','','',`Pagination ${i}`);
let cursor=null;const activity=[];
do{const page=ctx.getCommitmentActivity(task.id,cursor);assert.ok(page.history.length<=40);activity.push(...page.history);cursor=page.nextCursor;}while(cursor);
assert.equal(new Set(activity.map(h=>h.historial_id)).size,activity.length);assert.equal(activity.length,rows('HISTORIAL').filter(h=>h.compromiso_id===task.id).length);
assert.throws(()=>ctx.getCommitmentActivity(task.id,-1),/cursor/);
console.log('PASS: real server helpers against mock Sheets; roles, schema preservation, users, catalogs, delegations, reassignment, comments, cancellation, approval returns, direct closure, recurrences/replays/calendar, notifications/quota/retries and automation uniqueness.');
module.exports={ctx,rows,uuid,sheets,io,props,cache,triggers,book,setEmail:value=>email=value,advanceTime:ms=>nowMs+=ms};
