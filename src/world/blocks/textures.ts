import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import type { BlockId } from '../../contracts';

/** 16x16 ドット絵をコードで描く（M1-01 4-2 の色）。 */
export const TILE_SIZE = 16;
export const ATLAS_COLS = 4;

export type TileName =
  | 'grass_top'
  | 'grass_side'
  | 'dirt'
  | 'stone'
  | 'sand'
  | 'log_side'
  | 'log_top'
  | 'leaves'
  | 'coal_ore'
  | 'iron_ore'
  | 'water'
  | 'bedrock';

export const TILE_NAMES: readonly TileName[] = [
  'grass_top',
  'grass_side',
  'dirt',
  'stone',
  'sand',
  'log_side',
  'log_top',
  'leaves',
  'coal_ore',
  'iron_ore',
  'water',
  'bedrock',
];
export const ATLAS_ROWS = Math.ceil(TILE_NAMES.length / ATLAS_COLS);
export const ATLAS_WIDTH = ATLAS_COLS * TILE_SIZE;
export const ATLAS_HEIGHT = ATLAS_ROWS * TILE_SIZE;

/** 水の不透明度（60%） */
export const WATER_ALPHA = 0.6;

export type Rgba = readonly [number, number, number, number];
/** タイル 1 枚。pixels[y * 16 + x]、y = 0 が絵の上 */
type Tile = Rgba[];

function hex(c: string, a = 255): Rgba {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

/** 決まった並びの疑似乱数（タイルごとに同じ絵になる） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function solid(color: Rgba): Tile {
  return new Array<Rgba>(TILE_SIZE * TILE_SIZE).fill(color);
}

function speckle(base: string, dots: string[], seed: number, count = 40): Tile {
  const tile = solid(hex(base));
  const rnd = lcg(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * TILE_SIZE);
    const y = Math.floor(rnd() * TILE_SIZE);
    tile[y * TILE_SIZE + x] = hex(dots[i % dots.length]);
  }
  return tile;
}

function blobs(tile: Tile, color: string, seed: number, n: number): Tile {
  const rnd = lcg(seed);
  const c = hex(color);
  for (let i = 0; i < n; i++) {
    const x = 1 + Math.floor(rnd() * (TILE_SIZE - 3));
    const y = 1 + Math.floor(rnd() * (TILE_SIZE - 3));
    tile[y * TILE_SIZE + x] = c;
    tile[y * TILE_SIZE + x + 1] = c;
    tile[(y + 1) * TILE_SIZE + x] = c;
    if (i % 2 === 0) tile[(y + 1) * TILE_SIZE + x + 1] = c;
  }
  return tile;
}

function paintTile(name: TileName): Tile {
  switch (name) {
    case 'grass_top':
      return speckle('#5DBB3F', ['#4CA332', '#73CC52'], 11);
    case 'dirt':
      return speckle('#8B5A2B', ['#6F4520', '#A06A38'], 22);
    case 'grass_side': {
      const t = speckle('#8B5A2B', ['#6F4520', '#A06A38'], 22);
      const g = speckle('#5DBB3F', ['#4CA332', '#73CC52'], 11);
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < TILE_SIZE; x++) t[y * TILE_SIZE + x] = g[y * TILE_SIZE + x];
      }
      return t;
    }
    case 'stone':
      return speckle('#8E8E8E', ['#757575', '#A5A5A5'], 33);
    case 'sand':
      return speckle('#E8D9A0', ['#D6C487'], 44, 30);
    case 'log_side': {
      const t = solid(hex('#8A5A2E'));
      for (let x = 0; x < TILE_SIZE; x++) {
        if (x % 4 === 1) {
          for (let y = 0; y < TILE_SIZE; y++) t[y * TILE_SIZE + x] = hex('#6B4421');
        }
      }
      return t;
    }
    case 'log_top': {
      const t = solid(hex('#8A5A2E'));
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
          if (d >= 7) t[y * TILE_SIZE + x] = hex('#6B4421');
          else if (Math.floor(d) % 2 === 0) t[y * TILE_SIZE + x] = hex('#B88A55');
        }
      }
      return t;
    }
    case 'leaves':
      return speckle('#3E9B2F', ['#2E7D22'], 55, 60);
    case 'coal_ore':
      return blobs(speckle('#8E8E8E', ['#757575', '#A5A5A5'], 33), '#222222', 66, 5);
    case 'iron_ore':
      return blobs(speckle('#8E8E8E', ['#757575', '#A5A5A5'], 33), '#E0A872', 77, 5);
    case 'water':
      return solid(hex('#3A7BD5', Math.round(WATER_ALPHA * 255)));
    case 'bedrock':
      return speckle('#3A3A3A', ['#555555'], 88, 50);
  }
}

/** タイルのピクセル（テストで色を調べるため公開） */
export function getTilePixels(name: TileName): readonly Rgba[] {
  return paintTile(name);
}

/** [上, 下, 横] のタイル。air は無し */
export const BLOCK_TILES: Readonly<Partial<Record<BlockId, readonly [TileName, TileName, TileName]>>> = {
  grass: ['grass_top', 'dirt', 'grass_side'],
  dirt: ['dirt', 'dirt', 'dirt'],
  stone: ['stone', 'stone', 'stone'],
  sand: ['sand', 'sand', 'sand'],
  log: ['log_top', 'log_top', 'log_side'],
  leaves: ['leaves', 'leaves', 'leaves'],
  coal_ore: ['coal_ore', 'coal_ore', 'coal_ore'],
  iron_ore: ['iron_ore', 'iron_ore', 'iron_ore'],
  water: ['water', 'water', 'water'],
  bedrock: ['bedrock', 'bedrock', 'bedrock'],
};

/** タイルの UV の四角 [u0, v0, u1, v1]（v は下から。となりのタイルがにじまないよう少し内側） */
export function tileUv(name: TileName): [number, number, number, number] {
  const i = TILE_NAMES.indexOf(name);
  const col = i % ATLAS_COLS;
  const row = Math.floor(i / ATLAS_COLS);
  const e = 0.01;
  return [
    (col * TILE_SIZE + e) / ATLAS_WIDTH,
    (row * TILE_SIZE + e) / ATLAS_HEIGHT,
    ((col + 1) * TILE_SIZE - e) / ATLAS_WIDTH,
    ((row + 1) * TILE_SIZE - e) / ATLAS_HEIGHT,
  ];
}

/** アトラスのピクセル列（DataTexture は 1 行目が下なので、タイル内で上下を入れ替えて書く） */
export function buildAtlasData(): Uint8Array {
  const data = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  TILE_NAMES.forEach((name, i) => {
    const col = i % ATLAS_COLS;
    const row = Math.floor(i / ATLAS_COLS);
    const tile = paintTile(name);
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const px = col * TILE_SIZE + x;
        const py = row * TILE_SIZE + (TILE_SIZE - 1 - y);
        const o = (py * ATLAS_WIDTH + px) * 4;
        const c = tile[y * TILE_SIZE + x];
        data[o] = c[0];
        data[o + 1] = c[1];
        data[o + 2] = c[2];
        data[o + 3] = c[3];
      }
    }
  });
  return data;
}

export function createAtlasTexture(): DataTexture {
  const tex = new DataTexture(buildAtlasData(), ATLAS_WIDTH, ATLAS_HEIGHT, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
