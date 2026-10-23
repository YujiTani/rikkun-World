import { buildBig, voxelize, worldHits, cellKey } from './gashaBig';
import { TUNE as T } from './gashaBigTuning';
export function T0(): void {
  const m = buildBig();
  m.group.scale.setScalar(m.scale);
  const hits = worldHits(m);
  const cells = voxelize(hits, T.collide.margin, T.collide.topLift);
  console.log('scale', m.scale, 'head', m.head.toArray().map((v) => v.toFixed(1)));
  const L = (n: string) => { const h = hits.find((x) => x.name === n)!; console.log(n, h.center.map((v) => v.toFixed(1)).join(','), 'half', h.half.map((v) => v.toFixed(1)).join(',')); };
  for (const n of ['handL', 'foreArmL', 'upperArmL', 'shoulderL', 'rampOutL', 'rampInL', 'ribbonWingL', 'ribbonWing2L', 'skull']) L(n);
  // 高さ地図（上から見た いちばん 高い 固いマス）: x -50..50, z -40..60 を 2 ごとに
  const top = (i: number, k: number) => { for (let j = 80; j >= 0; j--) if (cells.has(cellKey(i, j, k))) return j; return -1; };
  const rows: string[] = [];
  for (let k = 55; k >= -35; k -= 2) {
    let r = String(k).padStart(4) + ' ';
    for (let i = 0; i <= 50; i += 1) { const t = top(i, k); r += t < 0 ? '.' : t < 10 ? String(t) : String.fromCharCode(55 + Math.min(t, 60) % 36 + (t >= 36 ? 0 : 0)); }
    rows.push(r);
  }
  console.log(rows.join('\n'));
}
export function T1(): void {
  const m = buildBig();
  m.group.scale.setScalar(m.scale);
  const hits = worldHits(m);
  const cells = voxelize(hits, T.collide.margin, T.collide.topLift);
  const top = (i: number, k: number) => { for (let j = 80; j >= 0; j--) if (cells.has(cellKey(i, j, k))) return j; return -1; };
  const s = m.scale;
  const E = m.rest.LeftForeArm.clone().multiplyScalar(s), S = m.rest.LeftArm.clone().multiplyScalar(s), W = m.rest.LeftHand.clone().multiplyScalar(s);
  console.log('S', S.toArray().map((v) => v.toFixed(1)), 'E', E.toArray().map((v) => v.toFixed(1)), 'W', W.toArray().map((v) => v.toFixed(1)));
  const out: string[] = [];
  let prev = -2;
  const path = [W, E, S];
  for (let a = 0; a < 2; a++) for (let t = 0; t <= 1; t += 0.02) {
    const p = path[a]!.clone().lerp(path[a + 1]!, t);
    const i = Math.floor(p.x), k = Math.floor(p.z), h = top(i, k);
    if (h !== prev) { out.push(`(${i},${k})=${h}`); prev = h; }
  }
  console.log(out.join(' '));
}
