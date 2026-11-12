import { hash01 } from './random';
import type { FallPlan } from './waterV2Types';
import { notchUp, sourceFor } from './waterV2Tier';
import { basinCells, basinFits, basinNorm, buildBasin, depthAt, DIR4, makeBasin, rimColumn, waterColumn, type Basin, type Dir, type Edit, type Ground, type Rect } from './waterV2Kit';
import { WATER_BLOCKS as B, WATER_TUNE as T } from './waterV2Table';

/**
 * 滝: 山の 大きな かべ・段の ふち（落差 8 以上）から、はば 2〜3 の 水が 落ちる。
 *   上: 石で かこんだ 水源の 池（うしろ 3 マス）。ふちの 列に わきどころ（水源）を 並べ、出口は 前（落ちる 方）だけ あく。
 *   下: 滝つぼ（直径 7〜11・ふかさ 2〜3）。落ちる 列の 底に たきつぼ。わきどころは たきつぼと つながると、池の 水を 1 つぶ ぬいて 出口に 出す
 *       （量が かわらない）ので ずっと 流れる。作ったままの 水は ねむって いる（計算に のらない）。
 */

const FALL = T.fall;
/** 候補の 数（ふるい用の 上限）。これ以上 見つかっても 乱数の 順で 先頭 から 使う */
const MAX_CANDIDATES = 6000;

type Cand = { lx: number; lz: number; d: Dir; w: number };

/** 山の 点を 中心に、へりの 候補を 集める（落差の ふるいだけ。池が 入るかは あとで） */
function candidates(g: Ground, px: number, pz: number, seed: number, allow: ((x: number, z: number) => boolean) | undefined): Cand[] {
  const out: Cand[] = [];
  const S = FALL.search;
  for (let z = pz - S; z <= pz + S; z++) {
    for (let x = px - S; x <= px + S; x++) {
      const gl = g(x, z);
      if (gl < 0 || (allow !== undefined && !allow(x, z))) continue;
      for (let di = 0; di < 4; di++) {
        const d = DIR4[di]!;
        const gf = g(x + d[0], z + d[1]);
        if (gf < 0 || gl - gf < FALL.drop[0] || gl - gf > FALL.drop[1]) continue;
        const w = FALL.width[0] + Math.floor(hash01(seed, x, z, 20 + di) * (FALL.width[1] - FALL.width[0] + 1));
        out.push({ lx: x, lz: z, d, w });
      }
    }
  }
  // 乱数の 順（決まった 順）に ならべる
  const key = (c: Cand): number => hash01(seed, c.lx, c.lz, 40 + c.d[0] * 2 + c.d[1] + 3);
  return out.sort((a, b) => key(a) - key(b)).slice(0, MAX_CANDIDATES);
}

/** 候補から 滝を 組んで みる（池が 入らなければ null） */
function plan(g: Ground, seed: number, c: Cand, free: (x: number, z: number) => boolean): FallPlan | null {
  // 好みの はばで 入らなければ 3 まで せまく する
  for (let w = c.w; w >= FALL.width[0]; w--) {
    const p = planW(g, seed, c, w, free);
    if (p !== null) return p;
  }
  return null;
}

function planW(g: Ground, seed: number, c: Cand, w: number, free: (x: number, z: number) => boolean): FallPlan | null {
  const { d } = c;
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
  // 大きい 半径から ためして、入る 最初の 大きさに する
  let pool: Basin | null = null;
  for (let r = FALL.poolRadius[1]; r >= FALL.poolRadius[0] - 1 && pool === null; r -= 1) {
    const b = makeBasin(seed, mx + d[0] * r * 0.75, mz + d[1] * r * 0.75, r, level, depth);
    if (front.every(([x, z]) => basinNorm(b, x, z) <= 0.95) && basinFits(g, b, FALL.poolCut, FALL.poolFill, free)) pool = b;
  }
  if (pool === null) return null;
  // 水源の 池: へりの うしろ
  const src = sourceFor(g, seed, c.lx, c.lz, d, w, top, free);
  if (src === null) return null;
  const { source, sourceRing } = src;
  const base: FallPlan = { d, stages: [{ lip, front, top, pool, shelf: null }], lip, front, top, level, pool, source, sourceRing };
  return notchUp(g, seed, base, free, buildFall) ?? base;
}

/** 滝を count 本まで えらぶ（川が 長く のびる 方を 優先。たがいに はなす）。river(p) = その 滝の 川の 長さ */
/** 滝の さがし方の しぼりこみ: allow = へりの 列に してよい 場所、blocked = 池・川を 置けない 列（ほかの 水） */
interface FallOpts {
  allow?: (x: number, z: number) => boolean;
  blocked?: (x: number, z: number) => boolean;
  /** 組めた 滝を 手なおしして 返す（null = 採らない。なければ そのまま 採る） */
  adjust?: (p: FallPlan) => FallPlan | null;
}

export function planFalls(g: Ground, px: number, pz: number, seed: number, count: number, avoid: readonly Rect[], river: (p: FallPlan) => number, opts: FallOpts = {}): FallPlan[] {
  const out: FallPlan[] = [];
  const cs = candidates(g, px, pz, seed, opts.allow);
  const used: Rect[] = [...avoid];
  const hit = (x: number, z: number): boolean => used.some((u) => x >= u[0] && x <= u[2] && z >= u[1] && z <= u[3]) || (opts.blocked?.(x, z) ?? false);
  for (let n = 0; n < count; n++) {
    let best: FallPlan | null = null;
    let bestScore = -1;
    let tried = 0;
    for (const c of cs) {
      if (out.some((o) => Math.max(Math.abs(o.lip[0]![0] - c.lx), Math.abs(o.lip[0]![1] - c.lz)) < FALL.apart)) continue;
      const p0 = plan(g, seed, c, (x, z) => !hit(x, z));
      const p = p0 === null || opts.adjust === undefined ? p0 : opts.adjust(p0);
      if (p === null) continue;
      // 川が 長く のびる 所を 優先（落差は 川の 長さの つぎ）。川が みじかい 所は えらばない
      const len = river(p);
      if (len < FALL.riverMin) continue;
      const score = Math.min(len, FALL.riverGoal) * 4 + (p.top - p.level) + (p.top - p.level >= FALL.bigDrop ? FALL.bigBonus : 0) + (p.stages.length - 1) * T.tier.bonus;
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
  const cells: [number, number][] = [...p.stages.flatMap((s) => (s.pool !== null ? basinCells(s.pool).map((q): [number, number] => [q.x, q.z]) : s.shelf!.cells)), ...p.source, ...p.sourceRing, ...p.lip];
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

/** 自分の 川が 通れない 列（水源の 池・へり・落ちる 列・たなの たまり。まわり 1 マス）。いちばん 下の 滝つぼは 川の はじまりなので のぞく */
export function fallKeepOut(p: FallPlan): (x: number, z: number) => boolean {
  const set = new Set<number>();
  const add = (x: number, z: number, m: number): void => {
    for (let dz = -m; dz <= m; dz++) for (let dx = -m; dx <= m; dx++) set.add((x + dx) * 100003 + z + dz);
  };
  for (const [x, z] of [...p.source, ...p.sourceRing]) add(x, z, 1);
  p.stages.forEach((s) => {
    for (const [x, z] of [...s.lip, ...s.front]) add(x, z, 1);
    if (s.shelf !== null) for (const [x, z] of s.shelf.cells) add(x, z, 1);
  });
  return (x, z) => set.has(x * 100003 + z);
}

/** 滝の ブロックを 書く（川の 前に 書く。川は 滝つぼから はじまる）。段ごとに 「たまり → 底の たきつぼ → へりの わきどころ」 */
export function buildFall(ed: Edit, g: Ground, seed: number, p: FallPlan): void {
  p.stages.forEach((st, s) => {
    // うける たまり（まわりは あらいし・こけの あらいし）と、落ちる 列の 底 = たきつぼ
    if (st.pool !== null) {
      buildBasin(ed, g, seed + s, st.pool, B.rim, false);
      for (const [x, z] of st.front) ed.set(x, st.pool.level - depthAt(st.pool, basinNorm(st.pool, x, z)), z, B.pit);
    } else if (st.shelf !== null) {
      // ひな段の たな: 台地を ほって 浅い たまり。落ちる 列の 底に たきつぼ
      for (const [x, z] of st.shelf.rim) {
        // 水面の 1 つ 上まで 岩の かべ（底の 下 1 つ から。地面が ひくければ 地面から うめる）
        for (let y = Math.min(g(x, z) + 1, st.shelf.level - st.shelf.depth - 1); y <= st.shelf.level + 1; y++) ed.set(x, y, z, B.fill);
      }
      for (const [x, z] of st.shelf.cells) waterColumn(ed, seed + s, x, z, g(x, z), st.shelf.level, st.shelf.depth);
      for (const [x, z] of st.front) ed.set(x, st.shelf.level - st.shelf.depth, z, B.pit);
    }
    // へりの わきどころ（その 上は あける）。両はしの よこ（列の 外）は わきどころの 高さまで 岩（そこへ 水が 出て いかない ように）
    const base = st.shelf !== null ? st.shelf.level - st.shelf.depth - 1 : st.top - 3;
    const l0 = st.lip[0]!;
    const l1 = st.lip[st.lip.length - 1]!;
    const sx = Math.sign(l1[0] - l0[0]) || 0;
    const sz = Math.sign(l1[1] - l0[1]) || 0;
    for (const [x, z] of [[l0[0] - sx, l0[1] - sz], [l1[0] + sx, l1[1] + sz]] as const) for (let y = base; y <= st.top; y++) ed.set(x, y, z, B.fill);
    for (const [x, z] of st.lip) {
      // わきどころの 下は 岩（うしろが ほら穴でも ささえる。たなの 手前の かべに なる 所は たなの 底まで）
      for (let y = base; y < st.top; y++) ed.set(x, y, z, B.fill);
      ed.set(x, st.top, z, B.spring);
      for (let y = st.top + 1; y <= Math.max(g(x, z), ed.topOf(x, z)); y++) ed.set(x, y, z, B.air);
    }
  });
  // 水源の 池と まわりの いし（いちばん 上。滝つぼが かかる 所は こちらが 勝つ = 池の かべを けずらない）
  for (const [x, z] of p.source) waterColumn(ed, seed + 7, x, z, g(x, z), p.top, FALL.sourceDepth);
  for (const [x, z] of p.sourceRing) rimColumn(ed, seed + 7, x, z, g(x, z), p.top, B.rim, false);
}
