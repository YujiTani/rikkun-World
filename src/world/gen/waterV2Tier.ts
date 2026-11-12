import { hash01 } from './random';
import type { FallPlan, Stage } from './waterV2Types';
import { basinCells, basinFits, basinNorm, makeBasin, waterLeaks, Edit, type Basin, type Dir, type Ground } from './waterV2Kit';
import { WATER_TUNE as T } from './waterV2Table';

/**
 * 段々の 滝: 高い かべ（落差 tier.min 以上）の 滝を 2〜4 段に わける。
 * かべの 前に、段ごとの 「たな」（いびつな たまり。下は 岩で うめる）を 階段のように ならべる。落ち口は 段ごとに 横へ ずれる。
 * 1 段 = 1 くみの わきどころ（へり）と たきつぼ（うける たまりの 底）。水の 量は 段ごとに 保たれる。
 * 組めたか は 「水が もれない」で きめる（もれる なら 次の 形を ためす。どれも だめなら 1 段のまま）。
 */

const TI = T.tier;

/** base（1 段）を 段々に した 滝。作れなければ null */
export function tierUp(g: Ground, seed: number, base: FallPlan, free: (x: number, z: number) => boolean, build: (ed: Edit, g: Ground, seed: number, p: FallPlan) => void): FallPlan | null {
  const drop = base.top - base.level;
  if (drop < TI.min) return null;
  const n = Math.min(TI.maxStages, Math.floor(drop / TI.stageMin));
  const levels: number[] = [];
  for (let i = 0; i <= n; i++) levels.push(i === n ? base.level : base.top - Math.round((drop * i) / n));
  const key = base.lip[0]![0] * 7919 + base.lip[0]![1];
  for (let t = 0; t < TI.attempts; t++) {
    const p = chain(g, seed + t * 101, key + t, base, levels, free);
    if (p === null) continue;
    const ed = new Edit();
    build(ed, g, seed, p);
    if (waterLeaks(ed.blocks(), g).length === 0) return p;
  }
  return null;
}

function chain(g: Ground, seed: number, key: number, base: FallPlan, levels: number[], free: (x: number, z: number) => boolean): FallPlan | null {
  const d: Dir = base.d;
  const w = base.lip.length;
  const stages: Stage[] = [];
  let lip = base.lip;
  let front = base.front;
  let top = base.top;
  let prev: Basin | null = null;
  const older: Basin[] = []; // ひとつ まえより 上の たまり（はなして おく）
  const n = levels.length - 1;
  for (let s = 0; s < n; s++) {
    const level = levels[s + 1]!;
    const last = s === n - 1;
    const mx = front.reduce((a, f) => a + f[0] + 0.5, 0) / w;
    const mz = front.reduce((a, f) => a + f[1] + 0.5, 0) / w;
    let pool: Basin | null = null;
    const radii = last ? [7.5, 6.5, 5.5, 4.5, 3.5] : [TI.shelfRadius[0] + Math.floor(hash01(seed, key, s, 1) * (TI.shelfRadius[1] - TI.shelfRadius[0] + 1))];
    const depth = last ? T.fall.poolDepth[0] + Math.floor(hash01(seed, key, s, 2) * (T.fall.poolDepth[1] - T.fall.poolDepth[0] + 1)) : TI.shelfDepth[0] + Math.floor(hash01(seed, key, s, 3) * (TI.shelfDepth[1] - TI.shelfDepth[0] + 1));
    for (const r of radii) {
      if (pool !== null) break;
      const b = makeBasin(seed, mx + d[0] * r * 0.75, mz + d[1] * r * 0.75, r, level, depth);
      if (!front.every(([x, z]) => basinNorm(b, x, z) <= 0.95) || !lip.every(([x, z]) => basinNorm(b, x, z) > 1)) continue;
      if (last ? !basinFits(g, b, T.fall.poolCut, T.fall.poolFill, free) : !shelfFits(g, b, prev, older, free)) continue;
      pool = b;
    }
    if (pool === null) return null;
    stages.push({ lip, front, top, pool });
    if (prev !== null) older.push(prev);
    prev = pool;
    if (!last) {
      // つぎの 落ち口: たまりの 中から 向こうへ すすみ、水を でた 最初の 列。はば w。横へ ずらす
      const px = -d[1];
      const pz = d[0];
      let sh = Math.floor(hash01(seed, key, s, 4) * (2 * TI.shift)) - TI.shift;
      if (sh >= 0) sh++;
      const nl: [number, number][] = [];
      for (let k = 0; k < w; k++) {
        let x = Math.floor(pool.cx) + px * (sh + k - Math.floor((w - 1) / 2));
        let z = Math.floor(pool.cz) + pz * (sh + k - Math.floor((w - 1) / 2));
        if (basinNorm(pool, x, z) > 1) return null;
        let steps = 0;
        while (basinNorm(pool, x, z) <= 1 && steps++ < TI.walk) {
          x += d[0];
          z += d[1];
        }
        if (steps >= TI.walk || g(x, z) < 0 || !free(x, z)) return null;
        if (older.some((o) => basinNorm(o, x, z) <= TI.apart)) return null;
        nl.push([x, z]);
      }
      lip = nl;
      front = nl.map(([x, z]): [number, number] => [x + d[0], z + d[1]]);
      top = level;
    }
  }
  const finalPool = stages[stages.length - 1]!.pool;
  return { ...base, stages, pool: finalPool };
}

/** たな（たまり）が 作れるか: 置ける 列だけ・まえの たまりの 水と かさならない */
function shelfFits(g: Ground, b: Basin, prev: Basin | null, older: readonly Basin[], free: (x: number, z: number) => boolean): boolean {
  for (const { x, z, n } of basinCells(b)) {
    if (g(x, z) < 0 || !free(x, z)) return false;
    if (n <= 1 && prev !== null && basinNorm(prev, x, z) <= 1.4) return false;
    if (older.some((o) => basinNorm(o, x, z) <= TI.apart)) return false;
  }
  return true;
}
