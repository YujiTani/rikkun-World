import { describe, expect, it } from 'vitest';
import type { FarmEvent, ItemStack } from '../contracts';
import { createBucket, isBucket, isFullBucket } from './bucket';
import { magmaId } from '../world/blocks/magma';
import { InventoryImpl as Inventory } from '../inventory/Inventory';
import { bucketItemPixels } from '../ui/bucketArt';

/** BUCKET-2（docs/design/BUCKET-2.md §3）: マグマの バケツ・わきどころを くむ */
function make(slot0: ItemStack | null, cells: Record<string, string> = {}) {
  const slots: Array<ItemStack | null> = [slot0];
  const events: FarmEvent[] = [];
  const port = createBucket({
    inventory: { slots: () => slots, setSlot: (i, s) => void (slots[i] = s) },
    emit: (e) => void events.push(e),
    tick: () => 1,
    world: {
      getBlock: (x: number, y: number, z: number) => (cells[`${x},${y},${z}`] ?? 'air') as never,
      setBlock: (x: number, y: number, z: number, id: string) => ((cells[`${x},${y},${z}`] = id), true),
    },
  });
  return { slots, events, port, cells };
}
const C = { x: 0, y: 0, z: 0 };

describe('BUCKET-2', () => {
  it('AC1: からの バケツで マグマ 8 → マグマの バケツ（量 8）、マスは 空気。量 3 なら 3', () => {
    const a = make({ item: 'bucket', count: 1 }, { '0,0,0': magmaId(8) });
    expect(a.port.fill(0, C)).toBe(true);
    expect(a.slots[0]).toEqual({ item: 'magma_bucket', count: 1, water: 8 });
    expect(a.cells['0,0,0']).toBe('air');
    const b = make({ item: 'bucket', count: 1 }, { '0,0,0': magmaId(3) });
    b.port.fill(0, C);
    expect(b.slots[0]).toEqual({ item: 'magma_bucket', count: 1, water: 3 });
  });

  it('AC2: みずの バケツで マグマは くめない・マグマの バケツで 水は くめない。マグマの バケツは マグマを 足せる', () => {
    const a = make({ item: 'water_bucket', count: 1, water: 4 }, { '0,0,0': magmaId(8) });
    expect(a.port.fill(0, C)).toBe(false);
    expect(a.cells['0,0,0']).toBe(magmaId(8));
    const b = make({ item: 'magma_bucket', count: 1, water: 4 }, { '0,0,0': 'water' });
    expect(b.port.fill(0, C)).toBe(false);
    const c = make({ item: 'magma_bucket', count: 1, water: 4 }, { '0,0,0': magmaId(8) });
    expect(c.port.fill(0, C)).toBe(true);
    expect(c.slots[0]!.water).toBe(8);
    expect(c.cells['0,0,0']).toBe(magmaId(4));
  });

  it('AC3: からの バケツで わきどころ → 量 8 の バケツ、わきどころは 空気。入った バケツでは かわらない', () => {
    for (const [spring, item] of [['wakimizu', 'water_bucket'], ['magma_wakimizu', 'magma_bucket']] as const) {
      const a = make({ item: 'bucket', count: 1 }, { '0,0,0': spring });
      expect(a.port.fill(0, C)).toBe(true);
      expect(a.slots[0]).toEqual({ item, count: 1, water: 8 });
      expect(a.cells['0,0,0']).toBe('air');
      const b = make({ item, count: 1, water: 2 }, { '0,0,0': spring });
      expect(b.port.fill(0, C)).toBe(false);
      expect(b.cells['0,0,0']).toBe(spring);
    }
  });

  it('AC4: マグマの バケツを 置いた あと → から。出来事に liquid magma。preview は 置く', () => {
    const a = make({ item: 'magma_bucket', count: 1, water: 8 });
    expect(a.port.preview(a.slots[0]!, { throughWater: false, waterCell: null, hit: null }, true, C, false)).toBe('bucketPlace');
    expect(a.port.placed(0, C)).toBe(true);
    expect(a.slots[0]).toEqual({ item: 'bucket', count: 1 });
    expect(a.events.at(-1)).toMatchObject({ type: 'bucketPlace', liquid: 'magma' });
    expect(isBucket('magma_bucket') && isFullBucket('magma_bucket') && !isFullBucket('bucket')).toBe(true);
  });

  it('AC5: 保存: マグマの バケツの 量が 読み直しで のこる', () => {
    const inv = new Inventory();
    inv.setSlot(0, { item: 'magma_bucket', count: 1, water: 5 });
    const inv2 = new Inventory();
    inv2.deserialize(JSON.parse(JSON.stringify(inv.serialize())));
    expect(inv2.slots()[0]).toMatchObject({ item: 'magma_bucket', water: 5 });
  });

  it('AC6: 絵: から・みず・マグマ の 3 つが ちがう', () => {
    const k = (id: 'bucket' | 'water_bucket' | 'magma_bucket') => JSON.stringify(bucketItemPixels(id));
    expect(new Set([k('bucket'), k('water_bucket'), k('magma_bucket')]).size).toBe(3);
  });
});
