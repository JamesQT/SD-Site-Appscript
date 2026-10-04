const {ctx,rows,uuid}=require('./server.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const runtime=process.env.SD_NODE_MODULES||'C:/Users/ULTRA/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {chromium}=require(path.join(runtime,'playwright'));
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'Index.html'),'utf8').replace("<?!= include('Styles'); ?>",()=>fs.readFileSync(path.join(root,'Styles.html'),'utf8')).replace("<?!= include('Client'); ?>",()=>fs.readFileSync(path.join(root,'Client.html'),'utf8').replace('function showError(error) {','function showError(error) { console.error(error.stack);'));
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;const failures=[],rpc=[];let slowId='',baseGate=null,activityGate=null,failActivity=false;
  try {
    browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    page.on('pageerror',e=>{failures.push(e.message);console.error('PAGE:',e.message);});
    page.on('console',m=>{if(m.type()==='error')console.error('BROWSER:',m.text());});
    await page.exposeFunction('__server',async(name,args)=>{
      rpc.push(name);
      if(name==='getCommitmentDetail'&&baseGate) await baseGate;
      if(name==='getCommitmentActivity'&&activityGate) await activityGate;
      if(name==='getCommitmentActivity'&&failActivity) throw new Error('Simulated activity failure');
      if(name==='getCommitmentDetail'&&args[0]===slowId) await new Promise(r=>setTimeout(r,250));
      if(typeof ctx[name]!=='function'||name.endsWith('_')) throw new Error('Invalid RPC');
      try {return JSON.parse(JSON.stringify(ctx[name](...args)));} catch(e){console.error('RPC:',name,e.message);throw e;}
    });
    await page.addInitScript(()=>{
      function runner(success,failure){return new Proxy({}, {get(_,name){if(name==='withSuccessHandler')return fn=>runner(fn,failure);if(name==='withFailureHandler')return fn=>runner(success,fn);return(...args)=>window.__server(name,args).then(success||(()=>{})).catch(e=>(failure||(()=>{}))({message:e.message}));}});}
      window.google={script:{run:runner()}};
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(()=>document.querySelector('#user-name').textContent==='Admin');
    await page.locator('[data-view="admin"]').click();await page.locator('#admin-new').click();
    await page.locator('#feature-form [name="nombre"]').fill('Browser User');
    await page.locator('#feature-form [name="correo_corporativo"]').fill('browser@example.com');
    await page.locator('#feature-save').click();await page.waitForFunction(()=>!document.querySelector('#feature-dialog').open);
    const browserUser=rows('USUARIOS').find(u=>u.correo_corporativo==='browser@example.com');assert.ok(browserUser);
    await page.locator('#admin-section').selectOption('projects');await page.locator('#admin-new').click();
    await page.locator('#feature-form [name="nombre"]').fill('Browser Project');await page.locator('#feature-save').click();await page.waitForFunction(()=>!document.querySelector('#feature-dialog').open);
    assert.ok(rows('PROYECTOS').find(p=>p.nombre==='Browser Project'));
    await page.locator('[data-view="recurrentes"]').click();await page.locator('[data-action="new-recurrence"]').click();
    await page.locator('#feature-form [name="nombre"]').fill('Browser Recurrence');await page.locator('#feature-form [name="tipo_id"]').selectOption('N');await page.locator('#feature-form [name="owner_id"]').selectOption('B');
    await page.locator('#feature-form [name="fecha_inicio"]').fill('2026-10-03');await page.locator('#feature-form [name="proxima_generacion"]').fill('2026-10-03');
    await page.locator('#feature-save').click();await page.waitForFunction(()=>!document.querySelector('#feature-dialog').open);assert.ok(rows('RECURRENCIAS').find(r=>r.nombre==='Browser Recurrence'));
    await page.locator('[data-view="compromisos"]').click();
    const open=rows('COMPROMISOS').find(c=>c.estado==='EN_CURSO');
    let releaseBase,releaseActivity;
    activityGate=new Promise(r=>releaseActivity=r);
    await page.locator(`#commitments-table tr[data-id="${open.compromiso_id}"]`).click();
    assert.ok(await page.locator('#detail-dialog').evaluate(d=>d.open));
    await page.locator('#update-form').waitFor();
    assert.ok((await page.locator('#detail-history').textContent()).includes('cuando lo solicites'));
    await page.locator('#activity-more').click();
    failActivity=true;releaseActivity();activityGate=null;
    await page.waitForFunction(()=>document.querySelector('#activity-more').textContent==='Reintentar actividad');
    assert.ok(await page.locator('#update-form').isVisible());
    await page.locator('#update-form [name="descripcion"]').fill('Unsaved draft');
    ctx.updateCommitment({compromiso_id:open.compromiso_id,changes:{descripcion:'External edit'}});
    await page.evaluate(()=>document.querySelector('#sync-now').click());
    await page.waitForFunction(()=>document.querySelector('#detail-update-note').textContent.includes('Hay cambios recientes'));
    assert.equal(await page.locator('#update-form [name="descripcion"]').inputValue(),'Unsaved draft');
    await page.locator('#update-form button[type="submit"]').click();
    await page.waitForFunction(()=>document.querySelector('#detail-save-error').textContent.length>0);
    assert.equal(await page.locator('#update-form [name="descripcion"]').inputValue(),'Unsaved draft');
    assert.equal(rows('COMPROMISOS').find(c=>c.compromiso_id===open.compromiso_id).descripcion,'External edit');
    await page.locator('[data-action="reload-local-detail"]').click();
    await page.locator('#update-form [name="descripcion"]').fill('Unsaved draft');
    failActivity=false;await page.locator('#activity-more').click();await page.waitForFunction(()=>document.querySelectorAll('#detail-history .list-row').length===40);
    assert.equal(await page.locator('#update-form [name="descripcion"]').inputValue(),'Unsaved draft');
    await page.locator('#activity-more').click();await page.waitForFunction(()=>document.querySelectorAll('#detail-history .list-row').length>40);
    await page.locator('#comment-form textarea').fill('Browser comment');await page.locator('#comment-form button').click();
    await page.waitForFunction(()=>document.querySelector('#detail-content').textContent.includes('Browser comment'));
    assert.equal(await page.locator('#update-form [name="descripcion"]').inputValue(),'Unsaved draft');
    await page.locator('#detail-dialog [data-action="reassign"]').click();await page.locator('#feature-form [name="owner_id"]').selectOption('B');await page.locator('#feature-form [name="aprobador_id"]').selectOption('C');await page.locator('#feature-form [name="motivo"]').fill('Browser reassignment');await page.locator('#feature-save').click();await page.waitForFunction(()=>!document.querySelector('#feature-dialog').open);
    assert.equal(rows('COMPROMISOS').find(c=>c.compromiso_id===open.compromiso_id).owner_id,'B');
    // Closing a pending detail must never reopen it when its response arrives.
    baseGate=new Promise(r=>releaseBase=r);
    await page.locator(`#commitments-table tr[data-id="${open.compromiso_id}"]`).click();await page.locator('#detail-dialog [data-action="close-dialog"]').click();
    releaseBase();baseGate=null;await page.waitForTimeout(100);assert.equal(await page.locator('#detail-dialog').evaluate(d=>d.open),false);
    await page.locator(`#commitments-table tr[data-id="${open.compromiso_id}"]`).click();await page.locator('#detail-dialog [data-action="cancel-commitment"]').click();await page.locator('#feature-form [name="motivo"]').fill('Browser cancellation');await page.locator('#feature-save').click();await page.waitForFunction(()=>!document.querySelector('#feature-dialog').open);assert.equal(rows('COMPROMISOS').find(c=>c.compromiso_id===open.compromiso_id).estado,'ANULADO');
    // Out-of-order responses must not change the decision target.
    const a=ctx.createCommitment({titulo:'Slow approval',tipo_id:'T',owner_id:'B',aprobador_id:'A',fecha_objetivo:'2026-10-10',request_id:uuid(201)});
    const b=ctx.createCommitment({titulo:'Fast approval',tipo_id:'T',owner_id:'B',aprobador_id:'A',fecha_objetivo:'2026-10-10',request_id:uuid(202)});
    const aprA=ctx.submitEvidence({compromiso_id:a.id,url:'https://drive.google.com/a',comentario:'A'}),aprB=ctx.submitEvidence({compromiso_id:b.id,url:'https://drive.google.com/b',comentario:'B'});
    await page.reload();await page.waitForFunction(()=>document.querySelector('#user-name').textContent==='Admin');await page.locator('[data-view="aprobaciones"]').click();slowId=a.id;
    await page.locator(`#approval-list [data-id="${aprA.approvalId}"]`).click();await page.locator(`#approval-list [data-id="${aprB.approvalId}"]`).click();
    await page.waitForFunction(()=>document.querySelector('#approval-detail').textContent.includes('Fast approval'));
    await new Promise(r=>setTimeout(r,350));assert.ok((await page.locator('#approval-detail').textContent()).includes('Fast approval'));
    await page.locator('#decision-comment').fill('Return B');await page.locator('[data-action="decide"][data-decision="DEVOLVER"]').click();
    await page.waitForFunction(()=>!document.querySelector('#approval-detail [data-action="decide"]'));
    assert.equal(rows('APROBACIONES').find(r=>r.aprobacion_id===aprA.approvalId).estado,'PENDIENTE');assert.equal(rows('APROBACIONES').find(r=>r.aprobacion_id===aprB.approvalId).estado,'DEVUELTO');
    await page.locator('[data-view="admin"]').click();await page.waitForFunction(()=>document.querySelector('#automation-status').textContent.includes('Correos pendientes'));
    await page.screenshot({path:path.join(root,'tests/admin-preview.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('[data-view="admin"]').isVisible());
    assert.equal(rpc.filter(n=>n==='getCommitmentDetail').length,0);
    assert.equal(rpc.filter(n=>n==='getAppData').length,2);
    assert.deepEqual(failures,[]);console.log('PASS: browser forms, immediate detail opening, deferred/paginated activity, closed-window responses ignored, comments, reassignment, cancellation, approval response race and mobile admin navigation.');
  } finally {if(browser) await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
