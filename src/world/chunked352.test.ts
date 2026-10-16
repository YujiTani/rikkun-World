import { describe, expect, it, vi } from 'vitest';

// 世界の高さの定数を 352 に差しかえる（VOX-B で本当に上げる前に、入れ物が動くことを確かめる）
vi.mock('../contracts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../contracts')>()), WORLD_HEIGHT: 352, SEA_Y: 144 }));

import { WORLD_HEIGHT } from '../contracts';
import { ChunkedVoxelWorld } from './VoxelWorld';

describe('高さ 352 でも入れ物が動く', () => {
  it('定数が差しかわっている', () => {
    expect(WORLD_HEIGHT).toBe(352);
  });

  it('22 セクション・上下のはし・負の座標', () => {
    const w = new ChunkedVoxelWorld({ x: 48, z: 48 });
    expect(w.size.y).toBe(352);
    expect(w.column(0, 0)?.sections.length).toBe(22);
    expect(w.setBlock(5, 351, 5, 'stone')).toBe(true);
    expect(w.setBlock(5, 352, 5, 'stone')).toBe(false);
    expect(w.getBlock(5, 351, 5)).toBe('stone');
    expect(w.getBlock(5, 352, 5)).toBe('outside');
    expect(w.getBlock(5, 350, 5)).toBe('air');
    w.setBlock(17, 144, 40, 'water');
    expect(w.getBlock(17, 144, 40)).toBe('water');
    // 空気だけの列は ほぼ 0 バイト
    expect(w.section(0, 10, 0)?.kind).toBe('uniform');
    expect(w.section(0, 21, 0)?.kind).toBe('full');
  });

  it('地下をうめて「見えない」印と 列の端', () => {
    const w = new ChunkedVoxelWorld({ x: 48, z: 48 });
    w.fill(0, 0, 0, 47, 207, 47, 'stone'); // 地面 208 まで
    expect(w.isSectionHidden(1, 5, 1)).toBe(true);
    expect(w.isSectionHidden(1, 0, 1)).toBe(true);
    expect(w.isSectionHidden(1, 11, 1)).toBe(true);
    expect(w.isSectionHidden(1, 12, 1)).toBe(false); // y 192〜207 の上は 空気のセクション
    w.setBlock(24, 100, 24, 'air');
    expect(w.isSectionHidden(1, 6, 1)).toBe(false);
  });

  it('hash は全マスを読み、fillFlat は全高さを写す', () => {
    const w = new ChunkedVoxelWorld({ x: 16, z: 16 });
    w.setBlock(1, 300, 2, 'log');
    const out = new Uint8Array(16 * 352 * 16);
    w.fillFlat(out, 16, 16);
    expect(out.filter((v) => v !== 0).length).toBe(1);
    expect(w.hash().endsWith(`-${16 * 352 * 16}`)).toBe(true);
  });
});
