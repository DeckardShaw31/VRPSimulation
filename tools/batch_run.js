// Iterate over experiments/sample_scenarios/*.json and run run_scenario.js for each, saving outputs into experiments/results/<scenario-name>
const fs = require('fs'); const path = require('path'); const child_process = require('child_process');
const scenariosDir = path.join(__dirname,'..','experiments','sample_scenarios');
const outBase = path.join(__dirname,'..','experiments','results');
const files = fs.readdirSync(scenariosDir).filter(f=>f.endsWith('.json'));
if(files.length===0){ console.log('No scenario files found in', scenariosDir); process.exit(0); }
// start server
const server = child_process.spawn('node',[path.join(__dirname,'static-server.js')],{stdio:'inherit'});
setTimeout(()=>{
  (async ()=>{
    for(const f of files){ const sp = path.join(scenariosDir,f); const name = path.basename(f, '.json'); const out = path.join(outBase, name); if(!fs.existsSync(out)) fs.mkdirSync(out,{recursive:true}); console.log('Running', sp, '->', out); const res = child_process.spawnSync('node',[path.join(__dirname,'run_scenario.js'), sp, out],{stdio:'inherit'}); if(res.status!==0) console.error('run_scenario failed for', sp); }
    console.log('Batch run complete'); process.exit(0);
  })();
}, 800);
