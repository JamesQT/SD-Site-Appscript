/** Ejecuta comprobaciones y suites de servidor en procesos aislados, sin correos ni Sheets reales. */
const {spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.join(__dirname,'..');
for(const file of ['tools/check.cjs','tests/html.cjs','tests/server.cjs','tests/sync.cjs','tests/performance.cjs','tests/checklist.cjs']) {
  const result=spawnSync(process.execPath,[path.join(root,file)],{encoding:'utf8',cwd:root});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if(result.stdout)process.stdout.write(result.stdout.split('\n').filter(line=>!line.startsWith('SD_PERF ')).join('\n'));
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.status!==0)process.exit(result.status||1);
}
