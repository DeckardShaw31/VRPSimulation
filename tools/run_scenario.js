// Headless runner: load a scenario JSON, open the app, import scenario, run simulate and dump CSV outputs
const fs = require('fs'); const path = require('path'); const puppeteer = require('puppeteer');
(async ()=>{
  const scenarioPath = process.argv[2] || path.join(__dirname,'..','experiments','sample_scenarios','scenario_example.json');
  const outDir = process.argv[3] || path.join(__dirname,'..','experiments','results','run1');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive:true});
  const scenario = JSON.parse(fs.readFileSync(scenarioPath,'utf8'));
  const serverPort = process.env.PORT || 8000;
  const baseUrl = `http://localhost:${serverPort}/`;
  const browser = await puppeteer.launch({ headless: true, args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'networkidle2' });
  // set grid size and import scenario by calling window functions where possible
  await page.evaluate((sc)=>{
    // apply rows/cols
    if(sc.rows) document.getElementById('rows').value = sc.rows;
    if(sc.cols) document.getElementById('cols').value = sc.cols;
    document.getElementById('createGrid').click();
    // set seed and simulation params
    if(typeof sc.seed !== 'undefined') document.getElementById('simSeed').value = String(sc.seed);
    if(typeof sc.n !== 'undefined') document.getElementById('simN').value = String(sc.n);
    if(typeof sc.z !== 'undefined') document.getElementById('simZ').value = String(sc.z);
    if(sc.useDepot) document.getElementById('simUseDepot').checked = true;
    // clear obstacles then set from sc.obstacles
    // sc.obstacles expected as array or object
    window.__applyObstacles = function(ob){ try{ window.obstacles = new Set(); if(Array.isArray(ob)){ for(const o of ob) window.obstacles.add(o.r+','+o.c); } else if(typeof ob === 'object'){ for(const k of Object.keys(ob)) window.obstacles.add(k); } }catch(e){} }
  }, scenario);
  // apply obstacles via exposed helper
  if(scenario.obstacles){ await page.evaluate((obs)=>{ if(window.__applyObstacles) window.__applyObstacles(obs); }, scenario.obstacles); }
  // set depot if present
  if(scenario.depot){ await page.evaluate((d)=>{ window.depot = {r:d.r,c:d.c}; }, scenario.depot); }
  // click simulate
  await page.click('#simulate');
  // wait until simulation finishes by polling window.__getLastSimResults
  const timeout = 120000; const start = Date.now(); let results = null;
  while(Date.now() - start < timeout){ results = await page.evaluate(()=>{ try{ return window.__getLastSimResults ? window.__getLastSimResults() : null }catch(e){ return null } }); if(results) break; await new Promise(r=>setTimeout(r,500)); }
  if(!results){ console.error('Simulation did not finish within timeout'); await browser.close(); process.exit(2); }
  // get CSV and depot CSV if present
  const csv = await page.evaluate(()=> window.__exportSimCsv ? window.__exportSimCsv() : null);
  if(csv) fs.writeFileSync(path.join(outDir,'sim_results.csv'), csv);
  const depCsv = await page.evaluate(()=> window.__exportLastDepotCsv ? window.__exportLastDepotCsv() : null);
  if(depCsv) fs.writeFileSync(path.join(outDir,'depot_scores.csv'), depCsv);
  console.log('Wrote outputs to', outDir);
  await browser.close();
})();
