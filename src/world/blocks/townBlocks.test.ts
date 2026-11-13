import { describe, expect, it } from 'vitest';
import { CRAFT_RECIPES } from '../../craft/recipes';
import { DIG_DEFAULTS } from '../../dig/config';
import { ITEM_TYPES } from '../../inventory/items';
import { EMISSION, OPACITY } from '../light/opacity';
import { BLOCK_INDEX, BLOCK_TYPES, isOpaqueIndex, isPropIndex } from './blockTypes';
import { TOWN_BLOCK_DEFS, TOWN_BLOCK_IDS, isTownBlockId } from './townBlocks';
import { BLOCK_TILES, TILE_NAMES, buildAtlasData, ATLAS_COLS, ATLAS_WIDTH, TILE_SIZE } from './textures';
import { paintTownTile } from './townTextures';

/**
 * AC44〔1B-1〕（TOWN-1-place.md §4.5b）: 街の 新しい ブロック。§4.5b の 表の 40 行が ぜんぶ ブロックに あり、絵が ある。
 * 番号は 今の いちばん 後ろより 後ろ。表で「光る」の 物は 光、「すける」の 物は 向こうが 見える。街の 中で こわせず アイテムに ならない・クラフトの 表に ない。
 */

/** §4.5b の 表 40 行（見本 # の じゅん）。名前・すける・光る。表を ここに うつした（仕様の 表の 行が 読めるように） */
const SPEC_40: readonly { n: number; name: string; see: boolean; glow: 'light' | 'deco' | null }[] = [
  { n: 1, name: 'くろかわら', see: false, glow: null },
  { n: 2, name: 'あおかわら', see: false, glow: null },
  { n: 3, name: 'ふるかわら', see: false, glow: null },
  { n: 4, name: 'むねがわら', see: false, glow: null },
  { n: 5, name: 'いたぶき', see: false, glow: null },
  { n: 6, name: 'かやぶき', see: false, glow: null },
  { n: 7, name: 'いしづみ', see: false, glow: null },
  { n: 8, name: 'こいしづみ', see: false, glow: null },
  { n: 9, name: 'いしだたみ A', see: false, glow: null },
  { n: 10, name: 'いしだたみ B', see: false, glow: null },
  { n: 11, name: 'いしだたみ C', see: false, glow: null },
  { n: 12, name: 'いしだん', see: false, glow: null },
  { n: 13, name: 'こけいし', see: false, glow: null },
  { n: 14, name: 'つち', see: false, glow: null },
  { n: 15, name: 'じゃり', see: false, glow: null },
  { n: 16, name: 'いたばり', see: false, glow: null },
  { n: 17, name: 'こいいたばり', see: false, glow: null },
  { n: 18, name: 'ゆかいた', see: false, glow: null },
  { n: 19, name: 'しっくい', see: false, glow: null },
  { n: 20, name: 'くらかべ', see: false, glow: null },
  { n: 21, name: 'なまこかべ', see: false, glow: null },
  { n: 22, name: 'つちかべ', see: false, glow: null },
  { n: 23, name: 'はしら', see: false, glow: null },
  { n: 24, name: 'しゅばしら', see: false, glow: null },
  { n: 25, name: 'こうしまど', see: true, glow: null },
  { n: 26, name: 'あかこうし', see: true, glow: null },
  { n: 27, name: 'しょうじ', see: false, glow: 'deco' },
  { n: 28, name: 'たたみ', see: false, glow: null },
  { n: 29, name: 'しまひさし 朱', see: false, glow: null },
  { n: 30, name: 'しまひさし 黄', see: false, glow: null },
  { n: 31, name: 'しまひさし 藍', see: false, glow: null },
  { n: 32, name: 'のれん 藍', see: false, glow: null },
  { n: 33, name: 'のれん 朱', see: false, glow: null },
  { n: 34, name: 'あんどん', see: false, glow: 'light' },
  { n: 35, name: 'かんばん', see: false, glow: null },
  { n: 36, name: 'てすり', see: true, glow: null },
  { n: 37, name: 'たけ', see: false, glow: null },
  { n: 38, name: 'たけがき', see: true, glow: null },
  { n: 39, name: 'たる', see: false, glow: null },
  { n: 40, name: 'はちうえ', see: true, glow: null },
];

describe('AC44 街の 新しい ブロック', () => {
  it('表の 40 行が ぜんぶ ブロックに ある（名前・すける・光る が 表の とおり）', () => {
    expect(TOWN_BLOCK_DEFS.length).toBeGreaterThanOrEqual(SPEC_40.length);
    SPEC_40.forEach((row, i) => {
      const d = TOWN_BLOCK_DEFS[i]!;
      expect(d.name, `見本 ${row.n}`).toBe(row.name);
      expect(d.see, `${row.name} の すける`).toBe(row.see);
      expect(d.glow, `${row.name} の 光る`).toBe(row.glow);
      expect(BLOCK_INDEX[d.id], `${d.id} が BLOCK_TYPES に ある`).toBeGreaterThan(0);
      expect(BLOCK_TYPES[BLOCK_INDEX[d.id]!]!.name).toBe(row.name);
    });
  });

  it('番号は 街の ブロックが いちばん 後ろ（今の いちばん 後ろより 後ろ）・ならびは 表の じゅん', () => {
    const idx = TOWN_BLOCK_IDS.map((id) => BLOCK_INDEX[id]);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1]! + 1);
    const maxOther = Math.max(...BLOCK_TYPES.map((t, i) => (isTownBlockId(t.id) ? -1 : i)));
    expect(Math.min(...idx)).toBeGreaterThan(maxOther);
    expect(idx.at(-1)).toBe(BLOCK_TYPES.length - 1);
  });

  it('どの ブロックにも 絵が ある（アトラスに 入って いて 透明だけでは ない）。すけない ブロックは ぜんぶ 不透明', () => {
    const atlas = buildAtlasData();
    for (const d of TOWN_BLOCK_DEFS) {
      const tiles = BLOCK_TILES[d.id];
      expect(tiles, `${d.id} の 絵の 表`).toBeTruthy();
      for (const name of tiles!) expect(TILE_NAMES.includes(name), `${d.id}: ${name} が アトラスに ある`).toBe(true);
      const name = tiles![2];
      const i = TILE_NAMES.indexOf(name);
      let opaque = 0;
      for (let y = 0; y < TILE_SIZE; y++) {
        for (let x = 0; x < TILE_SIZE; x++) {
          const o = ((Math.floor(i / ATLAS_COLS) * TILE_SIZE + y) * ATLAS_WIDTH + (i % ATLAS_COLS) * TILE_SIZE + x) * 4;
          if (atlas[o + 3]! > 0) opaque++;
        }
      }
      expect(opaque, `${d.id} の 絵に 見える ドットが ある`).toBeGreaterThan(20);
      if (!d.see) expect(opaque, `${d.id}（すけない）は ぜんぶ 不透明`).toBe(TILE_SIZE * TILE_SIZE);
      expect(paintTownTile(d.id)).toEqual(paintTownTile(d.id)); // いつも 同じ 絵
    }
  });

  it('光る 物は 光り（あんどん）、しょうじは 見た目だけ（明るさ 0）。すける 物は 光を 通し 面を かくさない', () => {
    for (const d of TOWN_BLOCK_DEFS) {
      const i = BLOCK_INDEX[d.id]!;
      if (d.glow === 'light') expect(EMISSION[i], `${d.id} は 光る`).toBeGreaterThan(0);
      else expect(EMISSION[i], `${d.id} は 光らない（かざり光 は 明るさ 0）`).toBe(0);
      if (d.see) {
        expect(OPACITY[i], `${d.id} は 光を 通す`).toBeLessThan(15);
        expect(isPropIndex(i) || !isOpaqueIndex(i), `${d.id} は となりの 面を かくさない`).toBe(true);
      } else {
        expect(OPACITY[i], `${d.id} は 光を 通さない`).toBe(15);
      }
    }
  });

  it('街の 中で こわせず アイテムに ならない・クラフトの 表に ない', () => {
    const items = new Set(ITEM_TYPES.map((t) => t.id as string));
    const ingredients = new Set<string>();
    for (const r of CRAFT_RECIPES) {
      ingredients.add(r.output.item as string);
      for (const k of r.inputs) ingredients.add(k.item as string);
    }
    for (const d of TOWN_BLOCK_DEFS) {
      expect(BLOCK_TYPES[BLOCK_INDEX[d.id]!]!.breakable, `${d.id} は こわせない`).toBe(false);
      expect(DIG_DEFAULTS.hardness[d.id], `${d.id} の ほる 固さ`).toBeNull();
      expect(items.has(d.id), `${d.id} は アイテムに ならない`).toBe(false);
      expect(ingredients.has(d.id), `${d.id} は クラフトの 表に ない`).toBe(false);
    }
  });
});
