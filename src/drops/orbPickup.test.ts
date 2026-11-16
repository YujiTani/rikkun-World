import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { routeDropPicked } from '../duo/p2Feed';
import { createRng } from '../world/gen/random';
import { DropField } from './DropField';

/** TOWN-1 1.6〔1F〕AC65: 地面の yokai_orb は ひろった 人の さいふへ（もちものが いっぱいでも ひろえる。ほかの 物は 今どおり） */
const world: VoxelWorld = {
  size: { x: 64, y: 32, z: 64 },
  isLoaded: () => true,
  loadedBounds: () => ({ x0: 0, z0: 0, x1: 64, z1: 64 }),
  getBlock: (_x: number, y: number) => (y <= 8 ? 'stone' : 'air') as BlockId,
  setBlock: () => true,
  isSolid: (_x: number, y: number) => y <= 8,
} as unknown as VoxelWorld;
const AT = { x: 10.5, y: 9, z: 10.5 };

describe('地面の ようかいダマ', () => {
  it('もちものが いっぱいでも ひろって さいふへ・落とし物は きえる。ほかの 物は のこる', () => {
    const inv = new InventoryImpl();
    const wallet: number[] = [];
    inv.orbSink = (n) => void wallet.push(n);
    for (let i = 0; i < inv.size; i++) inv.setSlot(i, { item: 'dirt' as ItemId, count: 64 });
    const drops = new DropField({ world, inventory: inv, player: () => AT, rng: createRng(1) });
    drops.scatter(AT, [{ item: 'yokai_orb' as ItemId, count: 4 }]);
    drops.scatter(AT, [{ item: 'dirt' as ItemId, count: 1 }]);
    const marked: number[] = [];
    let pickedAll = 0;
    for (let i = 0; i < 300; i++) {
      pickedAll += drops.update(true).length;
      marked.push(...drops.walletPicked);
    }
    expect(wallet).toEqual([4]);
    expect(drops.list().map((v) => v.slots[0]!.item)).toEqual(['dirt']);
    expect(pickedAll, 'ようかいダマだけ ひろえた（土は いっぱいで ひろえない）').toBe(1);
    expect(marked, 'ようかいダマだけ 印が つく（実績の「ぶくろを とりもどした」に 数えない ため）').toHaveLength(1);
  });
});

describe('ひろった ログ', () => {
  it('ようかいダマは ログ・実績の 知らせに 出さない（さいふの「＋」だけ）。ほかの 物は 人ごとに 通す', () => {
    const seen: string[] = [];
    const route = routeDropPicked({ p1: (i) => void seen.push(`1:${i}`), p2: (i) => void seen.push(`2:${i}`) });
    route('yokai_orb' as ItemId, 4, true, 1);
    route('yokai_orb' as ItemId, 4, true, 2);
    route('dirt' as ItemId, 1, false, 2);
    expect(seen).toEqual(['2:dirt']);
  });
});
