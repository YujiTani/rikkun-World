import { SEA_Y, WILD_BLOCK, type BlockId } from '../../contracts';
import { takePath, type CountryKind } from './biome';
import { GEN_CONFIG as C } from './config';
import { nearMouth } from './mouths';
import { bambooRawHit, plantsOfChunk } from './plants';
import { hash01, subSeed } from './random';
import { regionRect } from './region';
import { terrainFor, type Terrain } from './terrain';

/**
 * 国だけの物 その 1（VOX-I-4a #187。docs/design/VOX-I.md §2.3・§8.3）。
 * 置く場所は (シード, 升目 cx, cz, type) の乱数だけで決まる → 作る順・ほかの列に 関係しない。ブロックは 作らない（場所だけ。
 * 世界に 置くのは countryFeatureBlocks.ts が チャンクごとに する）。読みこんでいない所でも 答える。
 * 6 種: はたけあと・きのこの わ（もり）・ひまわり・かいがら・たけのこ・つきみの いわ。
 * あとの PR（4b・4c）の 種類は 表 FEATURE_TYPES・OWNER・BUILDERS に 足す。
 */

export const FEATURE_TYPES = ['hatakeato', 'kinokoNoWa', 'himawari', 'kaigara', 'takenoko', 'tsukimiIwa'] as const;
export type FeatureType = (typeof FEATURE_TYPES)[number];

/** `window.__rikkun.biome.features` の 1 こ。x, y, z = その物の 基準の マス（§8.3） */
export interface CountryFeature {
  type: FeatureType;
  cx: number;
  cz: number;
  x: number;
  y: number;
  z: number;
}

export interface PlacedBlock {
  x: number;
  y: number;
  z: number;
  id: BlockId;
}

/** 置く 物 1 こ ぶん（場所 ＋ 置く ブロック ＋ 木・草花を どける 四角） */
export interface FeatureSite extends CountryFeature {
  blocks: PlacedBlock[];
  /** 足もとの 四角（x0, z0, x1, z1。両はし ふくむ）。この 中の 草花と、まわり TUNE.treeMargin 以内に みきが ある 木を どける */
  foot: readonly [number, number, number, number];
}

/** 数の表（単位は ブロック。仕様 §2.3 の 表と 同じ。ちがう 所は 理由を 書く） */
export const FEATURE_TUNE = {
  /** 点から これ以内に 置く（チェビシェフ）。つきみの いわ・はたけあと・きのこの わ = 32、ひまわり = 40、たけのこ = 40（道は 点から 88 まで のびる ので 点に 近い 所だけ。かいがらは 列で 56 + 16） */
  reach: { hatakeato: 32, kinokoNoWa: 32, himawari: 40, tsukimiIwa: 32, takenoko: 40 },
  /** 場所さがしの くり返し（1 升目・1 列 あたり。乱数の 番号を 進める） */
  tries: { hatakeato: 30, kinokoNoWa: 30, himawari: 80, kaigara: 16, tsukimiIwa: 30 },
  /** はたけあと: 4×4 の 平ら（最大 − 最小 の 高さ）の 上限・やせいの やさいの 本数 */
  hatakeato: { size: 4, flat: 1, veg: [3, 4] as const },
  /** きのこの わ: 7×7 の 平らの 上限・半径 3 の 8 か所に 立てる 本数（ゆるい 所は とばす） */
  kinoko: { size: 7, flat: 2, ring: 3, count: [6, 8] as const },
  /** ひまわり: 1 升目に 置く 数・まわり 3×3 の 平らの 上限・ひまわり どうしの はなす きょり（チェビシェフ） */
  himawari: { count: [3, 5] as const, flat: 1, gap: 4 },
  /** かいがら: 1 列（16×16）に 置く 数・海からの 高さ（すなの 上）。列は まん中が その 升目の 列 */
  kaigara: { perColumn: [2, 4] as const, above: [1, 7] as const, search: 56 },
  /** たけのこ: 1 升目の 数・どうしの はなす きょり・まわり 5×5 の たけの 本数の 下限。
   *  仕様は 12 本だが、道の マス（たけが 生えない）が 5×5 の 半分ちかくを しめる ので 12 本は 出ない（実測: 多い 所でも 1〜5 本）→ 多い 順に えらび、下限は 2 本に ゆるめた。verify = まず 安い ふるい（乱数だけ）で 上から これだけ に しぼってから 本当の たけを 数える */
  takenoko: { count: [1, 3] as const, gap: 8, window: 5, minBamboo: 2, verify: 5 },
  /** つきみの いわ: 7×7 の 平らの 上限・まるい 山の 直径と 高さ */
  tsukimi: { size: 7, flat: 3, diameter: [5, 7] as const, height: [3, 4] as const },
  /** スタートの まわり（チェビシェフ）・はじまりの 岩山の まわり・洞くつの 口の まわりには 置かない */
  startClear: 20,
  rockClear: 4,
  mouthClear: 3,
  /** はじまりの 範囲（regionRect 128×128。M7 の 農家・やせいの やさい・木・坑道の 口が 決まる 四角）の 中には 6 種とも 置かない。はたけあとは やせいの やさいを 持つので、M7 が 数える 読みこみの 輪に 入らないよう 四角の まわり さらに これだけ（ブロック）よける */
  farmClearWild: 64,
  /** 置く 所の みきが この きょり 以内の 木は どける（はっぱが 大木で 4 まで 出る ぶん） */
  treeMargin: 4,
} as const;

const B = C.biome;

/** 国 → その 国の 物の 基準の マスが 点から 離れる 最大（チェビシェフ）。四角に かからない 升目は 計算しない（ふるい）。置く 物が ない 国は 0 */
const KIND_REACH = {
  harappa: FEATURE_TUNE.reach.hatakeato,
  mori: FEATURE_TUNE.reach.kinokoNoWa,
  ookina: 0,
  hana: FEATURE_TUNE.reach.himawari,
  sunahama: FEATURE_TUNE.kaigara.search + 16,
  susuki: FEATURE_TUNE.reach.tsukimiIwa,
  take: FEATURE_TUNE.reach.takenoko,
  kappa: 0,
  iwayama: 0,
  tengu: 0,
  momiji: 0,
  yuki: 0,
} as const satisfies Record<CountryKind, number>;
const REACH_MAX = Math.max(...Object.values(KIND_REACH));

interface Ctx {
  T: Terrain;
  i: number;
  j: number;
  px: number;
  pz: number;
  kind: CountryKind;
}

const typeNo = (t: FeatureType): number => FEATURE_TYPES.indexOf(t);
const sTypes = new WeakMap<Terrain, number>();
const seedOf = (T: Terrain): number => {
  let s = sTypes.get(T);
  if (s === undefined) sTypes.set(T, (s = subSeed(T.seed, 1187)));
  return s;
};
/** 乱数（0 以上 1 未満）。(シード, 升目, type, k) だけで 決まる */
const rnd = (c: Ctx, t: FeatureType, k: number): number => hash01(seedOf(c.T), c.i, c.j, typeNo(t), k);
const range = (r: number, lo: number, hi: number): number => lo + Math.floor(r * (hi - lo + 1));

/**
 * (x, z) の 地面の 高さ（置けない 所は -1）。陸・top の ブロック・いけ でない・スタート／岩山／洞くつの 口から はなれている・
 * その 国の 升目の 中（境目 e < blend は だめ）・はじまりの 範囲（clear = さらに ひろげる ブロック数）。minAbove = 海からの 最低の 高さ
 */
function groundAt(c: Ctx, x: number, z: number, top: BlockId, minAbove: number = C.strata.landFrom, clear = 0): number {
  const T = c.T;
  const h = T.height(x, z);
  if (h < SEA_Y + minAbove || T.topBlock(x, z, h) !== top) return -1;
  if (T.map.pondAt(x, z) !== null || T.liquid.pondAt(x, z) !== null) return -1;
  const sp = T.spawn();
  if (Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z)) <= FEATURE_TUNE.startClear) return -1;
  if (inStartRegion(T, x, z, clear)) return -1;
  const rock = T.rock();
  if (Math.hypot(x - rock.cx, z - rock.cz) <= rock.r + FEATURE_TUNE.rockClear) return -1;
  if (nearMouth(T, x, z, FEATURE_TUNE.mouthClear)) return -1;
  const a = T.map.countryAt(x, z);
  if (a.kind !== c.kind || a.cx !== c.i || a.cz !== c.j || a.e < B.blend) return -1;
  return h;
}

/** はじまりの 範囲（regionRect）から margin だけ ひろげた 四角の 中か */
function inStartRegion(T: Terrain, x: number, z: number, margin: number): boolean {
  const r = regionRect(T.seed);
  return x >= r.x0 - margin && x < r.x1 + margin && z >= r.z0 - margin && z < r.z1 + margin;
}

/** 海の 中（または ごく あさい）の 列か。平らさを 調べる 前の 安い ふるい（海の 升目は ほとんどが ここで おちる） */
const isSea = (c: Ctx, x: number, z: number, above: number = C.strata.landFrom): boolean => c.T.height(x, z) < SEA_Y + above;

/** 四角 [x0, x0+w) × [z0, z0+w) の 高さの 差（最大 − 最小） */
function flatness(T: Terrain, x0: number, z0: number, w: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let dz = 0; dz < w; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const h = T.height(x0 + dx, z0 + dz);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  }
  return hi - lo;
}

const cheb = (ax: number, az: number, bx: number, bz: number): number => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

function site(c: Ctx, type: FeatureType, x: number, y: number, z: number, blocks: PlacedBlock[], foot: readonly [number, number, number, number]): FeatureSite {
  return { type, cx: c.i, cz: c.j, x, y, z, blocks, foot };
}

// ------------------------------------------------------------------ 1 種ずつ

/** はたけあと: 4×4 が ほぼ 平ら。上を ひくい 方に そろえて つち にし、やせいの やさいを 3〜4 本 */
function hatakeato(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.hatakeato;
  const R = FEATURE_TUNE.reach.hatakeato;
  for (let k = 0; k < FEATURE_TUNE.tries.hatakeato; k++) {
    const x0 = c.px + range(rnd(c, 'hatakeato', 2 * k), -R, R - K.size + 1);
    const z0 = c.pz + range(rnd(c, 'hatakeato', 2 * k + 1), -R, R - K.size + 1);
    if (isSea(c, x0, z0) || flatness(c.T, x0, z0, K.size) > K.flat) continue;
    const hs: number[] = [];
    let ok = true;
    for (let dz = 0; dz < K.size && ok; dz++) for (let dx = 0; dx < K.size && ok; dx++) {
      const h = groundAt(c, x0 + dx, z0 + dz, 'grass', C.strata.landFrom, FEATURE_TUNE.farmClearWild); // はたけあと = やせいの やさいを 持つ
      if (h < 0) ok = false;
      hs.push(h);
    }
    if (!ok) continue;
    const lo = Math.min(...hs);
    const blocks: PlacedBlock[] = [];
    const cells: { x: number; z: number }[] = [];
    hs.forEach((h, n) => {
      const x = x0 + (n % K.size);
      const z = z0 + Math.floor(n / K.size);
      if (h > lo) blocks.push({ x, y: h, z, id: 'air' }); // 高い 方の 上の くさは とる（上が ひくい 方に そろう）
      blocks.push({ x, y: lo, z, id: 'dirt' });
      cells.push({ x, z });
    });
    // やさい: マスを 乱数で ならべかえて 先頭から 3〜4 本（種類も 乱数）
    const order = cells.map((p, n) => ({ p, r: rnd(c, 'hatakeato', 1000 + n) })).sort((a, b) => a.r - b.r);
    const veg = Object.values(WILD_BLOCK);
    const n = range(rnd(c, 'hatakeato', 999), K.veg[0], K.veg[1]);
    for (let q = 0; q < n; q++) blocks.push({ x: order[q]!.p.x, y: lo + 1, z: order[q]!.p.z, id: veg[Math.floor(rnd(c, 'hatakeato', 2000 + q) * veg.length)]! });
    return [site(c, 'hatakeato', x0 + 1, lo + 1, z0 + 1, blocks, [x0, z0, x0 + K.size - 1, z0 + K.size - 1])];
  }
  return [];
}

/** きのこの わ: 7×7 が ほぼ 平ら。まん中から 半径 3 の 8 か所（たて・よこ 3 と ななめ 2,2）の 地面の 上に きのこ 6〜8 本 */
function kinokoNoWa(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.kinoko;
  const R = FEATURE_TUNE.reach.kinokoNoWa;
  const half = (K.size - 1) / 2;
  const ring: readonly (readonly [number, number])[] = [[K.ring, 0], [-K.ring, 0], [0, K.ring], [0, -K.ring], [2, 2], [2, -2], [-2, 2], [-2, -2]];
  for (let k = 0; k < FEATURE_TUNE.tries.kinokoNoWa; k++) {
    const mx = c.px + range(rnd(c, 'kinokoNoWa', 2 * k), -R, R);
    const mz = c.pz + range(rnd(c, 'kinokoNoWa', 2 * k + 1), -R, R);
    if (isSea(c, mx, mz) || flatness(c.T, mx - half, mz - half, K.size) > K.flat) continue;
    const hc = groundAt(c, mx, mz, 'grass');
    if (hc < 0) continue;
    const spots = ring.map(([dx, dz]) => ({ x: mx + dx, z: mz + dz })).map((p) => ({ ...p, h: groundAt(c, p.x, p.z, 'grass') })).filter((p) => p.h >= 0);
    const want = range(rnd(c, 'kinokoNoWa', 999), K.count[0], K.count[1]);
    if (spots.length < K.count[0]) continue;
    const pick = spots.map((p, n) => ({ p, r: rnd(c, 'kinokoNoWa', 1000 + n) })).sort((a, b) => a.r - b.r).slice(0, want);
    const blocks: PlacedBlock[] = pick.map(({ p }) => ({ x: p.x, y: p.h + 1, z: p.z, id: 'kinoko' }));
    return [site(c, 'kinokoNoWa', mx, hc + 1, mz, blocks, [mx - half, mz - half, mx + half, mz + half])];
  }
  return [];
}

/** ひまわり: 地面が くさ・上が あいている・まわり 3×3 が ほぼ 平ら。どうし 4 以上 はなす。1 升目に 3〜5（見つかった 数だけ） */
function himawari(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.himawari;
  const R = FEATURE_TUNE.reach.himawari;
  const out: FeatureSite[] = [];
  const want = range(rnd(c, 'himawari', 999), K.count[0], K.count[1]);
  for (let k = 0; k < FEATURE_TUNE.tries.himawari && out.length < want; k++) {
    const x = c.px + range(rnd(c, 'himawari', 2 * k), -R, R);
    const z = c.pz + range(rnd(c, 'himawari', 2 * k + 1), -R, R);
    if (out.some((s) => cheb(s.x, s.z, x, z) < K.gap)) continue;
    if (isSea(c, x, z) || flatness(c.T, x - 1, z - 1, 3) > K.flat) continue;
    const h = groundAt(c, x, z, 'grass');
    if (h < 0) continue;
    out.push(site(c, 'himawari', x, h + 1, z, [{ x, y: h + 1, z, id: 'himawari' }, { x, y: h + 2, z, id: 'himawari_top' }], [x, z, x, z]));
  }
  return out;
}

/** かいがら: 1 列（16×16）に 2〜4 こ。すなの 上（海から +1〜+7）。列は まん中が その 升目の 列だけ（となりの 升目と かさならない） */
function kaigara(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.kaigara;
  const out: FeatureSite[] = [];
  for (let kz = (c.pz - K.search) >> 4; kz <= (c.pz + K.search) >> 4; kz++) {
    for (let kx = (c.px - K.search) >> 4; kx <= (c.px + K.search) >> 4; kx++) {
      const a = c.T.map.countryAt(kx * 16 + 8, kz * 16 + 8);
      if (a.kind !== c.kind || a.cx !== c.i || a.cz !== c.j) continue;
      if (isSea(c, kx * 16 + 8, kz * 16 + 8, K.above[0]) && isSea(c, kx * 16, kz * 16, K.above[0]) && isSea(c, kx * 16 + 15, kz * 16 + 15, K.above[0])) continue; // 列が 3 点とも 海なら とばす
      const colNo = (kz + 1000) * 4001 + (kx + 1000); // 乱数の 番号を 列ごとに わける
      const want = range(rnd(c, 'kaigara', colNo * 100 + 99), K.perColumn[0], K.perColumn[1]);
      const mine: FeatureSite[] = [];
      for (let k = 0; k < FEATURE_TUNE.tries.kaigara && mine.length < want; k++) {
        const x = kx * 16 + Math.floor(rnd(c, 'kaigara', colNo * 100 + 2 * k) * 16);
        const z = kz * 16 + Math.floor(rnd(c, 'kaigara', colNo * 100 + 2 * k + 1) * 16);
        if (mine.some((s) => s.x === x && s.z === z)) continue;
        const h = groundAt(c, x, z, 'sand', K.above[0]);
        if (h < 0 || h > SEA_Y + K.above[1]) continue;
        mine.push(site(c, 'kaigara', x, h + 1, z, [{ x, y: h + 1, z, id: 'kaigara' }], [x, z, x, z]));
      }
      out.push(...mine);
    }
  }
  return out;
}

/** たけのこ: 道の マスの うち、まわり 5×5 の たけが 多い 所（やぶの おく）。どうし 8 以上 はなす。1 升目に 1〜3（見つかった 数だけ） */
function takenoko(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.takenoko;
  // 陸の マスだけ のこす（海の 升目は ここで 空に なり、たけの しらべを しない）
  const path = takePath(c.T.seed, c.i, c.j).filter((p) => cheb(p.x, p.z, c.px, c.pz) <= FEATURE_TUNE.reach.takenoko && !isSea(c, p.x, p.z));
  if (path.length === 0) return [];
  const half = (K.window - 1) / 2;
  const key = (x: number, z: number): number => (x + 100000) * 200003 + (z + 100000);
  // ① 安い ふるい: たけの こうほ（乱数だけ）が 5×5 に 多い 順に 上から K.verify こ（どうし 近すぎない）
  const rough = path
    .map((p, n) => {
      let score = 0;
      for (let dz = -half; dz <= half; dz++) for (let dx = -half; dx <= half; dx++) if (bambooRawHit(c.T.seed, p.x + dx, p.z + dz)) score++;
      return { p, n, score };
    })
    .sort((a, b) => b.score - a.score || a.n - b.n);
  const near: typeof rough = [];
  for (const r of rough) {
    if (near.length >= K.verify) break;
    if (near.every((u) => cheb(u.p.x, u.p.z, r.p.x, r.p.z) >= K.gap)) near.push(r);
  }
  // ② 本当の たけ（間隔・地形の あと）を 数える（その 5×5 の まわりの 列だけ 読む）
  const bamboo = new Set<number>();
  const seen = new Set<number>();
  for (const { p } of near) {
    for (let kz = (p.z - half) >> 4; kz <= (p.z + half) >> 4; kz++) {
      for (let kx = (p.x - half) >> 4; kx <= (p.x + half) >> 4; kx++) {
        const ck = key(kx, kz);
        if (seen.has(ck)) continue;
        seen.add(ck);
        for (const q of plantsOfChunk(c.T, kx, kz)) if (q.height > 1) bamboo.add(key(q.x, q.z)); // 高さ 4〜7 = たけ（はな・すすきは 1）
      }
    }
  }
  const start = Math.floor(rnd(c, 'takenoko', 0) * path.length);
  const cand: { x: number; z: number; h: number; score: number; order: number }[] = [];
  for (const { p, n } of near) {
    let score = 0;
    for (let dz = -half; dz <= half; dz++) for (let dx = -half; dx <= half; dx++) if (bamboo.has(key(p.x + dx, p.z + dz))) score++;
    if (score < K.minBamboo) continue;
    const h = groundAt(c, p.x, p.z, 'grass');
    if (h >= 0) cand.push({ x: p.x, z: p.z, h, score, order: (n + path.length - start) % path.length });
  }
  cand.sort((a, b) => b.score - a.score || a.order - b.order);
  const want = range(rnd(c, 'takenoko', 1), K.count[0], K.count[1]);
  const out: FeatureSite[] = [];
  for (const p of cand) {
    if (out.length >= want) break;
    if (out.some((s) => cheb(s.x, s.z, p.x, p.z) < K.gap)) continue;
    out.push(site(c, 'takenoko', p.x, p.h + 1, p.z, [{ x: p.x, y: p.h + 1, z: p.z, id: 'takenoko' }], [p.x, p.z, p.x, p.z]));
  }
  return out;
}

/** つきみの いわ: 7×7 が ほぼ 平ら（3 以下）。いしの まるい 山（直径 5〜7・高さ 3〜4）。まん中の 地面の 上から つむ */
function tsukimiIwa(c: Ctx): FeatureSite[] {
  const K = FEATURE_TUNE.tsukimi;
  const R = FEATURE_TUNE.reach.tsukimiIwa;
  const half = (K.size - 1) / 2;
  for (let k = 0; k < FEATURE_TUNE.tries.tsukimiIwa; k++) {
    const mx = c.px + range(rnd(c, 'tsukimiIwa', 2 * k), -R, R);
    const mz = c.pz + range(rnd(c, 'tsukimiIwa', 2 * k + 1), -R, R);
    if (isSea(c, mx, mz) || flatness(c.T, mx - half, mz - half, K.size) > K.flat) continue;
    const hc = groundAt(c, mx, mz, 'grass');
    if (hc < 0) continue;
    const d = range(rnd(c, 'tsukimiIwa', 999), K.diameter[0], K.diameter[1]);
    const top = range(rnd(c, 'tsukimiIwa', 998), K.height[0], K.height[1]);
    const rr = d / 2 + 0.5; // 山の 半径（ふちで 高さ 0）
    const blocks: PlacedBlock[] = [];
    let ok = true;
    for (let dz = -half; dz <= half && ok; dz++) {
      for (let dx = -half; dx <= half && ok; dx++) {
        const q = (dx * dx + dz * dz) / (rr * rr);
        if (q >= 1) continue;
        const ht = Math.round(top * (1 - q));
        if (ht < 1) continue;
        const h = groundAt(c, mx + dx, mz + dz, 'grass');
        if (h < 0) {
          ok = false;
          break;
        }
        for (let y = h + 1; y <= hc + ht; y++) blocks.push({ x: mx + dx, y, z: mz + dz, id: 'stone' });
      }
    }
    if (!ok) continue;
    return [site(c, 'tsukimiIwa', mx, hc + 1, mz, blocks, [mx - half, mz - half, mx + half, mz + half])];
  }
  return [];
}

/** 国 → 置く 物を さがす 関数（その 国に 置く 物が なければ null）。足し忘れは 型エラー */
const BUILDERS = {
  harappa: hatakeato,
  mori: kinokoNoWa,
  ookina: null, // 4c: ぬしの木・うろ
  hana: himawari,
  sunahama: kaigara, // 4c: しま
  susuki: tsukimiIwa,
  take: takenoko,
  kappa: null, // 4c: はすの は
  iwayama: null, // 4b: すいしょう
  tengu: null, // 4b: かいだん・とうろう
  momiji: null, // 4b: おちば・おおもみじ
  yuki: null, // 4b: ゆきだるま
} as const satisfies Record<CountryKind, ((c: Ctx) => FeatureSite[]) | null>;

// ------------------------------------------------------------------ 窓口

const MAX_CELLS = 600;
const memo = new WeakMap<Terrain, Map<number, FeatureSite[]>>();

/** 升目 (i, j) に 置く 物（覚える。Terrain を 作りなおすと 覚えも 空） */
export function sitesOfCell(T: Terrain, i: number, j: number): FeatureSite[] {
  let m = memo.get(T);
  if (!m) memo.set(T, (m = new Map()));
  const key = (i + 50000) * 100003 + (j + 50000);
  const hit = m.get(key);
  if (hit) return hit;
  const cell = T.map.cell(i, j);
  const build = cell.mountain || cell.startForced ? null : BUILDERS[cell.kind];
  const out = build ? build({ T, i, j, px: cell.px, pz: cell.pz, kind: cell.kind }) : [];
  if (m.size >= MAX_CELLS) m.delete(m.keys().next().value as number);
  m.set(key, out);
  return out;
}

/** 四角 [x0, x1] × [z0, z1]（ふくむ）の 基準の マスが 入る 物 */
export function featureSitesInRect(seed: number, x0: number, z0: number, x1: number, z1: number): FeatureSite[] {
  const T = terrainFor(seed);
  const R = REACH_MAX;
  const cell = B.cell;
  const out: FeatureSite[] = [];
  // 升目 i の 点は [i × cell + pointMin, i × cell + pointMin + pointSpan) → 物は その ± R の 中
  const i0 = Math.floor((x0 - R - B.pointMin - B.pointSpan - C.anchor.x) / cell);
  const i1 = Math.floor((x1 + R - B.pointMin - C.anchor.x) / cell);
  const j0 = Math.floor((z0 - R - B.pointMin - B.pointSpan - C.anchor.z) / cell);
  const j1 = Math.floor((z1 + R - B.pointMin - C.anchor.z) / cell);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cell = T.map.cell(i, j);
      const r = KIND_REACH[cell.kind];
      if (r === 0 || cell.px + r < x0 || cell.px - r > x1 || cell.pz + r < z0 || cell.pz - r > z1) continue;
      for (const s of sitesOfCell(T, i, j)) if (s.x >= x0 && s.x <= x1 && s.z >= z0 && s.z <= z1) out.push(s);
    }
  }
  return out;
}

/** window.__rikkun.biome.features: 四角の 中の 国だけの 物（VOX-I §8.3）。生成と 同じ 場所 */
export function featuresInRect(seed: number, x0: number, z0: number, x1: number, z1: number): CountryFeature[] {
  return featureSitesInRect(seed, x0, z0, x1, z1).map(({ type, cx, cz, x, y, z }) => ({ type, cx, cz, x, y, z }));
}
