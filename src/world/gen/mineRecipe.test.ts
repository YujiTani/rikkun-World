import { beforeAll, describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { InventoryImpl } from '../../inventory/Inventory';
import { BLOCK_TYPES } from '../blocks/blockTypes';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { createMineHook } from './mineHook';
import { SEEDS_20, genColumn, hook1c, type ChestRoll, type Shaft } from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * HOUSE-2A（#364）AC1（坑道 側）: 坑道の いちばん 下の へやで レシピを 1 まい 見つける（仕様 docs/design/HOUSE-2.md §2.1・§6.1）。
 *   宝箱の ある 坑道: 宝箱を あけると ふつうの わくに くわえて レシピの わくが 1 つ。宝箱の ない 坑道: 宝箱が 置かれる マスに まきもの（固く ない 1 マス）。右クリックで とる。
 * 約束（e2e/helpers/house.ts の「2A の 約束」）:
 *   shaft.recipe ＝ { kind: 'chest' | 'scroll', x, y, z, taken }（どの 坑道にも 1 つ。taken は いきている 世界を 読む）
 *   createMineHook の chest ポートに recipe(at: { x, y, z })（はじめて あけた／とった ときに 1 回だけ）。open(x, y, z) が まきものも 受ける。
 * どの レシピに なるかは src/house/recipes/recipes.test.ts（pick）と src/house/recipes/recipeLearn.test.ts。
 */

interface Recipe {
  kind: 'chest' | 'scroll';
  x: number;
  y: number;
  z: number;
  taken: boolean;
}
type WithRecipe = Shaft & { recipe?: Recipe };
interface Samples {
  seed: number;
  shaft: WithRecipe;
}

const chests: Samples[] = [];
const scrolls: Samples[] = [];
beforeAll(() => {
  for (const seed of SEEDS_20.slice(0, 5)) {
    const h = hook1c(seed);
    const sp = spawnOf(seed);
    for (const shaft of [h.startShaft(), ...h.shafts(sp.x - 1024, sp.z - 1024, sp.x + 1023, sp.z + 1023)]) {
      const list = shaft.chest ? chests : scrolls;
      if (list.length < 3 && !list.some((s) => s.shaft.id === shaft.id)) list.push({ seed, shaft });
    }
  }
}, 600_000);

interface Rig {
  mine: { shafts(x0: number, z0: number, x1: number, z1: number): WithRecipe[]; open(x: number, y: number, z: number): void; chestPreview(x: number, y: number, z: number): ChestRoll | null };
  world: ArrayVoxelWorld;
  inv: InventoryImpl;
  asked: { x: number; y: number; z: number }[];
}
function rig(seed: number, shaft: WithRecipe): Rig {
  const world = new ArrayVoxelWorld({ x: 0, z: 0 });
  const r = shaft.recipe!;
  const cells = shaft.chest ? shaft.chest.cells : [{ x: r.x, z: r.z }];
  for (const k of new Set(cells.map((c) => `${c.x >> 4},${c.z >> 4}`))) {
    const [cx, cz] = k.split(',').map(Number) as [number, number];
    world.loadColumn(genColumn(seed, cx, cz));
  }
  const inv = new InventoryImpl();
  const asked: Rig['asked'] = [];
  const chest = {
    add: (item: ItemId, count: number): number => inv.add(item, count),
    drop: (): void => {},
    say: (): void => {},
    telop: (): void => {},
    opened: (): void => {},
    recipe: (at: { x: number; y: number; z: number }): void => void asked.push({ ...at }),
  };
  return { mine: createMineHook({ seed, world, chest } as never) as unknown as Rig['mine'], world, inv, asked };
}
const takenOf = (r: Rig, s: WithRecipe): boolean | undefined => r.mine.shafts(s.recipe!.x, s.recipe!.z, s.recipe!.x, s.recipe!.z).find((q) => q.id === s.id)?.recipe?.taken;
const solidOf = (id: string): boolean | undefined => BLOCK_TYPES.find((t) => t.id === id)?.solid;

describe('AC1 坑道の 計画: どの 坑道にも レシピが 1 つ', () => {
  it('宝箱の ある 坑道も ない 坑道も 見つかる（見本が そろう）', () => {
    expect(chests.length).toBeGreaterThan(0);
    expect(scrolls.length).toBeGreaterThan(0);
  });

  it('宝箱の ある 坑道: kind chest・場所は 宝箱の 本体の マス（chest.x/y/z）・taken false', () => {
    for (const { shaft } of chests) expect(shaft.recipe, shaft.id).toEqual({ kind: 'chest', x: shaft.chest!.x, y: shaft.chest!.y, z: shaft.chest!.z, taken: false });
  });

  it('宝箱の ない 坑道: kind scroll・場所は いちばん 下の へや（room）の 中の 床の 高さ・taken false', () => {
    for (const { shaft } of scrolls) {
      const r = shaft.recipe!;
      expect(r, shaft.id).toMatchObject({ kind: 'scroll', taken: false });
      expect(r.x, `${shaft.id} x`).toBeGreaterThanOrEqual(shaft.room.x0);
      expect(r.x).toBeLessThanOrEqual(shaft.room.x1);
      expect(r.z, `${shaft.id} z`).toBeGreaterThanOrEqual(shaft.room.z0);
      expect(r.z).toBeLessThanOrEqual(shaft.room.z1);
      expect(r.y, `${shaft.id} y`).toBe(shaft.room.y);
      // 仕様 §2.1「へやの おくの かべに そった まん中の 床（宝箱の ある 坑道なら 宝箱が 置かれる マス）」: へやの ふちの 列の まん中
      const { x0, x1, z0, z1 } = shaft.room;
      const onXEdge = (r.x === x0 || r.x === x1) && r.z * 2 === z0 + z1;
      const onZEdge = (r.z === z0 || r.z === z1) && r.x * 2 === x0 + x1;
      expect(onXEdge || onZEdge, `${shaft.id}: へやの ふちの まん中（${r.x}, ${r.z} ／ へや x ${x0}〜${x1}・z ${z0}〜${z1}）`).toBe(true);
    }
  });
});

describe('AC1 宝箱: あけると レシピの わくが 1 つ ふえる', () => {
  it('はじめて あけた とき 1 回だけ recipe(at) が 呼ばれ（at ＝ shaft.recipe の マス）、2 マス どちらを もう 1 回 右クリックしても 呼ばれない。taken が true に なる', () => {
    for (const { seed, shaft } of chests.slice(0, 2)) {
      const r = rig(seed, shaft);
      const [a, b] = shaft.chest!.cells as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
      expect(takenOf(r, shaft), `${shaft.id}: あける 前`).toBe(false);
      r.mine.open(b.x, b.y, b.z);
      expect(r.asked, `${shaft.id}: レシピの わく`).toEqual([{ x: shaft.recipe!.x, y: shaft.recipe!.y, z: shaft.recipe!.z }]);
      for (const c of [a, b, a]) r.mine.open(c.x, c.y, c.z);
      expect(r.asked, `${shaft.id}: 2 回目は からっぽ（レシピも 出ない）`).toHaveLength(1);
      expect(takenOf(r, shaft), `${shaft.id}: あけた あと`).toBe(true);
    }
  }, 60_000);

  it('ふつうの わく（中身）は へらさない: 持ち物に 入る 物は 今までと 同じ（chestPreview の とおり）', () => {
    const { seed, shaft } = chests[0]!;
    const r = rig(seed, shaft);
    const c = shaft.chest!.cells[0]!;
    const preview = r.mine.chestPreview(c.x, c.y, c.z)!;
    r.mine.open(c.x, c.y, c.z);
    const want = new Map<string, number>();
    const ref = new InventoryImpl();
    for (const it of preview.items) ref.add(it.item, it.count);
    for (const s of ref.slots()) if (s) want.set(s.item, (want.get(s.item) ?? 0) + s.count);
    const got = new Map<string, number>();
    for (const s of r.inv.slots()) if (s) got.set(s.item, (got.get(s.item) ?? 0) + s.count);
    expect(got).toEqual(want);
  });
});

describe('AC1 まきもの: 宝箱の ない 坑道の いちばん 下の へや', () => {
  it('まきものの マスは 空気では なく、固く ない ブロック（通れる・右クリックで とる）', () => {
    for (const { seed, shaft } of scrolls.slice(0, 2)) {
      const r = rig(seed, shaft);
      const at = shaft.recipe!;
      const id = r.world.getBlock(at.x, at.y, at.z) as string;
      expect(id, `${shaft.id}: まきものの ブロック`).not.toBe('air');
      expect(solidOf(id), `${shaft.id}: ${id} は 固く ない`).toBe(false);
    }
  });

  it('右クリック（open）で とる: recipe(at) が 1 回・ブロックが 消える・taken が true。もう 1 回 右クリックしても 何も おきない', () => {
    for (const { seed, shaft } of scrolls.slice(0, 2)) {
      const r = rig(seed, shaft);
      const at = shaft.recipe!;
      expect(takenOf(r, shaft), `${shaft.id}: とる 前`).toBe(false);
      r.mine.open(at.x, at.y, at.z);
      expect(r.asked, `${shaft.id}: レシピ`).toEqual([{ x: at.x, y: at.y, z: at.z }]);
      expect(r.world.getBlock(at.x, at.y, at.z), `${shaft.id}: とった あとは 消える`).toBe('air');
      expect(takenOf(r, shaft), `${shaft.id}: とった あと`).toBe(true);
      r.mine.open(at.x, at.y, at.z);
      expect(r.asked, '2 回目は 何も おきない').toHaveLength(1);
    }
  }, 60_000);

  it('まきものを 持ち物の マスに かえない（レシピは 持ち物を 使わない）', () => {
    const { seed, shaft } = scrolls[0]!;
    const r = rig(seed, shaft);
    r.mine.open(shaft.recipe!.x, shaft.recipe!.y, shaft.recipe!.z);
    expect(r.inv.slots().filter((s) => s)).toHaveLength(0);
  });
});
