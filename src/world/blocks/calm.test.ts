// CALM（#194）: ブロックの絵の「ざわざわ」をへらす。受け入れ基準 1〜7（docs/tickets/CALM.md）
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TILE_CALM, TILE_NAMES, TILE_SIZE, calmColor, getTilePixels, type Rgba, type TileName } from './textures';
import { paintFarmTile } from './farmTextures';
import { tileAverage } from '../render/voxel/projection';
import { itemIconPixels } from '../../ui/itemIcon';

// ---- もとの絵（main の 2eec063 の色の表とたね）をテストの中で作りなおす ----
function hex(c: string): Rgba {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
type Tile = Rgba[];
function speckle(base: string, dots: string[], seed: number, count = 40): Tile {
  const tile: Tile = new Array<Rgba>(256).fill(hex(base));
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
const GRASS = '#5DBB3F';
const DIRT = '#8B5A2B';
const STONE = '#8E8E8E';
const oldGrassTop = () => speckle(GRASS, ['#4CA332', '#73CC52'], 11);
const oldDirt = () => speckle(DIRT, ['#6F4520', '#A06A38'], 22);
const oldStone = () => speckle(STONE, ['#757575', '#A5A5A5'], 33);
function oldLogSide(): Tile {
  const t: Tile = new Array<Rgba>(256).fill(hex('#8A5A2E'));
  for (let x = 0; x < 16; x++) if (x % 4 === 1) for (let y = 0; y < 16; y++) t[y * 16 + x] = hex('#6B4421');
  return t;
}
function oldLogTop(): Tile {
  const t: Tile = new Array<Rgba>(256).fill(hex('#8A5A2E'));
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d >= 7) t[y * 16 + x] = hex('#6B4421');
      else if (Math.floor(d) % 2 === 0) t[y * 16 + x] = hex('#B88A55');
    }
  }
  return t;
}
function oldGrassSide(): Tile {
  const t = oldDirt();
  const g = oldGrassTop();
  for (let i = 0; i < 4 * 16; i++) t[i] = g[i];
  return t;
}
const COAL = '#222222';
const IRON = '#E0A872';
const oldCoal = () => blobs(oldStone(), COAL, 66, 5);
const oldIron = () => blobs(oldStone(), IRON, 77, 5);

/** おさえる絵: [もとの絵, 各画素の地の色（行ごと）] */
const BASE_OF = (b: string) => () => hex(b);
const CALMED: Record<string, { old: () => Tile; base: (y: number) => Rgba; dot?: string }> = {
  grass_top: { old: oldGrassTop, base: BASE_OF(GRASS) },
  dirt: { old: oldDirt, base: BASE_OF(DIRT) },
  grass_side: { old: oldGrassSide, base: (y) => hex(y < 4 ? GRASS : DIRT) },
  stone: { old: oldStone, base: BASE_OF(STONE) },
  sand: { old: () => speckle('#E8D9A0', ['#D6C487'], 44, 30), base: BASE_OF('#E8D9A0') },
  log_side: { old: oldLogSide, base: BASE_OF('#8A5A2E') },
  log_top: { old: oldLogTop, base: BASE_OF('#8A5A2E') },
  leaves: { old: () => speckle('#3E9B2F', ['#2E7D22'], 55, 60), base: BASE_OF('#3E9B2F') },
  bedrock: { old: () => speckle('#3A3A3A', ['#555555'], 88, 50), base: BASE_OF('#3A3A3A') },
  coal_ore: { old: oldCoal, base: BASE_OF(STONE), dot: COAL },
  iron_ore: { old: oldIron, base: BASE_OF(STONE), dot: IRON },
};

/** 式（チケットの文章どおり、独立に書いたもの） */
function expected(c: Rgba, b: Rgba): Rgba {
  const v = [0, 1, 2].map((i) => b[i] + (c[i] - b[i]) * 0.5);
  const L = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  const o = v.map((x) => Math.min(255, Math.max(0, Math.round(L + (x - L) * 0.8))));
  return [o[0], o[1], o[2], c[3]];
}
const lum = (c: Rgba) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const sameRgba = (a: Rgba, b: Rgba) => a.every((v, i) => v === b[i]);

describe('CALM 基準 1: 数と式', () => {
  it('TILE_CALM は { contrast: 0.5, saturation: 0.8 }', () => {
    expect(TILE_CALM).toEqual({ contrast: 0.5, saturation: 0.8 });
  });
  it('calmColor が式どおり（例を手計算の値で ±0）', () => {
    const cases: Array<[string, string, number[]]> = [
      ['#5DBB3F', '#5DBB3F', [106, 181, 82]],
      ['#4CA332', '#5DBB3F', [97, 169, 75]],
      ['#73CC52', '#5DBB3F', [117, 190, 91]],
      ['#6F4520', '#8B5A2B', [117, 81, 47]],
      ['#A06A38', '#8B5A2B', [141, 99, 61]],
      ['#555555', '#3A3A3A', [72, 72, 72]],
      ['#757575', '#8E8E8E', [130, 130, 130]],
    ];
    for (const [c, b, want] of cases) {
      expect(Array.from(calmColor(hex(c), hex(b)).slice(0, 3))).toEqual(want);
    }
  });
  it('透明度はそのまま', () => {
    expect(calmColor([100, 150, 200, 77], [100, 150, 200, 255])[3]).toBe(77);
  });
});

describe('CALM 基準 2: おさえる絵の各画素 = calmColor(もとの画素, 地の色)', () => {
  for (const [name, spec] of Object.entries(CALMED)) {
    it(name, () => {
      const old = spec.old();
      const now = getTilePixels(name as TileName);
      expect(now).toHaveLength(256);
      for (let i = 0; i < 256; i++) {
        const y = Math.floor(i / 16);
        // 鉱石のつぶは基準 4 で見る（そのまま）
        if (spec.dot && sameRgba(old[i], hex(spec.dot))) continue;
        expect(Array.from(now[i]), `${name} (${i % 16},${y})`).toEqual(Array.from(expected(old[i], spec.base(y))));
      }
    });
  }
  it('grass_side の上 4 行は grass_top と、下は dirt と同じ画素', () => {
    const side = getTilePixels('grass_side');
    const top = getTilePixels('grass_top');
    const dirt = getTilePixels('dirt');
    for (let i = 0; i < 256; i++) expect(Array.from(side[i])).toEqual(Array.from(i < 64 ? top[i] : dirt[i]));
  });
  it('calmColor を直接かけた値と一致する（式の入口が 1 つ）', () => {
    const old = oldGrassTop();
    const now = getTilePixels('grass_top');
    for (let i = 0; i < 256; i++) expect(Array.from(now[i])).toEqual(Array.from(calmColor(old[i], hex(GRASS))));
  });
});

describe('CALM 基準 3: 明るさの差がもとの 55% 以下', () => {
  for (const [name, spec] of Object.entries(CALMED)) {
    it(name, () => {
      const old = spec.old();
      const now = getTilePixels(name as TileName);
      const idx = [...Array(256).keys()].filter((i) => !(spec.dot && sameRgba(old[i], hex(spec.dot))));
      const spread = (px: readonly Rgba[]) => Math.max(...idx.map((i) => lum(px[i]))) - Math.min(...idx.map((i) => lum(px[i])));
      const before = spread(old);
      expect(before).toBeGreaterThan(0);
      expect(spread(now)).toBeLessThanOrEqual(before * 0.55);
    });
  }
});

describe('CALM 基準 4: 鉱石のつぶはそのまま', () => {
  for (const [name, dot] of [['coal_ore', COAL], ['iron_ore', IRON]] as const) {
    it(name, () => {
      const old = (name === 'coal_ore' ? oldCoal : oldIron)();
      const now = getTilePixels(name);
      const want = old.map((c, i) => (sameRgba(c, hex(dot)) ? i : -1)).filter((i) => i >= 0);
      const got = [...now.keys()].filter((i) => sameRgba(now[i], hex(dot)));
      expect(want.length).toBeGreaterThan(0);
      expect(got).toEqual(want);
    });
  }
});

describe('CALM 基準 5: 変えない絵は 1 画素も変わらない', () => {
  // 今の出力（変更前）の FNV-1a ハッシュ
  const HASH: Record<string, string> = {
    water: 'f64947c5', furnace_top: '2aedb2c5', furnace_side: 'fdaf9b1d', kawara: 'e25734c5', brick: 'b40ddb95',
    torch: '4c858a0d', start_torch: '311711f5', tansu_front: '649007d9', tansu_top: '2ac3a495',
    farmland_top: '235cb4e0', farmland_wet_top: '2906be25',
    crop_onion_0: '1b480f19', crop_onion_1: '5ce26e5d', crop_onion_2: '261f5932', crop_onion_3: 'd65771a9',
    crop_tomato_0: 'c0651883', crop_tomato_1: 'f1a27135', crop_tomato_2: '77f1e782', crop_tomato_3: '62e36f5',
    crop_pumpkin_0: 'cc3fa597', crop_pumpkin_1: '8d4adfed', crop_pumpkin_2: '283ab975', crop_pumpkin_3: 'e5fa1b79',
    crop_eggplant_0: 'fcae0c15', crop_eggplant_1: '57e552ce', crop_eggplant_2: '9295e8e3', crop_eggplant_3: 'f590dbcb',
    wild_onion: '48c6e2c9', wild_tomato: '7990001f', wild_pumpkin: '3008fd95', wild_eggplant: '97bb96f9',
    kakashi: '4f4901a7', kakashi_head: '4a0dda11', saku: '4424eef9',
    sprinkler_top: '443e0c11', sprinkler_side: 'cb9ab32d', sprinkler_bottom: '6c49f3c5',
  };
  const fnv = (px: readonly Rgba[]) => {
    let x = 2166136261;
    for (const p of px) for (const v of p) { x ^= v; x = Math.imul(x, 16777619) >>> 0; }
    return x.toString(16);
  };
  it('おさえる絵と farmland の横 4 枚以外は、全部この表にある', () => {
    const skip = new Set([...Object.keys(CALMED), 'farmland_side', 'farmland_wet_side']);
    expect(TILE_NAMES.filter((n) => !skip.has(n)).sort()).toEqual(Object.keys(HASH).sort());
  });
  for (const [name, h] of Object.entries(HASH)) {
    it(name, () => expect(fnv(getTilePixels(name as TileName))).toBe(h));
  }
  it('farmland の横: 土の部分 = おさえた dirt、それ以外は今のまま', () => {
    const oldD = oldDirt();
    const oldDirtHex = oldD.map((c) => '#' + [c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
    const newDirt = getTilePixels('dirt');
    for (const name of ['farmland_side', 'farmland_wet_side'] as const) {
      const oldF = paintFarmTile(name, oldDirtHex).map((c) => (c ? hex(c) : ([0, 0, 0, 0] as Rgba)));
      const now = getTilePixels(name);
      let dirtPx = 0;
      for (let i = 0; i < 256; i++) {
        if (sameRgba(oldF[i], oldD[i])) {
          dirtPx++;
          expect(Array.from(now[i]), `${name} ${i}`).toEqual(Array.from(newDirt[i]));
        } else {
          expect(Array.from(now[i]), `${name} ${i}`).toEqual(Array.from(oldF[i]));
        }
      }
      expect(dirtPx).toBeGreaterThan(100);
    }
  });
});

describe('CALM 基準 6: アイコンと LOD の平均色は新しい絵から', () => {
  it('草・土・石のアイコンの画素 = 新しい横の絵', () => {
    const tiles = { grass: 'grass_side', dirt: 'dirt', stone: 'stone' } as const;
    for (const [item, tile] of Object.entries(tiles)) {
      const icon = itemIconPixels(item as 'grass');
      const px = getTilePixels(tile);
      for (let i = 0; i < 256; i++) expect(Array.from(icon[i])).toEqual(Array.from(px[i]));
    }
    // もとの絵ではない
    expect(Array.from(itemIconPixels('stone')[0])).not.toEqual(Array.from(oldStone()[0]));
  });
  it('tileAverage = 新しい絵の線形平均', () => {
    const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    for (const name of ['grass_top', 'grass_side', 'dirt', 'stone', 'sand', 'leaves', 'bedrock'] as const) {
      const px = getTilePixels(name);
      const avg = [0, 1, 2].map((k) => px.reduce((s, p) => s + lin(p[k]), 0) / px.length);
      const got = tileAverage(name);
      for (let k = 0; k < 3; k++) expect(got[k]).toBeCloseTo(avg[k], 9);
    }
  });
});

describe('CALM 基準 7: 切りかえ（calm=）がない', () => {
  it('textures.ts に calm= も location も無い', () => {
    const src = readFileSync(new URL('./textures.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/calm=/);
    expect(src).not.toMatch(/location/);
  });
});
