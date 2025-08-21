// Web Worker for running simulations off the main thread.
// Listens for messages: {type:'run', scenario: {...}}

// Simple xorshift32 PRNG
function xorshift32(seed){ let x = seed>>>0; if(x===0) x=2463534242; return function(){ x ^= x<<13; x >>>= 0; x ^= x>>>17; x ^= x<<5; x >>>= 0; return (x>>>0)/4294967296; } }

// util distance
function dist(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return Math.hypot(dx,dy) }

// Nearest neighbor
function nearestNeighbor(pts){ if(pts.length===0) return []; const n=pts.length; const visited=new Array(n).fill(false); const path=[0]; visited[0]=true; for(let k=1;k<n;k++){ let last=path[path.length-1]; let best=-1,bestd=Infinity; for(let i=0;i<n;i++) if(!visited[i]){ const d=dist(pts[last],pts[i]); if(d<bestd){bestd=d; best=i}} path.push(best); visited[best]=true } return path }

// path length (close optional via scenario)
function pathLength(path, pts, close=false){ let L=0; for(let i=1;i<path.length;i++) L+=dist(pts[path[i-1]], pts[path[i]]); if(close && path.length>1) L += dist(pts[path[path.length-1]], pts[path[0]]); return L }

// 2-opt
function twoOpt(path,pts,close=false){ let improved=true; let n=path.length; while(improved){ improved=false; for(let i=1;i<n-1;i++) for(let k=i+1;k<n;k++){ const newPath = path.slice(0,i).concat(path.slice(i,k+1).reverse(), path.slice(k+1)); if(pathLength(newPath,pts,close) + 1e-9 < pathLength(path,pts,close)){ path=newPath; improved=true } } } return path }

// Held-Karp exact (same as main thread)
function heldKarp(pts){ const n=pts.length; if(n===0) return []; if(n===1) return [0]; const D = Array.from({length:n},()=>Array(n).fill(0)); for(let i=0;i<n;i++) for(let j=0;j<n;j++) D[i][j]=dist(pts[i],pts[j]); const N = 1<<(n-1); const dp = new Map(); for(let i=1;i<n;i++){ const key = (1<<(i-1))<<5 | i; dp.set(key, D[0][i]); } for(let s=1;s<N;s++){ for(let last=1;last<n;last++){ if(!(s & (1<<(last-1)))) continue; const key = (s<<5)|last; if(!dp.has(key)){ let best=Infinity; const sprev = s & ~(1<<(last-1)); if(sprev===0) continue; for(let prev=1;prev<n;prev++){ if(!(sprev & (1<<(prev-1)))) continue; const prevKey = (sprev<<5)|prev; const val = dp.get(prevKey); if(val + D[prev][last] < best) best = val + D[prev][last]; } if(best<Infinity) dp.set(key,best); } } } let best=Infinity; let lastBest=1; const full = N-1; for(let last=1;last<n;last++){ const key=(full<<5)|last; const val = dp.get(key); if(val + D[last][0] < best){ best = val + D[last][0]; lastBest = last } } const path=[0]; let curS = full; let curLast = lastBest; const rev=[]; while(curS){ rev.push(curLast); let found=-1; const key=(curS<<5)|curLast; const curVal = dp.get(key); const sprev = curS & ~(1<<(curLast-1)); if(sprev===0){ found=0 } else { for(let prev=1;prev<n;prev++){ if(!(sprev & (1<<(prev-1)))) continue; const prevKey = (sprev<<5)|prev; const v=dp.get(prevKey); if(v + D[prev][curLast] === curVal){ found=prev; break } } } if(found<=0){ curS=0; break } curLast = found; curS = curS & ~(1<<(rev[rev.length-1]-1)); } rev.reverse(); for(const r of rev) if(r!==0) path.push(r); return path }

// Simple Simulated Annealing (2-opt neighbor)
function simulatedAnnealing(pts, opts){ const n=pts.length; if(n<=1) return [0]; const rng = (opts && opts.rng) ? opts.rng : Math.random; // start with NN
  let cur = nearestNeighbor(pts); let curCost = pathLength(cur,pts,opts.close);
  let T = opts.T0 || 1.0; const alpha = opts.alpha || 0.995; const iters = opts.iters || 200;
  for(let it=0; it<iters; it++){ // pick two indices i<j
    const i = 1 + Math.floor(rng()*(n-2)); const j = i + Math.floor(rng()*(n-i)); const cand = cur.slice(0,i).concat(cur.slice(i,j+1).reverse(), cur.slice(j+1)); const cCost = pathLength(cand,pts,opts.close); const d = cCost - curCost; if(d < 0 || Math.exp(-d/T) > rng()){ cur = cand; curCost = cCost } T *= alpha }
  return cur }

// Simple GA: permutation GA with order crossover and swap mutation
function geneticAlgorithm(pts, opts){
  const n = pts.length; if(n<=1) return [0];
  const pop = (opts && opts.pop) || 50;
  const generations = (opts && opts.gen) || 80;
  const mutp = (opts && opts.mut) || 0.05;
  const close = !!(opts && opts.close);
  const rng = (opts && opts.rng) ? opts.rng : Math.random;
  const population = [];
  for(let i=0;i<pop;i++){ let p = [...Array(n).keys()].sort(()=>rng()-0.5); p[0]=0; let fit; try{ fit = pathLength(p, pts, close); }catch(e){ fit = pathLength(nearestNeighbor(pts), pts, close); } population.push({geno:p, fitness: fit}) }
  function tournamentSelect(k=3){ let best=null; for(let i=0;i<k;i++){ const cand = population[Math.floor(rng()*population.length)]; if(!best || cand.fitness < best.fitness) best = cand; } return best }
  function orderCrossover(a,b){ const cut1 = 1 + Math.floor(rng()*(n-2)); const cut2 = cut1 + Math.floor(rng()*(n-cut1)); const child = new Array(n).fill(null); const used = new Set(); for(let i=cut1;i<=cut2;i++){ child[i]=a.geno[i]; used.add(child[i]); } let bi=0; for(let i=0;i<n;i++){ if(child[i]===null){ while(used.has(b.geno[bi])) bi++; child[i]=b.geno[bi++]; } } if(child[0] !== 0){ const idx0 = child.indexOf(0); if(idx0>0) [child[0],child[idx0]]=[child[idx0],child[0]]; } return child }
  function orderCrossover(a,b){
    const cut1 = 1 + Math.floor(rng()*(n-2));
    const cut2 = cut1 + Math.floor(rng()*(n-cut1));
    const child = new Array(n).fill(null);
    const used = new Set();
    for(let i=cut1;i<=cut2;i++){ child[i]=a.geno[i]; used.add(child[i]); }
    let bi = 0;
    for(let i=0;i<n;i++){
      if(child[i]===null){
        // advance bi until we find a value not used; wrap to stay within bounds
        let attempts = 0;
        while(attempts < n && used.has(b.geno[bi])){ bi = (bi + 1) % n; attempts++; }
        const val = b.geno[bi];
        // as a defensive fallback, if val is undefined (shouldn't happen), pick first unused from a.geno
        if(typeof val === 'undefined'){
          for(let k=0;k<n;k++){ if(!used.has(a.geno[k])){ child[i]=a.geno[k]; used.add(a.geno[k]); break } }
        }else{
          child[i] = val; used.add(val); bi = (bi + 1) % n;
        }
      }
    }
    if(child[0] !== 0){ const idx0 = child.indexOf(0); if(idx0>0) [child[0],child[idx0]]=[child[idx0],child[0]]; }
    return child;
  }
  function mutateSwap(g){ if(rng()<mutp){ const i=1+Math.floor(rng()*(n-1)); const j=1+Math.floor(rng()*(n-1)); [g[i],g[j]]=[g[j],g[i]] } }
  const elitism = Math.max(1, Math.floor(pop*0.05));
  for(let gen=0; gen<generations; gen++){
    const newPop = [];
    population.sort((a,b)=>a.fitness-b.fitness);
    for(let e=0;e<elitism;e++) newPop.push(population[e]);
      while(newPop.length < pop){ const p1 = tournamentSelect(), p2 = tournamentSelect(); const child = orderCrossover(p1,p2); mutateSwap(child); let fit; try{ fit = pathLength(child, pts, close); if(!Array.isArray(child) || child.length !== pts.length) throw new Error('invalid child'); }catch(e){ // fallback
          const fallback = nearestNeighbor(pts); fit = pathLength(fallback, pts, close); newPop.push({geno: fallback, fitness: fit}); continue; }
        newPop.push({geno: child, fitness: fit}); }
    population.splice(0,pop, ...newPop);
  }
  population.sort((a,b)=>a.fitness-b.fitness);
  return population[0].geno
}

// Clarke-Wright savings algorithm for CVRP
function clarkeWright(depotCoord, customers, capacity){
  // customers: array of {r,c,demand}
  const m = customers.length;
  // compute distances
  function d(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
  const depot = [depotCoord.c+0.5, depotCoord.r+0.5];
  const custPts = customers.map(p=>[p.c+0.5, p.r+0.5]);
  const d0 = custPts.map(p=>d(depot,p));
  const D = Array.from({length:m},()=>Array(m).fill(0));
  for(let i=0;i<m;i++) for(let j=0;j<m;j++) D[i][j] = d(custPts[i], custPts[j]);
  // initial routes: each customer in its own route
  const routes = customers.map((c,i)=>({nodes:[i], load: c.demand||1}));
  // savings list
  const savings = [];
  for(let i=0;i<m;i++) for(let j=i+1;j<m;j++){ savings.push({i,j, s: d0[i] + d0[j] - D[i][j]}); }
  savings.sort((a,b)=>b.s - a.s);
  // helper to find route index and whether at ends
  function findRouteContaining(idx){ for(let r=0;r<routes.length;r++){ const nodes = routes[r].nodes; if(nodes[0]===idx) return {r,at:'start'}; if(nodes[nodes.length-1]===idx) return {r,at:'end'}; if(nodes.includes(idx)) return {r,at:'middle'}; } return null }
  for(const sv of savings){ const i = sv.i, j = sv.j; const ri = findRouteContaining(i); const rj = findRouteContaining(j); if(!ri||!rj) continue; if(ri.r === rj.r) continue; // same route
    // only merge if endpoints
    if(ri.at==='middle' || rj.at==='middle') continue;
    const combinedLoad = routes[ri.r].load + routes[rj.r].load;
    if(capacity && combinedLoad > capacity) continue;
    // decide orientation: attach end to start
    if(ri.at==='end' && rj.at==='start'){
      // merge rj after ri
      routes[ri.r].nodes = routes[ri.r].nodes.concat(routes[rj.r].nodes);
      routes[ri.r].load = combinedLoad;
      routes.splice(rj.r,1);
    }else if(rj.at==='end' && ri.at==='start'){
      routes[rj.r].nodes = routes[rj.r].nodes.concat(routes[ri.r].nodes);
      routes[rj.r].load = combinedLoad;
      routes.splice(ri.r,1);
    }else if(ri.at==='end' && rj.at==='end'){
      // reverse rj
      routes[rj.r].nodes.reverse(); routes[ri.r].nodes = routes[ri.r].nodes.concat(routes[rj.r].nodes); routes[ri.r].load = combinedLoad; routes.splice(rj.r,1);
    }else if(ri.at==='start' && rj.at==='start'){
      // reverse ri and merge
      routes[ri.r].nodes.reverse(); routes[ri.r].nodes = routes[ri.r].nodes.concat(routes[rj.r].nodes); routes[ri.r].load = combinedLoad; routes.splice(rj.r,1);
    }
  }
  return routes;
}

function cvrpTotalLength(depotCoord, customers, capacity){
  const routes = clarkeWright(depotCoord, customers, capacity);
  // compute total euclidean length including depot returns
  function d(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
  const depot = [depotCoord.c+0.5, depotCoord.r+0.5];
  const custPts = customers.map(p=>[p.c+0.5, p.r+0.5]);
  let total = 0;
  for(const rt of routes){ if(rt.nodes.length===0) continue; let prev = depot; for(const idx of rt.nodes){ const cur = custPts[idx]; total += d(prev, cur); prev = cur; } total += d(prev, depot); }
  return {total, routes};
}

self.onmessage = async function(ev){
  const msg = ev.data;
  if(msg.type === 'run'){
    const s = msg.scenario; const n = s.n; const z = s.z; const useDepot = !!s.useDepot; const seed = s.seed || 12345; const useSeed = !!s.useSeed;
    const rng = useSeed ? xorshift32(seed) : Math.random;
  // Validate available cells: compute free cells from obstacles map
  const cells = s.rows * s.cols;
  let blocked = 0;
  if(s.obstacles){ blocked = Object.keys(s.obstacles).length; }
  const freeCells = cells - blocked - (s.depot ? 1 : 0);
  if(n > freeCells){ postMessage({type:'warn', message: `Invalid scenario: requested n=${n} but only ${freeCells} free cells available`}); postMessage({type:'done', result: { perRun: { nearest:[], twoopt:[], held:[], sa:[], ga:[], cvrp:[] }, n,z, useDepot }}); return; }
  const out = { perRun: { nearest:[], twoopt:[], held:[], sa: [], ga: [], cvrp: [] }, n,z, useDepot };
    for(let i=0;i<z;i++){
      try{
        // generate pts
        const pts = [];
        while(pts.length<n){ const r = Math.floor((useSeed?rng():Math.random())*s.rows); const c = Math.floor((useSeed?rng():Math.random())*s.cols); const k = `${r},${c}`; if(s.obstacles && s.obstacles[k]) continue; if(useDepot && s.depot && s.depot.r===r && s.depot.c===c) continue; if(!pts.some(p=>p.r===r&&p.c===c)) pts.push({r,c}); }
        const eu = pts.map(p=>[p.c+0.5, p.r+0.5]);
        let euWithDepot = eu;
        if(useDepot && s.depot){ euWithDepot = [[s.depot.c+0.5, s.depot.r+0.5]].concat(eu); }
        // NN
        const t0 = performance.now(); const nn = nearestNeighbor(euWithDepot); const t1 = performance.now(); out.perRun.nearest.push({time: t1-t0, len: pathLength(nn,euWithDepot, s.close)});
        // 2opt
        const t2 = performance.now(); let two = nearestNeighbor(euWithDepot); two = twoOpt(two,euWithDepot, s.close); const t3 = performance.now(); out.perRun.twoopt.push({time: t3-t2, len: pathLength(two,euWithDepot, s.close)});
        // held
        if(n + (useDepot && s.depot ? 1:0) <= 12){ const t4 = performance.now(); const hk = heldKarp(euWithDepot); const t5 = performance.now(); out.perRun.held.push({time: t5-t4, len: pathLength(hk,euWithDepot, s.close)}); }
        // SA
        if(s.includeSA){ try{ const t6 = performance.now(); const sa = simulatedAnnealing(euWithDepot, {iters: s.saIters, close: s.close, rng}); const t7 = performance.now(); out.perRun.sa.push({time: t7-t6, len: pathLength(sa,euWithDepot,s.close)}) }catch(e){ postMessage({type:'warn', message: 'SA error: '+e.message, stack: e && e.stack}); out.perRun.sa.push({time:0,len:NaN}); } }
        // GA
        if(s.includeGA){ try{ const t8 = performance.now(); const ga = geneticAlgorithm(euWithDepot, {pop: s.gaPop, gen: s.gaGen, mut: s.gaMut, close: s.close, rng}); const t9 = performance.now();
            // validate GA result
            if(!Array.isArray(ga) || ga.length !== euWithDepot.length || ga.some(x=>typeof x !== 'number')){
              postMessage({type:'warn', message: 'GA returned invalid genome; falling back to NN'});
              out.perRun.ga.push({time: t9-t8, len: pathLength(nearestNeighbor(euWithDepot), euWithDepot, s.close)});
            }else{
              out.perRun.ga.push({time: t9-t8, len: pathLength(ga,euWithDepot,s.close)});
            }
          }catch(e){ postMessage({type:'warn', message: 'GA error: '+e.message, stack: e && e.stack}); out.perRun.ga.push({time:0,len:NaN}); } }
        // CVRP (Clarke-Wright) if requested and if depot present
        if(s.includeCVRP){ try{ if(s.depot){ // build customers from houses or points
              const customers = (s.houses && s.houses.length) ? s.houses : pts.map(p=>({r:p.r,c:p.c,demand:1})); const cap = s.vehicleCap || 10; const cRes = cvrpTotalLength(s.depot, customers, cap); out.perRun.cvrp.push({time:0, len: cRes.total, routes: cRes.routes}); } else { out.perRun.cvrp.push({time:0, len: NaN, routes: []}); } }catch(e){ postMessage({type:'warn', message: 'CVRP error: '+e.message, stack: e && e.stack}); out.perRun.cvrp.push({time:0, len:NaN, routes:[]}); } }
      }catch(e){
        // catch any unexpected per-iteration errors and continue so worker does not hang
        postMessage({type:'warn', message: 'Iteration error: '+(e && e.message), stack: e && e.stack});
      }
      // send progress as 1-based count; do it more frequently so UI updates smoothly
      if(i%5===0) postMessage({type:'progress', done: i+1, total: z});
    }
    // ensure final progress reflects completion
    postMessage({type:'progress', done: z, total: z});
    postMessage({type:'done', result: out});
  }
  else if(msg.type === 'measureDepot'){
    // msg: { targets: [{r,c,demand}], candidates: [{r,c}], topK }
    const targets = msg.targets || [];
    const candidates = msg.candidates || [];
    const topK = msg.topK || candidates.length;
    // compute scores (grid shortest-path sums) using existing BFS approach
    const scores = [];
    for(const cand of candidates){ // run BFS to compute distance sum
      const distMap = Array.from({length: msg.rows}, ()=>Array(msg.cols).fill(-1));
      const q = [{r:cand.r,c:cand.c,d:0}]; distMap[cand.r][cand.c]=0; let qi=0;
      while(qi<q.length){ const node=q[qi++]; for(const nb of [[1,0],[-1,0],[0,1],[0,-1]]){ const nr=node.r+nb[0], nc=node.c+nb[1]; if(nr<0||nr>=msg.rows||nc<0||nc>=msg.cols) continue; const k = `${nr},${nc}`; if(msg.obstacles && msg.obstacles[k]) continue; if(distMap[nr][nc]!==-1) continue; distMap[nr][nc]=node.d+1; q.push({r:nr,c:nc,d:node.d+1}); } }
      let sum=0; for(const t of targets){ const d = (distMap[t.r] && distMap[t.r][t.c] >=0) ? distMap[t.r][t.c] : 1e9; sum += (t.demand||1)*d; }
      scores.push({cand, score: sum});
    }
    scores.sort((a,b)=>a.score-b.score);
    const top = scores.slice(0, topK);
    const measured = [];
    // measure BFS times per top candidate
    for(const item of top){ const cand = item.cand; const t0=performance.now(); const distMap = Array.from({length: msg.rows}, ()=>Array(msg.cols).fill(-1)); const q=[{r:cand.r,c:cand.c,d:0}]; distMap[cand.r][cand.c]=0; let qi=0; while(qi<q.length){ const node=q[qi++]; for(const nb of [[1,0],[-1,0],[0,1],[0,-1]]){ const nr=node.r+nb[0], nc=node.c+nb[1]; if(nr<0||nr>=msg.rows||nc<0||nc>=msg.cols) continue; const k = `${nr},${nc}`; if(msg.obstacles && msg.obstacles[k]) continue; if(distMap[nr][nc]!==-1) continue; distMap[nr][nc]=node.d+1; q.push({r:nr,c:nc,d:node.d+1}); } } const t1=performance.now(); measured.push({cand, score:item.score, time: Math.max(0, t1-t0)}); }
    postMessage({type:'measureDepotResult', result: { measured, scores }});
  }
}
