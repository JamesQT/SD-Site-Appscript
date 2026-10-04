/** Verifica inventario, sintaxis, inclusiones y documentación antes de desplegar. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,manifest,serverSource,renderHtml}=require('./project.cjs');
const listed=[...manifest.server,...manifest.html];
assert.equal(new Set(listed).size,listed.length,'Inventario duplicado');
const actual=fs.readdirSync(root).filter(name=>/\.(gs|html)$/.test(name)).sort();
assert.deepEqual([...listed].sort(),actual,'Falta una fuente en project-files.json');
new vm.Script(serverSource(),{filename:'server-bundle.gs'});
const bootstrap=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}});
vm.runInContext(serverSource(),bootstrap);
const html=renderHtml('Index.html',[],bootstrap.getClientConfig_());
assert.ok(!html.includes('<?'),'Inclusiones o scriptlets sin resolver');
for(const [,script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script,{filename:'client-bundle.js'});
let functions=0;
for(const file of listed.filter(name=>name.endsWith('.gs')||name.startsWith('Client'))) {
  const source=fs.readFileSync(path.join(root,file),'utf8');
  assert.ok(!/[ÃÂ]|â€/.test(source),'Texto con codificación incorrecta en '+file);
  for(const match of source.matchAll(/^ *(?:async )?function (\w+)\(([^)]*)\)/gm)) {
    const prefix=source.slice(0,match.index).trimEnd();
    assert.ok(prefix.endsWith('*/'),'Falta JSDoc en '+file+': '+match[1]);
    const doc=prefix.slice(prefix.lastIndexOf('/**'));
    for(const parameter of match[2].split(',').map(p=>p.trim().split('=')[0].replace(/^\.\.\./,'')).filter(Boolean)) {
      assert.ok(new RegExp('@param \\{[^}]+\\} '+parameter+'(?: |$)').test(doc),'Falta parámetro '+parameter+' en '+match[1]);
    }
    functions++;
  }
}
assert.ok(fs.statSync(path.join(root,'Code.gs')).size<3000,'Code.gs volvió a contener lógica de negocio');
assert.ok(fs.statSync(path.join(root,'Client.html')).size<2000,'Client.html volvió a contener lógica de vistas');
console.log(`PASS: ${manifest.server.length} módulos de servidor, ${manifest.html.length} HTML, ${functions} funciones documentadas, sintaxis e inclusiones resueltas.`);
