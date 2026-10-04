/** Lee el inventario del proyecto y ensambla sus componentes para pruebas locales. */
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'project-files.json'),'utf8'));

/** Concatena archivos de servidor sin modificar las fuentes desplegables. */
function serverSource() {
  return manifest.server.map(name=>fs.readFileSync(path.join(root,name),'utf8')).join('\n');
}

/** Resuelve solo inclusiones estáticas autorizadas por el inventario del proyecto. */
function renderHtml(name='Index.html',parents=[],uiConfig={}) {
  if(!manifest.html.includes(name)||parents.includes(name))throw new Error('Inclusión inválida: '+name);
  return fs.readFileSync(path.join(root,name),'utf8')
    .replace('<?!= JSON.stringify(getClientConfig_()); ?>',()=>JSON.stringify(uiConfig))
    .replace(/<\?!=\s*include\('([\w]+)'\);\s*\?>/g,(_,child)=>renderHtml(child+'.html',[...parents,name],uiConfig));
}
module.exports={root,manifest,serverSource,renderHtml};
