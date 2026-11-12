import { smooth, type Params } from './mountainV2Params';
import { T, TAU } from './mountainV2Table';

/**
 * 登れる道（すそ → 頂上）。山の 坂が 道の 坂より きついので、まっすぐ おろすと 空に 浮く（細い かべに なる）。
 * そこで 山を ぐるっと まわる らせんに する（山の 坂 k と 道の 坂 T.path.k から、まわる はやさを きめる）。
 * 道の 高さ = 頂上 − 坂 × 道のり。道の まわり（edge）の 列には、いちばん ちかい 道の 点の 高さを かける。
 */

/**
 * 山の 高さの 段面（頂上からの きょり r ごとの、まわりの 向きを ならべた ひくい ほうの 高さ。P.profQ の わりあい）。
 * 道は この 段面に そって 下りる（地面より 高く 浮かないように）。choosePath が 作る
 */
function buildProfile(p: Params, px: number, pz: number, shape: (x: number, z: number) => number, q: number): void {
  const P = T.path;
  const n = Math.ceil(p.r0 * P.profReach);
  const prof: number[] = [];
  const hs: number[] = [];
  for (let r = 0; r <= n; r++) {
    hs.length = 0;
    for (let a = 0; a < P.profAngles; a++) {
      const th = (a / P.profAngles) * TAU;
      hs.push(shape(px + Math.cos(th) * r, pz + Math.sin(th) * r));
    }
    hs.sort((u, v) => u - v);
    prof.push(hs[Math.floor(q * (hs.length - 1))]!);
  }
  p.prof = prof;
}

/**
 * らせんの 点（道のり 0 〜 maxAlong、P.step ごと）を 数えて 作る。頂上から そとへ。a0 = はじめの 向き・dir = まわる 向き（±1）。
 * そとへ 広がる はやさ rho = 道の 坂 ÷ その 場所の 山の 坂（段面から）。山が きついほど、その 場所で 何周も まわって 高さを かせぐ。
 * 戻り値 = [x, z, ...]
 */
function spiralPts(p: Params, px: number, pz: number, a0: number, dir: number, maxAlong: number): number[] {
  const P = T.path;
  const prof = p.prof!;
  const out: number[] = [];
  let r = P.startR;
  let th = a0;
  for (let along = 0; along <= maxAlong; along += P.step) {
    out.push(px + Math.cos(th) * r, pz + Math.sin(th) * r);
    const i = Math.min(prof.length - 1, Math.round(r));
    const slope = Math.abs(prof[Math.max(0, i - P.profSmooth)]! - prof[Math.min(prof.length - 1, i + P.profSmooth)]!) / (2 * P.profSmooth);
    const rho = Math.min(P.maxRho, P.k / Math.max(slope, 1e-3));
    r += rho * P.step;
    th += (dir * Math.sqrt(1 - rho * rho) * P.step) / r;
  }
  return out;
}

/**
 * 道の 向き（はじめの 向き × まわる 向き × 段面の 低さ）: 点数が いちばん 低い もの。
 * 点数 = 道が 地面より 高く 浮く ぶん（土手。maxBank を こえると 重い ばつ）＋ 地面を ほりこむ ふかさ（P.cutCost）＋ 道の 終わりが すそに とどかない ばつ ＋ 柱を つきぬける ばつ。
 * shape = 道を ほる まえの 山の高さ
 */
export function choosePath(p: Params, px: number, pz: number, shape: (x: number, z: number) => number): { a0: number; dir: number; bank: number } {
  const P = T.path;
  let best = { a0: p.pathA, dir: 1, bank: 0 };
  let bestQ = P.profQs[0]!;
  let bestScore = Infinity;
  const maxAlong = (p.apex + 2) / P.k;
  const stride = Math.round(2 / P.step);
  for (const q of P.profQs) {
    buildProfile(p, px, pz, shape, q);
    for (const dir of [1, -1]) {
      for (let i = 0; i < P.tryDirs; i++) {
        const a0 = p.pathA + (i / P.tryDirs) * TAU;
        const pts = spiralPts(p, px, pz, a0, dir, maxAlong);
        let score = 0;
        let bank = 0;
        let last = 0;
        for (let j = stride; j * P.step * P.k < p.apex; j += stride) {
          const qx = pts[j * 2]!;
          const qz = pts[j * 2 + 1]!;
          const ground = shape(qx, qz);
          const excess = Math.max(0, p.apex - P.k * j * P.step - ground);
          const cut = Math.max(0, ground - (p.apex - P.k * j * P.step) - P.cutFree);
          bank = Math.max(bank, excess);
          score += excess + Math.max(0, excess - P.maxBank) * P.bankPenalty + cut * P.cutCost;
          last = ground;
          for (const pl of p.pillars) if (Math.hypot(qx - pl.x, qz - pl.z) < pl.rad + P.edge + 3) score += P.pillarPenalty;
        }
        score += Math.max(0, last - P.endFree) * P.endPenalty;
        if (score < bestScore) {
          bestScore = score;
          best = { a0, dir, bank };
          bestQ = q;
        }
      }
    }
  }
  buildProfile(p, px, pz, shape, bestQ);
  return best;
}

/** 道を つくる: 点（pathPts = x, z の 列。P.step ごと）と、道の まわりの 列ごとの 高さ（pathCells） */
export function buildPath(p: Params, px: number, pz: number, a0: number, dir: number): void {
  const P = T.path;
  const pts = spiralPts(p, px, pz, a0, dir, (p.apex + 2) / P.k);
  const cells = new Map<number, { d: number; hp: number }>();
  const R = Math.ceil(P.edge);
  for (let i = 0; i < pts.length / 2; i++) {
    const hp = p.apex - P.k * i * P.step;
    const qx = pts[i * 2]!;
    const qz = pts[i * 2 + 1]!;
    for (let cz = Math.round(qz) - R; cz <= Math.round(qz) + R; cz++) {
      for (let cx = Math.round(qx) - R; cx <= Math.round(qx) + R; cx++) {
        const d = Math.hypot(cx - qx, cz - qz);
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
