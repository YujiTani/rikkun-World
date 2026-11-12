import { hash01 } from './random';
import { basinFits, buildBasin, circleCells, DIR4, rimColumn, waterColumn, type Basin, type Dir, type Edit, type Ground, type Rect } from './waterV2Kit';
import { WATER_BLOCKS as B, WATER_TUNE as T } from './waterV2Table';

/**
 * 滝: 山の 大きな かべ・段の ふち（落差 8 以上）から、はば 2〜3 の 水が 落ちる。
 *   上: 石で かこんだ 水源の 池（うしろ 3 マス）。ふちの 列に わきどころ（水源）を 並べ、出口は 前（落ちる 方）だけ あく。
 *   下: 滝つぼ（直径 7〜11・ふかさ 2〜3）。落ちる 列の 底に たきつぼ。わきどころは たきつぼと つながると、池の 水を 1 つぶ ぬいて 出口に 出す
 *       （量が かわらない）ので ずっと 流れる。作ったままの 水は ねむって いる（計算に のらない）。
 */

export interface FallPlan {
  /** 落ちる 向き（かべから はなれる 方） */
  d: Dir;
  /** へりの 列（わきどころを 置く） */
  lip: [number, number][];
  /** 落ちる 先の 列（へりの すぐ 前） */
  front: [number, number][];
  /** わきどころの 高さ・滝つぼの 水面（いちばん 上の 水の マス） */
  top: number;
  level: number;
  pool: Basin;
  /** 水源の 池の 列（うしろ）と まわり */
  source: [number, number][];
  sourceRing: [number, number][];
}

const FALL = T.fall;
/** 候補の 数（ふるい用の 上限）。これ以上 見つかっても 乱数の 順で 先頭 から 使う */
const MAX_CANDIDATES = 2500;

type Cand = { lx: number; lz: number; d: Dir; w: number; r: number };

/** 山の 点を 中心に、へりの 候補を 集める（落差の ふるいだけ。池が 入るかは あとで） */
function candidates(g: Ground, px: number, pz: number, seed: number): Cand[] {
  const out: Cand[] = [];
  const S = FALL.search;
  for (let z = pz - S; z <= pz + S; z++) {
    for (let x = px - S; x <= px + S; x++) {
      const gl = g(x, z);
      if (gl < 0) continue;
      for (let di = 0; di < 4; di++) {
        const d = DIR4[di]!;
        const gf = g(x + d[0], z + d[1]);
        if (gf < 0 || gl - gf < FALL.drop[0] || gl - gf > FALL.drop[1]) continue;
        const w = FALL.width[0] + Math.floor(hash01(seed, x, z, 20 + di) * (FALL.width[1] - FALL.width[0] + 1));
        const r = FALL.poolRadius[0] + Math.floor(hash01(seed, x, z, 30 + di) * (FALL.poolRadius[1] - FALL.poolRadius[0] + 1));
        out.push({ lx: x, lz: z, d, w, r });
      }
    }
  }
  // 乱数の 順（決まった 順）に ならべる
  const key = (c: Cand): number => hash01(seed, c.lx, c.lz, 40 + c.d[0] * 2 + c.d[1] + 3);
  return out.sort((a, b) => key(a) - key(b)).slice(0, MAX_CANDIDATES);
}

/** 候補から 滝を 組んで みる（池が 入らなければ null） */
function plan(g: Ground, seed: number, c: Cand, free: (x: number, z: number) => boolean): FallPlan | null {
  const { d, w } = c;
  const px = -d[1];
  const pz = d[0];
  const lip: [number, number][] = [];
  const front: [number, number][] = [];
  for (let k = 0; k < w; k++) {
    const lx = c.lx + k * px;
    const lz = c.lz + k * pz;
    const fx = lx + d[0];
    const fz = lz + d[1];
    const gl = g(lx, lz);
    const gf = g(fx, fz);
    if (gl < 0 || gf < 0 || gl - gf < FALL.drop[0] || gl - gf > FALL.drop[1]) return null;
    if (k > 0 && (Math.abs(gl - g(lip[0]![0], lip[0]![1])) > FALL.flat || Math.abs(gf - g(front[0]![0], front[0]![1])) > FALL.flat)) return null;
    lip.push([lx, lz]);
    front.push([fx, fz]);
  }
  const top = Math.min(...lip.map(([x, z]) => g(x, z)));
  const level = Math.min(...front.map(([x, z]) => g(x, z)));
  const depth = FALL.poolDepth[0] + Math.floor(hash01(seed, c.lx, c.lz, 50) * (FALL.poolDepth[1] - FALL.poolDepth[0] + 1));
  if (top - (level - depth) > 31) return null; // わきどころが たきつぼを 見つけられる とどく はんい（32）
  // 滝つぼ: 落ちる 列が 円の 中に 入り、へりの 列は 外（かべの ほう）
  const mx = front.reduce((s, f) => s + f[0] + 0.5, 0) / w;
  const mz = front.reduce((s, f) => s + f[1] + 0.5, 0) / w;
  const pool: Basin = { cx: mx + d[0] * (c.r - 0.5), cz: mz + d[1] * (c.r - 0.5), r: c.r, level, depth };
  if (!basinFits(g, pool, FALL.poolCut, FALL.poolFill, free)) return null;
  // 水源の 池: へりの うしろ。列 k = -1..w、うしろへ 1..rows（さいごの 列の 角は 丸める）
  const source: [number, number][] = [];
  const sourceRing: [number, number][] = [];
  const rows = FALL.sourceRows;
  const [lo, hi] = FALL.sourceSlack;
  for (let r = 0; r <= rows + 1; r++) {
    for (let k = -2; k <= w + 1; k++) {
      const x = c.lx + k * px - r * d[0];
      const z = c.lz + k * pz - r * d[1];
      const inside = r >= 1 && r <= rows && k >= -1 && k <= w && !(r === rows && (k === -1 || k === w));
      const onLip = r === 0 && k >= 0 && k < w;
      if (onLip) continue;
      const h = g(x, z);
      if (h < 0 || !free(x, z)) return null;
      if (inside) {
        if (h < top + lo || h > top + hi) return null;
        source.push([x, z]);
      } else sourceRing.push([x, z]);
    }
  }
  return { d, lip, front, top, level, pool, source, sourceRing };
}

/** 滝を count 本まで えらぶ（川が 長く のびる 方を 優先。たがいに はなす）。river(p) = その 滝の 川の 長さ */
export function planFalls(g: Ground, px: number, pz: number, seed: number, count: number, avoid: readonly Rect[], river: (p: FallPlan) => number): FallPlan[] {
  const out: FallPlan[] = [];
  const cs = candidates(g, px, pz, seed);
  const used: Rect[] = [...avoid];
  const hit = (x: number, z: number): boolean => used.some((u) => x >= u[0] && x <= u[2] && z >= u[1] && z <= u[3]);
  for (let n = 0; n < count; n++) {
    let best: FallPlan | null = null;
    let bestScore = -1;
    let tried = 0;
    for (const c of cs) {
      if (out.some((o) => Math.max(Math.abs(o.lip[0]![0] - c.lx), Math.abs(o.lip[0]![1] - c.lz)) < FALL.apart)) continue;
      const p = plan(g, seed, c, (x, z) => !hit(x, z));
      if (p === null) continue;
      // 川が 長く のびる 所を 優先（落差は 川の 長さの つぎ）。川が みじかい 所は えらばない
      const len = river(p);
      if (len < FALL.riverMin) continue;
      const score = Math.min(len, FALL.riverGoal) * 4 + (p.top - p.level);
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
      if (++tried >= FALL.pick) break;
    }
    if (best === null) break;
    out.push(best);
    used.push(footOf(best));
  }
  return out;
}

/** 滝の 足もとの 四角（池・水源の 池・まわりを ふくむ。1 マス ひろげる） */
export function footOf(p: FallPlan): Rect {
  const cells: [number, number][] = [...circleCells(p.pool.cx, p.pool.cz, p.pool.r + 2), ...p.source, ...p.sourceRing, ...p.lip];
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of cells) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return [x0 - 1, z0 - 1, x1 + 1, z1 + 1];
}

/** 滝の ブロックを 書く（川の 前に 書く。川は 滝つぼから はじまる） */
export function buildFall(ed: Edit, g: Ground, seed: number, p: FallPlan): void {
  // 滝つぼ（まわりは あらいし・こけの あらいし）
  buildBasin(ed, g, seed, p.pool, B.rim, false);
  const bed = p.pool.level - p.pool.depth;
  for (const [x, z] of p.front) ed.set(x, bed, z, B.pit); // 落ちる 列の 底 = たきつぼ
  // 水源の 池と まわりの いし
  for (const [x, z] of p.source) waterColumn(ed, seed + 7, x, z, g(x, z), p.top, FALL.sourceDepth);
  for (const [x, z] of p.sourceRing) rimColumn(ed, seed + 7, x, z, g(x, z), p.top, B.rim, false);
  // へりの わきどころ（その 上は あける）
  for (const [x, z] of p.lip) {
    ed.set(x, p.top, z, B.spring);
    for (let y = p.top + 1; y <= g(x, z); y++) ed.set(x, y, z, B.air);
  }
}

