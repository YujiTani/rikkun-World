import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX, BLOCK_TYPES, isOpaqueIndex, isPropIndex } from './blockTypes';
import { OPACITY } from '../light/opacity';
import { SHAPE_BASES, SHAPE_BLOCKS, SHAPE_IDS, shapeBoxes } from './shapeBlocks';
import { BLOCK_TILES } from './textures';
import { emptyMesh, pushProp } from '../render/meshChunk';

describe('形つきブロック（WAFU-2）', () => {
  it('もとの ブロック × 形 の 数だけ あり（20 こ 前後）、id は ぜんぶ ちがい、BLOCK_TYPES の 末尾に 並ぶ', () => {
    const n = Object.values(SHAPE_BASES).reduce((a, b) => a + b.length, 0);
    expect(SHAPE_IDS.length).toBe(n);
    expect(n).toBeGreaterThanOrEqual(16);
    expect(n).toBeLessThanOrEqual(24);
    expect(new Set(SHAPE_IDS).size).toBe(n);
    const first = BLOCK_INDEX[SHAPE_IDS[0]!];
    SHAPE_IDS.forEach((id, k) => expect(BLOCK_INDEX[id]).toBe(first + k));
    expect(first + n + 4).toBe(BLOCK_TYPES.length); // そのあと 模様つきの 石 4 つ（WAFU-3）
  });
  it('当たりは 固い・光を 通す・となりの 面を かくさない・ほれない・もとの 絵を 使う', () => {
    for (const b of SHAPE_BLOCKS) {
      const i = BLOCK_INDEX[b.id];
      expect(BLOCK_TYPES[i]!.solid, b.id).toBe(true);
      expect(BLOCK_TYPES[i]!.breakable, b.id).toBe(false);
      expect(isPropIndex(i), b.id).toBe(true);
      expect(isOpaqueIndex(i), b.id).toBe(false);
      expect(OPACITY[i], b.id).toBe(0);
      expect(BLOCK_TILES[b.id], b.id).toEqual(BLOCK_TILES[b.base as keyof typeof BLOCK_TILES] ?? BLOCK_TILES[b.id]);
    }
  });
  it('形は 1 ブロックの 中に 入り、はしらは まんなか 3 小ブロック・うすいたは 3 だん・かきねは 3 はば 6 だん', () => {
    const w = 16 / 3;
    expect(shapeBoxes('hashira')[0]).toMatchObject({ min: [w, 0, w], max: [2 * w, 16, 2 * w] });
    expect(shapeBoxes('usuita_shita')[0]!.max[1]).toBeCloseTo(w);
    expect(shapeBoxes('usuita_ue')[0]!.min[1]).toBeCloseTo(2 * w);
    expect(shapeBoxes('kakine_x')[0]!.max[1]).toBeCloseTo(2 * w);
    expect(shapeBoxes('kakine_x')[0]!.max[2] - shapeBoxes('kakine_x')[0]!.min[2]).toBeCloseTo(w);
    expect(shapeBoxes('kasa').length).toBe(3);
    for (const b of SHAPE_BLOCKS) for (const x of shapeBoxes(b.shape)) for (let a = 0; a < 3; a++) { expect(x.min[a]!).toBeGreaterThanOrEqual(0); expect(x.max[a]!).toBeLessThanOrEqual(16); expect(x.max[a]!).toBeGreaterThan(x.min[a]!); }
  });
  it('描くと 面が できる（はしら 1 本 = 箱 1 つ = 面 5〜6）', () => {
    const m = emptyMesh();
    pushProp(m, 0, 5, 0, 'ara_ishi_hashira', 1, 0);
    expect(m.faceCount).toBe(5); // 下の 面は ゆかに ぴったりなので 描かない
    const k = emptyMesh();
    pushProp(k, 0, 5, 0, 'kawara_kasa', 1, 0);
    expect(k.faceCount).toBeGreaterThan(10);
  });
});
