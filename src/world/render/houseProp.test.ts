import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { furnitureQuads } from '../blocks/furnitureQuads';
import { FLAT_FURN_KINDS, FURN_BLOCK_IDS, FURN_LEN, HOUSE_DOOR_PART_IDS, furnInfo, type FurnRot } from '../blocks/houseBlocks';
import { emptyMesh } from './meshChunk';
import { pushHouseProp, shojiAxisAt } from './houseProp';

/** HOUSE-1C PR-1: 戸・しょうじ・向きの ある 家具（箱の 組み合わせ）を メッシュに 足す。描画回数は ふえない（同じ メッシュに 足す） */

const BOX_FURN_IDS = FURN_BLOCK_IDS.filter((id) => !FLAT_FURN_KINDS.has(furnInfo(id)!.kind));

function faces(id: string, axis: 'x' | 'z' = 'z') {
  const m = emptyMesh();
  const ok = pushHouseProp(m, 0, 0, 0, id, 1, 0, axis);
  return { m, ok };
}

describe('pushHouseProp', () => {
  it('家のものでなければ 何も 足さず false', () => {
    const { m, ok } = faces('stone');
    expect(ok).toBe(false);
    expect(m.faceCount).toBe(0);
    expect(m.positions).toHaveLength(0);
  });

  it('戸 4 つと しょうじ（どちらの 軸も）は 面を 足す。あけた 戸は しめた 戸と 形が ちがう', () => {
    for (const id of ['house_door', ...HOUSE_DOOR_PART_IDS, 'shoji']) {
      const { m, ok } = faces(id);
      expect(ok, id).toBe(true);
      expect(m.faceCount, id).toBeGreaterThan(0);
      expect(m.indices, id).toHaveLength(m.faceCount * 6);
      expect(m.positions, id).toHaveLength(m.faceCount * 12);
      expect(m.uvs, id).toHaveLength(m.faceCount * 8);
    }
    expect(faces('shoji', 'x').m.positions).not.toEqual(faces('shoji', 'z').m.positions);
    expect(faces('house_door_open').m.positions).not.toEqual(faces('house_door').m.positions);
  });

  it('向きの ある 家具(箱の 組み合わせ)の どの マスも 自分の マスの 中に おさまる（となりへ はみ出さない）', () => {
    const eps = 1e-6;
    for (const id of BOX_FURN_IDS) {
      const { m, ok } = faces(id);
      expect(ok, id).toBe(true);
      expect(m.faceCount, `${id} の 面`).toBeGreaterThan(0);
      m.positions.forEach((v, i) => {
        const high = i % 3 === 1; // y は 1 マスより 高い 家具(いすの せもたれ など)が ある。よこ・たては マスの 中
        expect(v, id).toBeGreaterThanOrEqual(-eps);
        expect(v, id).toBeLessThanOrEqual((high ? 2 : 1) + eps);
      });
    }
  });

  it('1 つの 家具の ぜんぶの マスの 面を あわせると、見本と 同じ 面の 数（1 まいも 失わず 2 回も 数えない）', () => {
    for (const kind of ['table', 'long_table', 'ofuro', 'chair', 'andon', 'shelf', 'stool', 'round_table'] as const) {
      for (const rot of [0, 1, 2, 3] as FurnRot[]) {
        let total = 0;
        for (const id of BOX_FURN_IDS.filter((i) => furnInfo(i)!.kind === kind && furnInfo(i)!.rot === rot)) total += faces(id).m.faceCount;
        expect(total, `${kind} rot${rot}`).toBe(furnitureQuads(kind, rot).length);
        expect(BOX_FURN_IDS.filter((i) => furnInfo(i)!.kind === kind && furnInfo(i)!.rot === rot)).toHaveLength(FURN_LEN[kind]);
      }
    }
  });

  it('あんどん・しょうじの 紙は 自分で 光る（ブロックの 光が 上がる）。いすは 光らない', () => {
    const lightOf = (id: string): number => Math.max(...faces(id).m.lights.filter((_, i) => i % 2 === 1));
    expect(lightOf('andon')).toBeGreaterThan(0);
    expect(lightOf('shoji')).toBeGreaterThan(0);
    expect(lightOf('chair')).toBe(0);
    expect(lightOf('house_door')).toBe(0);
  });

  it('同じ id は 何回 呼んでも 同じ 形（おぼえた 面を 使う）', () => {
    expect(faces('table_2_n').m.positions).toEqual(faces('table_2_n').m.positions);
    expect(faces('table_2_n').m.uvs).toEqual(faces('table_2_n').m.uvs);
  });
});

describe('shojiAxisAt: しょうじの 紙の 向き', () => {
  const idx = (ids: Record<string, string>) => (x: number, y: number, z: number): number => BLOCK_INDEX[(ids[`${x},${y},${z}`] ?? 'air') as never]!;
  it('となりが 東西に つづく かべ → z、南北に つづく かべ → x、どちらも なければ z', () => {
    expect(shojiAxisAt(idx({ '4,0,5': 'house_wall', '6,0,5': 'house_wall' }), 5, 0, 5)).toBe('z');
    expect(shojiAxisAt(idx({ '5,0,4': 'house_wall', '5,0,6': 'house_wall' }), 5, 0, 5)).toBe('x');
    expect(shojiAxisAt(idx({}), 5, 0, 5)).toBe('z');
    expect(shojiAxisAt(idx({ '5,0,4': 'shoji' }), 5, 0, 5)).toBe('x');
    expect(shojiAxisAt(idx({ '4,0,5': 'house_door' }), 5, 0, 5)).toBe('z');
  });
});
