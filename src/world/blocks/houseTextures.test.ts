import { describe, expect, it } from 'vitest';
import { FACE_UV } from '../render/meshChunk';
import { furnitureBoxes } from './furnitureArt';
import { BLOCK_INDEX, BLOCK_TYPES } from './blockTypes';
import { FURN_FACE_TILES, HOUSE_ATLAS_TILE_NAMES, furnTileName, isHouseTile, paintHouseTile } from './houseTextures';
import { FURN_BLOCK_IDS, HOUSE_DOOR_PART_IDS, furnInfo, type FurnRot } from './houseBlocks';
import { BLOCK_TILES, TILE_NAMES, getTilePixels, tileUv, type TileName } from './textures';

/** HOUSE-1C PR-1（#304 1 か所）: エディターの 見本と 世界の ブロックは 同じ 絵の 表（アトラス）を 読む。新しい 絵は アトラスの さいごに 足す */

describe('世界の 絵の 表に 足した 絵', () => {
  it('家の ブロック 12 まい ＋ 家具 20 まい ＋ 建築 8 まい。名前は ぶつからず、アトラスの さいごに この 順で ならぶ', () => {
    expect(HOUSE_ATLAS_TILE_NAMES).toHaveLength(12 + 20 + 8); // PR-2 で 建築の ブロック 8 まい（かためた つち 2・足場 5・のぼり 1）を さいごに 足した
    expect(new Set(TILE_NAMES).size, 'アトラスの 名前は ぜんぶ ちがう').toBe(TILE_NAMES.length);
    expect(TILE_NAMES.slice(TILE_NAMES.length - HOUSE_ATLAS_TILE_NAMES.length)).toEqual([...HOUSE_ATLAS_TILE_NAMES]);
    for (const n of HOUSE_ATLAS_TILE_NAMES) expect(isHouseTile(n)).toBe(true);
    expect(isHouseTile('stone')).toBe(false);
  });

  it('どの 絵も 16×16。見本と 世界の 両方が 読む 絵の 画素が おなじ', () => {
    for (const n of HOUSE_ATLAS_TILE_NAMES) {
      const px = getTilePixels(n);
      expect(px, n).toHaveLength(256);
      const raw = paintHouseTile(n);
      expect(raw, n).toHaveLength(256);
      for (let i = 0; i < 256; i += 37) {
        const c = px[i]!;
        expect([(raw[i]! >> 16) & 255, (raw[i]! >> 8) & 255, raw[i]! & 255], `${n}[${i}]`).toEqual([c[0], c[1], c[2]]);
      }
    }
  });

  it('おふろの 水の 絵は ふつうの 水 `water` と ぶつからない 名前 `furn_bath_water`', () => {
    expect(furnTileName('bath_water')).toBe('furn_bath_water');
    expect(furnTileName('water')).toBe('water');
    expect(TILE_NAMES).toContain('furn_bath_water');
    expect(TILE_NAMES).toContain('water');
    expect(TILE_NAMES.filter((n) => n === 'water')).toHaveLength(1);
    expect(getTilePixels('furn_bath_water')).not.toEqual(getTilePixels('water'));
  });

  it('家具の 箱が 使う 絵の 名前は ぜんぶ アトラスに ある（ブロックの 絵と 同じ 名前の ものは そちらを 使う）', () => {
    const names = new Set<string>();
    for (const boxes of Object.values(furnitureBoxes())) {
      for (const b of boxes) for (const t of [b.top, b.side, ...Object.values(b.faces ?? {})]) names.add(furnTileName(t));
    }
    expect(names.size).toBeGreaterThan(10);
    for (const n of names) expect(TILE_NAMES, n).toContain(n);
  });
});

describe('ブロックごとの 絵', () => {
  it('新しい ブロックは ぜんぶ 上・下・横の 3 まいが アトラスに ある', () => {
    for (const id of ['house_floor', 'house_wall', 'house_roof', 'shoji', 'house_door', ...HOUSE_DOOR_PART_IDS, ...FURN_BLOCK_IDS] as const) {
      const t = BLOCK_TILES[id];
      expect(t, id).toBeDefined();
      for (const n of t!) expect(TILE_NAMES, `${id}: ${n}`).toContain(n);
    }
  });

  it('向きごとの たんす・かまどは 前の 絵が プレイヤーの ほう（rot 0 ＝ 南 +z・1 ＝ 西 −x・2 ＝ 北 −z・3 ＝ 東 +x）。うしろは うしろの 絵', () => {
    // 面の 番号: 0 上 1 下 2 +x 3 −x 4 +z 5 −z
    const FRONT = { 0: 4, 1: 3, 2: 5, 3: 2 } as const;
    const REAR = { 0: 5, 1: 2, 2: 4, 3: 3 } as const;
    for (const [kind, front, rear] of [['tansu', 'tansu_front', 'furn_tansu_rear'], ['furnace', 'furnace_side', 'furn_furnace_rear']] as const) {
      for (const rot of [0, 1, 2, 3] as FurnRot[]) {
        const id = rot === 0 ? kind : `${kind}_${(['', 'w', 'n', 'e'] as const)[rot]}`;
        const faces = FURN_FACE_TILES[id]!;
        expect(faces, id).toHaveLength(6);
        expect(faces[FRONT[rot]], `${id} 前`).toBe(front);
        expect(faces[REAR[rot]], `${id} うしろ`).toBe(rear);
        expect(faces[0], `${id} 上`).toBe(kind === 'tansu' ? 'tansu_top' : 'furnace_top');
        // 世界の 描画が 読む 面ごとの UV（render/meshChunk.ts）と 同じ 表
        expect(FACE_UV[BLOCK_INDEX[id as keyof typeof BLOCK_INDEX]!]![FRONT[rot]], `${id} UV`).toEqual(tileUv(front as TileName));
      }
    }
    expect(Object.keys(FURN_FACE_TILES)).toHaveLength(8);
  });

  it('向きの ある 家具は 向きごと・マスごとの id すべてに 絵の 表が ある（足し忘れ なし）', () => {
    const missing = BLOCK_TYPES.filter((t) => furnInfo(t.id) && !BLOCK_TILES[t.id]).map((t) => t.id);
    expect(missing).toEqual([]);
  });
});
