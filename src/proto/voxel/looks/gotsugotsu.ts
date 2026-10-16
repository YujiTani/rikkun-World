import { blockHash, createPalette, dentable, mix } from './common';
import { ALL_FACES, LOOK_N, type KindSpec, type Look } from './types';

/**
 * 案 B「ごつごつ」（id: gotsugotsu）。手で ほった ジオラマ（もけい）の島。
 * - 形: 1 マスの つぶ ではなく、3×3 の「かけら」単位で 面を へこませる。くさ は 3×3 の しばふ が段になり、ところどころ 草の芽が立つ。
 *   崖では くさ の下の土が 1 マス引っこみ、しばふ の「ひさし」ができる。木の皮は たての みぞ。はっぱ は 3×3×3 の かたまり。
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
const COAL = [P('#2E2A33'), P('#4A4452')];
const IRON = [P('#C97E48'), P('#E8AC78')];
const BARK = L('#76502F', '#6B482A', '#4E3320', '#3A2618');
const RING = [P('#C99860'), P('#AE7E4A'), P('#8E6238')];
const LEAF = L('#5DAA45', '#4F9A3C', '#3B7E33', '#2A6127');
const BEDROCK = L('#4D4843', '#45403B', '#36322E', '#292624');
const OTHER: Record<string, Layers> = {
  furnace: L('#928B80', '#9E978A', '#6F685F', '#504A43'),
  kawara: L('#4E6582', '#465C77', '#374A62', '#2A394C'),
  brick: L('#AE5240', '#A04A3A', '#7E3A2D', '#5E2B22'),
  tansu: L('#A2723F', '#966A3A', '#7A552E', '#5C4022'),
  farmland: L('#624025', '#5A3A22', '#46301C', '#352416'),
  farmland_wet: L('#4A2F1A', '#432A18', '#352113', '#28190E'),
  sprinkler: L('#7F9FB8', '#7594AC', '#5C7A90', '#465E70'),
};

type Fill = KindSpec['fill'];
const LEAF_SALT = 290;
let salt = 200;

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
 * 3×3 の かけら の へこみ。面ごとに 9 枚の かけら の うち いくつかを 1 マス、まれに まんなかを 2 マス へこませる。
 * rate = 9 枚のうち へこむ 目安（0〜9）
 */
function chipped(x: number, y: number, z: number, e: number, h: number, rate: number): boolean {
  const d = exposedDepth(x, y, z, e);
  if (d > 1 || !dentable(x, y, z, e)) return false;
  const faces: [number, number, number, number][] = [
    [1, M - y, x, z],
    [2, y, x, z],
    [4, M - x, z, y],
    [8, x, z, y],
    [16, M - z, x, y],
    [32, z, x, y],
  ];
  for (let f = 0; f < 6; f++) {
    const [bit, dd, u, v] = faces[f];
    if (!(e & bit) || dd > 1) continue;
    const tu = (u / 3) | 0;
    const tv = (v / 3) | 0;
    const r = mix(h, f * 16 + tv * 3 + tu);
    if (r % 9 >= rate) continue;
    if (dd === 0) return true;
    // 2 マス目: かけら の まんなか だけ、ときどき
    if (u % 3 === 1 && v % 3 === 1 && (r >>> 8) % 3 === 0) return true;
  }
  return false;
}

function kind(base: number, color: (x: number, y: number, z: number, h: number) => number, hole: (x: number, y: number, z: number, e: number, h: number) => boolean): KindSpec {
  const s = salt++;
  const fill: Fill = (bx, by, bz, exposed, out) => {
    const h = blockHash(s, bx, by, bz);
    const solidOnly = exposed === ALL_FACES; // 3D テクスチャ用（上の説明）
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++, i++) {
          out[i] = !solidOnly && hole(x, y, z, exposed, h) ? 0 : color(x, y, z, h);
        }
      }
    }
  };
  return { base, fill };
}

function rock(c: Layers, rate: number): KindSpec {
  return kind(c[0], (x, y, z, h) => layered(c, x, y, z, h), (x, y, z, e, h) => chipped(x, y, z, e, h, rate));
}

/** 石に うまった 3×3×3 の かたまり（つぶ ではなく かたまり。上の段が明るい）。27 の かたまりの うち 4〜6 こ */
function nugget(spec: number[]): KindSpec {
  return kind(
    STONE[0],
    (x, y, z, h) => {
      const r = mix(h, (((y / 3) | 0) * 3 + ((z / 3) | 0)) * 3 + ((x / 3) | 0));
      if (r % 5 === 0) {
        // かたまり の 角 は 石のまま（まるく見せる）
        const ex = x % 3 !== 1 ? 1 : 0;
        const ey = y % 3 !== 1 ? 1 : 0;
        const ez = z % 3 !== 1 ? 1 : 0;
        if (ex + ey + ez < 3) return y % 3 === 2 ? spec[1] : spec[0];
      }
      return layered(STONE, x, y, z, h);
    },
    (x, y, z, e, h) => chipped(x, y, z, e, h, 3),
  );
}

export const gotsugotsuLook: Look = {
  id: 'gotsugotsu',
  label: 'B ごつごつ',
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
        return layered(DIRT, x, y, z, h);
      },
      (x, y, z, e, h) => {
        if ((e & 1) !== 0 && y === M && dentable(x, M, z, e)) {
          // くさむら: 3×3 ごとに「もこっと つまった しばふ」(4 割) か「草の芽が 3 本に 1 本 立つ」(6 割)
          const r = mix(h, ((z / 3) | 0) * 3 + ((x / 3) | 0));
          if (r % 5 < 2) return false;
          return mix(h, z * 9 + x + 100) % 3 !== 0;
        }
        // 崖: くさ の下の土（y <= 4）を 1 マス引っこめる（しばふ の ひさし）
        if (y <= 4 && exposedDepth(x, y, z, e & ~3) === 0 && dentable(x, y, z, e)) return true;
        return false;
      },
    ),
    dirt: rock(DIRT, 3),
    sand: kind(
      SAND[0],
      (x, y, z, h) => layered(SAND, x, y, z, h),
      (x, y, z, e, h) => {
        // 上の面に 風の しま（なみ）。横は 少しだけ かける
        if ((e & 1) !== 0 && y === M && dentable(x, y, z, e)) return (z + (((x / 3) | 0) % 2)) % 3 === 0;
        return chipped(x, y, z, e & ~1, h, 2);
      },
    ),
    stone: rock(STONE, 4),
    coal_ore: nugget(COAL),
    iron_ore: nugget(IRON),
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
        // たての みぞ（2 本ずつ）。ブロックごとに ずらす
        if (y === 0 || y === M || !dentable(x, y, z, e)) return false;
        const off = h % 3;
        if ((e & 12) !== 0 && (x === 0 || x === M) && (z + off) % 4 === 0) return true;
        if ((e & 48) !== 0 && (z === 0 || z === M) && (x + off) % 4 === 0) return true;
        return false;
      },
    ),
    leaves: {
      base: LEAF[0],
      occludes: false,
      // 3×3×3 の かたまり 27 こ。外がわの かたまりは ときどき ない（もこもこ）。上の面ほど明るい
      fill: (bx, by, bz, _e, out) => {
        const h = blockHash(LEAF_SALT, bx, by, bz);
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
              out[i] = ly === 2 ? (r % 3 === 0 ? LEAF[1] : LEAF[0]) : ly === 1 ? LEAF[2] : LEAF[3];
            }
          }
        }
      },
    },
    bedrock: rock(BEDROCK, 5),
    ...Object.fromEntries(Object.entries(OTHER).map(([id, c]) => [id, rock(c, 2)])),
  },
};
