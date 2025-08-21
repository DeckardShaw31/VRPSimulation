// Minimal implementations extracted from app/simWorker for unit testing
function dist(a,b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
function nearestNeighbor(pts){ if(pts.length===0) return []; const n=pts.length; const visited=new Array(n).fill(false); const path=[0]; visited[0]=true; for(let k=1;k<n;k++){ let last=path[path.length-1]; let best=-1,bestd=Infinity; for(let i=0;i<n;i++) if(!visited[i]){ const d=dist(pts[last],pts[i]); if(d<bestd){bestd=d; best=i}} path.push(best); visited[best]=true } return path }
function pathLength(path, pts, close=false){ let L=0; for(let i=1;i<path.length;i++) L+=dist(pts[path[i-1]], pts[path[i]]); if(close && path.length>1) L += dist(pts[path[path.length-1]], pts[path[0]]); return L }
function twoOpt(path,pts,close=false){ let improved=true; let n=path.length; while(improved){ improved=false; for(let i=1;i<n-1;i++) for(let k=i+1;k<n;k++){ const newPath = path.slice(0,i).concat(path.slice(i,k+1).reverse(), path.slice(k+1)); if(pathLength(newPath,pts,close) + 1e-9 < pathLength(path,pts,close)){ path=newPath; improved=true } } } return path }
function nearestCoords(n){ // helper to generate n coords on unit grid diagonal for tests
  const out=[]; for(let i=0;i<n;i++) out.push([i,0]); return out; }
module.exports = { dist, nearestNeighbor, pathLength, twoOpt, nearestCoords };
