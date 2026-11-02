import type { BlockId, BucketId, BucketPort, FarmEvent, ItemStack } from '../contracts';
import { BUCKET_TAKE, waterAmount, waterId } from '../world/blocks/water';
import { magmaAmount, magmaId } from '../world/blocks/magma';

/** バケツ（から・みず）か */
export function isBucket(item: string | undefined): item is BucketId {
  return item !== undefined && Object.hasOwn(BUCKET_LIQUID, item);
}

type Liquid = 'mizu' | 'magma';
/** BUCKET-2: バケツ → 中の 液体（から は null）・液体 → 入った バケツ・わきどころ → 液体（表で 引く。id の 直書きを ふやさない） */
const BUCKET_LIQUID: Record<BucketId, Liquid | null> = { bucket: null, water_bucket: 'mizu', magma_bucket: 'magma' };
const FULL_OF: Record<Liquid, 'water_bucket' | 'magma_bucket'> = { mizu: 'water_bucket', magma: 'magma_bucket' };
const SPRING_OF: Partial<Record<string, Liquid>> = { wakimizu: 'mizu', magma_wakimizu: 'magma' };

/** バケツの 中の 液体（から・バケツで ない は null） */
export const bucketLiquid = (item: string | undefined): Liquid | null => (isBucket(item) ? BUCKET_LIQUID[item] : null);
/** BUCKET-2: 液体が 入った バケツか */
export const isFullBucket = (item: string | undefined): item is 'water_bucket' | 'magma_bucket' => bucketLiquid(item) !== null;
/** わきどころ（水・マグマ）か */
export const isSpringBlock = (id: string): boolean => SPRING_OF[id] !== undefined;

/** BUCKET-2: マスの 液体（わきどころは 量 8 の もと）。液体で なければ null */
function liquidOf(id: BlockId | 'outside'): { kind: Liquid; amount: number; spring: boolean } | null {
  const sp = SPRING_OF[id];
  if (sp) return { kind: sp, amount: BUCKET_TAKE, spring: true };
  const w = waterAmount(id);
  if (w > 0) return { kind: 'mizu', amount: w, spring: false };
  const m = magmaAmount(id);
  if (m > 0) return { kind: 'magma', amount: m, spring: false };
  return null;
}

export interface BucketDeps {
  inventory: {
    slots(): ReadonlyArray<ItemStack | null>;
    setSlot(index: number, stack: ItemStack | null): void;
  };
  /** 農業の 出来事を 足す（`farm.emit`） */
  emit(e: FarmEvent): void;
  tick(): number;
  /** WATER-1: くむと その マスの 水が へる ので 世界を 読み書きする */
  world: {
    getBlock(x: number, y: number, z: number): BlockId | 'outside';
    setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  };
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
      if (isFullBucket(held.item)) {
        if (spot) return 'bucketPlace'; // 4e
        return hasTarget ? 'bucketNo' : 'idle'; // 4g
      }
      return 'bucketHint'; // 4f
    },
    fill(slot, cell) {
      const s = d.inventory.slots()[slot];
      if (!s || !isBucket(s.item)) return false;
      // WATER-1 §4.4: マスの 液体から min(8 − 今の 量, マスの 量) を とる(欄 なしの 入った バケツは 量 8)
      // BUCKET-2: 同じ 種類 だけ。わきどころは からの バケツで だけ（まるごと 8、マスは 空気）
      const liq = liquidOf(d.world.getBlock(cell.x, cell.y, cell.z));
      const inBucket = BUCKET_LIQUID[s.item as BucketId];
      const kindOk = liq !== null && (inBucket === null || inBucket === liq.kind) && (!liq.spring || inBucket === null);
      const have = inBucket === null ? 0 : Math.max(0, Math.min(BUCKET_TAKE, s.water ?? BUCKET_TAKE));
      const take = liq && kindOk ? Math.min(BUCKET_TAKE - have, liq.amount) : 0;
      const changed = take > 0;
      if (changed && liq) {
        d.inventory.setSlot(slot, { item: FULL_OF[liq.kind], count: s.count, water: have + take });
        const left = liq.spring ? 0 : liq.amount - take;
        d.world.setBlock(cell.x, cell.y, cell.z, liq.kind === 'magma' ? magmaId(left) : waterId(left));
      }
      d.emit({ type: 'bucketFill', tick: d.tick(), x: cell.x, y: cell.y, z: cell.z, item: s.item, changed });
      return changed;
    },
    placed(slot, cell) {
      const s = at(slot, 'water_bucket') ?? at(slot, 'magma_bucket');
      if (!s) return false;
      d.inventory.setSlot(slot, { item: 'bucket', count: s.count });
      d.emit({ type: 'bucketPlace', tick: d.tick(), x: cell.x, y: cell.y, z: cell.z, liquid: BUCKET_LIQUID[s.item as BucketId] === 'magma' ? 'magma' : 'water' });
      return true;
    },
    no(cell) {
      d.emit({ type: 'bucketNo', tick: d.tick(), x: cell.x, y: cell.y, z: cell.z });
    },
  };
}
