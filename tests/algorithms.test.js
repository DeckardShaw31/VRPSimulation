const alg = require('../lib/algorithms'); const prng = require('../lib/prng');

test('dist simple', ()=>{ expect(alg.dist([0,0],[3,4])).toBeCloseTo(5); });

test('nearestNeighbor trivial', ()=>{ const pts = [[0,0],[1,0],[2,0]]; const nn = alg.nearestNeighbor(pts); expect(nn).toEqual([0,1,2]); });

test('pathLength and twoOpt improve or equal', ()=>{ const pts = [[0,0],[0,2],[0,1]]; const order = [0,1,2]; const L1 = alg.pathLength(order, pts); const improved = alg.twoOpt(order, pts); const L2 = alg.pathLength(improved, pts); expect(L2).toBeLessThanOrEqual(L1); });

test('twoOpt preserves nodes', ()=>{ const pts = [[0,0],[1,0],[2,0],[3,0]]; const order = [0,1,2,3]; const out = alg.twoOpt(order, pts); expect(out.slice().sort((a,b)=>a-b)).toEqual([0,1,2,3]); });

test('deterministic PRNG', ()=>{ const r = prng.xorshift32(12345); const a = [r(), r(), r()]; const r2 = prng.xorshift32(12345); const b = [r2(), r2(), r2()]; expect(a).toEqual(b); });
