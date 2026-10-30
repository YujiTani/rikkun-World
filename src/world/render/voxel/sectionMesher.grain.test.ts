import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../../contracts';
import { BLOCK_INDEX } from '../../blocks/blockTypes';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { MAX_GRAINS } from '../looks';
import { SectionMesher } from './sectionMesher';

/**
 * MINE-1B: 鉱石の「とびだす つぶ」を メッシュの 面ごとの 数〔aData〕に のせる。
 * aData = [種類, 行, 角の 印 3 ビット | つぶ << 3, 面の 向き | 旗]。つぶ = 0 は ふつうの 面・1 は 地の 石・2 以上は つぶの 色〔grainList の 番号 + 2〕。
 */
function world(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
  w.fill(0, 0, 0, 47, 0, 47, 'bedrock');
  w.fill(0, 1, 0, 47, 20, 47, 'stone');
  w.fill(23, 17, 25, 25, 19, 27, 'air'); // 石の 台の 中の くぼみ〔ほらあなの かべ〕。鉱石は その かべに おく〔地面の 上の 面〕だと 地形あつかいで つぶが 付かない
  return w;
}

/** 区画 (1,1,1) の 小ブロックの 面を 全部 読んで [種類, つぶ] を 集める */
function seen(w: ArrayVoxelWorld): { kinds: Set<number>; grains: Set<number> } {
  const d = new SectionMesher(w).build(1, 1, 1, 'micro');
  const kinds = new Set<number>();
  const grains = new Set<number>();
  for (const p of d.pieces) {
    for (let v = 0; v < p.vertexCount; v++) {
      kinds.add(p.data[v * 4]!);
      grains.add(p.data[v * 4 + 2]! >> 3);
    }
  }
  return { kinds, grains };
}

describe('鉱石の つぶを 面の 数に のせる', () => {
  it('石だけの 世界〔くぼみ つき〕: つぶは 0 だけ〔いままでと 同じ〕', () => {
    const { grains } = seen(world());
    expect([...grains]).toEqual([0]);
  });

  it('鉱石を おくと 種類〔64 以上も 切れない〕と つぶ〔地の 石 1・色 2 以上〕が のる', () => {
    const ids: BlockId[] = ['coal_ore', 'iron_ore', 'kin_ore', 'suisho_ore', 'diamond_ore', 'hotaruishi'];
    for (const id of ids) {
      const w = world();
      w.setBlock(24, 18, 24, id); // くぼみの 北の かべ〔面が 南を 向く〕
      const { kinds, grains } = seen(w);
      expect(kinds.has(BLOCK_INDEX[id]), `${id} の 番号`).toBe(true);
      const g = [...grains].filter((v) => v > 0);
      expect(g.length, `${id} の つぶ`).toBeGreaterThan(0);
      expect(Math.max(...g), `${id} の つぶの 番号`).toBeLessThan(MAX_GRAINS + 2);
      expect(Math.max(...g), `${id} に 色の つぶ`).toBeGreaterThanOrEqual(2);
    }
  });
});
