import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { MAGMA_TUNING } from '../blocks/liquids';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/**
 * WATERFALL-1 版 2: マグマの 光（12）は たいまつ・ほたるいしと 同じ ブロックの 光。妖怪の 出る「暗い 所」（isDarkForSpawn）の 判定にも そのまま 入る。
 */
function dark(): { w: ArrayVoxelWorld; l: WorldLight } {
  const w = new ArrayVoxelWorld({ x: 48, y: 16, z: 48 });
  w.fill(0, 0, 0, 47, 0, 47, 'stone');
  w.fill(0, 4, 0, 47, 4, 47, 'stone');
  const l = new WorldLight(w, new SkyDarkness());
  l.update();
  l.flush();
  return { w, l };
}

describe('マグマの 光と 妖怪の 出る 暗さ', () => {
  it('まっくらな 部屋に マグマ 1 マス: その マスは 12、となりの 空気は 11。4 マス 先まで 妖怪が 出ない 明るさ', () => {
    const { w, l } = dark();
    expect(l.isDarkForSpawn(30, 1, 24)).toBe(true);
    w.setBlock(24, 1, 24, 'magma');
    l.update();
    l.flush();
    expect(l.blockLight(24, 1, 24)).toBe(MAGMA_TUNING.light);
    expect(l.blockLight(25, 1, 24)).toBe(MAGMA_TUNING.light - 1);
    for (let d = 1; d <= 4; d++) expect(l.isDarkForSpawn(24 + d, 1, 24), `${d} マス 先`).toBe(false);
    // マグマを とると もとの 暗さ
    w.setBlock(24, 1, 24, 'air');
    l.update();
    l.flush();
    expect(l.isDarkForSpawn(25, 1, 24)).toBe(true);
  });
  it('量 1 の マグマも 同じ 光（量で かわらない）', () => {
    const { w, l } = dark();
    w.setBlock(24, 1, 24, 'magma_1');
    l.update();
    l.flush();
    expect(l.blockLight(24, 1, 24)).toBe(MAGMA_TUNING.light);
  });
});
