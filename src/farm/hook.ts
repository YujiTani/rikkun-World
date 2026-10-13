import type { BlockId, CropKind, CropStage, FarmPlacement, FarmVisual, ItemStack, Vec3, WateringCanId } from '../contracts';
import { canCapacity, readWater } from '../tools/durability';
import type { KeyValueStore } from '../save/SaveManager';
import type { FarmSystemImpl } from './FarmSystem';
import { writeLegacySave } from './legacy';

export interface FarmHookDeps {
  farm: FarmSystemImpl;
  /** B の 見た目（texture・look） */
  visual: FarmVisual;
  /** いま ねらっている ブロック（`dig.target().block`）。なければ null */
  aimed: () => Vec3 | null;
  /** しゅうかく の 結果を 持ち物へ（入りきらない分は 落とし物。つなぎ込みが C の道を つなぐ）。なければ 入れない */
  give?: (items: ItemStack[]) => void;
  /** 保存の場所（`?nosave=1` なら null） */
  store: KeyValueStore | null;
  /** 世界の シード */
  seed: number;
  /** 世界を 走査して 数えるための 窓口（`world.getBlock` と `size`） */
  world: { size: { x: number; y: number; z: number }; getBlock(x: number, y: number, z: number): BlockId | 'outside' };
  /** 置きもの の 計算（`farm.placement(seed)`）。なければ `deps.placement` と 同じものを つなぐ */
  placement: (seed: number) => FarmPlacement;
  /** M7-2: 持ち物（`farm.setCanWater`）。なければ false を 返す */
  inventory?: {
    slots(): ReadonlyArray<ItemStack | null>;
    setSlot(index: number, stack: ItemStack | null): void;
  };
  /** M7-2: いま の プレイヤー の 見ている 向き（水平 ベクトル）。`farm.pour` の `dir` が 無い とき 使う */
  facing?: () => { dx: number; dz: number };
  /** M7-2: 今 出ている つぶ と 出た 数（B・C の fx が 持つ。`farm.fx()` / `farm.fxReset()`） */
  fx?: () => unknown;
  fxReset?: () => void;
}

const DIRS: Record<string, { dx: number; dz: number }> = { '+x': { dx: 1, dz: 0 }, '-x': { dx: -1, dz: 0 }, '+z': { dx: 0, dz: 1 }, '-z': { dx: 0, dz: -1 } };

/** `window.__rikkun.farm.*`（仕様 §6.1）。つなぎ込みが testHook に `farm:` として足す */
export function createFarmHook(d: FarmHookDeps) {
  const { farm, world } = d;
  const scan = (pred: (id: BlockId) => boolean) => {
    const out: Array<{ x: number; y: number; z: number; id: BlockId }> = [];
    for (let y = 0; y < world.size.y; y++)
      for (let z = 0; z < world.size.z; z++)
        for (let x = 0; x < world.size.x; x++) {
          const id = world.getBlock(x, y, z);
          if (id !== 'outside' && pred(id)) out.push({ x, y, z, id });
        }
    return out;
  };
  return {
    crop: (x: number, y: number, z: number) => farm.crop(x, y, z),
    crops: () => farm.crops(),
    simulateGrowth: (kind: CropKind, wet: boolean, n: number, seed: number, happy?: boolean) =>
      farm.simulateGrowth(kind, wet, n, seed, happy === true),
    wild: () =>
      scan((id) => id.startsWith('wild_')).map((b) => ({ x: b.x, y: b.y, z: b.z, kind: b.id.slice(5) as CropKind })),
    oldFarm: () => {
      const k = farm.kakashi();
      if (!k || world.getBlock(k.x, k.y, k.z) !== 'kakashi') return null;
      const near = (b: { x: number; z: number }) => Math.abs(b.x - k.x) <= 8 && Math.abs(b.z - k.z) <= 8;
      const pos = (b: { x: number; y: number; z: number }) => ({ x: b.x, y: b.y, z: b.z });
      const all = scan((id) => id === 'farmland' || id === 'farmland_wet' || id === 'saku' || id === 'tansu').filter(near);
      const tansu = all.find((b) => b.id === 'tansu');
      if (!tansu) return null;
      return {
        kakashi: { ...k },
        farmland: all.filter((b) => b.id.startsWith('farmland')).map(pos),
        saku: all.filter((b) => b.id === 'saku').map(pos),
        tansu: pos(tansu),
      };
    },
    placedM7: () => farm.placedM7(),
    placement: (seed: number) => {
      const p = d.placement(seed);
      return {
        wild: p.wild,
        oldFarm: p.oldFarm ? { blocks: p.oldFarm.blocks, tansu: p.oldFarm.tansu, tier: p.oldFarm.tier } : null,
      };
    },
    makeLegacySave: (seed: number, changes: Array<{ x: number; y: number; z: number; id: BlockId }>) => {
      if (!d.store) return false;
      writeLegacySave(d.store, seed, changes);
      return true;
    },
    grassSeedKind: (x: number, z: number) => farm.grassSeedKind(x, z),
    soil: (x: number, y: number, z: number) => farm.soil(x, y, z),
    till: (x: number, y: number, z: number) => farm.till(x, y, z),
    /** 座標は はたけ のマス（作物のマスを わたしても 下が はたけ なら 受ける） */
    plant: (x: number, y: number, z: number, kind: CropKind) => {
      if (farm.soil(x, y, z)) return farm.plant(x, y, z, kind);
      if (world.getBlock(x, y, z) === 'air' && farm.soil(x, y - 1, z)) return farm.plant(x, y - 1, z, kind);
      return false;
    },
    harvest: (x: number, y: number, z: number) => {
      const r = farm.harvest(x, y, z);
      if (r.ok) d.give?.(r.items);
      return r.ok;
    },
    setStage: (x: number, y: number, z: number, stage: CropStage) => farm.setStage(x, y, z, stage),
    growTicks: (kind: CropKind, wet: boolean) => farm.growTicks(kind, wet),
    events: () => farm.peekEvents(),
    lastHint: () => farm.lastHint(),
    texture: (name: string) => d.visual.texture(name),
    look: (x: number, y: number, z: number) => d.visual.look(x, y, z),
    hud: () => {
      const a = d.aimed();
      return a ? farm.aim(a.x, a.y, a.z) : null;
    },
    // ---- M7-2
    /** 入力 なし で はたけ (x,y,z) を ねらって まいた のと 同じ こと（持ち物 は 変えない）。`tiles` を 返す */
    pour: (x: number, y: number, z: number, item: WateringCanId, dir?: '+x' | '-x' | '+z' | '-z') => {
      const f = (dir && DIRS[dir]) || d.facing?.() || DIRS['+x']!;
      return farm.pourAt({ x, y, z }, item, f.dx, f.dz);
    },
    /** 入力 なし で なでる */
    pet: (x: number, y: number, z: number) => farm.petCrop(x, y, z),
    /** 持ち物 の その マス の じょうろ の `water` を n に（じょうろ でなければ false） */
    setCanWater: (slot: number, n: number) => {
      const inv = d.inventory;
      const s = inv?.slots()[slot];
      if (!inv || !s || canCapacity(s.item) === null) return false;
      const w = readWater(n, s.item);
      inv.setSlot(slot, w > 0 ? { item: s.item, count: s.count, water: w } : { item: s.item, count: s.count });
      return true;
    },
    sprinklers: () => farm.sprinklers(),
    fx: () => d.fx?.() ?? { particles: [], counts: { star: 0, heart: 0, spray: 0, splash: 0 } },
    fxReset: () => d.fxReset?.(),
  };
}
