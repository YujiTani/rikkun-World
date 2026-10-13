import type {
  ItemStack,
  M7Settings,
  Vec3,
  VoxelWorld,
  WaterPreview,
  WaterRay,
  WateringCanId,
  WateringPort,
} from '../contracts';
import type { FarmSystemImpl } from './FarmSystem';

/** じょうろ（2 しゅるい）か */
export function isWateringCan(item: string | undefined): item is WateringCanId {
  return item === 'watering_can' || item === 'long_watering_can';
}

/** マスの じょうろ の みず の 量（なし = 0） */
export function waterOf(s: ItemStack | null | undefined): number {
  return s && s.water && s.water > 0 ? s.water : 0;
}

/**
 * ねらいの 線（M2 の とどく 距離）。目 の ある マス は 数えない。固い ブロック・作物 に 当たる より 手前で
 * 通った いちばん 手前 の `water` を 返す（§2.1）。`reach` 以内 だけ。
 * dx, dy, dz は 長さ 1 に した 向き
 */
export function computeWaterRay(
  world: Pick<VoxelWorld, 'getBlock'>,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  reach: number,
): WaterRay {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const hitAt = (id: string) => id !== 'air' && id !== 'water' && id !== 'outside';
  const start = world.getBlock(x, y, z);
  if (hitAt(start)) return { throughWater: false, waterCell: null, hit: { x, y, z } };
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ;
  let waterCell: Vec3 | null = null;
  for (;;) {
    let t: number;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
    } else if (tMaxY <= tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
    }
    if (t > reach) return { throughWater: waterCell !== null, waterCell, hit: null };
    const id = world.getBlock(x, y, z);
    if (id === 'water') {
      if (!waterCell) waterCell = { x, y, z };
    } else if (hitAt(id)) {
      return { throughWater: waterCell !== null, waterCell, hit: { x, y, z } };
    }
  }
}

export interface WateringDeps {
  farm: Pick<FarmSystemImpl, 'pourAt' | 'emit'>;
  inventory: {
    slots(): ReadonlyArray<ItemStack | null>;
    setSlot(index: number, stack: ItemStack | null): void;
  };
  settings: M7Settings;
  tick(): number;
}

/** A → C: じょうろ（§2.1・§2.4 の 4a〜4c）。`water` を へらす・ふやす のは ここ だけ */
export function createWatering(d: WateringDeps): WateringPort {
  const canAt = (slot: number): { s: ItemStack; item: WateringCanId } | null => {
    const s = d.inventory.slots()[slot];
    return s && isWateringCan(s.item) ? { s, item: s.item } : null;
  };
  const write = (slot: number, s: ItemStack, water: number) => {
    const next: ItemStack = { item: s.item, count: s.count };
    if (water > 0) next.water = water;
    d.inventory.setSlot(slot, next);
  };
  return {
    canPreview(held, ray, repeat): WaterPreview | null {
      if (!held || !isWateringCan(held.item)) return null;
      // 4a: 線 が みず を 通る → くむ（押した瞬間 だけ。くりかえし の ステップ は 何も しない）
      if (ray.throughWater) return repeat ? null : 'fill';
      if (waterOf(held) > 0) return ray.hit ? 'pour' : null; // 4b
      return repeat ? null : 'fillHint'; // 4c
    },
    fill(slot, at) {
      const c = canAt(slot);
      if (!c) return 0;
      const cap = d.settings.farmCanCapacity[c.item];
      const before = waterOf(c.s);
      if (before !== cap) write(slot, c.s, cap);
      d.farm.emit({ type: 'fill', tick: d.tick(), x: at.x, y: at.y, z: at.z, item: c.item, water: cap, wasFull: before === cap });
      return cap;
    },
    pour(slot, target, facing) {
      const c = canAt(slot);
      if (!c) return 0;
      const w = waterOf(c.s);
      if (w <= 0) return 0;
      const tiles = d.farm.pourAt(target, c.item, facing.dx, facing.dz);
      if (tiles > 0) write(slot, c.s, w - 1);
      return tiles;
    },
  };
}
