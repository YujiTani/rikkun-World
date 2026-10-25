import { blockHash, cellHash, createPalette, dentable, mix } from './common';
import { ALL_FACES, LOOK_N, type KindSpec, type Look } from './types';

/**
 * 案 A「つみき」（id: tsumiki）。木のおもちゃの つみき のような世界。
 * - 形: 面は たいら。見えている 2 つの面が出会う かど だけ 1 マス けずる（まるい かど）。でこぼこは少ない → 三角形は へる。
 * - 色: ばらばらの つぶ（ノイズ）を使わない。どのブロックも「上のふちが明るく・下のふちが暗い」ふち取りで、1 個ずつ数えられる。
 * - 空気: あたたかい 明るい空、遠くは やさしく かすむ。
 * 色はブロックの中の位置だけで決める（3D テクスチャは位置しか見ないため。形が変わっても色がずれない）。
 * 3D テクスチャは exposed = ALL_FACES で作られ、穴のマスは base 1 色になる。そこで ALL_FACES のときは かどを けずらない
 * （ふち取りの色が そのまま テクスチャに入る。6 面とも見える 宙に浮いた 1 個だけは かどが まるくならない）。
 */
const N = LOOK_N;
const M = N - 1;
const pal = createPalette();
const P = pal.P;

// ---- 色の表
const GRASS = P('#8ACF58');
const GRASS_RIM = P('#76BE4A'); // 上の面の ふち（つみきの さかい目）
const GRASS_HI = P('#A4DE74');
const FLOWER = P('#FFE15A');
const FLOWER_C = P('#F59A2E');
const DIRT = P('#B97A4A');
const DIRT_HI = P('#CB8D5B');
const DIRT_LO = P('#9C6238');
const PEBBLE = P('#DDB083');
const SAND = P('#EBC877');
const SAND_HI = P('#F4D68C');
const SAND_LO = P('#D4AE60');
const STONE = P('#9AA3B8');
const STONE_HI = P('#B7BFD0');
const STONE_LO = P('#7F889F');
const COAL = P('#3A3450');
const COAL_HI = P('#6E6690');
const IRON = P('#E8975A');
const IRON_HI = P('#FFD3A0');
const BARK = P('#95623A');
const BARK_LO = P('#7C4E2C');
const BARK_HI = P('#A9744A');
const RING_A = P('#E6B97E');
const RING_B = P('#CF9C60');
const LEAF = P('#55B04A');
const LEAF_HI = P('#76CA5C');
const LEAF_LO = P('#3E9040');
const BEDROCK = P('#585170');
const BEDROCK_LO = P('#463F5C');
const BEDROCK_HI = P('#6A6384');
// 世界のブロック以外（かまど など）: 今回は ふち取り だけ
const OTHER = {
  furnace: [P('#9AA3B8'), P('#B7BFD0'), P('#6F7890')],
  kawara: [P('#4F6A8C'), P('#6482A6'), P('#3E5574')],
  brick: [P('#C8604A'), P('#DC7A62'), P('#A84C3A')],
  tansu: [P('#B8814A'), P('#CC9862'), P('#9A6A3A')],
  farmland: [P('#7A4E2C'), P('#8C5E38'), P('#643E22')],
  farmland_wet: [P('#5E3A20'), P('#6E4628'), P('#4C2E18')],
  sprinkler: [P('#8FB2CC'), P('#AECBE0'), P('#7596B0')],
} as const;
const LEAF_SALT = 90;

type Fill = KindSpec['fill'];
let salt = 100;

/** 面にさわっている数（0 = 中、1 = 面、2 = かど（へり）、3 = 角） */
function boundaryCount(x: number, y: number, z: number): number {
  return (x === 0 || x === M ? 1 : 0) + (y === 0 || y === M ? 1 : 0) + (z === 0 || z === M ? 1 : 0);
}

/** つみきの ふち取り: 横の面の いちばん上の段 = 明るい、いちばん下 = 暗い、上の面の ふち = rimTop */
function bevel(x: number, y: number, z: number, main: number, hi: number, lo: number, rimTop: number): number {
  const side = x === 0 || x === M || z === 0 || z === M;
  if (y === M) return side ? rimTop : main;
  if (side && y === M - 1) return hi;
  if (side && y === 0) return lo;
  if (y === 0) return lo;
  return main;
}

/** 見えている 2 面が出会う へり を けずるか（まるい かど） */
function chamfer(x: number, y: number, z: number, exposed: number): boolean {
  return boundaryCount(x, y, z) >= 2 && dentable(x, y, z, exposed);
}

function kind(base: number, color: (x: number, y: number, z: number, h: number) => number, opt: { round?: 'all' | 'vertical' } = {}): KindSpec {
  const s = salt++;
  const fill: Fill = (bx, by, bz, exposed, out) => {
    const h = blockHash(s, bx, by, bz);
    const round = exposed === ALL_FACES ? undefined : opt.round; // 3D テクスチャ用（上の説明）
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++, i++) {
          let c = color(x, y, z, h);
          if (round === 'all' && chamfer(x, y, z, exposed)) c = 0;
          // 木: たての へり だけ けずる（八角形の みき）
          else if (round === 'vertical' && (x === 0 || x === M) && (z === 0 || z === M) && dentable(x, y, z, exposed)) c = 0;
          out[i] = c;
        }
      }
    }
  };
  return { base, fill };
}

/** つみき（ふち取り＋まるい かど）の 固い種類 */
function plain(main: number, hi: number, lo: number): KindSpec {
  return kind(
    main,
    (x, y, z, h) => {
      // ブロックごとに 場所のちがう 2 マスの もよう（同じ形が ならびすぎないように。つぶ の ノイズ にはしない）
      const r = mix(h, 3);
      const sx = 2 + (r % 4);
      const sy = 2 + ((r >>> 3) % 4);
      const sz = 2 + ((r >>> 6) % 4);
      if ((x === sx || x === sx + 1) && (y === sy || z === sz) && (x + y + z) % 2 === 0) return lo;
      return bevel(x, y, z, main, hi, lo, hi);
    },
    { round: 'all' },
  );
}

/** 石の中に 2×2×2 の宝石（明るい 1 マスつき）。位置は ブロックごとに 2 つ */
function gems(gem: number, gemHi: number): KindSpec {
  return kind(
    STONE,
    (x, y, z, h) => {
      for (let g = 0; g < 2; g++) {
        const r = mix(h, g + 7);
        const gx = 1 + (r % 6);
        const gy = 1 + ((r >>> 4) % 6);
        const gz = 1 + ((r >>> 8) % 6);
        if (x >= gx && x <= gx + 1 && y >= gy && y <= gy + 1 && z >= gz && z <= gz + 1) {
          return x === gx && y === gy + 1 && z === gz ? gemHi : gem;
        }
      }
      return bevel(x, y, z, STONE, STONE_HI, STONE_LO, STONE_HI);
    },
    { round: 'all' },
  );
}

export const tsumikiLook: Look = {
  id: 'tsumiki',
  label: 'A つみき',
  palette: pal.rgb(),
  // あたたかい 朝の空。遠くは クリーム色に やさしく かすむ（上空から見ても 島が見えるよう near は 90）
  sky: 0xbfe4f2,
  fog: { color: 0xf2ead6, near: 90, far: 300 },
  kinds: {
    grass: kind(
      GRASS,
      (x, y, z, h) => {
        if (y === M) {
          if (x === 0 || z === 0) return GRASS_RIM; // つみきの さかい目（1 マスの線）
          // 小さな花（9 ブロックに 1 つくらい）
          const r = h % 9;
          if (r === 0) {
            const fx = 2 + ((h >>> 4) % 5);
            const fz = 2 + ((h >>> 8) % 5);
            if (x === fx && z === fz) return FLOWER_C;
            if (Math.abs(x - fx) + Math.abs(z - fz) === 1) return FLOWER;
          }
          return (x + z) % 4 === 1 && (x * 3 + z) % 5 === 0 ? GRASS_HI : GRASS;
        }
        // 横: 上は緑。下のふちが ゆるい なみ形に たれる
        const k = x === 0 || x === M ? z : x;
        const drip = k % 4 === 1 || k % 4 === 2 ? 5 : 6;
        if (y >= drip) return y === M - 1 ? GRASS_HI : GRASS;
        return bevel(x, y, z, DIRT, DIRT, DIRT_LO, DIRT);
      },
      { round: 'all' },
    ),
    dirt: kind(
      DIRT,
      (x, y, z, h) => {
        const r = mix(h, (y >> 2) * 3 + ((x + z) >> 2));
        if (r % 7 === 0 && (x + y + z) % 3 === 0) return PEBBLE;
        return bevel(x, y, z, DIRT, DIRT_HI, DIRT_LO, DIRT_HI);
      },
      { round: 'all' },
    ),
    sand: plain(SAND, SAND_HI, SAND_LO),
    stone: plain(STONE, STONE_HI, STONE_LO),
    coal_ore: gems(COAL, COAL_HI),
    iron_ore: gems(IRON, IRON_HI),
    log: kind(
      BARK,
      (x, y, z) => {
        if (y === 0 || y === M) {
          const ring = Math.max(Math.abs(x - 4), Math.abs(z - 4));
          return ring === 4 ? BARK : ring % 2 === 0 ? RING_A : RING_B;
        }
        const k = x === 0 || x === M ? z : x;
        if (k % 3 === 1) return BARK_LO;
        return y === M - 1 ? BARK_HI : BARK;
      },
      { round: 'vertical' },
    ),
    leaves: {
      base: LEAF,
      occludes: false,
      // まるく ふくらんだ かたまり: 12 本の へり と 角を けずる。上の面は明るく、下と中は こい
      fill: (bx, by, bz, _exposed, out) => {
        const h = blockHash(LEAF_SALT, bx, by, bz);
        let i = 0;
        for (let y = 0; y < N; y++) {
          for (let z = 0; z < N; z++) {
            for (let x = 0; x < N; x++, i++) {
              const b = boundaryCount(x, y, z);
              if (b >= 2) {
                out[i] = 0;
                continue;
              }
              // 面の まんなかに ときどき 1 マスの くぼみ（はっぱの すきま）
              if (b === 1 && cellHash(h, x, y, z) % 23 === 0) {
                out[i] = 0;
                continue;
              }
              out[i] = y === M || y === M - 1 ? LEAF_HI : y <= 1 ? LEAF_LO : (x + y + z) % 5 === 0 ? LEAF_LO : LEAF;
            }
          }
        }
      },
    },
    bedrock: plain(BEDROCK, BEDROCK_HI, BEDROCK_LO),
    ...Object.fromEntries(Object.entries(OTHER).map(([id, [m, hi, lo]]) => [id, plain(m, hi, lo)])),
  },
};
