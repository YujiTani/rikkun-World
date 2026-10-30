import { blockHash, carved, dentable, mix, shapeKind } from './common';
import { ALL_FACES, FACE_BIT, LOOK_N, LOOK_VOLUME, type GrainSpec, type KindSpec } from './types';

/**
 * MINE-1B（#349）の 見た目: 鉱石 = B「とびだす つぶ」、ブロック（ねんど・せっかいせき）= A「ごつごつ」。
 * 見本と 数の もとは アート `docs/art/design/07-mine.md` 20.2・20.5 と、描いた プログラム `docs/art/mine-1/proto/`
 * （`designs.py.txt` の `grain_block`・`opt_b` の ○○_layout、`base.py.txt` の carved・face_xyz）。同じ たね・同じ ハッシュなので、
 * 同じ 場所では 見本と 同じ 形（`mineLooks.test.ts` が 見本の プログラムが 出した 値と くらべる）。
 *
 * B: 見える 面ごとに、がらを 3 つの 中から ブロックの 位置の ハッシュで 1 つ えらび、つぶを 表面の 層に のこして、つぶの まわり 1 小ブロックの
 *    表面を ほる（みぞ。角の 暗がり（AO）で 影に なる）。つぶの 下の 層にも つぶの こい 色を ぬる。ほかの 石は 地の 石の ほり方（4・2）。
 *    色は 小ブロックごと（TEX-A「色は 絵の 投影だけ」の 例外。鉱石の つぶ だけ）: 格子には `KindSpec.grains` の 色番号が 入り、
 *    meshing（sectionMesher）が つぶの 番号に 直して シェーダー（voxelMaterial）が 色を ぬる。16 ブロックより 遠くは 平らな 絵。
 * A: ねんど = いまの つち と 同じ 4・2・5、せっかいせき = いまの いしと 同じ 6・3・7。
 */
const N = LOOK_N;
const M = N - 1;

// ---- 色（07-mine.md 20.2・20.5 の 表）
const COAL = ['#5E5869', '#3A3442', '#2B2632'] as const; // 光 → 地 → 下の 層
const IRON = ['#CC8452', '#A85E38', '#82462A'] as const;
const GOLD = ['#FFF0B4', '#EBB840', '#C98A1E'] as const;
const CRYSTAL = ['#E0F7FC', '#8CDAF2', '#55A6D2'] as const;
const HOTARU = ['#EEF8B2', '#C9E56E', '#93BD52'] as const; // 芯 → わの 十字 → わの かど
const HOTARU_GLOW = [1.0, 0.85, 0.55] as const; // 光る 強さ（自分の 明るさ。面の 明るさ・AO を かけない）
const SLATE = '#5E6672'; // ほたるいしの 地（こい 青灰。まだらは 平らな 絵だけ）
const DIAMOND = ['#FBFDFF', '#E3E8F8', '#AEB6DE', '#7880B8', '#FFD3EA', '#FFF1B0'] as const; // 光 → 地 → かげ → 下の 層 → ピンク → きいろ
const CLAY = ['#B07048', '#C4845A', '#975F3D', '#6E4630'] as const; // 外がわ 2 色・1 段内・2 段より内
const LIME = ['#D3CCBE', '#DED8CC', '#BAB1A0', '#8F8777'] as const;

/** がらを 決める ハッシュ（hf）から 1 面ぶんの 「つぶ」〔u, v, 深さ d, 材料 k の 4 つ組〕と 「ほる」〔u, v, d の 3 つ組〕 */
interface Plan {
  /** [u, v, d, k, u, v, d, k, …]。k = 材料の 番号（2 から。proto の mats の 並び） */
  vox: number[];
  /** [u, v, d, u, v, d, …]（つぶ ではなく ほって 空に する マス） */
  pits: number[];
}
type Layout = (hf: number) => Plan;

const pick = <T>(hf: number, variants: readonly T[]): T => variants[hf % variants.length]!;

/** せきたん: うすい 板（3×1）が 3 まい かさなる（よこの すじ）。左はしの 1 マスが つや */
const coalLayout: Layout = (hf) => {
  const vs = pick(hf, [[[1, 1], [5, 4], [1, 6]], [[4, 1], [0, 4], [5, 7]], [[2, 2], [6, 4], [1, 6]]] as const);
  const vox: number[] = [];
  for (const [u0, v0] of vs) {
    for (let i = 0; i < 3; i++) vox.push(u0! + i, v0!, 0, i === 0 ? 2 : 3, u0! + i, v0!, 1, 4);
  }
  return { vox, pits: [] };
};

/** てつ: まるい こぶ（3×3 の 中の ＋ の 形。まん中が 光）が 2 つ */
const ironLayout: Layout = (hf) => {
  const vs = pick(hf, [[[1, 1], [5, 4]], [[4, 0], [0, 5]], [[1, 5], [5, 1]]] as const);
  const vox: number[] = [];
  for (const [u0, v0] of vs) {
    vox.push(u0! + 1, v0! + 1, 0, 2);
    for (const [du, dv] of [[1, 0], [0, 1], [2, 1], [1, 2]] as const) vox.push(u0! + du, v0! + dv, 0, 3);
    for (let du = 0; du < 3; du++) for (let dv = 0; dv < 3; dv++) vox.push(u0! + du, v0! + dv, 1, 4);
  }
  return { vox, pits: [] };
};

/** きんの いし: 小さな 粒 3 つ（2×2・2×2 か 1×1）。左上の 1 マスが 光 */
const goldLayout: Layout = (hf) => {
  const vs = pick(hf, [[[1, 1, 2], [5, 5, 2], [2, 6, 1]], [[5, 1, 2], [2, 3, 1], [1, 6, 2]], [[3, 2, 2], [6, 6, 1], [1, 5, 2]]] as const);
  const vox: number[] = [];
  for (const [u0, v0, s] of vs) {
    for (let du = 0; du < s!; du++) {
      for (let dv = 0; dv < s!; dv++) vox.push(u0! + du, v0! + dv, 0, du === 0 && dv === 0 ? 2 : 3, u0! + du, v0! + dv, 1, 4);
    }
  }
  return { vox, pits: [] };
};

/** すいしょうの いし: 6×6 の くぼみ（かどは のこす・ふかさ 2）の 中から 2×2 の 太い はしら（先が 光）＋ 1×1 の 細い はしら 3 本（1 本は 表面まで） */
const crystalLayout: Layout = (hf) => {
  const [u0, v0] = pick(hf, [[1, 1], [3, 2], [2, 3]] as const);
  const vox: number[] = [];
  const pits: number[] = [];
  for (let du = -1; du < 5; du++) {
    for (let dv = -1; dv < 5; dv++) {
      if ((du === -1 || du === 4) && (dv === -1 || dv === 4)) continue;
      pits.push(u0! + du, v0! + dv, 0, u0! + du, v0! + dv, 1);
    }
  }
  for (let du = 0; du < 2; du++) for (let dv = 0; dv < 2; dv++) vox.push(u0! + du, v0! + dv, 1, 3, u0! + du, v0! + dv, 2, 4);
  vox.push(u0!, v0!, 0, 2, u0! + 1, v0!, 0, 3);
  for (const [du, dv, top] of [[3, 0, 0], [2, 3, 1], [0, 3, 1]] as const) {
    for (let dd = top; dd < 3; dd++) vox.push(u0! + du, v0! + dv, dd, dd === top ? 2 : dd === 1 ? 3 : 4);
  }
  return { vox, pits };
};

/** ほたるいし: ほたるの むれ。芯 1 マス（とびだす）＋ 下の 3×3 が 光る わ（十字 3、かど 4）。1 面に 5 つ */
const hotaruLayout: Layout = (hf) => {
  const vs = pick(hf, [[[1, 1], [5, 2], [2, 5], [6, 6], [4, 7]], [[2, 1], [6, 1], [1, 4], [5, 5], [2, 7]], [[1, 2], [4, 1], [7, 3], [3, 5], [6, 7]]] as const);
  const vox: number[] = [];
  for (const [u0, v0] of vs) {
    vox.push(u0!, v0!, 0, 2);
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) vox.push(u0! + du, v0! + dv, 1, du === 0 || dv === 0 ? 3 : 4);
  }
  return { vox, pits: [] };
};

/** ダイヤの いし: ひし形の 石 1 つ（|u|＋|v| ≦ 2 の 13 マス）＋ 1×1 の かけら 1 つ。まわりの みぞだけ 2 だん（石が 2 小ブロック 立つ） */
const diamondLayout: Layout = (hf) => {
  const [[cu, cv], [pu, pv]] = pick(hf, [[[3, 3], [7, 7]], [[5, 4], [1, 7]], [[4, 5], [7, 1]]] as const);
  const vox: number[] = [];
  const pits: number[] = [];
  const inGem = (du: number, dv: number): boolean => Math.abs(du) + Math.abs(dv) <= 2;
  for (let du = -2; du <= 2; du++) {
    for (let dv = -2; dv <= 2; dv++) {
      if (!inGem(du, dv)) continue;
      const s = du + dv;
      let k = s < 0 ? 2 : s > 0 ? 4 : 3; // 左上 = 光・ななめの 列 = 地・右下 = かげ
      if (du === 1 && dv === -1) k = 6; // ピンクの きらっ
      if (du === -1 && dv === 1) k = 7; // きいろの きらっ
      if (du === -1 && dv === -1) k = 2;
      vox.push(cu! + du, cv! + dv, 0, k, cu! + du, cv! + dv, 1, 5); // 下の 層 = こい むらさき（みぞの 横から 見える ふち）
    }
  }
  for (let du = -3; du <= 3; du++) {
    for (let dv = -3; dv <= 3; dv++) {
      if (inGem(du, dv)) continue;
      let near = false;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (inGem(du + a, dv + b)) near = true;
      if (near) pits.push(cu! + du, cv! + dv, 1); // みぞを 2 だんに
    }
  }
  vox.push(pu!, pv!, 0, 2, pu!, pv!, 1, 5);
  return { vox, pits };
};

/** 面 f の (u, v, 深さ d) → ブロックの 中の 番号 (y * 9 + z) * 9 + x（proto base.py の face_xyz） */
function cellOf(f: number, u: number, v: number, d: number): number {
  let x: number;
  let y: number;
  let z: number;
  switch (f) {
    case 0:
      x = u; y = M - d; z = v;
      break;
    case 1:
      x = u; y = d; z = M - v;
      break;
    case 2:
      x = M - d; y = M - v; z = M - u;
      break;
    case 3:
      x = d; y = M - v; z = u;
      break;
    case 4:
      x = u; y = M - v; z = M - d;
      break;
    default:
      x = M - u; y = M - v; z = d;
  }
  return (y * N + z) * N + x;
}

/** 作業用（fill は 同時に 1 つしか 動かない。毎回 新しい 配列を 作らない） */
const grainAt = new Uint8Array(LOOK_VOLUME);
const carveAt = new Uint8Array(LOOK_VOLUME);
/** つぶの d=0 の 位置（u, v は -4〜12 まで 受ける） */
const OCC_W = 17;
const OCC_OFF = 4;
const occ0 = new Uint8Array(OCC_W * OCC_W);

/**
 * B の 1 ブロック: 見える 面ごとに がらを 置き、つぶの まわりを ほり、のこりの 石を (rate, deep) で ほる。
 * body = 地の 石の 色番号、mats[k - 2] = 材料 k の 色番号。
 */
function fillGrains(salt: number, layout: Layout, rate: number, deep: number, body: number, mats: readonly number[], bx: number, by: number, bz: number, e: number, out: Uint8Array): void {
  const h = blockHash(salt, bx, by, bz);
  grainAt.fill(0);
  carveAt.fill(0);
  for (let f = 0; f < 6; f++) {
    if (!(e & FACE_BIT[f]!)) continue;
    const { vox, pits } = layout(mix(h, 31 + f));
    occ0.fill(0);
    for (let i = 0; i < vox.length; i += 4) {
      const u = vox[i]!;
      const v = vox[i + 1]!;
      if (u >= 0 && u < N && v >= 0 && v < N) grainAt[cellOf(f, u, v, vox[i + 2]!)] = vox[i + 3]!;
      if (vox[i + 2] === 0) occ0[(u + OCC_OFF) * OCC_W + v + OCC_OFF] = 1;
    }
    // つぶの まわり 1 マス（外がわの 層）を ほる
    for (let u = -OCC_OFF; u < OCC_W - OCC_OFF; u++) {
      for (let v = -OCC_OFF; v < OCC_W - OCC_OFF; v++) {
        if (occ0[(u + OCC_OFF) * OCC_W + v + OCC_OFF] === 0) continue;
        for (let du = -1; du <= 1; du++) {
          for (let dv = -1; dv <= 1; dv++) {
            const uu = u + du;
            const vv = v + dv;
            if (uu >= 0 && uu < N && vv >= 0 && vv < N && occ0[(uu + OCC_OFF) * OCC_W + vv + OCC_OFF] === 0) carveAt[cellOf(f, uu, vv, 0)] = 1;
          }
        }
      }
    }
    for (let i = 0; i < pits.length; i += 3) {
      const u = pits[i]!;
      const v = pits[i + 1]!;
      if (u >= 0 && u < N && v >= 0 && v < N) carveAt[cellOf(f, u, v, pits[i + 2]!)] = 1;
    }
  }
  const solidOnly = e === ALL_FACES; // 3D テクスチャ用: 穴を あけない（common.ts の shapeKind と 同じ）
  let i = 0;
  for (let y = 0; y < N; y++) {
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++, i++) {
        const k = grainAt[i]!;
        out[i] = k >= 2 ? mats[k - 2]! : !solidOnly && dentable(x, y, z, e) && (carveAt[i] === 1 || carved(x, y, z, e, h, rate, deep, 0)) ? 0 : body;
      }
    }
  }
}

/**
 * 型（kata.ts）の かわりに この 種類の 中で とっておく。kata の 表は 決定どおりで 足せない ため。
 * （見える面 × 型の番号）ごとに 1 回だけ 作り、場所の ハッシュで 型を えらぶ。3D テクスチャ（ALL_FACES）は 場所のまま 作る。
 */
function cachedKind(spec: KindSpec, variants: number, salt: number): KindSpec {
  const cache = new Map<number, Uint8Array>();
  return {
    ...spec,
    fill: (bx, by, bz, exposed, out) => {
      if (exposed === ALL_FACES) {
        spec.fill(bx, by, bz, exposed, out);
        return;
      }
      const v = blockHash(salt, bx, by, bz) % variants;
      const key = exposed * variants + v;
      let t = cache.get(key);
      if (!t) {
        t = new Uint8Array(LOOK_VOLUME);
        spec.fill(-50000 - v, -7, 0, exposed, t); // 型 v は ありえない 遠くの 位置の 形（kata.ts と 同じ 約束）
        cache.set(key, t);
      }
      out.set(t);
    },
  };
}

/** 外がわの 2 色（3×3 の まだら）・1 段内・2 段より内 */
function layeredColor(c: readonly number[], x: number, y: number, z: number, h: number): number {
  const d = Math.min(x, M - x, y, M - y, z, M - z);
  if (d >= 2) return c[3]!;
  if (d === 1) return c[2]!;
  return mix(h, ((y / 3) | 0) * 9 + ((z / 3) | 0) * 3 + ((x / 3) | 0)) % 3 === 0 ? c[1]! : c[0]!;
}

/** 鉱石の 地の 石の ほり方（つちと 同じ 4・2。07-mine.md 20.2「まぜた 見本で 直した」） */
const ROCK_RATE = 4;
const ROCK_DEEP = 2;
/** 型の 数（kata.ts の 石・つち と そろえた） */
const ORE_VARIANTS = 8;
const CLAY_VARIANTS = 4;
const LIME_VARIANTS = 8;
/** 型を えらぶ ハッシュの たね（形の たねとは べつ） */
const PICK_SALT = 9100;

/**
 * 鉱石・ブロックの 見た目。P = パレットに 色を 入れて 色番号を 返す 関数。body = 地の 石の 色番号。variants = false なら 型を とっておかない（見本との くらべ用）。
 * せきたん・てつ は 今の 登録（kata が 型を とっておく）。新しい 7 つは `extra`。
 */
export function createMineKinds(P: (hex: string) => number, body: number, variants = true): { coal_ore: KindSpec; iron_ore: KindSpec; extra: Record<string, KindSpec> } {
  /** B の 種類 1 つ。cols = 材料の 色（k = 2 から）。glow = 光る 強さ（なし = 光らない）。bodyColor = 地の 石を 別の 色に する とき */
  const grainKind = (salt: number, layout: Layout, cols: readonly string[], glow?: readonly number[], bodyColor?: string): KindSpec => {
    const bodyIdx = bodyColor === undefined ? body : P(bodyColor);
    const mats = cols.map((c) => P(c));
    const grains: GrainSpec[] = mats.map((index, m) => ({ index, glow: glow?.[m] ?? 0 }));
    if (bodyColor !== undefined) grains.unshift({ index: bodyIdx, glow: 0 }); // 地が 石の 絵では なく 自分の 色（ほたるいし）
    return { base: bodyIdx, grains, fill: (bx, by, bz, e, out) => fillGrains(salt, layout, ROCK_RATE, ROCK_DEEP, bodyIdx, mats, bx, by, bz, e, out) };
  };
  const cached = (spec: KindSpec, n: number, salt: number): KindSpec => (variants ? cachedKind(spec, n, PICK_SALT + salt) : spec); // variants = false は テスト用（型を つくらず 場所の まま）
  const clay = CLAY.map((c) => P(c));
  const lime = LIME.map((c) => P(c));
  return {
    coal_ore: grainKind(401, coalLayout, COAL),
    iron_ore: grainKind(402, ironLayout, IRON),
    extra: {
      nendo: cached(shapeKind(304, clay[0]!, (x, y, z, h) => layeredColor(clay, x, y, z, h), (x, y, z, e, h) => carved(x, y, z, e, h, 4, 2, 5)), CLAY_VARIANTS, 4),
      sekkaiseki: cached(shapeKind(305, lime[0]!, (x, y, z, h) => layeredColor(lime, x, y, z, h), (x, y, z, e, h) => carved(x, y, z, e, h, 6, 3, 7)), LIME_VARIANTS, 5),
      kin_ore: cached(grainKind(403, goldLayout, GOLD), ORE_VARIANTS, 3),
      suisho_ore: cached(grainKind(404, crystalLayout, CRYSTAL), ORE_VARIANTS, 4),
      hotaruishi: cached(grainKind(405, hotaruLayout, HOTARU, HOTARU_GLOW, SLATE), ORE_VARIANTS, 6),
      diamond_ore: cached(grainKind(408, diamondLayout, DIAMOND), ORE_VARIANTS, 8),
    },
  };
}
