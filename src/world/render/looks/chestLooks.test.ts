import { describe, expect, it } from 'vitest';
import { CHEST_BLOCK_IDS, chestBlockInfo, chestFrontAt } from '../../blocks/chestBlock';
import { createPalette } from './common';
import { chestLidGrid, createChestKinds, createKodoWakuKind, setChestWorldReader } from './chestLooks';
import { LOOK_VOLUME } from './types';

/** MINE-1C: 宝箱の 小ブロックの 形（内部の 約束。仕様の 受け入れ基準は mineChestBlocks.test.ts ほか） */
const pal = createPalette();
const kinds = createChestKinds(pal.P);
const buf = new Uint8Array(LOOK_VOLUME);
const count = (id: string): number => {
  kinds[id]!.fill(0, 0, 0, 63, buf);
  return buf.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
};

describe('chestLooks', () => {
  it('16 この 宝箱と わく に 見た目が ある・色番号は パレットの 中', () => {
    expect(Object.keys(kinds).sort()).toEqual([...CHEST_BLOCK_IDS].sort());
    const rgb = pal.rgb();
    for (const id of CHEST_BLOCK_IDS) {
      kinds[id]!.fill(1, 2, 3, 63, buf);
      for (const v of buf) expect(v * 3 + 2).toBeLessThan(rgb.length);
      expect(kinds[id]!.occludes).toBe(false);
    }
    expect(createKodoWakuKind(pal.P).fill).toBeTypeOf('function');
  });

  it('向きを かえても 小ブロックの 数は 同じ・本体と のこりの マスの 合計は 向きに よらない', () => {
    const RIGHT: Record<string, [number, number]> = { n: [-1, 0], e: [0, -1], s: [1, 0], w: [0, 1] };
    for (const tier of [1, 2, 3, 4]) {
      for (const open of ['', '_open']) {
        const sums = (['n', 'e', 's', 'w'] as const).map((f) => {
          const [rx, rz] = RIGHT[f]!;
          // 本体 (10,5,10)・のこり ＝ 本体の 右どなり
          const map = new Map<string, string>([
            ['10,5,10', `takarabako_${tier}${open}`],
            [`${10 + rx},5,${10 + rz}`, `takarabako_${tier}${open}_r`],
          ]);
          setChestWorldReader((x, y, z) => map.get(`${x},${y},${z}`) ?? 'air');
          const n = (bx: number, bz: number, id: string): number => {
            kinds[id]!.fill(bx, 5, bz, 63, buf);
            return buf.reduce((m, v) => m + (v > 0 ? 1 : 0), 0);
          };
          const r = n(10, 10, `takarabako_${tier}${open}`) + n(10 + rx, 10 + rz, `takarabako_${tier}${open}_r`);
          setChestWorldReader(null);
          return r;
        });
        expect(new Set(sums).size, `段 ${tier}${open}`).toBe(1);
        expect(sums[0]).toBeGreaterThan(0);
      }
    }
  });

  it('段が 上がるほど かざりで 小ブロックが ふえる（とじた 形）', () => {
    const total = [1, 2, 3, 4].map((t) => count(`takarabako_${t}`) + count(`takarabako_${t}_r`));
    expect(total[1]!).toBeGreaterThan(total[0]!);
    expect(total[2]!).toBeGreaterThan(total[1]!);
  });

  it('ふたの 形は 18×9×9・id から 段と 向きが 読める', () => {
    for (const tier of [1, 2, 3, 4] as const) {
      const g = chestLidGrid(tier);
      expect(g.lid).toHaveLength(18 * 81);
      expect(g.lid.some((k) => k !== '')).toBe(true);
      expect(g.bodyOpen.some((k) => k !== '')).toBe(true);
    }
    expect(chestBlockInfo('takarabako_3_open_r')).toMatchObject({ tier: 3, open: true, rest: true });
    const m = new Map([['0,0,0', 'takarabako_3'], ['0,0,1', 'takarabako_3_r']]);
    expect(chestFrontAt((x, y, z) => m.get(`${x},${y},${z}`) ?? 'air', 0, 0, 0)).toBe('w'); // のこりが +z どなり
    expect(chestFrontAt((x, y, z) => m.get(`${x},${y},${z}`) ?? 'air', 0, 0, 1)).toBe('w');
  });
});
