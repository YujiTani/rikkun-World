import type { BlockId, CropKind, CropStage, FarmPlacement, FarmVisual, ItemStack, Vec3 } from '../contracts';
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
}

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
    simulateGrowth: (kind: CropKind, wet: boolean, n: number, seed: number) => farm.simulateGrowth(kind, wet, n, seed),
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
  };
}
