import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import type { BlockId } from '../../contracts';
import { tansuPixels } from '../../storage/tansuArt';
import { FARM_TILE_NAMES, paintFarmTile } from './farmTextures';

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
  | 'bedrock'
  | 'furnace_top'
  | 'furnace_side'
  | 'kawara'
  | 'brick'
  | 'torch'
  | 'start_torch'
  | 'tansu_front'
  | 'tansu_top'
  | VoxITileName
  | FarmTileName;

/** VOX-I-1（12 の国）のふつうの絵（一ひねりの絵は #185） */
export type VoxITileName = 'snow' | 'momiji_leaves' | 'matsu_leaves' | 'flower_y' | 'flower_o' | 'flower_p' | 'bamboo' | 'susuki' | 'kusa' | 'nobana';
const VOX_I_TILES: readonly VoxITileName[] = ['snow', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo', 'susuki', 'kusa', 'nobana'];

/** M7 農業の絵の名前（`farm.texture` の name と同じ） */
export type FarmTileName =
  | 'farmland_top' | 'farmland_wet_top' | 'farmland_side' | 'farmland_wet_side'
  | `crop_${'onion' | 'tomato' | 'pumpkin' | 'eggplant'}_${0 | 1 | 2 | 3}`
  | `wild_${'onion' | 'tomato' | 'pumpkin' | 'eggplant'}`
  | 'kakashi' | 'kakashi_head' | 'saku'
  | 'sprinkler_top' | 'sprinkler_side' | 'sprinkler_bottom';

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
  'furnace_top',
  'furnace_side',
  'kawara',
  'brick',
  'torch',
  'start_torch',
  'tansu_front',
  'tansu_top',
  ...(FARM_TILE_NAMES as readonly FarmTileName[]),
  ...VOX_I_TILES,
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

/**
 * ざわざわをへらす（#194）: 自然のブロックの絵の中の明暗の差を 地の色へ近づけ（contrast）、
 * 彩度を少しおさえる（saturation）。絵そのもの（点の場所・形）は変えない。
 */
export const TILE_CALM = { contrast: 0.5, saturation: 0.8 } as const;

/** 1 色をおさえる（c = もとの色、base = 地の色）。透明度はそのまま */
export function calmColor(c: Rgba, base: Rgba): Rgba {
  const { contrast, saturation } = TILE_CALM;
  const v = [0, 1, 2].map((i) => base[i] + (c[i] - base[i]) * contrast);
  const l = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  const o = v.map((x) => Math.max(0, Math.min(255, Math.round(l + (x - l) * saturation))));
  return [o[0], o[1], o[2], c[3]];
}

function calm(tile: Tile, base: string): Tile {
  const b = hex(base);
  return tile.map((c) => calmColor(c, b));
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

function fillRect(t: Tile, x0: number, y0: number, w: number, h: number, c: Rgba): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) t[y * TILE_SIZE + x] = c;
  }
}

/** かまど の「口」の四角（横の面）。火の絵もこの四角に重ねる */
export const FURNACE_MOUTH = { x: 4, y: 8, w: 8, h: 6 } as const;

/** かまど（上）: いしの灰色。まん中にえんとつの黒い穴 */
function furnaceTop(): Tile {
  const t = speckle('#8E8E8E', ['#757575', '#A5A5A5'], 33);
  fillRect(t, 5, 5, 6, 6, hex('#3A3A3A'));
  fillRect(t, 6, 6, 4, 4, hex('#1A1A1A'));
  return t;
}

/** かまど（横）: いしの灰色の箱に、黒い口（燃えていないとき口の中は暗い） */
function furnaceSide(): Tile {
  const t = speckle('#8E8E8E', ['#757575', '#A5A5A5'], 34, 30);
  const { x, y, w, h } = FURNACE_MOUTH;
  fillRect(t, x - 1, y - 1, w + 2, h + 2, hex('#5A5A5A'));
  fillRect(t, x, y, w, h, hex('#151515'));
  fillRect(t, x + 1, y + h - 2, w - 2, 2, hex('#2A2020'));
  fillRect(t, 0, 0, TILE_SIZE, 1, hex('#A5A5A5'));
  return t;
}

/** かわら: こい灰青に、明るい灰色のなみの線 3 本 */
function kawaraTile(): Tile {
  const t = solid(hex('#4A5560'));
  const line = hex('#B4BCC4');
  for (const base of [3, 8, 13]) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const y = base + (Math.floor(x / 2) % 2 === 0 ? 0 : 1);
      t[y * TILE_SIZE + x] = line;
    }
  }
  return t;
}

/** たいまつのタイル: 細い棒（はば 2 ドット、x=7〜8）。上の 3 ドット（y=4〜6）が炎、下が棒。まわりは見えない所 */
export const TORCH_PX: { x0: number; x1: number; y0: number; y1: number; flameRows: number } = { x0: 7, x1: 9, y0: 4, y1: 16, flameRows: 3 };

function paintTorch(special: boolean): Tile {
  const t = solid(hex('#000000', 0));
  const stick = special ? '#6b4a2a' : '#8a5a2e';
  for (let y = TORCH_PX.y0; y < TORCH_PX.y1; y++) {
    for (let x = TORCH_PX.x0; x < TORCH_PX.x1; x++) {
      let c: string;
      if (y === TORCH_PX.y0) c = special ? '#ffffff' : '#fff3a0';
      else if (y < TORCH_PX.y0 + TORCH_PX.flameRows) c = special ? '#ffd23f' : '#ff9d2e';
      else c = stick;
      // こわれない たいまつ: 赤いひもを 2 か所まく
      if (special && (y === 9 || y === 10 || y === 14)) c = '#d92b2b';
      t[y * TILE_SIZE + x] = hex(c);
    }
  }
  return t;
}

/** はな: くさの上の 小さな花（十字の板） */
function flowerTile(c: string): Tile {
  const t = solid(hex('#000000', 0));
  for (let y = 9; y < 16; y++) {
    t[y * TILE_SIZE + 7] = hex('#3E8B2F');
    t[y * TILE_SIZE + 8] = hex('#4CA332');
  }
  for (let y = 12; y < 16; y++) {
    t[y * TILE_SIZE + 5] = hex('#4CA332');
    t[y * TILE_SIZE + 10] = hex('#4CA332');
  }
  fillRect(t, 5, 5, 6, 5, hex(c));
  fillRect(t, 7, 6, 2, 3, hex('#FFF3B0'));
  return t;
}

/** すすき: 金色の穂（十字の板） */
function susukiTile(): Tile {
  const t = solid(hex('#000000', 0));
  for (const x of [3, 6, 9, 12]) {
    for (let y = 4 + (x % 3); y < 16; y++) t[y * TILE_SIZE + x] = hex(y < 9 ? '#E3C25A' : '#B89A3C');
    t[(3 + (x % 3)) * TILE_SIZE + x] = hex('#F5E39A');
    t[(4 + (x % 3)) * TILE_SIZE + x + 1] = hex('#E3C25A');
  }
  return t;
}

/** くさ（FLORA-75）: せの たかい くさ。はの先が 1 ブロックの 1/3〜5/9（絵の 上から 7〜10 ぎょう目から）。十字の板 */
function kusaTile(): Tile {
  const t = solid(hex('#000000', 0));
  const blades: [number, number, number][] = [[2, 9, -1], [4, 7, 0], [6, 10, 1], [8, 8, 0], [10, 9, -1], [12, 7, 1], [14, 10, 0]];
  for (const [x, top, lean] of blades) {
    for (let y = top; y < 16; y++) {
      const k = (y - top) / (16 - top);
      const xx = x + (k < 0.4 ? lean : 0);
      t[y * TILE_SIZE + xx] = hex(y === top ? '#B7D65A' : y < top + 2 ? '#8CC24A' : '#4E9A36');
      if (y > 13) t[y * TILE_SIZE + xx + 1] = hex('#3E8B2F');
    }
  }
  return t;
}

/** のばな（FLORA-75）: 小さな あわい あお 1 色の はな（背は 1 ブロックの 2/9〜4/9）。はなばたけの き・だいだい・うす紫、水、ゆき と 明るさが ちがう。ピンク・白は 使わない */
function nobanaTile(): Tile {
  const t = solid(hex('#000000', 0));
  for (const [x, top] of [[3, 12], [8, 9], [12, 11]] as const) {
    for (let y = top; y < 16; y++) t[y * TILE_SIZE + x] = hex('#3E8B2F');
    fillRect(t, x - 1, top - 2, 3, 3, hex('#8FC1F0'));
    t[(top - 1) * TILE_SIZE + x] = hex('#FFF3B0');
  }
  for (const x of [5, 6, 10, 14]) for (let y = 13; y < 16; y++) t[y * TILE_SIZE + x] = hex('#4CA332');
  return t;
}

/** たけ: 緑の柱。ふしが入る */
function bambooTile(): Tile {
  const t = speckle('#5DAA45', ['#52A03C', '#66B24D'], 94, 10);
  for (let y = 0; y < TILE_SIZE; y++) {
    if (y % 5 === 4) for (let x = 0; x < TILE_SIZE; x++) t[y * TILE_SIZE + x] = hex('#2E6B2A');
  }
  return t;
}

/** レンガ: 赤茶に、うすい灰色の目地 */
function brickTile(): Tile {
  const t = solid(hex('#B5523B'));
  const mortar = hex('#C9C9C9');
  const dark = hex('#9A4430');
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4;
    for (let x = 0; x < TILE_SIZE; x++) t[(y0 + 3) * TILE_SIZE + x] = mortar;
    const off = row % 2 === 0 ? 0 : 4;
    for (let x = off; x < TILE_SIZE; x += 8) {
      for (let y = y0; y < y0 + 3; y++) t[y * TILE_SIZE + x] = mortar;
    }
    t[(y0 + 1) * TILE_SIZE + ((off + 3) % TILE_SIZE)] = dark;
    t[(y0 + 1) * TILE_SIZE + ((off + 6) % TILE_SIZE)] = dark;
  }
  return t;
}

function paintTile(name: TileName): Tile {
  switch (name) {
    case 'grass_top':
      return calm(speckle('#5DBB3F', ['#4CA332', '#73CC52'], 11), '#5DBB3F');
    case 'dirt':
      return calm(speckle('#8B5A2B', ['#6F4520', '#A06A38'], 22), '#8B5A2B');
    case 'grass_side': {
      const t = calm(speckle('#8B5A2B', ['#6F4520', '#A06A38'], 22), '#8B5A2B');
      const g = calm(speckle('#5DBB3F', ['#4CA332', '#73CC52'], 11), '#5DBB3F');
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < TILE_SIZE; x++) t[y * TILE_SIZE + x] = g[y * TILE_SIZE + x];
      }
      return t;
    }
    case 'stone':
      return calm(speckle('#8E8E8E', ['#757575', '#A5A5A5'], 33), '#8E8E8E');
    case 'sand':
      return calm(speckle('#E8D9A0', ['#D6C487'], 44, 30), '#E8D9A0');
    case 'log_side': {
      const t = solid(hex('#8A5A2E'));
      for (let x = 0; x < TILE_SIZE; x++) {
        if (x % 4 === 1) {
          for (let y = 0; y < TILE_SIZE; y++) t[y * TILE_SIZE + x] = hex('#6B4421');
        }
      }
      return calm(t, '#8A5A2E');
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
      return calm(t, '#8A5A2E');
    }
    case 'leaves':
      return calm(speckle('#3E9B2F', ['#2E7D22'], 55, 60), '#3E9B2F');
    case 'coal_ore':
      // 鉱石の つぶ は さがす目じるしなので そのまま（地の石だけ おさえる）
      return blobs(calm(speckle('#8E8E8E', ['#757575', '#A5A5A5'], 33), '#8E8E8E'), '#222222', 66, 5);
    case 'iron_ore':
      return blobs(calm(speckle('#8E8E8E', ['#757575', '#A5A5A5'], 33), '#8E8E8E'), '#E0A872', 77, 5);
    case 'water':
      return solid(hex('#3A7BD5', Math.round(WATER_ALPHA * 255)));
    case 'bedrock':
      return calm(speckle('#3A3A3A', ['#555555'], 88, 50), '#3A3A3A');
    case 'furnace_top':
      return furnaceTop();
    case 'furnace_side':
      return furnaceSide();
    case 'kawara':
      return kawaraTile();
    case 'brick':
      return brickTile();
    case 'torch':
      return paintTorch(false);
    case 'start_torch':
      return paintTorch(true);
    case 'tansu_front':
      return tansuPixels('front').map((c) => hex(c));
    case 'tansu_top':
      return tansuPixels('top').map((c) => hex(c));
    case 'snow':
      return speckle('#D2E8F5', ['#C2DBEC', '#DDEFF9'], 91, 14);
    case 'momiji_leaves':
      return speckle('#DA7A35', ['#DE9A38', '#CC6A2C'], 92, 20);
    case 'matsu_leaves':
      return speckle('#32703E', ['#2A6236', '#397A46'], 93, 20);
    case 'flower_y':
      return flowerTile('#F5D63A');
    case 'flower_o':
      return flowerTile('#F28A2E');
    case 'flower_p':
      return flowerTile('#B79AE0');
    case 'bamboo':
      return bambooTile();
    case 'susuki':
      return susukiTile();
    case 'kusa':
      return kusaTile();
    case 'nobana':
      return nobanaTile();
    default:
      return paintFarmTile(
        name,
        paintTile('dirt').map((c) => '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('')),
      ).map((c) => (c ? hex(c) : hex('#000000', 0)));
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
  furnace: ['furnace_top', 'furnace_top', 'furnace_side'],
  kawara: ['kawara', 'kawara', 'kawara'],
  brick: ['brick', 'brick', 'brick'],
  torch: ['torch', 'torch', 'torch'],
  start_torch: ['start_torch', 'start_torch', 'start_torch'],
  // M6: 世界に向きのしかけは作らない（PO 決定）ので 4 面とも 前の面。向きは storage に記録する
  tansu: ['tansu_top', 'tansu_top', 'tansu_front'],
  // M7 農業。作物・やせい・かかし・さく は 十字の板（全部の面が同じ絵）。作物の絵は 3 だんかい（みのった）
  farmland: ['farmland_top', 'dirt', 'farmland_side'],
  farmland_wet: ['farmland_wet_top', 'dirt', 'farmland_wet_side'],
  crop_onion: ['crop_onion_3', 'crop_onion_3', 'crop_onion_3'],
  crop_tomato: ['crop_tomato_3', 'crop_tomato_3', 'crop_tomato_3'],
  crop_pumpkin: ['crop_pumpkin_3', 'crop_pumpkin_3', 'crop_pumpkin_3'],
  crop_eggplant: ['crop_eggplant_3', 'crop_eggplant_3', 'crop_eggplant_3'],
  wild_onion: ['wild_onion', 'wild_onion', 'wild_onion'],
  wild_tomato: ['wild_tomato', 'wild_tomato', 'wild_tomato'],
  wild_pumpkin: ['wild_pumpkin', 'wild_pumpkin', 'wild_pumpkin'],
  wild_eggplant: ['wild_eggplant', 'wild_eggplant', 'wild_eggplant'],
  kakashi: ['kakashi', 'kakashi', 'kakashi'],
  kakashi_head: ['kakashi_head', 'kakashi_head', 'kakashi_head'],
  saku: ['saku', 'saku', 'saku'],
  sprinkler: ['sprinkler_top', 'sprinkler_bottom', 'sprinkler_side'],
  // VOX-I-1（12 の国）。はな・すすき は 十字の板
  snow: ['snow', 'snow', 'snow'],
  momiji_leaves: ['momiji_leaves', 'momiji_leaves', 'momiji_leaves'],
  matsu_leaves: ['matsu_leaves', 'matsu_leaves', 'matsu_leaves'],
  flower_y: ['flower_y', 'flower_y', 'flower_y'],
  flower_o: ['flower_o', 'flower_o', 'flower_o'],
  flower_p: ['flower_p', 'flower_p', 'flower_p'],
  bamboo: ['bamboo', 'bamboo', 'bamboo'],
  susuki: ['susuki', 'susuki', 'susuki'],
  kusa: ['kusa', 'kusa', 'kusa'],
  nobana: ['nobana', 'nobana', 'nobana'],
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

/** タイルの一部（ドットの範囲 [px0, px1) × [py0, py1)、py は絵の上から）の UV [u0, v0, u1, v1] */
export function tileSubUv(name: TileName, px0: number, py0: number, px1: number, py1: number): [number, number, number, number] {
  const i = TILE_NAMES.indexOf(name);
  const col = i % ATLAS_COLS;
  const row = Math.floor(i / ATLAS_COLS);
  const e = 0.01;
  return [
    (col * TILE_SIZE + px0 + e) / ATLAS_WIDTH,
    (row * TILE_SIZE + (TILE_SIZE - py1) + e) / ATLAS_HEIGHT,
    (col * TILE_SIZE + px1 - e) / ATLAS_WIDTH,
    (row * TILE_SIZE + (TILE_SIZE - py0) - e) / ATLAS_HEIGHT,
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
