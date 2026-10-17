import { describe, expect, it } from 'vitest';
import { uniformSection } from './sections';
import { ChunkedVoxelWorld } from './VoxelWorld';

/**
 * 「見えない」印と 地面の表面ブロック（#142、docs/tickets/SEETHRU.md 基準 10）。
 * 中まで固いセクションでも、となりの接する面が「地面の表面ブロック」（小ブロック地形で描く。高さ S が上のへりより下までへこむ）なら
 * 見えない にしない。ほかの（ふつうの）地下のセクションは これまでどおり「見えない」。
 * 手作りの世界の幅は 3×3 列（cx, cz = -1〜1）、高さ 64。
 */

/** top(x, z) が その列の いちばん上の石の y（それより上は空気）の世界 */
function stoneWorld(top: (x: number, z: number) => number): ChunkedVoxelWorld {
  const w = new ChunkedVoxelWorld({ x: 0, z: 0, y: 64 });
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) w.loadColumn({ cx, cz, sections: Array.from({ length: 4 }, () => uniformSection(0)) });
  }
  for (let z = -16; z < 32; z++) for (let x = -16; x < 32; x++) w.fill(x, 0, z, x, top(x, z), z, 'stone');
  return w;
}

describe('見えない印と 地面の表面ブロック（#142）', () => {
  it('どこも同じ高さ（表面がセクションの外）なら、中の セクション (0,1,0) は 見えない', () => {
    const w = stoneWorld(() => 34);
    expect(w.isSectionHidden(0, 1, 0)).toBe(true);
  });

  it('よこのとなりの接する面（x=-1 のがわ）が 表面ブロックなら 見えない にならない（x の向き）', () => {
    const w = stoneWorld((x) => (x < 0 ? 31 : 34)); // x<0 の表面は y=31 = セクション (-1,1,0) の いちばん上の段
    expect(w.isSectionHidden(0, 1, 0)).toBe(false);
  });

  it('z の向きも同じ', () => {
    const w = stoneWorld((_x, z) => (z >= 16 ? 31 : 34)); // z>=16 の表面は y=31。セクション (0,1,0) の +z のとなりは (0,1,1)
    expect(w.isSectionHidden(0, 1, 0)).toBe(false);
  });

  it('となりの表面が セクションの外（y=39 は上のセクション）なら、よこの面は ふつうの地下なので 見えない', () => {
    const w = stoneWorld((x) => (x < 0 ? 39 : 34));
    expect(w.isSectionHidden(0, 1, 0)).toBe(true);
  });

  it('上のとなりの 底の段（y=16）が 表面ブロックなら 見えない にならない（S が ブロックの底まで下がっても 上の面が見える）', () => {
    const w = stoneWorld(() => 16);
    expect(w.isSectionHidden(0, 0, 0)).toBe(false);
    const w2 = stoneWorld(() => 17); // 表面が 1 段上: 底の段は ふつうの固いブロック
    expect(w2.isSectionHidden(0, 0, 0)).toBe(true);
  });
  it('FIX-149 A: ななめ（x と y）のセクションの底をほって 表面が よこのふちに来たら、見えない が はずれる', () => {
    const w = stoneWorld(() => 33);
    expect(w.isSectionHidden(0, 1, 0)).toBe(true); // 印を一度読ませる
    w.setBlock(16, 33, 5, 'air');
    w.setBlock(16, 32, 5, 'air'); // セクション (1,2,0) の底の段。列の表面は y=31 = (1,1,0) の -x のふち
    expect(w.isSectionHidden(0, 1, 0)).toBe(false);
  });

  it('FIX-149 B: 同じほり方で ななめの セクション (0,1,0) も 作り直しに入る', () => {
    const w = stoneWorld(() => 33);
    w.takeDirtySections();
    w.setBlock(16, 33, 5, 'air');
    w.setBlock(16, 32, 5, 'air');
    expect(w.takeDirtySections()).toContainEqual({ cx: 0, sy: 1, cz: 0 });
  });

  it('FIX-149 C: セクションの角（x と z のななめ）をほると ななめの列のセクションも 作り直しに入る', () => {
    const w = stoneWorld(() => 33);
    w.takeDirtySections();
    w.setBlock(16, 33, 16, 'air');
    expect(w.takeDirtySections()).toContainEqual({ cx: 0, sy: 2, cz: 0 });
    w.setBlock(15, 33, 15, 'air');
    expect(w.takeDirtySections()).toContainEqual({ cx: 1, sy: 2, cz: 1 });
  });
});
