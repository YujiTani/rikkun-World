import { it } from 'vitest';
import { TUNE as T } from './gashaBigTuning';
import { buildBig, cellKey, voxelize, worldHits } from './gashaBig';
function standable(cells: Set<number>, i: number, j: number, k: number) { if (j<0) return false; if (cells.has(cellKey(i,j,k))||cells.has(cellKey(i,j+1,k))) return false; return j===0||cells.has(cellKey(i,j-1,k)); }
function reach(cells: Set<number>, start: [number, number, number], maxDrop = 3) {
  const seen = new Map<number, [number, number, number]>(); const q = [start]; seen.set(cellKey(...start), start);
  while (q.length) { const [i, j, k] = q.pop()!;
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const) { const ni=i+dx, nk=k+dz;
      for (let nj=j+1; nj>=Math.max(0,j-maxDrop); nj--) { if (!standable(cells,ni,nj,nk)) continue; if (nj===j+1&&cells.has(cellKey(i,j+2,k))) break; const key=cellKey(ni,nj,nk); if(!seen.has(key)){seen.set(key,[ni,nj,nk]);q.push([ni,nj,nk]);} break; } } }
  return seen; }
it('dbg', () => {
  const model = buildBig(); model.group.position.set(0,0,0); model.group.scale.setScalar(model.scale);
  const hits = worldHits(model);
  const cells = voxelize(hits.filter((h) => !/^(upperArm|foreArm|hand)/.test(h.name)), T.collide.margin, T.collide.topLift);
  const out: string[] = [];
  for (const h of hits) if (/^(tail|side|pompon|skull|ribbon|shoulderL)/.test(h.name) && !/R\d?$/.test(h.name) || h.name==='skull') {
    out.push(`${h.name} c=${h.center.map((v) => v.toFixed(1))} half=${h.half.map((v) => v.toFixed(1))} top=${(h.center[1]+h.half[1]).toFixed(1)}`);
  }
  const seen = reach(cells, [10,17,1]);
  for (let k=8;k>=-2;k--) { let row=''; for (let i=2;i<=10;i++) { let best='..'; let mx=-1; for (const [a,j,c] of seen.values()) if (a===i&&c===k) mx=Math.max(mx,j); if (mx>=0) best=String(mx).padStart(2,' '); row+=best+' '; } console.log('r k='+k, row); }
  // standable top per column (i,k) with i 3..9,k -1..8
  for (let k=8;k>=-2;k--) { let row=''; for (let i=2;i<=10;i++) { let best='.'; for (let j=31;j>=14;j--) if (standable(cells,i,j,k)) { best=String(j%100).padStart(2,' '); break; } row+=best+' '; } console.log('k='+k, row); }
  // columns heights near tail
  for (const [i,k] of [[7,2],[8,2],[7,1],[6,2],[6,3],[7,3]]) { let s=''; for (let j=10;j<32;j++) s += cells.has(cellKey(i,j,k))?'#':'.'; console.log(i,k,s); }
});
