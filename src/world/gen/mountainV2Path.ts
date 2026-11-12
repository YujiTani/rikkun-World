import { smooth, type Params } from './mountainV2Params';
import { T, TAU } from './mountainV2Table';

/**
 * 登れる道（すそ → 頂上）。山の 坂が 道の 坂より きついので、まっすぐ おろすと 空に 浮く（細い かべに なる）。
 * そこで 山を ぐるっと まわる らせんに する（山の 坂 k と 道の 坂 T.path.k から、まわる はやさを きめる）。
 * 道の 高さ = 頂上 − 坂 × 道のり。道の まわり（edge）の 列には、いちばん ちかい 道の 点の 高さを かける。
 */

/** らせんの 上の 点（頂上から 道のり along の ところ）。a0 = はじめの 向き・dir = まわる 向き（±1） */
function spiralAt(p: Params, px: number, pz: number, a0: number, dir: number, along: number): { x: number; z: number } {
  const P = T.path;
  const rho = Math.min(P.maxRho, P.k / p.k);
  const r = P.startR + rho * along;
  const th = a0 + dir * (Math.sqrt(1 - rho * rho) / rho) * Math.log(r / P.startR);
  return { x: px + Math.cos(th) * r, z: pz + Math.sin(th) * r };
}

/**
 * 道の 向き（はじめの 向き × まわる 向き）: 道が 山の 地面より 高く 浮く ぶんが いちばん 少ない もの。柱を つきぬける 向きは ばつ。
 * shape = 道を ほる まえの 山の高さ
 */
export function choosePath(p: Params, px: number, pz: number, shape: (x: number, z: number) => number): { a0: number; dir: number } {
  const P = T.path;
  let best = { a0: p.pathA, dir: 1 };
  let bestScore = Infinity;
  for (const dir of [1, -1]) {
    for (let i = 0; i < P.tryDirs; i++) {
      const a0 = p.pathA + (i / P.tryDirs) * TAU;
      let score = 0;
      for (let along = 2; along * P.k < p.apex; along += 2) {
        const q = spiralAt(p, px, pz, a0, dir, along);
        score += Math.max(0, p.apex - P.k * along - shape(q.x, q.z));
        for (const pl of p.pillars) if (Math.hypot(q.x - pl.x, q.z - pl.z) < pl.rad + P.edge + 3) score += P.pillarPenalty;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { a0, dir };
      }
    }
  }
  return best;
}

/** 道を つくる: 点（pathPts = x, z の 列。P.step ごと）と、道の まわりの 列ごとの 高さ（pathCells） */
export function buildPath(p: Params, px: number, pz: number, a0: number, dir: number): void {
  const P = T.path;
  const pts: number[] = [];
  const cells = new Map<number, { d: number; hp: number }>();
  const R = Math.ceil(P.edge);
  for (let i = 0; ; i++) {
    const along = i * P.step;
    const hp = p.apex - P.k * along;
    if (hp < -2) break;
    const q = spiralAt(p, px, pz, a0, dir, along);
    pts.push(q.x, q.z);
    for (let cz = Math.round(q.z) - R; cz <= Math.round(q.z) + R; cz++) {
      for (let cx = Math.round(q.x) - R; cx <= Math.round(q.x) + R; cx++) {
        const d = Math.hypot(cx - q.x, cz - q.z);
        if (d >= P.edge) continue;
        const key = cellKey(cx, cz);
        const old = cells.get(key);
        if (!old || d < old.d) cells.set(key, { d, hp });
      }
    }
  }
  p.pathPts = pts;
  p.pathCells = cells;
}

const cellKey = (x: number, z: number): number => (x + 100000) * 200003 + (z + 100000);

/** 道の ふちを なめらかに: その 列の 道の 高さと、かかる 強さ（なければ null） */
export function pathCell(p: Params, x: number, z: number): { hp: number; w: number } | null {
  const c = p.pathCells!.get(cellKey(Math.round(x), Math.round(z)));
  if (!c) return null;
  return { hp: c.hp, w: 1 - smooth(T.path.flat, T.path.edge, c.d) };
}

/** 道の 点（頂上から 道のり along）と 進む 向き。橋を かけるときに つかう */
export function pathAt(p: Params, along: number): { x: number; z: number; tx: number; tz: number } {
  const pts = p.pathPts!;
  const n = pts.length / 2;
  const i = Math.min(n - 2, Math.max(1, Math.round(along / T.path.step)));
  const tx = pts[(i + 1) * 2]! - pts[(i - 1) * 2]!;
  const tz = pts[(i + 1) * 2 + 1]! - pts[(i - 1) * 2 + 1]!;
  const l = Math.hypot(tx, tz) || 1;
  return { x: pts[i * 2]!, z: pts[i * 2 + 1]!, tx: tx / l, tz: tz / l };
}
