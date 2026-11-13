import { beforeAll, describe, expect, it } from 'vitest';
import type { ItemId, LockStatus, PlayerState, TargetInfo } from '../../contracts';
import { createDigConfig } from '../../dig/config';
import { BlockBreaker } from '../../dig/digBreak';
import type { DigCore } from '../../dig/digCore';
import { InventoryImpl } from '../../inventory/Inventory';
import { BLOCK_TYPES } from '../blocks/blockTypes';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { attach } from '../water/waterTestKit';
import { createMineHook } from './mineHook';
import { SEEDS_20, genColumn, hook1c, type ChestRoll, type Shaft } from './mineShaftKit';
import { createRng } from './random';
import { spawnOf } from './terrain';

/**
 * HOUSE-2A（#364・仕様 3.3 版）AC1（坑道 側）: 坑道の いちばん 下の へやで レシピの まきもの（アイテム recipe_scroll）を 1 まい 見つける（仕様 docs/design/HOUSE-2.md §2.1・§5・§6.1）。
 *   宝箱の ある 坑道: 宝箱を あけると ふつうの わくに くわえて「レシピの まきもの」の わくが 1 つ。宝箱の ない 坑道: 宝箱が 置かれる マスに まきもの（固く ない 1 マス）。
 *   3.3 版で かわった こと: 拾っても おぼえない（持ち物に recipe_scroll が 入る だけ。おぼえるのは 手に もって 右クリックした とき）。
 *   まきものは **右クリック でも ほって も** ブロックが 消えて recipe_scroll 1 まい（2 版の「こわしても 消えない・右クリックだけ」は やめた）。水が 流れこんでも 消えない のは そのまま。
 * 約束（e2e/helpers/house.ts の「2A の 約束」）:
 *   shaft.recipe ＝ { kind: 'chest' | 'scroll', x, y, z, taken }（どの 坑道にも 1 つ。taken は いきている 世界を 読む。ブロックが 消えて いれば true）
 *   createMineHook の chest ポートに recipe(at: { x, y, z })（はじめて あけた／右クリックで とった ときに 1 回だけ。呼び先は house.found〔まきものを 持ち物へ。おぼえない〕）。open(x, y, z) が まきものも 受ける。
 *   まきものを ほる（BlockBreaker.breakBlock）: ブロックが 消え、持ち物に recipe_scroll 1 こ（`dugItemOf('makimono')`）。ほる 固さは 数（null では ない）。
 * どの レシピに なるかは src/house/recipes/recipes.test.ts（pick・nextPick）、使う ところは src/house/recipes/recipeLearn.test.ts と src/dig/rightClickScroll.test.ts。
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
  }, 20_000); // 単体 3.1 秒（CI は 約 3 倍 おそい。既定の 5 秒だと 時間切れ）→ 最低 20 秒

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

  it('坑道の 係は まきものを 持ち物へ 直接 入れない（recipe(at) を よぶ だけ。持ち物へ 入れる のは 家の 係 house.found。おぼえる のは 使った とき）', () => {
    const { seed, shaft } = scrolls[0]!;
    const r = rig(seed, shaft);
    r.mine.open(shaft.recipe!.x, shaft.recipe!.y, shaft.recipe!.z);
    expect(r.asked).toHaveLength(1);
    expect(r.inv.slots().filter((s) => s)).toHaveLength(0);
  });
});

describe('AC1 まきもの: ほっても とれる（3.3 版）・水が 来ても 消えない（仕様 §5）', () => {
  /** こわす 処理を 直接 よぶ ための 道具（src/dig/mineChestReview.test.ts の breakerRig と 同じ つくり。世界は まきものの ある 坑道） */
  function breakerOf(world: ArrayVoxelWorld, near: { x: number; y: number; z: number }) {
    const inventory = new InventoryImpl();
    const scattered: { item: string; count: number }[] = [];
    const core = {
      world,
      inventory,
      m4: { scatterItem: (_at: unknown, item: string, count: number) => void scattered.push({ item, count }) },
      config: createDigConfig(),
      lock: { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true } as LockStatus,
      gate: null,
      player: () => ({ position: { x: near.x + 0.5, y: near.y, z: near.z + 0.5 } }) as PlayerState,
      tgt: () => null,
      bodyTgt: () => false,
      tick: () => 0,
      emit: () => undefined,
    } as unknown as DigCore;
    return { inventory, scattered, breaker: new BlockBreaker(core, createRng(1)) };
  }
  const targetOf = (at: { x: number; y: number; z: number }, id: string): TargetInfo => ({ block: { x: at.x, y: at.y, z: at.z }, id: id as never, face: { x: 0, y: 1, z: 0 }, place: { x: at.x, y: at.y + 1, z: at.z }, distance: 2 });

  it('ほる 固さが ある（null では ない＝ 左クリックで ほれる）・ブロックの きまりも こわせる', () => {
    expect(createDigConfig().hardness['makimono' as never], 'ほる 固さ').toBeTypeOf('number');
    expect(BLOCK_TYPES.find((t) => t.id === 'makimono')?.breakable, 'こわせる').toBe(true);
  });

  it('こわす 処理（BlockBreaker.breakBlock）で ブロックが 消えて、持ち物に recipe_scroll が ちょうど 1 こ。taken が true。', () => {
    for (const { seed, shaft } of scrolls.slice(0, 2)) {
      const r = rig(seed, shaft);
      const at = shaft.recipe!;
      const id = r.world.getBlock(at.x, at.y, at.z) as string;
      const { inventory, scattered, breaker } = breakerOf(r.world, { x: at.x, y: at.y + 1, z: at.z + 2 });
      expect(takenOf(r, shaft), `${shaft.id}: ほる 前`).toBe(false);
      breaker.breakBlock(targetOf(at, id), false);
      expect(r.world.getBlock(at.x, at.y, at.z), `${shaft.id}: ほると 消える`).toBe('air');
      expect(inventory.count('recipe_scroll' as ItemId), `${shaft.id}: 持ち物に まきもの 1 こ`).toBe(1);
      expect(inventory.slots().filter((x) => x !== null), `${shaft.id}: ほかの 物は 出ない`).toHaveLength(1);
      expect(scattered, `${shaft.id}: 空きが あるので 落とさない`).toEqual([]);
      expect(takenOf(r, shaft), `${shaft.id}: ほった あと`).toBe(true);
    }
  }, 60_000);

  it('ほる とき 持ち物が いっぱいなら 足もとに 落ちる（recipe_scroll 1 こ。仕様 §5）。持ち物は かわらない。ブロックは 消える', () => {
    const { seed, shaft } = scrolls[0]!;
    const r = rig(seed, shaft);
    const at = shaft.recipe!;
    const id = r.world.getBlock(at.x, at.y, at.z) as string;
    const { inventory, scattered, breaker } = breakerOf(r.world, { x: at.x, y: at.y + 1, z: at.z + 2 });
    let guard = 0;
    while (inventory.add('stone', 64) === 0 && guard++ < 1000);
    const before = JSON.stringify(inventory.slots());
    breaker.breakBlock(targetOf(at, id), false);
    expect(r.world.getBlock(at.x, at.y, at.z)).toBe('air');
    expect(JSON.stringify(inventory.slots()), 'いっぱいの 持ち物は かわらない').toBe(before);
    expect(scattered, '足もとに 落ちた まきもの').toEqual([{ item: 'recipe_scroll', count: 1 }]);
  }, 60_000);

  it('水が 上から 流れこんで 落ち着いても まきものは のこる（水に ながされて 消えない）。そのあと 右クリックで ちゃんと とれる', () => {
    for (const { seed, shaft } of scrolls.slice(0, 2)) {
      const r = rig(seed, shaft);
      const at = shaft.recipe!;
      const id = r.world.getBlock(at.x, at.y, at.z) as string;
      const w = attach(r.world, seed);
      w.sys.set(at.x, at.y + 1, at.z, 8);
      expect(w.sys.queue(), `${shaft.id}: 水が 動きだす`).toBeGreaterThan(0);
      w.settle(400);
      expect(r.world.getBlock(at.x, at.y, at.z), `${shaft.id}: 水が 来ても のこる`).toBe(id);
      expect(takenOf(r, shaft), `${shaft.id}: まだ 拾って いない`).toBe(false);
      r.mine.open(at.x, at.y, at.z);
      expect(r.asked, `${shaft.id}: 右クリックで とれる`).toEqual([{ x: at.x, y: at.y, z: at.z }]);
    }
  }, 120_000);
});
