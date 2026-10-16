import type { BucketId, BucketPort, FarmEvent, ItemStack } from '../contracts';

/** バケツ（から・みず）か */
export function isBucket(item: string | undefined): item is BucketId {
  return item === 'bucket' || item === 'water_bucket';
}

export interface BucketDeps {
  inventory: {
    slots(): ReadonlyArray<ItemStack | null>;
    setSlot(index: number, stack: ItemStack | null): void;
  };
  /** 農業の 出来事を 足す（`farm.emit`） */
  emit(e: FarmEvent): void;
  tick(): number;
}

/**
 * BUCKET-1: バケツ（§2.2 の 4d〜4g）。持ち物の `bucket` ↔ `water_bucket` を かえる のは ここだけ。
 * 水の ブロックを 置く のは DigSystem（世界の 判定が いる）。
 */
export function createBucket(d: BucketDeps): BucketPort {
  const at = (slot: number, item: BucketId): ItemStack | null => {
    const s = d.inventory.slots()[slot];
    return s && s.item === item ? s : null;
  };
  return {
    preview(held, ray, hasTarget, spot, repeat) {
      if (!held || !isBucket(held.item)) return null;
      if (repeat) return 'idle'; // くむ・おく・合図 は 押した瞬間 だけ
      if (ray.throughWater) return 'bucketFill'; // 4d（水の 上には 置けない）
      if (held.item === 'water_bucket') {
        if (spot) return 'bucketPlace'; // 4e
        return hasTarget ? 'bucketNo' : 'idle'; // 4g
      }
      return 'bucketHint'; // 4f
    },
    fill(slot, cell) {
      const s = d.inventory.slots()[slot];
      if (!s || !isBucket(s.item)) return false;
      const changed = s.item === 'bucket';
      if (changed) d.inventory.setSlot(slot, { item: 'water_bucket', count: s.count });
      d.emit({ type: 'bucketFill', tick: d.tick(), x: cell.x, y: cell.y, z: cell.z, item: s.item, changed });
      return changed;
    },
    placed(slot, cell) {
      const s = at(slot, 'water_bucket');
      if (!s) return false;
      d.inventory.setSlot(slot, { item: 'bucket', count: s.count });
      d.emit({ type: 'bucketPlace', tick: d.tick(), x: cell.x, y: cell.y, z: cell.z });
      return true;
    },
    no(cell) {
      d.emit({ type: 'bucketNo', tick: d.tick(), x: cell.x, y: cell.y, z: cell.z });
    },
  };
}
