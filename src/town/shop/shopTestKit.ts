import type { BlockId, ItemId } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { InventoryImpl } from '../../inventory/Inventory';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { rollChest } from '../../world/gen/mineChest';
import { createShaftHook } from '../../world/gen/mineHookShaft';
import { ShopService, boxSeed, type ShopPorts } from './shop';
import { SHOP_BOXES, type ShopBoxId, type ShopGive } from './shopTable';
import { planShopSpots } from './shopSpots';
import { fakeWallet } from '../../dama/walletTestKit';

/** よろずやの ユニットテストの 道具（テスト だけが 使う。本番は 読まない） */

export const ORB = 'yokai_orb' as ItemId;
export const SEED = 1234;

export const GROUND = 8; // 地面の ブロックの y（足もとは 9）
/** 置き場（戸口 D ＝ (9, 11)・向き s の 街と 同じ 形。toWorld は そのまま） */
export const SPOTS = planShopSpots({ toWorld: (u, v) => ({ x: u + 20, z: v + 20 }), feetY: () => GROUND + 1 });

export function rig(opts: { learnedAll?: boolean } = {}) {
  const inv = { 1: new InventoryImpl(), 2: new InventoryImpl() };
  const wallet = fakeWallet(); // 1.6〔1F〕: ようかいダマは さいふ（もちものの yokai_orb では ない）
  const dropped: { who: 1 | 2; stacks: ShopGive[] }[] = [];
  let joined2 = true;
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  /** 街の なおしの 記録に ある マス・体が かかる マス（テストが 入れる） */
  const recorded = new Set<string>();
  const bodies = new Set<string>();
  const world = new ArrayVoxelWorld({ x: 64, y: 24, z: 64 });
  for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) world.setBlock(x, GROUND, z, 'grass' as BlockId);
  const ports: ShopPorts = {
    inventory: (who) => (who === 2 && !joined2 ? null : inv[who]),
    wallet,
    dropAtFeet: (who, stacks) => dropped.push({ who, stacks: stacks.map((s) => ({ ...s })) }),
    recipesLeft: () => !opts.learnedAll,
    boxes: {
      spots: () => SPOTS,
      world: { getBlock: (x, y, z) => world.getBlock(x, y, z), setBlock: (x, y, z, id) => void world.setBlock(x, y, z, id as BlockId), isLoaded: () => true, isSolid: (x, y, z) => world.isSolid(x, y, z) },
      recorded: (x, y, z) => recorded.has(key(x, y, z)),
      bodyAt: (x, y, z) => bodies.has(key(x, y, z)),
    },
  };
  const shop = new ShopService(ports, SEED);
  // あけた 人に 入る（入らない 分は あけた 人の 足もと）。坑道の 宝箱と 同じ あける 口
  let opener: 1 | 2 = 1;
  const chestDrops: { who: 1 | 2; item: string; count: number }[] = [];
  const hook = createShaftHook({
    seed: SEED,
    world: { getBlock: (x, y, z) => world.getBlock(x, y, z), setBlock: (x, y, z, id) => world.setBlock(x, y, z, id), isLoaded: () => true },
    extraChest: (x, y, z) => shop.boxChest(x, y, z),
    chest: {
      add: (item, count) => inv[opener].add(item, count),
      drop: (item, count) => void chestDrops.push({ who: opener, item, count }),
      say: () => {},
      telop: () => {},
      opened: () => {},
    },
  });
  /** 置いて ある 箱を その 人が あける（右クリックと 同じ 口） */
  const openBox = (who: 1 | 2, i: number): void => {
    const b = shop.boxes!.list()[i]!;
    opener = who;
    const m = SPOTS[b.spot]!.main;
    hook.open(m.x, m.y, m.z);
  };
  return {
    shop,
    inv,
    wallet,
    world,
    dropped,
    chestDrops,
    openBox,
    key,
    recorded,
    bodies,
    /** 箱の 係を n ステップ 進める */
    step: (n = 1): void => {
      for (let i = 0; i < n; i++) shop.boxes!.step();
    },
    blockAt: (c: { x: number; y: number; z: number }): string => world.getBlock(c.x, c.y, c.z),
    give: (who: 1 | 2, n: number) => wallet.add(who, n),
    leave2: () => {
      joined2 = false;
    },
  };
}

/** あけた ときに もちもの（＋足もと）に ふえた 物（しゅるいごとの 数） */
export function gained(r: ReturnType<typeof rig>, who: 1 | 2, open: () => void): Map<string, number> {
  const ids = new Set<string>(Object.keys(ITEM_DEFS));
  const before = new Map([...ids].map((id) => [id, r.inv[who].count(id as ItemId)]));
  const d0 = r.chestDrops.length;
  open();
  const out = new Map<string, number>();
  for (const id of ids) {
    const n = r.inv[who].count(id as ItemId) - before.get(id)!;
    if (n > 0) out.set(id, n);
  }
  for (const d of r.chestDrops.slice(d0)) out.set(d.item, (out.get(d.item) ?? 0) + d.count);
  return out;
}

export const sum = (items: readonly { item: string; count: number }[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const s of items) m.set(s.item, (m.get(s.item) ?? 0) + s.count);
  return m;
};
export const want = (box: ShopBoxId, who: 1 | 2, n: number) => rollChest(SHOP_BOXES[box].table, boxSeed(SEED, who, box, n));

