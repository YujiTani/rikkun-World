import { SEA_Y, type BlockId } from '../../contracts';
import type { CountryKind } from './biome';
import { GEN_CONFIG as C } from './config';
import { nearMouth } from './mouths';
import { hash01, subSeed } from './random';
import { regionRect } from './region';
import type { Terrain } from './terrain';

/**
 * 国だけの物の 道具箱（VOX-I-4a・4b #187）。種類の 名前・数の 表・場所さがしの 道具。countryFeatures.ts（窓口）と、
 * 山の物（countryMountain.ts・countryKaidan.ts）が 同じ 道具を 使う ために、ここに おく（ほかの ファイルを import しない = 輪に ならない）。
 */

export const FEATURE_TYPES = ['hatakeato', 'kinokoNoWa', 'himawari', 'kaigara', 'takenoko', 'tsukimiIwa', 'suisho', 'touro', 'kaidan', 'oomomiji', 'yukidaruma',
  // 山の上の 目じるし（`?structures=1` の ときだけ。うしろに 足す = 乱数の 番号を ずらさない）
  'torii', 'odou', 'ishidan', 'azumaya', 'yagura', 'ido', 'ojizou', 'hokora', 'sekizou', 'ishi_torii',
  // 水の 景色（`?water=v2` の ときだけ。滝 = 水源の 池・滝つぼ、川、池）
  'taki', 'kawa', 'ike'] as const;
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
  /** 木・草花を どける 四角を 1 つ ずつ 書く とき（かいだん = 1 歩ごと）。なければ foot だけ */
  rects?: readonly (readonly [number, number, number, number])[];
  /** この 物の まわり これだけ 以内に みきが ある 木を どける（なければ FEATURE_TUNE.treeMargin） */
  margin?: number;
  /** かいだん: 道の 床の ブロック（頂上がわの はしから すそへ。1 歩に 2 マス） */
  path?: readonly { x: number; y: number; z: number }[];
}

/** 山の物の 数の表（4b。単位は ブロック。仕様 §2.3 の 表と 同じ。ちがう 所は 理由を 書く） */
export const MOUNTAIN_TUNE = {
  /** 「頂上」を さがす はんい（山の点から。チェビシェフ） */
  summitReach: 6,
  /** 物を 置く 高さの 上限（ブロックの y。これを こえる 時は 頂上の まわりで さがす。世界の 高さ 352 より かなり 下） */
  maxY: 270,
  /** 頂上に 置けない 時に さがす はんい（頂上から。チェビシェフ）: とうろう・ゆきだるま = 3、おおもみじ = 6 */
  fallback: { touro: 3, yukidaruma: 3, oomomiji: 6 },
  /** すいしょう: 山の点から 40 以内・海から +40 以上・1 山に 2〜4・どうし 4 以上・くぼみ（4 方向の となりの うち 1 段以上 高い 数）2 以上・くぼみ さがしの 回数・たりない 時に いしの 上で うめる 回数・まわりの 木を どける きょり */
  suisho: { reach: 40, above: 40, count: [2, 4] as const, gap: 4, hollowSides: 2, hollowDrop: 1, tries: 160, fillTries: 240, treeMargin: 1 },
  /** おおもみじ: みき 2×2（高さ 10〜12）・2×2 の 平らの 上限・ほかの 木を どける きょり 6・おちばを しく はんい（みきから 3）。
   *  はっぱ = 上から 数えた 段（みきの いちばん 上 = 0）と その 半径: 上へ 2 つ・下へ 4 つ の まるい かたまり */
  oomomiji: { trunk: [10, 12] as const, flat: 1, treeMargin: 6, ochiba: 3, crown: [[-4, 3], [-3, 5], [-2, 5], [-1, 5], [0, 4], [1, 3], [2, 1]] as const },
  /** かいだん: はば 2・とうろうの そば から 何マス はなして はじめるか・1 歩の 高さの 差の 上限・地面から うめる／けずる 上限・
   *  道の 長さ（歩）の 下限と 上限・海に ついたと みなす 高さ（海から）・上の 空気 3 */
  kaidan: { width: 2, startGap: 2, stepMax: 1, cutFill: 4, minSteps: 8, maxSteps: 100, shore: 2, air: 3 },
} as const;

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
  /** 山の物（4b）の 数の 表 */
  mountain: MOUNTAIN_TUNE,
} as const;


const B = C.biome;

export interface Ctx {
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
export const rnd = (c: Ctx, t: FeatureType, k: number): number => hash01(seedOf(c.T), c.i, c.j, typeNo(t), k);
export const range = (r: number, lo: number, hi: number): number => lo + Math.floor(r * (hi - lo + 1));

/**
 * (x, z) の 地面の 高さ（置けない 所は -1）。陸・top の ブロック・いけ でない・スタート／岩山／洞くつの 口から はなれている・
 * その 国の 升目の 中（境目 e < blend は だめ）・はじまりの 範囲（clear = さらに ひろげる ブロック数）。minAbove = 海からの 最低の 高さ
 */
export function groundAt(c: Ctx, x: number, z: number, top: BlockId | null, minAbove: number = C.strata.landFrom, clear = 0): number {
  const T = c.T;
  const h = T.height(x, z);
  if (h < SEA_Y + minAbove || (top !== null && T.topBlock(x, z, h) !== top)) return -1;
  if (!plainAt(c, x, z, clear)) return -1;
  const a = T.map.countryAt(x, z);
  if (a.kind !== c.kind || a.cx !== c.i || a.cz !== c.j || a.e < B.blend) return -1;
  return h;
}

/** (x, z) は いけ・スタートの そば・はじまりの 範囲・はじまりの 岩山・洞くつの 口の そば の どれでも ない か（物を 置いても よい 列か） */
export function plainAt(c: Ctx, x: number, z: number, clear = 0): boolean {
  const T = c.T;
  if (T.map.pondAt(x, z) !== null || T.liquid.pondAt(x, z) !== null) return false;
  const sp = T.spawn();
  if (Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z)) <= FEATURE_TUNE.startClear) return false;
  if (inStartRegion(T, x, z, clear)) return false;
  const rock = T.rock();
  if (Math.hypot(x - rock.cx, z - rock.cz) <= rock.r + FEATURE_TUNE.rockClear) return false;
  return !nearMouth(T, x, z, FEATURE_TUNE.mouthClear);
}


/** はじまりの 範囲（regionRect）から margin だけ ひろげた 四角の 中か */
function inStartRegion(T: Terrain, x: number, z: number, margin: number): boolean {
  const r = regionRect(T.seed);
  return x >= r.x0 - margin && x < r.x1 + margin && z >= r.z0 - margin && z < r.z1 + margin;
}

/** 海の 中（または ごく あさい）の 列か。平らさを 調べる 前の 安い ふるい（海の 升目は ほとんどが ここで おちる） */
export const isSea = (c: Ctx, x: number, z: number, above: number = C.strata.landFrom): boolean => c.T.height(x, z) < SEA_Y + above;

/** 四角 [x0, x0+w) × [z0, z0+w) の 高さの 差（最大 − 最小） */
export function flatness(T: Terrain, x0: number, z0: number, w: number): number {
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

export const cheb = (ax: number, az: number, bx: number, bz: number): number => Math.max(Math.abs(ax - bx), Math.abs(az - bz));

export function site(c: Ctx, type: FeatureType, x: number, y: number, z: number, blocks: PlacedBlock[], foot: readonly [number, number, number, number], extra: Pick<FeatureSite, 'rects' | 'margin' | 'path'> = {}): FeatureSite {
  return { type, cx: c.i, cz: c.j, x, y, z, blocks, foot, ...extra };
}


// ------------------------------------------------------------------ 山の 頂上

export interface Summit {
  x: number;
  z: number;
  /** 地面の 高さ（いちばん 上の ブロックの y） */
  h: number;
}

/** 頂上 = 山の点から summitReach 以内で いちばん 高い 列（同じなら 点に 近い 方）。置けない 列（海・いけ・スタートの そば など）は とばす。なければ null */
export function summitOf(c: Ctx): Summit | null {
  const R = MOUNTAIN_TUNE.summitReach;
  let best: Summit | null = null;
  let bestD = Infinity;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      const x = c.px + dx;
      const z = c.pz + dz;
      const h = groundAt(c, x, z, null);
      if (h < 0) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (best === null || h > best.h || (h === best.h && d < bestD)) {
        best = { x, z, h };
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * 頂上に 高さ need（いちばん 上の ブロックの y = 地面 + need）の 物を 置く 場所。上限 maxY を こえなければ 頂上。
 * こえる 時は 頂上から fall 以内で 置ける いちばん 高い 所（同じなら 頂上に 近い 方）。なければ null
 */
export function standingSpot(c: Ctx, s: Summit, need: number, fall: number): Summit | null {
  if (s.h + need <= MOUNTAIN_TUNE.maxY) return s;
  let best: Summit | null = null;
  let bestD = Infinity;
  for (let dz = -fall; dz <= fall; dz++) {
    for (let dx = -fall; dx <= fall; dx++) {
      const h = groundAt(c, s.x + dx, s.z + dz, null);
      if (h < 0 || h + need > MOUNTAIN_TUNE.maxY) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dz));
      if (best === null || h > best.h || (h === best.h && d < bestD)) {
        best = { x: s.x + dx, z: s.z + dz, h };
        bestD = d;
      }
    }
  }
  return best;
}
