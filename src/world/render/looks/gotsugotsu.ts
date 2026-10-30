import { blockHash, carved, createPalette, dentable, mix, shapeKind } from './common';
import { microSoil } from '../../micro/microSurface';
import { createMineKinds } from './mineLooks';
import { LOOK_N, type KindSpec, type Look } from './types';

/**
 * 案 B「ごつごつ」（id: gotsugotsu）。手で ほった ジオラマ（もけい）の島。
 * - 形（2026-10-16 オーナーの決定で強めた。きまりは docs/art/DESIGN.md）: 1 マスの つぶ ではなく、3×3 の「かけら」単位で
 *   1〜3 マス へこませる。見える面が出会う へり・かどは 3×3×3 ごとに けずる。くさ は 3×3 ごとに 4 つの高さ（くぼみ・草の芽・
 *   1 段ひくい・つまった）。崖では しばふ の くちびる を けずり、下のはしを ギザギザ、下の土を引っこめて ひさし を作る。
 *   木の皮は 2 マスの たての みぞ。鉱石の かたまり は けずらない（少し とび出す）。はっぱ は 3×3×3 の かたまり。
 * - 色: ブロックの外がわほど明るく、中ほど暗い（外 → 1 段内 → 2 段内）。へこみの底が かってに 暗くなり、かげ（光の代わり）になる。
 * - 空気: すんだ 青空。遠くは 青く かすむ（遠近感）。
 * 色はブロックの中の位置だけで決める（3D テクスチャは位置しか見ないため）。
 * 3D テクスチャは exposed = ALL_FACES で作られ、穴のマスは base 1 色になる。そこで ALL_FACES のときは穴をあけない
 * （色がそのまま全部テクスチャに入る。6 面とも見える 宙に浮いた 1 個だけは へこまない）。
 */
const N = LOOK_N;
const M = N - 1;
const pal = createPalette();
const P = pal.P;

/** 外がわの 2 色・1 段内・2 段より内 */
type Layers = readonly [number, number, number, number];
const L = (a: string, b: string, c: string, d: string): Layers => [P(a), P(b), P(c), P(d)];

const GRASS = L('#5DA640', '#529A39', '#3D7D30', '#2C5E25');
const GRASS_TIP = P('#8CCB55');
const DIRT = L('#86563A', '#7C4E33', '#653F28', '#4A2D1C');
const SAND = L('#DFC07F', '#D6B674', '#BE9C5E', '#A0824A');
const STONE = L('#928B80', '#9E978A', '#6F685F', '#504A43');
const BARK = L('#76502F', '#6B482A', '#4E3320', '#3A2618');
const RING = [P('#C99860'), P('#AE7E4A'), P('#8E6238')];
const LEAF = L('#5DAA45', '#4F9A3C', '#3B7E33', '#2A6127');
const MATSU = L('#2F7A4A', '#276B40', '#1F5634', '#17402A');
const MOMIJI = L('#D9502B', '#C8431F', '#A33418', '#7A2812');
const SNOW = L('#F4F8FB', '#E6EEF4', '#C9D6E2', '#A9BBCB');
const BAMBOO = L('#6DB84F', '#5FA844', '#478A38', '#336B2B');
const BEDROCK = L('#4D4843', '#45403B', '#36322E', '#292624');

const LEAF_SALT = 290;
let salt = 200;

/** MINE-1B: 鉱石の 見た目（palette に 色を 足す ので、palette を 取り出す 前に 作る） */
const MINE = createMineKinds(P, STONE[0]);

/** たねの 数を 1 つ 進めて、渡した 種類を そのまま 返す（今の 登録の たねを ずらさない ため） */
function keepSalt(spec: KindSpec): KindSpec {
  salt++;
  return spec;
}

/** ブロックの いちばん近い面までの深さ（0 = 外がわ） */
function depth(x: number, y: number, z: number): number {
  return Math.min(x, M - x, y, M - y, z, M - z);
}

/** 深さで色を決める（外がわは 3×3 の まだらで 2 色） */
function layered(c: Layers, x: number, y: number, z: number, h: number): number {
  const d = depth(x, y, z);
  if (d >= 2) return c[3];
  if (d === 1) return c[2];
  return mix(h, ((y / 3) | 0) * 9 + ((z / 3) | 0) * 3 + ((x / 3) | 0)) % 3 === 0 ? c[1] : c[0];
}

/** 見えている面から何マスの深さか（見えている面が無ければ 99） */
function exposedDepth(x: number, y: number, z: number, e: number): number {
  let d = 99;
  if (e & 1) d = Math.min(d, M - y);
  if (e & 2) d = Math.min(d, y);
  if (e & 4) d = Math.min(d, M - x);
  if (e & 8) d = Math.min(d, x);
  if (e & 16) d = Math.min(d, M - z);
  if (e & 32) d = Math.min(d, z);
  return d;
}

/**
 * 草の上の面（y = 5〜8）。3×3 ごとに 4 つの高さ（だんだん の しばふ）:
 * くぼみ 3 割（2 マス。まんなか は 3 マス・ときどき 草の芽が 1 本）/ 草の芽 3 割（1 マスめ に 3 本に 1 本）/
 * 1 段ひくい しばふ 2 割 / もこっと つまった しばふ 2 割
 */
function grassTop(x: number, y: number, z: number, e: number, h: number): boolean {
  if (!(e & 1) || y < 5 || !dentable(x, y, z, e)) return false;
  const dTop = M - y;
  const r = mix(h, ((z / 3) | 0) * 3 + ((x / 3) | 0)) % 10;
  const mid = x % 3 === 1 && z % 3 === 1;
  if (r < 3) {
    if (mid && (r & 1) === 0) return false; // 草の芽が 1 本 のこる
    return dTop <= 1 || (dTop === 2 && mid);
  }
  if (r < 6) return dTop === 0 && mix(h, z * 9 + x + 100) % 3 !== 0;
  if (r < 8) return dTop === 0;
  return false;
}

function kind(base: number, color: (x: number, y: number, z: number, h: number) => number, hole: (x: number, y: number, z: number, e: number, h: number) => boolean): KindSpec {
  return shapeKind(salt++, base, color, hole);
}

function rock(c: Layers, rate: number, deep: number, edge: number): KindSpec {
  return kind(c[0], (x, y, z, h) => layered(c, x, y, z, h), (x, y, z, e, h) => carved(x, y, z, e, h, rate, deep, edge));
}

/** 小ブロック地形の色（VOX-2）: ブロックの外がわほど明るく、内ほど暗い。草は 上から 3〜4 マス、その下は土 */
function layersOf(c: Layers, depth: number, h3: number): number {
  return depth >= 2 ? c[3] : depth === 1 ? c[2] : h3 % 3 === 0 ? c[1] : c[0];
}

/**
 * 小ブロック地形の色（VOX-2 アート調整）。
 * - てっぺん（fromTop 0）: 深さ（となりが高いほど くぼみ）で 4 段。草の先は 7 マスに 1 マス。
 * - 横に見える しばふ（fromTop 1〜）: 上より 1 段ずつ 暗く（上の面ほど明るい。2 マス以上の段差が 読める）。
 * - しばふ の下（3〜4 マスめから）: 土。崖の横は 土が見える。
 * - 土が見える所（microSoil）: てっぺんと そのすぐ下が 土。
 */
function terrainColor(kind: string, depth: number, fromTop: number, isRock: boolean, wx: number, wy: number, wz: number): number {
  // 3×3×3 のかたまりごとの まだら
  const h3 = mix(mix(910, Math.floor(wx / 3)), Math.floor(wz / 3) * 512 + Math.floor(wy / 3));
  if (isRock) return layersOf(STONE, depth, h3);
  switch (kind) {
    case 'grass': {
      if (fromTop < 2 && microSoil(wx, wz)) return layersOf(DIRT, depth, h3);
      if (fromTop === 0) {
        if (depth === 0 && (((wx * 5 + wz * 3) % 7) + 7) % 7 === 0) return GRASS_TIP;
        return layersOf(GRASS, depth, h3);
      }
      if (fromTop < 3 + (h3 % 2)) {
        if (depth > 0) return layersOf(GRASS, depth, h3);
        return fromTop === 1 ? GRASS[1] : GRASS[2];
      }
      return layersOf(DIRT, depth, h3);
    }
    case 'dirt':
      return layersOf(DIRT, depth, h3);
    case 'sand':
      return layersOf(SAND, depth, h3);
    case 'bedrock':
      return layersOf(BEDROCK, depth, h3);
    default:
      return layersOf(STONE, depth, h3);
  }
}

/** はっぱ: 3×3×3 の かたまり 27 こ。外がわの かたまりは ときどき ない（もこもこ）。上の面ほど明るい */
function leafKind(c: Layers, saltN: number): KindSpec {
  return {
    base: c[0],
    occludes: false,
    fill: (bx, by, bz, _e, out) => {
      const h = blockHash(saltN, bx, by, bz);
      let i = 0;
      for (let y = 0; y < N; y++) {
        for (let z = 0; z < N; z++) {
          for (let x = 0; x < N; x++, i++) {
            const cx = (x / 3) | 0;
            const cy = (y / 3) | 0;
            const cz = (z / 3) | 0;
            const outer = cx !== 1 || cy !== 1 || cz !== 1;
            const r = mix(h, (cy * 3 + cz) * 3 + cx);
            const corners = (cx !== 1 ? 1 : 0) + (cy !== 1 ? 1 : 0) + (cz !== 1 ? 1 : 0);
            if (outer && r % 10 < (corners >= 2 ? 5 : 2)) {
              out[i] = 0;
              continue;
            }
            const ly = y % 3;
            out[i] = ly === 2 ? (r % 3 === 0 ? c[1] : c[0]) : ly === 1 ? c[2] : c[3];
          }
        }
      }
    },
  };
}

export const gotsugotsuLook: Look = {
  id: 'gotsugotsu',
  label: 'B ごつごつ',
  terrainColor,
  palette: pal.rgb(),
  // すんだ 青空。遠くは 青く かすむ（遠近感）。上空からも見えるよう near は 100
  sky: 0x6ea8e0,
  fog: { color: 0xa6c6e4, near: 100, far: 360 },
  kinds: {
    grass: kind(
      GRASS[0],
      (x, y, z, h) => {
        if (y >= 6) {
          // てっぺん（草の先）は明るい。1 段下（くさむら の すきまの底）は こい
          if (y === M) return (x * 5 + z * 3) % 7 === 0 ? GRASS_TIP : mix(h, ((z / 3) | 0) * 3 + ((x / 3) | 0)) % 3 === 0 ? GRASS[1] : GRASS[0];
          const d = depth(x, y, z);
          return d >= 2 ? GRASS[3] : d === 1 ? GRASS[2] : GRASS[0];
        }
        const k = x === 0 || x === M ? z : x;
        if (y === 5 && k % 3 !== 1) return GRASS[2]; // しばふ の ねもと
        if (y === 5 && x > 0 && x < M && z > 0 && z < M) return GRASS[3]; // くぼみ の そこ（土を見せない）
        return layered(DIRT, x, y, z, h);
      },
      (x, y, z, e, h) => {
        if (grassTop(x, y, z, e, h)) return true;
        const side = e & ~3;
        if (!side || !dentable(x, y, z, e)) return false;
        const sd = exposedDepth(x, y, z, side);
        // 崖のふち: 上と横が出会う しばふ の くちびる を かたまり ごとに まるく けずる
        if ((e & 1) !== 0 && y >= 7 && sd === 0 && mix(h, 600 + ((z / 3) | 0) * 3 + ((x / 3) | 0)) % 10 < 5) return true;
        // しばふ の 下のはし（y = 5）を ギザギザに
        if (y === 5 && sd === 0) return mix(h, 700 + x * 9 + z) % 3 === 0;
        if (y > 4) return false;
        // 崖: くさ の下の土を 1 マス引っこめる（しばふ の ひさし）。かけら ごとに もう 1 マス ほる
        if (sd === 0) return true;
        const u = exposedDepth(x, y, z, e & 12) === sd ? z : x; // 面の上の よこの位置
        const r = mix(h, 800 + ((y / 3) | 0) * 9 + ((u / 3) | 0));
        if (sd === 1) return r % 9 < 4;
        if (sd === 2) return r % 9 < 2 && u % 3 === 1 && y % 3 === 1;
        return false;
      },
    ),
    dirt: rock(DIRT, 4, 2, 5),
    sand: kind(
      SAND[0],
      (x, y, z, h) => layered(SAND, x, y, z, h),
      (x, y, z, e, h) => {
        // 上の面に 風の しま（なみ）。横は 少しだけ かける
        if ((e & 1) !== 0 && y === M && dentable(x, y, z, e)) return (z + (((x / 3) | 0) % 2)) % 3 === 0;
        return carved(x, y, z, e & ~1, h, 3, 1, 3);
      },
    ),
    stone: rock(STONE, 6, 3, 7),
    // MINE-1B: 鉱石は B「とびだす つぶ」（mineLooks.ts）。ここで たねの 数を 2 つ 使い切る: このあとの 種類（log〔206〕…）の ハッシュを かえない ため
    coal_ore: keepSalt(MINE.coal_ore),
    iron_ore: keepSalt(MINE.iron_ore),
    log: kind(
      BARK[0],
      (x, y, z, h) => {
        if (y === 0 || y === M) {
          const ring = Math.max(Math.abs(x - 4), Math.abs(z - 4));
          return ring === 4 ? BARK[0] : RING[ring % 3];
        }
        return layered(BARK, x, y, z, h);
      },
      (x, y, z, e, h) => {
        // たての みぞ。ブロックごとに ずらす
        if (y === 0 || y === M || !dentable(x, y, z, e)) return false;
        const off = h % 3;
        // みぞ は 2 マスの深さ（外の 1 マスは 2 本に 1 本、2 マスめ は 4 本に 1 本）
        if ((e & 8) !== 0 && x <= 1 && (z + off) % (x === 0 ? 2 : 4) === 0) return true;
        if ((e & 4) !== 0 && x >= M - 1 && (z + off) % (x === M ? 2 : 4) === 0) return true;
        if ((e & 32) !== 0 && z <= 1 && (x + off) % (z === 0 ? 2 : 4) === 0) return true;
        if ((e & 16) !== 0 && z >= M - 1 && (x + off) % (z === M ? 2 : 4) === 0) return true;
        return false;
      },
    ),
    leaves: leafKind(LEAF, LEAF_SALT),
    matsu_leaves: leafKind(MATSU, LEAF_SALT + 1),
    momiji_leaves: leafKind(MOMIJI, LEAF_SALT + 2),
    snow: rock(SNOW, 3, 1, 4),
    bamboo: rock(BAMBOO, 2, 1, 3),
    bedrock: rock(BEDROCK, 6, 3, 7),
    ...MINE.extra, // MINE-1B: ねんど・せっかいせき（A）と 新しい 鉱石 5 つ（B）。たねは 見本と 同じ 固定の 数
    // かまど・たんす・スプリンクラー・レンガ・かわら・はたけ・ぬれたはたけ は 形を持たない（TEX-A: 平らな箱。docs/art/DESIGN.md 5.3）
  },
};
