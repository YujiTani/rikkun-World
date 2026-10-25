import { blockHash, createPalette, mix } from './common';
import { LOOK_N, type KindSpec, type Look } from './types';

/**
 * 案 C「ドット・タイル」（id: dot-tile）。むかしのゲームの「マス目の絵（タイル）」を そのまま 立体にした世界。
 * - 形: でこぼこ なし（いちばん軽い）。はっぱ も つまった箱（木は「緑の箱」に もようで見せる）。
 * - 色: 1 つの もの につき 3 色＋ふち の 4 色だけ。どの面も 9×9 の きまった絵（草の芽・レンガ・宝石）。
 *   ブロックの さかい に 1 マスの こい線（ふち取り）が入り、タイルの ゲームらしく見える。いちばん あざやか。
 * - 空気: こい 水色の 空。かすみ は うすく、遠くまで くっきり。
 * 色はブロックの中の位置だけで決める（3D テクスチャは位置しか見ないため）。
 */
const N = LOOK_N;
const M = N - 1;
const pal = createPalette();
const P = pal.P;

/** 面の 4 色: 地・もよう・明るい点・ふち */
type Four = { main: number; dark: number; hi: number; line: number };
const F = (main: string, dark: string, hi: string, line: string): Four => ({ main: P(main), dark: P(dark), hi: P(hi), line: P(line) });

const GRASS = F('#3EC04C', '#2A9C3B', '#86E474', '#1C7330');
const DIRT = F('#CB7C3E', '#9C5527', '#E59A5A', '#6A3518');
const SAND = F('#F4D16C', '#DDAC48', '#FFE9A2', '#B4862C');
const STONE = F('#A9B1C3', '#7E879C', '#D0D7E3', '#596175');
const COAL = F('#262638', '#262638', '#8E98BC', '#262638');
const IRON = F('#F08A48', '#F08A48', '#FFDAA8', '#F08A48');
const BARK = F('#A6663A', '#7B4325', '#C48352', '#4F2914');
const RING = F('#E9B977', '#C98E50', '#F6D29A', '#4F2914');
const LEAF = F('#2EB451', '#1C8B3C', '#7FE27F', '#11652B');
const BEDROCK = F('#53537A', '#3A3A58', '#6C6C96', '#24243C');
const OTHER: Record<string, Four> = {
  furnace: F('#A9B1C3', '#7E879C', '#D0D7E3', '#3E4558'),
  kawara: F('#4F6E9C', '#3C5880', '#6E8EBC', '#24385A'),
  brick: F('#D0573E', '#A8402C', '#EE7C60', '#6A2418'),
  tansu: F('#C2843E', '#9C642C', '#DCA35E', '#5C3814'),
  farmland: F('#7C4A22', '#5E3618', '#93602F', '#3C200C'),
  farmland_wet: F('#5A3418', '#432612', '#6C4220', '#2A160A'),
  sprinkler: F('#8CB8DC', '#6A96BC', '#B8DAF4', '#3C5C7C'),
};

type Fill = KindSpec['fill'];
let salt = 300;

/**
 * そのマスが どの面の絵に入るか と、面の中の (u, v)。上の面を いちばん先に。中のマスは face = -1。
 * face: 0 上, 1 下, 2 横（x）, 3 横（z）
 */
function faceUV(x: number, y: number, z: number): [number, number, number] {
  if (y === M) return [0, x, z];
  if (y === 0) return [1, x, z];
  if (x === 0 || x === M) return [2, z, y];
  if (z === 0 || z === M) return [3, x, y];
  return [-1, x, y];
}

/** ふち: 上下の面は x=0 と z=0 の列、横の面は 左の列（u=0）と いちばん下の段（v=0）。となりと合わせて 1 マスの線 */
function isLine(_face: number, u: number, v: number): boolean {
  return u === 0 || v === 0;
}

function kind(base: number, color: (face: number, u: number, v: number, h: number, x: number, y: number, z: number) => number): KindSpec {
  const s = salt++;
  const fill: Fill = (bx, by, bz, _exposed, out) => {
    const h = blockHash(s, bx, by, bz);
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        for (let x = 0; x < N; x++, i++) {
          const [f, u, v] = faceUV(x, y, z);
          out[i] = color(f, u, v, h, x, y, z);
        }
      }
    }
  };
  return { base, fill };
}

/** 土の絵: 決まった場所の 点 */
function dirtPix(c: Four, f: number, u: number, v: number): number {
  if (f >= 0 && isLine(f, u, v)) return c.line;
  if ((u * 2 + v * 3) % 7 === 0) return c.dark;
  if ((u * 3 + v) % 11 === 5) return c.hi;
  return c.main;
}

/** 石の絵: レンガ（3 段、まんなかの段は つぎ目が ずれる）。ブロックごとに つぎ目の場所が少しかわる */
function brickPix(c: Four, f: number, u: number, v: number, h: number): number {
  if (f < 0) return c.main;
  if (isLine(f, u, v)) return c.line;
  const band = (v / 3) | 0;
  if (v % 3 === 0) return c.dark;
  const joint = band === 1 ? 3 + ((h >>> (f * 2)) % 3) : -1;
  if (u === joint) return c.dark;
  if (v % 3 === 2 && (u === 1 || u === joint + 1)) return c.hi;
  return c.main;
}

/** 宝石: 面ごとに 1 つ、十字の 5 マス（まんなか が光る） */
function gemPix(gem: Four, f: number, u: number, v: number, h: number): number {
  if (f < 0) return -1;
  const r = mix(h, f + 11);
  const cu = 2 + (r % 5);
  const cv = 2 + ((r >>> 4) % 5);
  const d = Math.abs(u - cu) + Math.abs(v - cv);
  if (d === 0) return gem.hi;
  if (d === 1) return gem.main;
  // 2 つ目（小さい 1 マス）
  const cu2 = 1 + ((r >>> 8) % 7);
  const cv2 = 1 + ((r >>> 12) % 7);
  if (u === cu2 && v === cv2 && d > 2) return gem.main;
  return -1;
}

function ore(gem: Four): KindSpec {
  return kind(STONE.main, (f, u, v, h) => {
    if (f >= 0 && !isLine(f, u, v)) {
      const g = gemPix(gem, f, u, v, h);
      if (g >= 0) return g;
    }
    return brickPix(STONE, f, u, v, h);
  });
}

/** かんたんな タイル（世界のブロック以外）: 地＋ふち＋ななめの 点 */
function tile(c: Four): KindSpec {
  return kind(c.main, (f, u, v, h) => {
    if (f < 0) return c.main;
    if (isLine(f, u, v)) return c.line;
    if ((u + v + (h % 2)) % 4 === 0 && u % 2 === 1) return c.dark;
    if (u === 1 && v === M - 1) return c.hi;
    return c.main;
  });
}

export const dotTileLook: Look = {
  id: 'dot-tile',
  label: 'C ドット・タイル',
  palette: pal.rgb(),
  sky: 0x58c4fb,
  fog: { color: 0x9adcfb, near: 90, far: 380 },
  kinds: {
    grass: kind(GRASS.main, (f, u, v, h) => {
      if (f === 0) {
        if (isLine(f, u, v)) return GRASS.line;
        // 草の芽（V の形）を 2 つ。場所は ブロックごとに すこし かわる
        for (let k = 0; k < 2; k++) {
          const r = mix(h, k + 5);
          const fu = 1 + (r % 5);
          const fv = k === 0 ? 2 + ((r >>> 4) % 2) : 5 + ((r >>> 4) % 2);
          if ((v === fv && (u === fu || u === fu + 2)) || (v === fv - 1 && u === fu + 1)) return GRASS.dark;
          if (v === fv + 1 && u === fu + 1) return GRASS.hi;
        }
        return GRASS.main;
      }
      if (f === 2 || f === 3) {
        // 横: 上 3 段が 草（下のはしが ギザギザ）、その下は 土
        const grassRow = v >= 6 || (v === 5 && u % 2 === 0);
        if (grassRow) return u === 0 ? GRASS.line : v === M - 1 && u % 3 === 1 ? GRASS.hi : GRASS.main;
        if (v === 5 || (v === 4 && u % 2 === 0)) return GRASS.line; // 草と土の さかい
      }
      return dirtPix(DIRT, f, u, v);
    }),
    dirt: kind(DIRT.main, (f, u, v, h) => {
      if (f < 0) return DIRT.main;
      // 石ころ（ブロックごとに 1 つ）
      const r = mix(h, f + 3);
      const pu = 2 + (r % 5);
      const pv = 2 + ((r >>> 4) % 5);
      if ((u === pu || u === pu + 1) && v === pv && !isLine(f, u, v)) return u === pu ? DIRT.hi : DIRT.dark;
      return dirtPix(DIRT, f, u, v);
    }),
    sand: kind(SAND.main, (f, u, v, h) => {
      if (f < 0) return SAND.main;
      if (isLine(f, u, v)) return SAND.line;
      // さざなみ（ – の線）
      if (v % 3 === 1 && (u + ((v / 3) | 0) * 2 + (h % 3)) % 5 < 2) return SAND.dark;
      if (v % 3 === 2 && (u + ((v / 3) | 0) * 2 + (h % 3)) % 5 === 3) return SAND.hi;
      return SAND.main;
    }),
    stone: kind(STONE.main, (f, u, v, h) => brickPix(STONE, f, u, v, h)),
    coal_ore: ore(COAL),
    iron_ore: ore(IRON),
    log: kind(BARK.main, (f, u, v, h) => {
      if (f === 0 || f === 1) {
        if (isLine(f, u, v)) return RING.line;
        const ring = Math.max(Math.abs(u - 4), Math.abs(v - 4));
        return ring === 4 ? BARK.main : ring === 0 ? RING.hi : ring % 2 === 0 ? RING.main : RING.dark;
      }
      if (f < 0) return BARK.main;
      if (u === 0) return BARK.line;
      if (u % 3 === 1) return BARK.dark;
      if (u % 3 === 2 && (v + (h % 4)) % 4 === 0) return BARK.hi;
      return BARK.main;
    }),
    leaves: kind(LEAF.main, (f, u, v) => {
      if (f < 0) return LEAF.dark;
      if (isLine(f, u, v)) return LEAF.line;
      // うろこ もよう（はっぱ の かさなり）
      const row = (v / 2) | 0;
      const uu = u + (row % 2) * 2;
      if (v % 2 === 0 && uu % 4 === 0) return LEAF.dark;
      if (v % 2 === 1 && uu % 4 === 2) return LEAF.hi;
      return LEAF.main;
    }),
    bedrock: kind(BEDROCK.main, (f, u, v, h) => {
      if (f < 0) return BEDROCK.dark;
      if (isLine(f, u, v)) return BEDROCK.line;
      const c = (((u / 3) | 0) + ((v / 3) | 0) + (h % 2)) % 2;
      if (c === 0) return u % 3 === 1 && v % 3 === 1 ? BEDROCK.hi : BEDROCK.dark;
      return BEDROCK.main;
    }),
    ...Object.fromEntries(Object.entries(OTHER).map(([id, c]) => [id, tile(c)])),
  },
};
