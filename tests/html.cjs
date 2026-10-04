/** Comprueba el camino de inclusión de Code.gs, además del ensamblado de navegador. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {root,manifest,serverSource}=require('../tools/project.cjs');
const partials=manifest.html.filter(name=>name.startsWith('Client')&&name!=='Client.html');
const reads=[],templates=[];
const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}});

/** Simula la lectura de HTML Service exigiendo el contexto script de los componentes. */
function source(name) {
  const text=fs.readFileSync(path.join(root,name+'.html'),'utf8');
  if(partials.includes(name+'.html')) assert.match(text,/^\s*<script>[\s\S]*<\/script>\s*$/,'JavaScript suelto no debe enviarse al analizador HTML');
  return text;
}
ctx.HtmlService={
  createHtmlOutputFromFile(name){reads.push(name);return {getContent:()=>source(name)};},
  createTemplateFromFile(name){
    templates.push(name);
    assert.ok(!partials.includes(name+'.html'),'Los componentes script no necesitan evaluate()');
    return {evaluate(){
      const content=source(name)
        .replace('<?!= JSON.stringify(getClientConfig_()); ?>',()=>JSON.stringify(ctx.getClientConfig_()))
        .replace(/<\?!=\s*include\('([\w]+)'\);\s*\?>/g,(_,child)=>ctx.include(child));
      return {getContent:()=>content,setTitle(){return this;}};
    }};
  }
};
vm.runInContext(serverSource(),ctx);
const html=ctx.doGet().getContent();
assert.ok(!html.includes('<?'));
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1,'Los siete componentes deben compartir un único cierre privado');
assert.ok(!scripts[0][1].includes('<script>'),'No puede haber etiquetas script anidadas');
new vm.Script(scripts[0][1]);
assert.deepEqual([...reads].sort(),partials.map(name=>name.slice(0,-5)).sort());
assert.deepEqual(templates,['Index','Styles','Client']);
assert.throws(()=>ctx.include('Contracts'),/no permitido/);
console.log('PASS: camino de inclusión de Code.gs con HTML Service simulado, siete bloques script válidos, sin JavaScript suelto ni scripts anidados.');
