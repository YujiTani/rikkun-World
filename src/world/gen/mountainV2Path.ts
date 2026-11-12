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
function profileSamples(p: Params, px: number, pz: number, shape: (x: number, z: number) => number): number[][] {
  const P = T.path;
  const n = Math.ceil(p.r0 * P.profReach);
  const out: number[][] = [];
  for (let r = 0; r <= n; r++) {
    const hs: number[] = [];
    for (let a = 0; a < P.profAngles; a++) {
      const th = (a / P.profAngles) * TAU;
      hs.push(shape(px + Math.cos(th) * r, pz + Math.sin(th) * r));
    }
    hs.sort((u, v) => u - v);
    out.push(hs);
  }
  return out;
}

const samplesMemo = new WeakMap<Params, number[][]>();
/** 段面の 標本（山 1 つに 1 回。道の とどく はんい と 道えらびで 使いまわす） */
function samplesOf(p: Params, px: number, pz: number, shape: (x: number, z: number) => number): number[][] {
  let s = samplesMemo.get(p);
  if (!s) samplesMemo.set(p, (s = profileSamples(p, px, pz, shape)));
  return s;
}

/**
 * 道と 橋が とどく はんい（頂上からの きょり）。この 外の 列は 道・橋に 影響されない（高さは 山の 形そのまま）。
 * 道の 半径は 段面から 決まる（どの 向きでも 同じ）ので、道えらびより ずっと 軽く 出せる。橋は 柱の 中心と 道の 点の 間の 線（くねり bend まで）
 */
export function pathReach(p: Params, px: number, pz: number, shape: (x: number, z: number) => number): number {
  const P = T.path;
  const apex = shape(px, pz);
  const samples = samplesOf(p, px, pz, shape);
  let rMax = 0;
  for (const q of P.profQs) {
    setProfile(p, samples, q);
    const rs = spiralSteps(p, 1, (apex + 2) / P.k).rs;
    rMax = Math.max(rMax, rs[rs.length - 1]!);
  }
  let reach = rMax + P.edge + 1;
  if (p.pillars.length > 0) {
    let far = rMax + T.bridge.joinLen;
    for (const pl of p.pillars) far = Math.max(far, Math.hypot(pl.x - px, pl.z - pz));
    reach = Math.max(reach, far + T.bridge.bend + T.bridge.edge + 1);
  }
  return reach;
}

/** 段面の 高さ（q = 低い ほうから 何わり め。標本は 山の 形から 1 回だけ 数えて、q ごとに えらぶ。結果は q ごとに 数えるのと 同じ） */
function setProfile(p: Params, samples: readonly (readonly number[])[], q: number): void {
  p.prof = samples.map((hs) => hs[Math.floor(q * (hs.length - 1))]!);
}

/**
 * らせんの 点（道のり 0 〜 maxAlong、P.step ごと）を 数えて 作る。頂上から そとへ。a0 = はじめの 向き・dir = まわる 向き（±1）。
 * そとへ 広がる はやさ rho = 道の 坂 ÷ その 場所の 山の 坂（段面から）。山が きついほど、その 場所で 何周も まわって 高さを かせぐ。
 * 戻り値 = [x, z, ...]
 */
interface Spiral {
  rs: number[];
  incs: number[];
}

/** らせんの 半径と 角の すすみ（はじめの 向き a0 に よらない ので、向きごとに 1 回だけ 数える） */
function spiralSteps(p: Params, dir: number, maxAlong: number): Spiral {
  const P = T.path;
  const prof = p.prof!;
  const rs: number[] = [];
  const incs: number[] = [];
  let r = P.startR;
  for (let along = 0; along <= maxAlong; along += P.step) {
    rs.push(r);
    const i = Math.min(prof.length - 1, Math.round(r));
    const slope = Math.abs(prof[Math.max(0, i - P.profSmooth)]! - prof[Math.min(prof.length - 1, i + P.profSmooth)]!) / (2 * P.profSmooth);
    const rho = Math.min(P.maxRho, P.k / Math.max(slope, 1e-3));
    r += rho * P.step;
    incs.push((dir * Math.sqrt(1 - rho * rho) * P.step) / r);
  }
  return { rs, incs };
}

/** らせんの 点 [x, z, ...]（every 番目の 点だけ。三角関数を へらす。点の 値は 全部 数えた ときと 同じ） */
function spiralPts(px: number, pz: number, a0: number, sp: Spiral, every = 1): number[] {
  const out: number[] = [];
  let th = a0;
  const { rs, incs } = sp;
  for (let n = 0; n < rs.length; n++) {
    if (n % every === 0) out.push(px + Math.cos(th) * rs[n]!, pz + Math.sin(th) * rs[n]!);
    th += incs[n]!;
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
  const samples = samplesOf(p, px, pz, shape);
  for (const q of P.profQs) {
    setProfile(p, samples, q);
    for (const dir of [1, -1]) {
      const sp = spiralSteps(p, dir, maxAlong);
      for (let i = 0; i < P.tryDirs; i++) {
        const a0 = p.pathA + (i / P.tryDirs) * TAU;
        const pts = spiralPts(px, pz, a0, sp, stride);
        let score = 0;
        let bank = 0;
        let last = 0;
        for (let j = stride; j * P.step * P.k < p.apex && score < bestScore; j += stride) { // 点数は 増える だけ: いまの 最良 以上に なったら 打ち切る（選ぶ 道は 同じ）
          const qx = pts[(j / stride) * 2]!;
          const qz = pts[(j / stride) * 2 + 1]!;
          const ground = shape(qx, qz);
          const excess = Math.max(0, p.apex - P.k * j * P.step - ground);
          const cut = Math.max(0, ground - (p.apex - P.k * j * P.step) - P.cutFree);
          bank = Math.max(bank, excess);
          score += excess + Math.max(0, excess - P.maxBank) * P.bankPenalty + cut * P.cutCost;
          last = ground;
          for (const pl of p.pillars) {
            const r = pl.rad + P.edge + 3;
            const ex = qx - pl.x;
            const ez = qz - pl.z;
            if (ex >= r || ex <= -r || ez >= r || ez <= -r) continue; // hypot は 各辺より 小さく ならない → 四角の 外は 必ず 外（答えは 同じ）
            if (Math.hypot(ex, ez) < r) score += P.pillarPenalty;
          }
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
  setProfile(p, samples, bestQ);
  return best;
}

/** 道を つくる: 点（pathPts = x, z の 列。P.step ごと）と、道の まわりの 列ごとの 高さ（pathCells） */
export function buildPath(p: Params, px: number, pz: number, a0: number, dir: number): void {
  const P = T.path;
  const pts = spiralPts(px, pz, a0, spiralSteps(p, dir, (p.apex + 2) / P.k));
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
