// Enhanced VRP/TSP demo with grid modes, obstacles, Dijkstra, profiling and Chart.js plotting.
(function(){
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const chartTimeEl = document.getElementById('chartTime');
  const chartLenEl = document.getElementById('chartLen');
  const exportCsvBtn = document.getElementById('exportCsv');
  const exportScenarioBtn = document.getElementById('exportScenario');
  const simUseDepotCheckbox = document.getElementById('simUseDepot');
  const simDetailsEl = document.getElementById('simDetails');
  const rowsInput = document.getElementById('rows');
  const colsInput = document.getElementById('cols');
  const createGridBtn = document.getElementById('createGrid');
  const clearPointsBtn = document.getElementById('clearPoints');
  const randomPointsBtn = document.getElementById('randomPoints');
  const randomJInput = document.getElementById('randomJ');
  const runBtn = document.getElementById('run');
  const dijkstraRunBtn = document.getElementById('dijkstraRun');
  const profileBtn = document.getElementById('profile');
  const simulateBtn = document.getElementById('simulate');
  const simNInput = document.getElementById('simN');
  const simZInput = document.getElementById('simZ');
  const simUseSeedCheckbox = document.getElementById('simUseSeed');
  const simSeedInput = document.getElementById('simSeed');
  const modal = document.getElementById('chartModal');
  const modalClose = document.getElementById('modalClose');
  const modalChartEl = document.getElementById('modalChart');
  const algoSelect = document.getElementById('algorithm');
  const placeTypeSelect = document.getElementById('placeType');
  const recommendDepotBtn = document.getElementById('recommendDepot');
  const depotMetricSelect = document.getElementById('depotMetric');
  const depotTopKInput = document.getElementById('depotTopK');
  const normalizeDepotEl = document.getElementById('normalizeDepot');
  const modeSelect = document.getElementById('mode');
  const closedCheckbox = document.getElementById('closedRoute');
  const statusEl = document.getElementById('status');
  const lengthEl = document.getElementById('length');

  let rows = parseInt(rowsInput.value,10) || 6;
  let cols = parseInt(colsInput.value,10) || 6;
  let cellW = canvas.width/cols, cellH = canvas.height/rows;

  // state
  let points = []; // ordered list of placed points {r,c}
  let houses = []; // houses for transportation problems
  let obstacles = new Set(); // keys 'r,c'
  let depot = null; // {r,c}
  let dstart = null, dend = null; // for Dijkstra
  let bestPath = null; // sequence of point indices
  let lastDijkstraPath = null; // list of grid cells for Dijkstra

  // Charts
  let chartTime = null;
  let chartLen = null;
  let chartDepot = null;
  let lastDepotChartSnapshot = null;
  let lastDepotScores = null; // store latest scores+contributions
  let lastSimResults = null; // store detailed per-run arrays for export
  let simWorker = null;
  const consoleLogEl = document.getElementById('consoleLog');

  const clearLogBtn = document.getElementById('clearLogBtn');
  const downloadLogBtn = document.getElementById('downloadLogBtn');
  const filterInfoEl = document.getElementById('filterInfo');
  const filterWarnEl = document.getElementById('filterWarn');
  const filterErrorEl = document.getElementById('filterError');

  // in-memory log buffer so we can download and filter
  const logBuffer = [];

  // simple UI logger: timestamped entries go into #consoleLog and also to browser console
  function log(level, msg){
    try{
      const ts = (new Date()).toISOString();
      const line = `[${ts}] ${level.toUpperCase()}: ${msg}`;
      logBuffer.push({ts, level, msg, line});
      // keep buffer reasonable
      if(logBuffer.length > 20000) logBuffer.shift();
      // render if passes filter
  const passes = (level==='info' && filterInfoEl?.checked !== false) || (level==='warn' && filterWarnEl?.checked !== false) || (level==='error' && filterErrorEl?.checked !== false);
  if(passes && consoleLogEl){ const d = document.createElement('div'); d.textContent = line; d.style.whiteSpace = 'pre-wrap'; d.className = level==='info' ? 'log-info' : (level==='warn' ? 'log-warn' : 'log-error'); consoleLogEl.appendChild(d); if(consoleLogEl.children.length > 1000) consoleLogEl.removeChild(consoleLogEl.children[0]); consoleLogEl.scrollTop = consoleLogEl.scrollHeight; }
      if(level === 'error') console.error(line); else if(level === 'warn') console.warn(line); else console.log(line);
    }catch(e){ console.log('log failed', e); }
  }

  // Clear and download handlers
  if(clearLogBtn) clearLogBtn.addEventListener('click', ()=>{ logBuffer.length = 0; if(consoleLogEl) consoleLogEl.innerHTML=''; });
  if(downloadLogBtn) downloadLogBtn.addEventListener('click', ()=>{
    const txt = logBuffer.map(x=>x.line).join('\n'); const blob = new Blob([txt], {type:'text/plain'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `vrp_log_${(new Date()).toISOString().replace(/[:.]/g,'-')}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });
  const autoDownloadEl = document.getElementById('autoDownloadLogs');
  // filtering toggles re-render visible lines
  function rerenderLog(){ if(!consoleLogEl) return; consoleLogEl.innerHTML = ''; for(const e of logBuffer){ const passes = (e.level==='info' && filterInfoEl?.checked) || (e.level==='warn' && filterWarnEl?.checked) || (e.level==='error' && filterErrorEl?.checked); if(passes){ const d=document.createElement('div'); d.textContent = e.line; d.style.whiteSpace='pre-wrap'; consoleLogEl.appendChild(d); } } consoleLogEl.scrollTop = consoleLogEl.scrollHeight; }
  if(filterInfoEl) filterInfoEl.addEventListener('change', rerenderLog);
  if(filterWarnEl) filterWarnEl.addEventListener('change', rerenderLog);
  if(filterErrorEl) filterErrorEl.addEventListener('change', rerenderLog);

  function keyOf(r,c){return `${r},${c}`}

  function createGrid(){
    rows = Math.max(1,parseInt(rowsInput.value,10)||6);
    cols = Math.max(1,parseInt(colsInput.value,10)||6);
  cellW = canvas.width/cols; cellH = canvas.height/rows;
  points = []; houses = []; obstacles = new Set(); depot = null; dstart=null; dend=null; bestPath=null; lastDijkstraPath=null; updateStatus(); drawGrid();
  }

  // Seeded PRNG (xorshift32) for reproducible experiments
  function xorshift32(seed){
    let x = seed>>>0; if(x===0) x=2463534242; return function(){ x ^= x<<13; x >>>= 0; x ^= x>>>17; x ^= x<<5; x >>>= 0; return (x>>>0)/4294967296; }
  }

  function drawGrid(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // cells
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x = c*cellW, y = r*cellH;
        ctx.fillStyle = obstacles.has(keyOf(r,c)) ? '#94a3b8' : '#fff';
        ctx.fillRect(x,y,cellW,cellH);
        ctx.strokeStyle = '#e2e8f0'; ctx.strokeRect(x,y,cellW,cellH);
      }
    }
    // Dijkstra path overlay on grid cells
    if(lastDijkstraPath && lastDijkstraPath.length){
      ctx.fillStyle='rgba(34,197,94,0.18)';
      for(const cell of lastDijkstraPath){ctx.fillRect(cell.c*cellW, cell.r*cellH, cellW, cellH)}
    }
    // draw edges between points for bestPath
    if(bestPath && bestPath.length>1){
      ctx.strokeStyle='#ef4444'; ctx.lineWidth = 2; ctx.beginPath();
      const a = points[bestPath[0]]; ctx.moveTo((a.c+0.5)*cellW,(a.r+0.5)*cellH);
      for(let i=1;i<bestPath.length;i++){const p = points[bestPath[i]]; ctx.lineTo((p.c+0.5)*cellW,(p.r+0.5)*cellH)}
      if(closedCheckbox.checked){const z = points[bestPath[0]]; ctx.lineTo((z.c+0.5)*cellW,(z.r+0.5)*cellH)}
      ctx.stroke(); ctx.lineWidth=1;
    }
    // draw depot first (highlight cell) so overlapping points can be shown separately
    if(depot){
      ctx.fillStyle='#1e3a8a'; ctx.fillRect(depot.c*cellW, depot.r*cellH, cellW, cellH);
      ctx.strokeStyle='#93c5fd'; ctx.lineWidth=2; ctx.strokeRect(depot.c*cellW+1, depot.r*cellH+1, cellW-2, cellH-2); ctx.lineWidth=1;
      ctx.fillStyle='#fff'; ctx.font='14px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('D', (depot.c+0.5)*cellW, (depot.r+0.5)*cellH);
    }

    // draw points (if a point is on the depot cell, render as slightly offset with a badge)
    for(let i=0;i<points.length;i++){
      const p = points[i]; const baseCx=(p.c+0.5)*cellW, baseCy=(p.r+0.5)*cellH;
      const onDepot = depot && p.r===depot.r && p.c===depot.c;
      const radius = Math.min(cellW,cellH)*0.15;
      const offset = onDepot ? Math.min(cellW,cellH)*0.18 : 0;
      const cx = baseCx + offset, cy = baseCy + offset;
      ctx.fillStyle = '#0ea5a4'; ctx.beginPath(); ctx.arc(cx,cy,radius,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
      ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i), cx, cy);
      if(onDepot){ ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(baseCx - Math.min(cellW,cellH)*0.22, baseCy - Math.min(cellW,cellH)*0.22, Math.min(cellW,cellH)*0.12, 0, Math.PI*2); ctx.fill(); ctx.fillStyle='#fff'; ctx.font='10px sans-serif'; ctx.fillText('on D', baseCx - Math.min(cellW,cellH)*0.22, baseCy - Math.min(cellW,cellH)*0.22); }
    }
    // draw houses (transport endpoints)
    for(let i=0;i<houses.length;i++){
      const p = houses[i]; const cx=(p.c+0.5)*cellW, cy=(p.r+0.5)*cellH;
      ctx.fillStyle='#f59e0b'; ctx.fillRect(cx-6, cy-6, 12, 12);
      ctx.fillStyle='#000'; ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('H', cx, cy);
    }
  // draw dstart/dend markers (start/end for Dijkstra)
    // highlight recommended depot candidates if present
    if(typeof depotCandidates !== 'undefined' && depotCandidates && depotCandidates.length){
      ctx.fillStyle='rgba(37,99,235,0.22)';
      for(const c of depotCandidates){ ctx.fillRect(c.c*cellW, c.r*cellH, cellW, cellH); }
    }
    if(dstart){ctx.fillStyle='#0f172a'; fillSquare(dstart.r,dstart.c); ctx.fillStyle='#fff'; ctx.fillText('S', (dstart.c+0.5)*cellW, (dstart.r+0.5)*cellH)}
    if(dend){ctx.fillStyle='#0f172a'; fillSquare(dend.r,dend.c); ctx.fillStyle='#fff'; ctx.fillText('E', (dend.c+0.5)*cellW, (dend.r+0.5)*cellH)}
  }

  function fillSquare(r,c){ctx.fillRect(c*cellW, r*cellH, cellW, cellH)}

  function toggleAt(x,y){
    const c = Math.floor(x/cellW), r = Math.floor(y/cellH);
    if(r<0||r>=rows||c<0||c>=cols) return;
    const mode = modeSelect.value;
    const placeType = placeTypeSelect?.value || 'point';
    // Prevent placing on obstacle cells
    if(obstacles.has(keyOf(r,c))){ statusEl.textContent = 'Cannot place on obstacle cell.'; return }
    if(mode==='point'){
      if(placeType === 'point'){
        const idx = points.findIndex(p=>p.r===r&&p.c===c);
        if(idx>=0) points.splice(idx,1); else points.push({r,c});
      }else{
        const idx = houses.findIndex(p=>p.r===r&&p.c===c);
        if(idx>=0) houses.splice(idx,1); else houses.push({r,c,demand: parseInt(document.getElementById('houseDemand')?.value,10) || 1});
      }
      bestPath=null; lastDijkstraPath=null; updateStatus(); drawGrid();
    }else if(mode==='obstacle'){
      const k=keyOf(r,c); if(obstacles.has(k)) obstacles.delete(k); else obstacles.add(k); bestPath=null; lastDijkstraPath=null; drawGrid();
    }else if(mode==='depot'){
      depot = {r,c}; drawGrid();
    }else if(mode==='dstart'){
      dstart={r,c}; lastDijkstraPath=null; drawGrid();
    }else if(mode==='dend'){
      dend={r,c}; lastDijkstraPath=null; drawGrid();
    }
  }

  // Map pointer/click coordinates into canvas pixel coordinates taking into account
  // CSS scaling (rect.width/height) so cell selection is accurate.
  canvas.addEventListener('click', e=>{
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    toggleAt(x, y);
  });

  createGridBtn.addEventListener('click', createGrid);
  clearPointsBtn.addEventListener('click', ()=>{points=[]; houses=[]; depot=null; dstart=null; dend=null; bestPath=null; lastDijkstraPath=null; updateStatus(); drawGrid();});
  randomPointsBtn.addEventListener('click', ()=>{ const J = Math.max(1, parseInt(randomJInput.value,10) || 5); points=randomPoints(J); bestPath=null; updateStatus(); drawGrid();});

  function randomPoints(n){
    const set = [];
    // Fully random across the grid: pick random free cells until we have n unique points
    const triesLimit = Math.max(1000, n * 50);
    let tries = 0;
    while(set.length < n && tries < triesLimit){ tries++; const r = Math.floor(Math.random()*rows); const c = Math.floor(Math.random()*cols); if(obstacles.has(keyOf(r,c))) continue; if(!set.some(p=>p.r===r&&p.c===c)) set.push({r,c}); }
    // if we failed to fill due to too many obstacles, fill deterministically from available cells
    if(set.length < n){ const avail = []; for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) if(!obstacles.has(keyOf(r,c))) avail.push({r,c}); // shuffle avail
      for(let i=avail.length-1;i>0 && set.length<n;i--){ const j=Math.floor(Math.random()*(i+1)); [avail[i],avail[j]]=[avail[j],avail[i]] }
      for(let i=0;i<avail.length && set.length<n;i++) set.push(avail[i]); }
    return set;
  }

  function updateStatus(){statusEl.textContent = `${points.length} point(s) placed.`; lengthEl.textContent='';}

  function coords(){return points.map(p=>[p.c+0.5,p.r+0.5]);}
  function dist(a,b){const dx=a[0]-b[0], dy=a[1]-b[1]; return Math.hypot(dx,dy)}

  // NN / 2-opt / Held-Karp
  function nearestNeighbor(pts){ if(pts.length===0) return []; const n=pts.length; const visited=new Array(n).fill(false); const path=[0]; visited[0]=true; for(let k=1;k<n;k++){ let last=path[path.length-1]; let best=-1,bestd=Infinity; for(let i=0;i<n;i++) if(!visited[i]){ const d=dist(pts[last],pts[i]); if(d<bestd){bestd=d; best=i}} path.push(best); visited[best]=true } return path }
  function pathLength(path,pts){ let L=0; for(let i=1;i<path.length;i++) L+=dist(pts[path[i-1]],pts[path[i]]); if(closedCheckbox.checked && path.length>1) L += dist(pts[path[path.length-1]], pts[path[0]]); return L }
  function twoOpt(path,pts){ let improved=true; const n=path.length; while(improved){ improved=false; for(let i=1;i<n-1;i++) for(let k=i+1;k<n;k++){ const newPath = path.slice(0,i).concat(path.slice(i,k+1).reverse(), path.slice(k+1)); if(pathLength(newPath,pts)+1e-9 < pathLength(path,pts)){ path=newPath; improved=true } } } return path }

  function heldKarp(pts){ const n=pts.length; if(n===0) return []; if(n===1) return [0]; const D = Array.from({length:n},()=>Array(n).fill(0)); for(let i=0;i<n;i++) for(let j=0;j<n;j++) D[i][j]=dist(pts[i],pts[j]); const N = 1<<(n-1); const dp = new Map(); for(let i=1;i<n;i++){ const key = (1<<(i-1))<<5 | i; dp.set(key, D[0][i]); } for(let s=1;s<N;s++){ for(let last=1;last<n;last++){ if(!(s & (1<<(last-1)))) continue; const key = (s<<5)|last; if(!dp.has(key)){ let best=Infinity; const sprev = s & ~(1<<(last-1)); if(sprev===0) continue; for(let prev=1;prev<n;prev++){ if(!(sprev & (1<<(prev-1)))) continue; const prevKey = (sprev<<5)|prev; const val = dp.get(prevKey); if(val + D[prev][last] < best) best = val + D[prev][last]; } if(best<Infinity) dp.set(key,best); } } } let best=Infinity; let lastBest=1; const full = N-1; for(let last=1;last<n;last++){ const key=(full<<5)|last; const val = dp.get(key); if(val + D[last][0] < best){ best = val + D[last][0]; lastBest = last } } const path=[0]; let curS = full; let curLast = lastBest; const rev=[]; while(curS){ rev.push(curLast); let found=-1; const key=(curS<<5)|curLast; const curVal = dp.get(key); const sprev = curS & ~(1<<(curLast-1)); if(sprev===0){ found=0 } else { for(let prev=1;prev<n;prev++){ if(!(sprev & (1<<(prev-1)))) continue; const prevKey = (sprev<<5)|prev; const v=dp.get(prevKey); if(v + D[prev][curLast] === curVal){ found=prev; break } } } if(found<=0){ curS=0; break } curLast = found; curS = curS & ~(1<<(rev[rev.length-1]-1)); } rev.reverse(); for(const r of rev) if(r!==0) path.push(r); return path }

  runBtn.addEventListener('click', ()=>{
    const pts = coords(); if(pts.length<2){ alert('Place at least 2 points'); return }
    const alg = algoSelect.value; let path;
    if(alg==='nearest'){ path = nearestNeighbor(pts) }
    else if(alg==='2opt'){ path = nearestNeighbor(pts); path = twoOpt(path,pts) }
    else if(alg==='greedy'){ path = greedyInsertion(pts) }
    else if(alg==='rr2opt'){ path = rrTwoOpt(pts, 8) }
    else { if(pts.length>16){ if(!confirm('Held-Karp is exponential. Continue?')) return } path = heldKarp(pts) }
    bestPath = path; drawGrid(); lengthEl.textContent = `Path length: ${pathLength(path,pts).toFixed(3)}`;
  });

  // Greedy insertion heuristic for TSP (start at 0)
  function greedyInsertion(pts){ const n=pts.length; if(n===0) return []; let tour=[0,1]; for(let k=2;k<n;k++){ let bestIdx=1; let bestInc=Infinity; for(let i=1;i<tour.length;i++){ const a=tour[i-1], b=tour[i]; const inc = dist(pts[a],pts[k]) + dist(pts[k],pts[b]) - dist(pts[a],pts[b]); if(inc<bestInc){ bestInc=inc; bestIdx=i } } tour.splice(bestIdx,0,k); } return tour }

  // Random-Restart 2-opt: run NN+2opt multiple times with random starts and keep best
  function rrTwoOpt(pts, restarts=8){ const n=pts.length; if(n<=1) return [0]; let best=null, bestL=Infinity; for(let r=0;r<restarts;r++){ let order = [...Array(n).keys()].sort(()=>Math.random()-0.5); order[0]=0; let o2 = twoOpt(order, pts); let L=pathLength(o2,pts); if(L<bestL){ bestL=L; best=o2 } } return best }

  // Dijkstra on grid (4-neighbor), avoiding obstacles
  function neighbors(r,c){ const out = []; const deltas=[[1,0],[-1,0],[0,1],[0,-1]]; for(const d of deltas){ const nr=r+d[0], nc=c+d[1]; if(nr>=0&&nr<rows&&nc>=0&&nc<cols && !obstacles.has(keyOf(nr,nc))) out.push([nr,nc]) } return out }

  function dijkstraGrid(start,end){
    if(!start || !end) return null;
    const startKey = keyOf(start.r,start.c), endKey = keyOf(end.r,end.c);
    const distMap = new Map(); const prev = new Map();
    const pq = new MinHeap();
    distMap.set(startKey,0); pq.push({k:startKey,r:start.r,c:start.c,d:0});
    while(pq.size()){ const node = pq.pop(); const k = node.k; if(node.d !== distMap.get(k)) continue; if(k===endKey) break; const [r,c] = k.split(',').map(Number);
      for(const nb of neighbors(r,c)){ const nk = keyOf(nb[0],nb[1]); const nd = node.d + 1; if(!distMap.has(nk) || nd < distMap.get(nk)){ distMap.set(nk,nd); prev.set(nk,k); pq.push({k:nk,r:nb[0],c:nb[1],d:nd}) } }
    }
    if(!prev.has(endKey) && startKey!==endKey) return null; const path = []; let cur = endKey; path.push({r: Number(cur.split(',')[0]), c: Number(cur.split(',')[1])}); while(cur !== startKey){ cur = prev.get(cur); if(!cur){ break } path.push({r:Number(cur.split(',')[0]), c:Number(cur.split(',')[1])}) } path.reverse(); return path }

  dijkstraRunBtn.addEventListener('click', ()=>{ if(!dstart||!dend){ alert('Set Dijkstra start and end (select mode Dijkstra: Start/End and click cells)'); return } const p = dijkstraGrid(dstart,dend); if(!p){ alert('No path found (blocked?)'); lastDijkstraPath=null; drawGrid(); return } lastDijkstraPath = p; drawGrid(); lengthEl.textContent = `Dijkstra steps: ${p.length-1}` });

  // Min-heap for Dijkstra
  class MinHeap{ constructor(){ this.arr=[] } size(){ return this.arr.length } push(x){ this.arr.push(x); this._siftUp(this.arr.length-1) } pop(){ if(this.arr.length===0) return null; const top = this.arr[0]; const last = this.arr.pop(); if(this.arr.length>0){ this.arr[0]=last; this._siftDown(0) } return top } _siftUp(i){ while(i>0){ const p = Math.floor((i-1)/2); if(this.arr[p].d <= this.arr[i].d) break; [this.arr[p], this.arr[i]] = [this.arr[i], this.arr[p]]; i = p } } _siftDown(i){ const n=this.arr.length; while(true){ let l = 2*i+1; let r = 2*i+2; let smallest = i; if(l<n && this.arr[l].d < this.arr[smallest].d) smallest = l; if(r<n && this.arr[r].d < this.arr[smallest].d) smallest = r; if(smallest===i) break; [this.arr[i], this.arr[smallest]] = [this.arr[smallest], this.arr[i]]; i = smallest } }
  }

  // Profiling: run algorithms on random point sets of increasing size and plot length/time
  async function profileAndPlot(){
    const currentPts = points.slice();
    if(currentPts && currentPts.length >= 2){
      // Use the user's current point set for a direct algorithm comparison
      const eu = currentPts.map(p=>[p.c+0.5,p.r+0.5]);
      const labels = [];
      const timeData = [];
      const lenData = [];

      // Nearest
      labels.push('Nearest'); let t0 = performance.now(); const nn = nearestNeighbor(eu); let t1 = performance.now(); timeData.push(t1-t0); lenData.push(pathLength(nn,eu));

      // NN + 2-Opt
      labels.push('2Opt'); t0 = performance.now(); let two = nearestNeighbor(eu); two = twoOpt(two,eu); t1 = performance.now(); timeData.push(t1-t0); lenData.push(pathLength(two,eu));

      // Greedy Insertion
      labels.push('Greedy'); t0 = performance.now(); const gr = greedyInsertion(eu); t1 = performance.now(); timeData.push(t1-t0); lenData.push(pathLength(gr,eu));

      // Random-restart 2-Opt (small number of restarts)
      labels.push('RR-2Opt'); t0 = performance.now(); const rr = rrTwoOpt(eu, 6); t1 = performance.now(); timeData.push(t1-t0); lenData.push(pathLength(rr,eu));

      // Held-Karp only if small
      if(eu.length <= 12){ labels.push('Held-Karp'); t0 = performance.now(); const hk = heldKarp(eu); t1 = performance.now(); timeData.push(t1-t0); lenData.push(pathLength(hk,eu)); }

      // render charts: times and lengths (bar charts)
      if(chartTime) chartTime.destroy();
      chartTime = new Chart(chartTimeEl.getContext('2d'), { type:'bar', data:{ labels, datasets:[{ label:'Time (ms)', data: timeData, backgroundColor:'#2563eb' }] }, options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } } });
      if(chartLen) chartLen.destroy();
      chartLen = new Chart(chartLenEl.getContext('2d'), { type:'bar', data:{ labels, datasets:[{ label:'Length', data: lenData, backgroundColor:'#0ea5a4' }] }, options:{ responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true } } } });
      return;
    }

    // Fallback: sweep sizes when no user points placed
    const sizes = [4,6,8,10,12];
    const results = {nearest:[], twoopt:[], held:[]};
    for(const n of sizes){
      // build random points avoiding obstacles
      const pts = [];
      while(pts.length<n){ const r=Math.floor(Math.random()*rows); const c=Math.floor(Math.random()*cols); if(obstacles.has(keyOf(r,c))) continue; if(!pts.some(p=>p.r===r&&p.c===c)) pts.push({r,c}) }
      const eu = pts.map(p=>[p.c+0.5,p.r+0.5]);
      // nearest
      const t0 = performance.now(); const nn = nearestNeighbor(eu); const t1 = performance.now(); const ln = pathLength(nn,eu); results.nearest.push({n, time: t1-t0, len: ln});
      // twoopt
      const t2 = performance.now(); let two = nearestNeighbor(eu); two = twoOpt(two,eu); const t3 = performance.now(); results.twoopt.push({n, time: t3-t2, len: pathLength(two,eu)});
      // held (only if small)
      if(n<=12){ const t4 = performance.now(); const hk = heldKarp(eu); const t5 = performance.now(); results.held.push({n, time: t5-t4, len: pathLength(hk,eu)}); }
      await new Promise(r=>setTimeout(r,50)); // allow UI breathing
    }
    plotResults(results);
  }

  function plotResults(results){
    const labels = results.nearest.map(x=>String(x.n));
    const datasets = [
      {label:'NN time (ms)', data: results.nearest.map(x=>x.time), borderColor:'#ef4444', fill:false},
      {label:'2Opt time (ms)', data: results.twoopt.map(x=>x.time), borderColor:'#0ea5a4', fill:false},
      {label:'Held time (ms)', data: results.held.map(x=>x.time), borderColor:'#2563eb', fill:false}
    ];
    if(chartTime) chartTime.destroy();
    chartTime = new Chart(chartTimeEl.getContext('2d'), { type:'line', data:{ labels, datasets }, options:{ responsive:true } });
    const lenDatasets = [
      {label:'NN length', data: results.nearest.map(x=>x.len), backgroundColor:'#ef4444'},
      {label:'2Opt length', data: results.twoopt.map(x=>x.len), backgroundColor:'#0ea5a4'},
      {label:'Held length', data: results.held.map(x=>x.len), backgroundColor:'#2563eb'}
    ];
    if(chartLen) chartLen.destroy();
    chartLen = new Chart(chartLenEl.getContext('2d'), { type:'bar', data:{ labels, datasets: lenDatasets }, options:{ responsive:true } });
  }

  profileBtn.addEventListener('click', ()=>{ profileAndPlot().catch(e=>{ console.error(e); alert('Profile failed: '+e.message) }) });
  simulateBtn.addEventListener('click', ()=>{ const n = Math.max(2, parseInt(simNInput.value,10)||8); const z = Math.max(1, parseInt(simZInput.value,10)||50); const useDepot = !!simUseDepotCheckbox.checked; simulateTrials(n,z,useDepot).catch(e=>{ console.error(e); alert('Simulation failed: '+e.message) }) });
  exportCsvBtn.addEventListener('click', ()=>{ if(!lastSimResults){ alert('No simulation results to export'); return } exportSimCsv(lastSimResults) });

  // recommended depot candidates (highlighted on grid)
  let depotCandidates = null;

  recommendDepotBtn?.addEventListener('click', ()=>{
    const metric = depotMetricSelect?.value || 'grid';
    const K = Math.max(1, parseInt(depotTopKInput?.value,10)||1);
    const candidates = [];
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ const k = keyOf(r,c); if(obstacles.has(k)) continue; candidates.push({r,c}); }
    // build targets with demand (fallback to points with demand 1)
    const targets = houses.length ? houses : points.map(p=>({r:p.r,c:p.c,demand:1}));
    if(targets.length===0){ alert('Place houses or points first'); return }
    const scores = [];
    if(metric==='euclid'){
      // demand-weighted euclidean distance sums
      for(const cand of candidates){ let s=0; for(const t of targets){ s += (t.demand||1) * Math.hypot(cand.c - t.c, cand.r - t.r); } scores.push({cand,score:s}); }
      scores.sort((a,b)=>a.score-b.score);
    }else{
      // grid metric: exact demand-weighted sums computed by running BFS from each target but stopping
      // early once all candidate cells have been reached. This is exact and often much faster because
      // we need distances only for candidate cells, not every grid cell.
      // Try single-pass multi-source Dijkstra to compute exact demand-weighted sums for all candidates.
      // For moderate sizes this is much faster than running a BFS from every target.
      function multiSourceDemandWeightedGridDistances(targets, candidates){
        const T = targets.length;
        const cells = rows * cols;
        const bsWords = Math.ceil(T/32);
        // safety: avoid excessive memory for huge grids or many targets
        const approxBytes = cells * bsWords * 4;
        if(approxBytes > 2_000_000){ // ~2MB threshold
          return null; // signal fallback
        }
        // flat arrays
        const sums = new Float64Array(cells); // accumulator of demand*distance per cell
        const remaining = new Int16Array(cells); // how many sources still needed for candidate cells (0 otherwise)
        const isCandidate = new Uint8Array(cells);
        const candIndex = new Map();
        candidates.forEach((c,idx)=>{ const id = c.r*cols + c.c; isCandidate[id]=1; remaining[id]=T; candIndex.set(id, idx); });
        // bitsets per cell to track which targets have already reached it
        const seen = new Uint32Array(cells * bsWords);
        // min-heap PQ (simple binary heap) of nodes {r,c,d,src}
        class Q{ constructor(){ this.arr=[] } push(x){ this.arr.push(x); let i=this.arr.length-1; while(i>0){ const p=Math.floor((i-1)/2); if(this.arr[p].d <= this.arr[i].d) break; [this.arr[p], this.arr[i]]=[this.arr[i], this.arr[p]]; i=p } } pop(){ if(this.arr.length===0) return null; const top=this.arr[0]; const last=this.arr.pop(); if(this.arr.length>0){ this.arr[0]=last; let i=0; while(true){ let l=2*i+1, r=2*i+2, smallest=i; if(l<this.arr.length && this.arr[l].d < this.arr[smallest].d) smallest=l; if(r<this.arr.length && this.arr[r].d < this.arr[smallest].d) smallest=r; if(smallest===i) break; [this.arr[i], this.arr[smallest]]=[this.arr[smallest], this.arr[i]]; i=smallest } } return top } size(){ return this.arr.length }}
        const pq = new Q();
        // initialize with all targets
        for(let ti=0; ti<T; ti++){ const t = targets[ti]; const id = t.r*cols + t.c; const word = Math.floor(ti/32), bit = 1 << (ti%32); const off = id*bsWords + word; if((seen[off] & bit) === 0){ seen[off] |= bit; // mark
            // contribute zero distance at target cell
            sums[id] += 0 * (t.demand||1);
            if(isCandidate[id]){ remaining[id]--; }
            pq.push({r:t.r,c:t.c,d:0,src:ti}); }
        }
        // quick termination if all candidate cells already satisfied (e.g., targets cover them)
        let candidatesLeft = 0; for(let i=0;i<cells;i++) if(isCandidate[i] && remaining[i]>0) candidatesLeft++; if(candidatesLeft===0){ return sums }
        while(pq.size()){
          const node = pq.pop(); const nd = node.d; const sidx = node.src;
          for(const nb of neighbors(node.r,node.c)){
            const nid = nb[0]*cols + nb[1]; const offBase = nid*bsWords; const word = Math.floor(sidx/32), bit = 1 << (sidx%32); const off = offBase + word;
            if((seen[off] & bit) !== 0) continue; // this source already reached this cell
            seen[off] |= bit;
            const t = targets[sidx]; const demand = t.demand || 1; sums[nid] += (nd+1) * demand;
            if(isCandidate[nid]){ remaining[nid]--; if(remaining[nid]===0){ candidatesLeft--; if(candidatesLeft===0) return sums; } }
            pq.push({r: nb[0], c: nb[1], d: nd+1, src: sidx});
          }
        }
        return sums;
      }

      const sums = multiSourceDemandWeightedGridDistances(targets, candidates);
      if(sums === null){
        // fallback to per-target BFS (existing code) when too large
        const distSums = Array.from({length:rows},()=>Array(cols).fill(0));
        // prepare candidate lookup
        const candKeys = new Set(candidates.map(c=>keyOf(c.r,c.c)));
        // reusable seen buffer using epoch technique to avoid repeated allocations
        const seen = Array.from({length:rows},()=>Array(cols).fill(0)); let epoch = 1;
        for(const t of targets){
          let remaining = new Set(candKeys);
          // quick check: if target cell is a candidate, contribute zero distance
          const tk = keyOf(t.r,t.c);
          if(remaining.has(tk)){ distSums[t.r][t.c] += 0 * (t.demand||1); remaining.delete(tk); if(remaining.size===0) continue; }
          const q = [{r:t.r,c:t.c,d:0}]; seen[t.r][t.c] = epoch; let qi = 0;
          while(qi < q.length && remaining.size>0){ const node = q[qi++]; const nd = node.d;
            for(const nb of neighbors(node.r,node.c)){
              if(seen[nb[0]][nb[1]] === epoch) continue;
              seen[nb[0]][nb[1]] = epoch;
              const nk = keyOf(nb[0], nb[1]);
              if(remaining.has(nk)){
                distSums[nb[0]][nb[1]] += (nd+1) * (t.demand||1);
                remaining.delete(nk);
                if(remaining.size===0) break;
              }
              q.push({r: nb[0], c: nb[1], d: nd+1});
            }
          }
          epoch++;
        }
        for(const cand of candidates){ scores.push({cand, score: distSums[cand.r][cand.c]}); }
      }else{
        // sums is a Float64Array over flat cells
        for(const cand of candidates){ const id = cand.r*cols + cand.c; scores.push({cand, score: sums[id]}); }
      }
      scores.sort((a,b)=>a.score-b.score);
    }
    if(scores.length===0){ alert('No reachable candidate found'); return }
    // store full scores for plotting/explanation
    lastDepotScores = scores.map(s=>({ r: s.cand.r, c: s.cand.c, score: s.score }));
    // compute per-target contributions for top-K (for stacked bar visualization)
    const top = scores.slice(0,K);
    const contributions = [];
    // targets array defined earlier
    for(const t of targets) if(typeof t.demand === 'undefined') t.demand = 1;
    for(const item of top){ const cand = item.cand; const contrib = []; if(metric==='euclid'){
        for(const t of targets){ contrib.push((t.demand||1) * Math.hypot(cand.c - t.c, cand.r - t.r)); }
      }else{
        // grid metric: run BFS from candidate to get distances to targets
        const distMap = Array.from({length:rows},()=>Array(cols).fill(-1));
        const q = [{r:cand.r,c:cand.c,d:0}]; distMap[cand.r][cand.c]=0; let qi=0;
        while(qi<q.length){ const node=q[qi++]; for(const nb of neighbors(node.r,node.c)){ if(distMap[nb[0]][nb[1]]===-1){ distMap[nb[0]][nb[1]] = node.d+1; q.push({r:nb[0], c:nb[1], d: node.d+1}); } } }
        for(const t of targets){ const d = distMap[t.r] && distMap[t.r][t.c] >= 0 ? distMap[t.r][t.c] : 1e9; contrib.push((t.demand||1)*d); }
      }
      contributions.push({cand:{r:cand.r,c:cand.c}, contrib});
    }
    // attach contributions to lastDepotScores
    for(let i=0;i<lastDepotScores.length;i++){
      const mi = top.findIndex(x=>x.cand.r===lastDepotScores[i].r && x.cand.c===lastDepotScores[i].c);
      lastDepotScores[i].contrib = mi>=0 ? contributions[mi].contrib : null;
    }
    depotCandidates = scores.slice(0,K).map(s=>s.cand);
    depot = depotCandidates[0]; updateStatus(); drawGrid(); statusEl.textContent = `Recommended top ${K} locations, best set as depot.`;
    // plot top-K candidate contributions
    // plot asynchronously and capture errors
  plotDepotScores(top, targets).catch(e=>{ log('warn', 'Failed plotting depot scores: '+(e && e.message)); console.warn('Failed plotting depot scores', e); });
  });

    // export depot measured timings (CSV)
    const exportDepotCsvBtn = document.getElementById('exportDepotCsv');
    exportDepotCsvBtn?.addEventListener('click', ()=>{
      // lastDepotScores holds scores and contributions; but measured times were produced by plotDepotScores into chart datasets
      if(!lastDepotScores){ alert('No depot scores available'); return }
      // try to read measured times from chartDepot datasets (if present)
      let times = null;
      try{ if(chartDepot){ const ds = chartDepot.data.datasets; const mt = ds.find(d=>d.label==='Measured time (ms)'); if(mt) times = mt.data; } }catch(e){}
      const rowsOut = [['r','c','score','measured_time_ms'].join(',')];
      for(let i=0;i<lastDepotScores.length;i++){ const r=lastDepotScores[i].r, c=lastDepotScores[i].c, sc=lastDepotScores[i].score; const t = (times && times[i]) ? times[i] : ''; rowsOut.push([r,c,sc,t].join(',')); }
      const blob = new Blob([rowsOut.join('\n')], {type:'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `depot_timings_${(new Date()).toISOString().replace(/[:.]/g,'-')}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

  // Export depot chart as a PNG at higher resolution
  const exportDepotPngBtn = document.getElementById('exportDepotPng');
  exportDepotPngBtn?.addEventListener('click', ()=>{
    if(!chartDepot){ alert('No depot chart to export'); return }
    // create a temporary canvas to render at 2x resolution for better quality
    try{
      const scale = 2; const w = chartDepot.width * scale, h = chartDepot.height * scale;
      const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.style.width = w+'px'; tmp.style.height = h+'px';
      const ctx = tmp.getContext('2d'); ctx.scale(scale, scale);
      // render the chart onto the temporary canvas using Chart.js' toBase64Image (works on original canvas)
      const dataUrl = chartDepot.toBase64Image(); // base64 of current chart
      // draw the image onto tmp at high-res
      const img = new Image(); img.onload = ()=>{
        ctx.drawImage(img, 0, 0, chartDepot.width, chartDepot.height);
        tmp.toBlob((blob)=>{ const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `depot_chart_${(new Date()).toISOString().replace(/[:.]/g,'-')}.png`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }, 'image/png');
      };
      img.src = dataUrl;
    }catch(e){ alert('Export failed: '+(e&&e.message)); }
  });

  // Re-plot depot scores when normalize toggle changes (if we have last results)
  normalizeDepotEl?.addEventListener('change', ()=>{
    if(!lastDepotScores) return;
    // reconstruct topScores from lastDepotScores (top K stored at beginning of array)
    const K = Math.max(1, parseInt(depotTopKInput?.value,10)||1);
    const top = lastDepotScores.slice(0, K).map(x=>({ cand: { r: x.r, c: x.c }, score: x.score }));
    const targets = (houses.length ? houses : points.map(p=>({r:p.r,c:p.c,demand:1})));
    plotDepotScores(top, targets).catch(e=>{ log('warn', 'Failed re-plotting depot scores: '+(e && e.message)); });
  });

  // Import scenario: load JSON and apply to UI/state
  const importInput = document.getElementById('importScenario');
  importInput?.addEventListener('change', (ev)=>{
    const f = ev.target.files && ev.target.files[0]; if(!f) return; const rdr = new FileReader(); rdr.onload = ()=>{
      try{
        const sc = JSON.parse(rdr.result);
        if(sc.rows && sc.cols){ rows = sc.rows; cols = sc.cols; rowsInput.value = rows; colsInput.value = cols; cellW = canvas.width/cols; cellH = canvas.height/rows; }
        obstacles = new Set(); if(sc.obstacles){ for(const k of Object.keys(sc.obstacles||{})) obstacles.add(k); }
        depot = sc.depot ? {r: sc.depot.r, c: sc.depot.c} : null;
        points = [];
        if(Array.isArray(sc.points)) for(const p of sc.points) points.push({r:p.r,c:p.c});
        houses = [];
        if(Array.isArray(sc.houses)) for(const h of sc.houses) houses.push({r:h.r,c:h.c,demand: h.demand||1});
        depotCandidates = sc.depotCandidates || null;
        updateStatus(); drawGrid(); statusEl.textContent = 'Scenario imported.';
      }catch(e){ alert('Failed to import scenario: '+e.message) }
    }; rdr.readAsText(f);
  });

  // initial setup
  updateStatus(); drawGrid();

  // Simulation: run z trials of n random points and aggregate times/lengths; useDepot makes algorithms start at depot (if set)
  function buildScenario(n,z,useDepot){
    const useSeed = !!simUseSeedCheckbox && !!simUseSeedCheckbox.checked;
    const seedVal = useSeed && simSeedInput ? parseInt(simSeedInput.value,10) || 12345 : 12345;
    // serialize obstacles into a map for worker
    const obsObj = {};
    obstacles.forEach(k=>{ obsObj[k]=true });
    return {
      rows, cols, n, z, useDepot, seed: seedVal, useSeed,
      obstacles: obsObj,
      depot: depot ? {r: depot.r, c: depot.c} : null,
      includeSA: document.getElementById('includeSA')?.checked || false,
      includeGA: document.getElementById('includeGA')?.checked || false,
      saIters: parseInt(document.getElementById('saIters')?.value,10) || 200,
      gaPop: parseInt(document.getElementById('gaPop')?.value,10) || 50,
      gaGen: parseInt(document.getElementById('gaGen')?.value,10) || 80,
      gaMut: parseFloat(document.getElementById('gaMut')?.value) || 0.05,
      close: !!closedCheckbox.checked
    };
  }

  async function simulateTrials(n,z,useDepot){
    // prefer worker if available
    if(window.Worker && !simWorker){
      try{
        simWorker = new Worker('simWorker.js');
      }catch(e){ console.warn('Worker failed to start:', e); simWorker = null }
    }
    const scenario = buildScenario(n,z,useDepot);
  // validate: cannot request more points than free cells
  const totalCells = rows * cols;
  const blocked = obstacles.size || 0;
  const freeCells = totalCells - blocked - (scenario.useDepot && scenario.depot ? 1 : 0);
  if(scenario.n > freeCells){ const msg = `Requested n=${scenario.n} exceeds available free cells=${freeCells}. Aborting.`; statusEl.textContent = msg; log('error', msg); return; }
    if(simWorker){
      statusEl.textContent = 'Simulation: running in worker...';
      simWorker.postMessage({type:'run', scenario});
      simWorker.onmessage = ev=>{
        const m = ev.data;
        if(m.type==='progress'){
          statusEl.textContent = `Simulation progress: ${m.done}/${m.total}`;
          log('info', `Simulation progress: ${m.done}/${m.total}`);
        }else if(m.type==='warn'){
          // surface worker warnings to UI log (include stack if provided)
          log('warn', `Worker warning: ${m.message}\n${m.stack||''}`);
          statusEl.textContent = `Worker warning: ${m.message.split('\n')[0]}`;
        }else if(m.type==='done'){
          lastSimResults = Object.assign({}, m.result, {scenario});
          plotSimDetailed(lastSimResults);
          statusEl.textContent = 'Simulation: done';
          log('info', `Simulation done: n=${scenario.n}, z=${scenario.z}, useDepot=${scenario.useDepot}`);
    // auto-download logs if requested
    if(autoDownloadEl && autoDownloadEl.checked){ const txt = logBuffer.map(x=>x.line).join('\n'); const blob = new Blob([txt], {type:'text/plain'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `vrp_log_${(new Date()).toISOString().replace(/[:.]/g,'-')}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); log('info','Auto-downloaded log file'); }
        }
      };
  simWorker.onerror = e=>{ console.error('Worker error', e); alert('Worker error: '+e.message); statusEl.textContent='Simulation: worker error'; log('error', 'Worker error: '+(e && e.message)); };
    }else{
      // fallback to main-thread run (existing implementation)
      statusEl.textContent = 'Simulation: running on main thread...';
      // reuse prior implementation by dynamic eval (keeps patch small)
      await (async ()=>{
        const perRun = { nearest:[], twoopt:[], held:[], sa:[], ga:[] };
        const useSeed = scenario.useSeed; const seedVal = scenario.seed; const rng = useSeed ? xorshift32(seedVal) : Math.random;
        for(let i=0;i<z;i++){
          const pts = [];
          while(pts.length<n){ const r=Math.floor(rng()*rows); const c=Math.floor(rng()*cols); if(obstacles.has(keyOf(r,c))) continue; if(useDepot && depot && depot.r===r && depot.c===c) continue; if(!pts.some(p=>p.r===r&&p.c===c)) pts.push({r,c}) }
          const eu = pts.map(p=>[p.c+0.5,p.r+0.5]);
          let euWithDepot = eu; if(useDepot && depot) euWithDepot = [[depot.c+0.5, depot.r+0.5]].concat(eu);
          const t0 = performance.now(); const nn = nearestNeighbor(euWithDepot); const t1 = performance.now(); perRun.nearest.push({time: t1-t0, len: pathLength(nn,euWithDepot)});
          const t2 = performance.now(); let two = nearestNeighbor(euWithDepot); two = twoOpt(two,euWithDepot); const t3 = performance.now(); perRun.twoopt.push({time: t3-t2, len: pathLength(two,euWithDepot)});
          if(n+ (useDepot && depot ? 1:0) <= 12){ const t4 = performance.now(); const hk = heldKarp(euWithDepot); const t5 = performance.now(); perRun.held.push({time: t5-t4, len: pathLength(hk,euWithDepot)}); }
          if(scenario.includeSA){ const t6=performance.now(); const sa = simulatedAnnealing ? simulatedAnnealing(euWithDepot, {iters: scenario.saIters, close: scenario.close}) : nearestNeighbor(euWithDepot); const t7=performance.now(); perRun.sa.push({time: t7-t6, len: pathLength(sa,euWithDepot,scenario.close)}); }
          if(scenario.includeGA){ const t8=performance.now(); const ga = geneticAlgorithm ? geneticAlgorithm(euWithDepot, {pop: scenario.gaPop, gen: scenario.gaGen, mut: scenario.gaMut, close: scenario.close}) : nearestNeighbor(euWithDepot); const t9=performance.now(); perRun.ga.push({time: t9-t8, len: pathLength(ga,euWithDepot,scenario.close)}); }
          if(i%10===0) await new Promise(r=>setTimeout(r,1));
          if(i%5===0) log('info', `Main-thread simulation progress: ${i+1}/${z}`);
        }
        lastSimResults = {n,z,useDepot,perRun,scenario}; plotSimDetailed(lastSimResults);
        statusEl.textContent = 'Simulation: done (main thread)';
        log('info', `Simulation done (main thread): n=${n}, z=${z}, useDepot=${useDepot}`);
  if(autoDownloadEl && autoDownloadEl.checked){ const txt = logBuffer.map(x=>x.line).join('\n'); const blob = new Blob([txt], {type:'text/plain'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `vrp_log_${(new Date()).toISOString().replace(/[:.]/g,'-')}.txt`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); log('info','Auto-downloaded log file'); }
      })();
    }
  }

  // plot depot candidate scores (stacked contributions per target)
  async function plotDepotScores(topScores, targets){
    // topScores: array of {cand, score}
    const labels = topScores.map((s,i)=>`(${s.cand.r},${s.cand.c})`);
    const targetCount = targets.length;
    // build datasets: one dataset per target (stacked)
    const datasets = [];
    // first compute raw per-target contributions for each candidate (matrix: candidates x targets)
    const contribMatrix = topScores.map(s => {
      const cand = s.cand; const row = [];
      for(let t=0;t<targets.length;t++){
        const tgt = targets[t]; if(typeof tgt.demand === 'undefined') tgt.demand = 1;
        if(depotMetricSelect.value === 'euclid') row.push((tgt.demand||1)*Math.hypot(cand.c - tgt.c, cand.r - tgt.r));
        else {
          const rec = lastDepotScores && lastDepotScores.find(x=>x.r===cand.r && x.c===cand.c);
          if(rec && rec.contrib) row.push(rec.contrib[t]); else row.push((tgt.demand||1) * (Math.abs(cand.r - tgt.r) + Math.abs(cand.c - tgt.c)));
        }
      }
      return row;
    });

    // optionally normalize per-candidate so stacked bars are percentages
    const normalize = !!(normalizeDepotEl && normalizeDepotEl.checked);
    const contribToPlot = contribMatrix.map(row => {
      const total = row.reduce((s,x)=>s+x,0);
      if(!normalize || total === 0) return row.slice(0, Math.min(8, row.length));
      return row.slice(0, Math.min(8, row.length)).map(x => 100 * x / total);
    });

    const targetLimit = Math.min(8, targetCount);
    for(let t=0;t<targetLimit;t++){
      const data = contribToPlot.map(r => r[t] || 0);
      datasets.push({ label: `T${t}`, data, backgroundColor: `hsla(${(t*60)%360},70%,60%,0.85)` });
    }

    // add total score overlay line (either raw sum or 100 when normalized)
    const total = topScores.map((s,idx)=> normalize ? 100 : s.score);
    datasets.push({ label: normalize ? 'Total (%)' : 'Total score', data: total, type:'line', borderColor:'#111827', fill:false, yAxisID:'y' });
    // request measured timings from worker when available (non-blocking)
    let measuredTimes = new Array(topScores.length).fill(0);
    try{
      if(simWorker){
        // ask worker to measure top-K candidates; prepare plain objects
        const rowsLocal = rows, colsLocal = cols;
        const obstaclesObj = {}; obstacles.forEach(k=>obstaclesObj[k]=true);
        const payload = { type: 'measureDepot', rows: rowsLocal, cols: colsLocal, obstacles: obstaclesObj, targets, candidates: topScores.map(s=>s.cand), topK: topScores.length };
        // post and await response via a one-time listener
        const meas = await new Promise((resolve, reject)=>{
          function onmsg(ev){ if(ev.data && ev.data.type === 'measureDepotResult'){ simWorker.removeEventListener('message', onmsg); resolve(ev.data.result); } }
          simWorker.addEventListener('message', onmsg);
          simWorker.postMessage(payload);
          // timeout in 10s
          setTimeout(()=>{ simWorker.removeEventListener('message', onmsg); reject(new Error('Worker measureDepot timeout')); }, 10000);
        });
        measuredTimes = meas.measured.map(x=>x.time);
      }else{
        // fallback: do quick main-thread measurement (keeps previous behavior)
        for(let i=0;i<topScores.length;i++){ const cand = topScores[i].cand; const t0 = performance.now(); const distMap = Array.from({length:rows},()=>Array(cols).fill(-1)); const q=[{r:cand.r,c:cand.c,d:0}]; distMap[cand.r][cand.c]=0; let qi=0; while(qi<q.length){ const node=q[qi++]; for(const nb of neighbors(node.r,node.c)){ if(distMap[nb[0]][nb[1]]!==-1) continue; distMap[nb[0]][nb[1]] = node.d+1; q.push({r:nb[0],c:nb[1],d:node.d+1}); } } const t1 = performance.now(); measuredTimes[i] = Math.max(0, t1-t0); if(i%3===0) await new Promise(r=>setTimeout(r,0)); }
      }
    }catch(e){ log('warn','Depot measurement failed: '+(e && e.message)); }
  datasets.push({ label: 'Measured time (ms)', data: measuredTimes, type:'line', borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.12)', yAxisID: 'yTime', pointRadius:4, tension:0.2 });
    const ctx = document.getElementById('chartDepotScores').getContext('2d');
  if(chartDepot) chartDepot.destroy();
  chartDepot = new Chart(ctx, {
      type: 'bar', data: { labels, datasets }, options: {
        responsive:true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom' },
          zoom: { // enable zoom/pan
            pan: { enabled: true, mode: 'x' },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
          }
        },
        scales: {
          y: { beginAtZero:true, position: 'left', title: { display: true, text: normalize ? 'Percent (%)' : 'Score' }, stacked: true },
          yTime: { beginAtZero:true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Estimated time (ms)' }, ticks: { beginAtZero:true } }
        }
      }
    });
    // save an exact snapshot (type/data/options) for the modal so modal and inline chart match
  try{ lastDepotChartSnapshot = structuredClone(chartDepot.config); }catch(e){ lastDepotChartSnapshot = null; }
    // also render a larger zoomable depot chart in the modal when requested
    chartDepot.canvas.onclick = ()=> openModalWithChart('depot');
  }

  // Statistical helpers
  function pairedBootstrapP(a,b, iters=2000){ // returns p-value for two-sided paired test via bootstrap
    if(a.length!==b.length) return NaN; const n=a.length; const diffs = a.map((v,i)=>v-b[i]); const origMean = mean(diffs);
    let moreExtreme = 0;
    for(let it=0; it<iters; it++){ let sum=0; for(let i=0;i<n;i++){ const idx = Math.floor(Math.random()*n); sum += diffs[idx]; } const m = sum/n; if(Math.abs(m) >= Math.abs(origMean)) moreExtreme++; }
    return (moreExtreme+1)/(iters+1);
  }
  function cohensD(a,b){ if(a.length!==b.length) return NaN; const diffs=a.map((v,i)=>v-b[i]); const md=mean(diffs); const sd = Math.sqrt(diffs.reduce((s,x)=>s+(x-md)*(x-md),0)/(diffs.length-1)); return md / sd; }

  // Bootstrap CI helper (hoisted so Export LaTeX and other top-level code can use it)
  function bootstrapCI(arr, iters=2000, alpha=0.05){ if(!arr || arr.length===0) return [NaN,NaN,NaN]; const means = []; for(let i=0;i<iters;i++){ let sum=0; for(let j=0;j<arr.length;j++){ const idx = Math.floor(Math.random()*arr.length); sum += arr[idx]; } means.push(sum/arr.length); } means.sort((a,b)=>a-b); const lo = means[Math.floor((alpha/2)*iters)]; const hi = means[Math.floor((1-alpha/2)*iters)]; return [mean(arr), lo, hi]; }

  // Export LaTeX table for lastSimResults
  const exportLatexBtn = document.getElementById('exportLatex');
  exportLatexBtn?.addEventListener('click', ()=>{
    if(!lastSimResults){ alert('No simulation results to export'); return }
    const {perRun,n,z,useDepot} = lastSimResults;
    const nnLens = perRun.nearest.map(x=>x.len); const twoLens = perRun.twoopt.map(x=>x.len);
    const nnCI = bootstrapCI(nnLens,2000,0.05); const twoCI = bootstrapCI(twoLens,2000,0.05);
    const p = pairedBootstrapP(nnLens, twoLens, 4000); const d = cohensD(nnLens, twoLens);
    const table = [];
    table.push('\\begin{tabular}{lrr}');
    table.push('Algorithm & Mean length & 95\\% CI \\\\');
    table.push(`NN & ${nnCI[0].toFixed(3)} & [${nnCI[1].toFixed(3)}, ${nnCI[2].toFixed(3)}] \\\\`);
    table.push(`2Opt & ${twoCI[0].toFixed(3)} & [${twoCI[1].toFixed(3)}, ${twoCI[2].toFixed(3)}] \\\\`);
    table.push('\\midrule');
    table.push(`Paired bootstrap p & \multicolumn{2}{r}{${p.toExponential(2)}} \\\\`);
    table.push(`Cohen\\'s d & \multicolumn{2}{r}{${d.toFixed(3)}} \\\\`);
    table.push('\\end{tabular}');
    const blob = new Blob([table.join('\n')], {type:'text/plain'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='sim_table.tex'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  // export scenario JSON for exact reproduction
  exportScenarioBtn?.addEventListener('click', ()=>{
    const n = Math.max(2, parseInt(simNInput.value,10)||8); const z = Math.max(1, parseInt(simZInput.value,10)||50); const useDepot = !!simUseDepotCheckbox.checked;
    const sc = buildScenario(n,z,useDepot);
    const blob = new Blob([JSON.stringify(sc,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download = `scenario_n${n}_z${z}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  function mean(arr){ return arr.reduce((s,x)=>s+x,0)/arr.length }
  function std(arr){ const m=mean(arr); return Math.sqrt(arr.reduce((s,x)=>s+(x-m)*(x-m),0)/arr.length) }

  // Local SA/GA implementations (simple versions for main-thread fallback)
  function simulatedAnnealing(pts, opts){ const n=pts.length; if(n<=1) return [0]; let cur = nearestNeighbor(pts); let curCost = pathLength(cur,pts); let T = opts.T0 || 1.0; const alpha = opts.alpha || 0.995; const iters = opts.iters || 200; for(let it=0; it<iters; it++){ const i = 1 + Math.floor(Math.random()*(n-2)); const j = i + Math.floor(Math.random()*(n-i)); const cand = cur.slice(0,i).concat(cur.slice(i,j+1).reverse(), cur.slice(j+1)); const cCost = pathLength(cand,pts); const d = cCost - curCost; if(d < 0 || Math.exp(-d/T) > Math.random()){ cur = cand; curCost = cCost } T *= alpha } return cur }

  // Robust GA matching worker implementation (supports injected RNG and safer crossover)
  function geneticAlgorithm(pts, opts){ const n = pts.length; if(n<=1) return [0]; const pop = (opts && opts.pop) || 30; const generations = (opts && opts.gen) || 50; const mutp = (opts && opts.mut) || 0.05; const close = !!(opts && opts.close); const rng = (opts && opts.rng) ? opts.rng : Math.random;
    const population = [];
    for(let i=0;i<pop;i++){ let p = [...Array(n).keys()].sort(()=>rng()-0.5); p[0]=0; population.push({geno:p, fitness: pathLength(p,pts,close)}) }
    function tournamentSelect(k=3){ let best=null; for(let i=0;i<k;i++){ const cand = population[Math.floor(rng()*population.length)]; if(!best || cand.fitness < best.fitness) best = cand; } return best }
    function orderCrossover(a,b){ const cut1 = 1 + Math.floor(rng()*(n-2)); const cut2 = cut1 + Math.floor(rng()*(n-cut1)); const child = new Array(n).fill(null); const used = new Set(); for(let i=cut1;i<=cut2;i++){ child[i]=a.geno[i]; used.add(child[i]); } let bi=0; for(let i=0;i<n;i++){ if(child[i]===null){ while(used.has(b.geno[bi])) bi++; child[i]=b.geno[bi++]; } } if(child[0] !== 0){ const idx0 = child.indexOf(0); if(idx0>0){ [child[0], child[idx0]] = [child[idx0], child[0]]; } } return child }
    function mutateSwap(g){ if(rng()<mutp){ const i=1+Math.floor(rng()*(n-1)); const j=1+Math.floor(rng()*(n-1)); [g[i],g[j]]=[g[j],g[i]] } }
    const elitism = Math.max(1, Math.floor(pop*0.05));
    for(let gen=0; gen<generations; gen++){
      const newPop = [];
      // keep elites
      population.sort((a,b)=>a.fitness-b.fitness);
      for(let e=0;e<elitism;e++) newPop.push(population[e]);
      while(newPop.length < pop){ const p1 = tournamentSelect(), p2 = tournamentSelect(); const child = orderCrossover(p1,p2); mutateSwap(child); newPop.push({geno: child, fitness: pathLength(child,pts,close)}); }
      population.splice(0,pop, ...newPop);
    }
    population.sort((a,b)=>a.fitness-b.fitness);
    return population[0].geno }

  function plotSimDetailed(results){
    const {perRun,n,z,useDepot} = results;
  // prepare arrays (pad to length z so chart labels align)
  function padTimes(arr){ const out=[]; for(let i=0;i<z;i++){ out.push(arr && arr[i] && typeof arr[i].time === 'number' ? arr[i].time : NaN); } return out }
  function padLens(arr){ const out=[]; for(let i=0;i<z;i++){ out.push(arr && arr[i] && typeof arr[i].len === 'number' ? arr[i].len : NaN); } return out }
  const nnTimes = padTimes(perRun.nearest), nnLens = padLens(perRun.nearest);
  const twoTimes = padTimes(perRun.twoopt), twoLens = padLens(perRun.twoopt);
  const heldTimes = padTimes(perRun.held), heldLens = padLens(perRun.held);
  const saTimes = padTimes(perRun.sa), saLens = padLens(perRun.sa);
  const gaTimes = padTimes(perRun.ga), gaLens = padLens(perRun.ga);
  const cvrpTimes = padTimes(perRun.cvrp), cvrpLens = padLens(perRun.cvrp);
  // flags whether the scenario requested these algorithms (fall back to presence in results)
  const includeSAFlag = (results.scenario && results.scenario.includeSA) || (perRun.sa && perRun.sa.length>0);
  const includeGAFlag = (results.scenario && results.scenario.includeGA) || (perRun.ga && perRun.ga.length>0);
  const includeCVRPFlag = (results.scenario && results.scenario.includeCVRP) || (perRun.cvrp && perRun.cvrp.length>0);
    // time chart: scatter per-run + mean line
    const labels = Array.from({length:z},(_,i)=>String(i+1));
  if(chartTime) chartTime.destroy();
  const timeDatasets = [];
  timeDatasets.push({ label:'NN time (ms)', data: nnTimes, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.08)', fill:true, tension:0.2, pointRadius:2 });
  timeDatasets.push({ label:'2Opt time (ms)', data: twoTimes, borderColor:'#0ea5a4', backgroundColor:'rgba(14,165,164,0.08)', fill:true, tension:0.2, pointRadius:2 });
  if(perRun.held && perRun.held.length) timeDatasets.push({ label:'Held time (ms)', data: heldTimes, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,0.06)', fill:true, tension:0.2, pointRadius:2 });
  if(includeSAFlag) timeDatasets.push({ label:'SA time (ms)', data: saTimes, borderColor:'#7c3aed', backgroundColor:'rgba(124,58,237,0.06)', fill:true, tension:0.2, pointRadius:2 });
  if(includeGAFlag) timeDatasets.push({ label:'GA time (ms)', data: gaTimes, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.06)', fill:true, tension:0.2, pointRadius:2 });
  if(includeCVRPFlag) timeDatasets.push({ label:'CVRP time (ms)', data: cvrpTimes, borderColor:'#0b74a8', backgroundColor:'rgba(11,116,168,0.06)', fill:true, tension:0.2, pointRadius:2 });
  chartTime = new Chart(chartTimeEl.getContext('2d'), { type:'line', data:{ labels, datasets: timeDatasets }, options:{ responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ position:'bottom' } } } });
    // allow clicking to zoom: attach handlers to canvases
  chartTimeEl.onclick = ()=> openModalWithChart('time');
  chartLenEl.onclick = ()=> openModalWithChart('len');
  // allow depot chart to open modal for zoom as well
  const depotCanvas = document.getElementById('chartDepotScores'); if(depotCanvas) depotCanvas.onclick = ()=> openModalWithChart('depot');
  // compute bootstrap CIs for means (95%) for each algorithm lengths (uses hoisted bootstrapCI)
  const nnCI = bootstrapCI(nnLens); const twoCI = bootstrapCI(twoLens); const heldCI = heldLens.length? bootstrapCI(heldLens): null;
    // length chart: show per-run bars and overlay CI lines
  if(chartLen) chartLen.destroy();
  // show lines for each algorithm with points, and shaded CI bands
  const ctx = chartLenEl.getContext('2d');
  const datasets = [];
  datasets.push({ label:'NN', data: nnLens, borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.08)', fill:true, tension:0.2, pointRadius:3 });
  datasets.push({ label:'2Opt', data: twoLens, borderColor:'#0ea5a4', backgroundColor:'rgba(14,165,164,0.08)', fill:true, tension:0.2, pointRadius:3 });
  if(perRun.held && perRun.held.length) datasets.push({ label:'Held', data: heldLens, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,0.06)', fill:true, tension:0.2, pointRadius:3 });
  if(includeSAFlag) datasets.push({ label:'SA', data: saLens, borderColor:'#7c3aed', backgroundColor:'rgba(124,58,237,0.06)', fill:true, tension:0.2, pointRadius:3 });
  if(includeGAFlag) datasets.push({ label:'GA', data: gaLens, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.06)', fill:true, tension:0.2, pointRadius:3 });
  if(includeCVRPFlag) datasets.push({ label:'CVRP', data: cvrpLens, borderColor:'#0b74a8', backgroundColor:'rgba(11,116,168,0.06)', fill:true, tension:0.2, pointRadius:3 });
  // overlay mean lines
  // overlay mean lines for present algorithms
  if(nnLens.some(Number.isFinite)) datasets.push({ label:'NN mean', data: Array(z).fill(nnCI[0]), type:'line', borderColor:'#ef4444', borderDash:[6,6], fill:false, pointRadius:0 });
  if(twoLens.some(Number.isFinite)) datasets.push({ label:'2Opt mean', data: Array(z).fill(twoCI[0]), type:'line', borderColor:'#0ea5a4', borderDash:[6,6], fill:false, pointRadius:0 });
  if(heldCI) datasets.push({ label:'Held mean', data: Array(z).fill(heldCI[0]), type:'line', borderColor:'#2563eb', borderDash:[6,6], fill:false, pointRadius:0 });
  if(includeSAFlag){ const saFinite = saLens.filter(Number.isFinite); const saCI = saFinite.length ? bootstrapCI(saFinite) : null; if(saCI) datasets.push({ label:'SA mean', data: Array(z).fill(saCI[0]), type:'line', borderColor:'#7c3aed', borderDash:[6,6], fill:false, pointRadius:0 }); }
  if(includeGAFlag){ const gaFinite = gaLens.filter(Number.isFinite); const gaCI = gaFinite.length ? bootstrapCI(gaFinite) : null; if(gaCI) datasets.push({ label:'GA mean', data: Array(z).fill(gaCI[0]), type:'line', borderColor:'#f59e0b', borderDash:[6,6], fill:false, pointRadius:0 }); }
  if(includeCVRPFlag){ const cvFinite = cvrpLens.filter(Number.isFinite); const cvCI = cvFinite.length ? bootstrapCI(cvFinite) : null; if(cvCI) datasets.push({ label:'CVRP mean', data: Array(z).fill(cvCI[0]), type:'line', borderColor:'#0b74a8', borderDash:[6,6], fill:false, pointRadius:0 }); }
  // create chart
  chartLen = new Chart(ctx, { type:'line', data:{ labels, datasets }, options:{ responsive:true, scales:{ y:{ beginAtZero:true } }, plugins:{ legend:{ position:'bottom' } } } });
    // paired t-test NN vs 2Opt lengths (paired by run)
    function pairedTTest(a,b){ if(a.length!==b.length||a.length<2) return {t:NaN, p:NaN}; const n=a.length; const diffs = a.map((v,i)=>v-b[i]); const md = mean(diffs); const sd = Math.sqrt(diffs.reduce((s,x)=>s+(x-md)*(x-md),0)/(n-1)); const t = md / (sd/Math.sqrt(n)); // two-sided p from t with n-1 df using approximation (normal) for simplicity
      const z = Math.abs(t); const p = 2*(1 - (0.5*(1+Math.erf(z/Math.SQRT2)))); return {t,p}; }
    const ttest = pairedTTest(nnLens, twoLens);
    // details: means and stddev
    const details = [];
    details.push(`Simulated n=${n}, z=${z}, depot=${useDepot? 'yes':'no'}`);
    details.push(`NN: mean time=${Number.isFinite(mean(nnTimes))?mean(nnTimes).toFixed(3):'n/a'}ms, std=${Number.isFinite(std(nnTimes))?std(nnTimes).toFixed(3):'n/a'}, mean len=${Number.isFinite(mean(nnLens))?mean(nnLens).toFixed(3):'n/a'}`);
    details.push(`2Opt: mean time=${Number.isFinite(mean(twoTimes))?mean(twoTimes).toFixed(3):'n/a'}ms, std=${Number.isFinite(std(twoTimes))?std(twoTimes).toFixed(3):'n/a'}, mean len=${Number.isFinite(mean(twoLens))?mean(twoLens).toFixed(3):'n/a'}`);
  if(perRun.held && perRun.held.length) details.push(`Held: mean time=${mean(heldTimes).toFixed(3)}ms, std=${std(heldTimes).toFixed(3)}ms, mean len=${mean(heldLens).toFixed(3)}`);
  if(includeSAFlag) details.push(`SA: mean time=${Number.isFinite(mean(saTimes))?mean(saTimes).toFixed(3):'n/a'}ms, std=${Number.isFinite(std(saTimes))?std(saTimes).toFixed(3):'n/a'}, mean len=${Number.isFinite(mean(saLens))?mean(saLens).toFixed(3):'n/a'}`);
  if(includeGAFlag) details.push(`GA: mean time=${Number.isFinite(mean(gaTimes))?mean(gaTimes).toFixed(3):'n/a'}ms, std=${Number.isFinite(std(gaTimes))?std(gaTimes).toFixed(3):'n/a'}, mean len=${Number.isFinite(mean(gaLens))?mean(gaLens).toFixed(3):'n/a'}`);
  if(includeCVRPFlag) details.push(`CVRP: mean time=${Number.isFinite(mean(cvrpTimes))?mean(cvrpTimes).toFixed(3):'n/a'}ms, std=${Number.isFinite(std(cvrpTimes))?std(cvrpTimes).toFixed(3):'n/a'}, mean len=${Number.isFinite(mean(cvrpLens))?mean(cvrpLens).toFixed(3):'n/a'}`);
  details.push(`Paired t-test NN vs 2Opt lengths: t=${isNaN(ttest.t)?'n/a':ttest.t.toFixed(3)}, p≈${isNaN(ttest.p)?'n/a':ttest.p.toExponential(2)}`);
    simDetailsEl.textContent = details.join('\n');
  }

  // modal helpers: clone chart into modal (simple re-render of datasets)
  function openModalWithChart(which){
    modal.style.display = 'flex';
    const ctx = modalChartEl.getContext('2d');
    if(window.modalChartInstance) window.modalChartInstance.destroy();
    if(which==='time'){
      // copy data
      const data = chartTime.data; window.modalChartInstance = new Chart(ctx, { type: 'line', data: structuredClone(data), options:{ responsive:true } });
    }else{
      if(which === 'len'){
        const data = chartLen.data; window.modalChartInstance = new Chart(ctx, { type: 'bar', data: structuredClone(data), options:{ responsive:true } });
      }else if(which === 'depot'){
        if(lastDepotChartSnapshot){
          // use a deep clone of the chart config so modal and inline charts match exactly
          const cfg = structuredClone(lastDepotChartSnapshot);
          cfg.options = cfg.options || {};
          cfg.options.plugins = cfg.options.plugins || {};
          cfg.options.plugins.zoom = cfg.options.plugins.zoom || { pan:{enabled:true, mode:'x'}, zoom:{ wheel:{enabled:true}, pinch:{enabled:true}, mode:'x' } };
          window.modalChartInstance = new Chart(ctx, cfg);
        }else{
          // fallback to constructing from lastDepotScores
          const labels = lastDepotScores ? lastDepotScores.map(x=>`(${x.r},${x.c})`) : [];
          const total = lastDepotScores ? lastDepotScores.map(x=>x.score) : [];
          const est = total.map(v=>v * 0.2);
          const datasets = [ { label: 'Total score', data: total, type:'bar', backgroundColor:'rgba(59,130,246,0.6)' }, { label: 'Estimated time (ms)', data: est, type:'line', borderColor:'#f59e0b', yAxisID:'yTime' } ];
          window.modalChartInstance = new Chart(ctx, { type: 'bar', data: { labels, datasets }, options: { responsive:true, interaction:{ mode:'index', intersect:false }, plugins:{ zoom:{ pan:{enabled:true, mode:'x'}, zoom:{ wheel:{enabled:true}, pinch:{enabled:true}, mode:'x' } }, legend:{position:'bottom'} }, scales:{ y:{ beginAtZero:true }, yTime:{ beginAtZero:true, position:'right', grid:{drawOnChartArea:false} } } } });
        }
      }
    }
  }
  modalClose.addEventListener('click', ()=>{ modal.style.display='none'; if(window.modalChartInstance){ window.modalChartInstance.destroy(); window.modalChartInstance=null } });
  // close modal when clicking outside the chart canvas
  modal.addEventListener('click', (ev)=>{
    if(ev.target === modal){ modal.style.display='none'; if(window.modalChartInstance){ window.modalChartInstance.destroy(); window.modalChartInstance=null } }
  });

  function exportSimCsv(results){
    const {perRun,n,z,useDepot} = results;
    const rowsOut = [];
    rowsOut.push(['run','algo','time_ms','length','n','useDepot'].join(','));
    for(let i=0;i<z;i++){
  if(perRun.nearest[i]){ const nn = perRun.nearest[i]; rowsOut.push([i+1,'nearest', (nn.time||0).toFixed(6), (nn.len||NaN).toFixed(6),n,useDepot].join(',')); }
  if(perRun.twoopt[i]){ const two = perRun.twoopt[i]; rowsOut.push([i+1,'twoopt', (two.time||0).toFixed(6), (two.len||NaN).toFixed(6),n,useDepot].join(',')); }
  if(perRun.held[i]){ const h = perRun.held[i]; rowsOut.push([i+1,'held', (h.time||0).toFixed(6), (h.len||NaN).toFixed(6),n,useDepot].join(',')); }
  if(perRun.sa && perRun.sa[i]){ const s = perRun.sa[i]; rowsOut.push([i+1,'sa', (s.time||0).toFixed(6), (s.len||NaN).toFixed(6),n,useDepot].join(',')); }
  if(perRun.ga && perRun.ga[i]){ const g = perRun.ga[i]; rowsOut.push([i+1,'ga', (g.time||0).toFixed(6), (g.len||NaN).toFixed(6),n,useDepot].join(',')); }
  if(perRun.cvrp && perRun.cvrp[i]){ const c = perRun.cvrp[i]; rowsOut.push([i+1,'cvrp', (c.time||0).toFixed(6), (c.len||NaN).toFixed(6),n,useDepot].join(',')); }
    }
    const csv = rowsOut.join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `sim_n${n}_z${z}_depot${useDepot}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // Automation helpers for headless runners (Puppeteer etc.)
  try{
    window.__getLastSimResults = function(){ return lastSimResults }; // returns the raw results object
  window.__exportSimCsv = function(){ if(!lastSimResults) return null; const {perRun,n,z,useDepot} = lastSimResults; const rowsOut = []; rowsOut.push(['run','algo','time_ms','length','n','useDepot'].join(',')); for(let i=0;i<z;i++){ if(perRun.nearest[i]){ const nn = perRun.nearest[i]; rowsOut.push([i+1,'nearest',(nn.time||0).toFixed(6),(nn.len||NaN).toFixed(6),n,useDepot].join(',')); } if(perRun.twoopt[i]){ const two = perRun.twoopt[i]; rowsOut.push([i+1,'twoopt',(two.time||0).toFixed(6),(two.len||NaN).toFixed(6),n,useDepot].join(',')); } if(perRun.held[i]){ const h = perRun.held[i]; rowsOut.push([i+1,'held',(h.time||0).toFixed(6),(h.len||NaN).toFixed(6),n,useDepot].join(',')); } if(perRun.sa && perRun.sa[i]){ const s = perRun.sa[i]; rowsOut.push([i+1,'sa',(s.time||0).toFixed(6),(s.len||NaN).toFixed(6),n,useDepot].join(',')); } if(perRun.ga && perRun.ga[i]){ const g = perRun.ga[i]; rowsOut.push([i+1,'ga',(g.time||0).toFixed(6),(g.len||NaN).toFixed(6),n,useDepot].join(',')); } if(perRun.cvrp && perRun.cvrp[i]){ const c = perRun.cvrp[i]; rowsOut.push([i+1,'cvrp',(c.time||0).toFixed(6),(c.len||NaN).toFixed(6),n,useDepot].join(',')); } } return rowsOut.join('\n'); };
    window.__getLastDepotScores = function(){ return lastDepotScores };
    window.__exportLastDepotCsv = function(){ if(!lastDepotScores) return null; let times = null; try{ if(chartDepot){ const ds = chartDepot.data.datasets; const mt = ds.find(d=>d.label==='Measured time (ms)'); if(mt) times = mt.data; } }catch(e){} const rowsOut = [['r','c','score','measured_time_ms'].join(',')]; for(let i=0;i<lastDepotScores.length;i++){ const r=lastDepotScores[i].r, c=lastDepotScores[i].c, sc=lastDepotScores[i].score; const t = (times && times[i]) ? times[i] : ''; rowsOut.push([r,c,sc,t].join(',')); } return rowsOut.join('\n'); };
  }catch(e){ console.warn('Automation helpers failed to attach:', e); }

})();
