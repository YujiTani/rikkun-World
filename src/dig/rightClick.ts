import type { BucketPreview, BlockId, ItemId, RightClickKind, TargetInfo, WaterPreview, WaterRay } from '../contracts';
export type { RightClickKind };

/**
 * 右クリックで起きること（実行と表示の両方が、この 1 か所の判定を使う）。
 * 新しい動き（たがやす・まく・たべる・しゅうかく・かまえ など）は、ここに種類と 1 行の判定を足せば、
 * ねらっている所の ヒントにも出る（DigSystem の実行側は kind でふりわける）。
 */

export interface RightClickPreview {
  kind: RightClickKind;
  /** 持っているもの（armor・place のとき） */
  item: ItemId | null;
}

/** 左クリックで起きること（ヒント用） */
export type LeftClickKind = 'dig' | 'shoot' | 'hit' | 'harvest';

/** 判定に要るものだけ（DigSystem が毎回つくる。ブロックや持ち物は変えない） */
export interface RightClickCtx {
  target: TargetInfo | null;
  held: ItemId | null;
  isTansu(x: number, y: number, z: number): boolean;
  isFurnace(x: number, y: number, z: number): boolean;
  canEquip(item: ItemId): boolean;
  /** M7-2: 4a〜4c（じょうろ。`WateringPort.canPreview` が合う）。じょうろ でなければ null */
  water?(): WaterPreview | null;
  /** BUCKET-1: 4d〜4g（バケツ。`BucketPort.preview` が合う）。バケツ でなければ null。'idle' = 何も しない（ほかの 段へ 進まない） */
  bucket?(): BucketPreview | null;
  /** M7-2: 5（なでる）。作物・やせいの やさい を ねらっていれば その やさい の 絵（アイテム）。防具・じょうろ を 持つ ときは null */
  petSpot?(): ItemId | null;
  /**
   * LIVE-1 §2.9 の 0: にわとり を ねらっている（線が ブロック より 手前 で ねらう 箱 に 当たる）。
   * 'feed' = あげる、'animalPet' = なでる、'idle' = 何も しない（動き の とちゅう・押しつづけ。ほかの 段 へ も 進まない）。ねらって いなければ null
   */
  animal?(): 'feed' | 'animalFull' | 'animalPet' | 'idle' | null;
  /** LIVE-1 版 3.2 の 00: だっこ して いる（おろす。ほか の 段 へ は 進まない） */
  carrying?(): boolean;
  /** 持っているものを、ねらっている所の前に置けるか */
  canPlace(): boolean;
  /** M7: くわ か すで で、上が くうき の くさ・つち を ねらっている（§2.7 の 4） */
  canTill?(): boolean;
  /** M7: たね を持って、上が くうき の はたけ を ねらっている（5） */
  canPlant?(): boolean;
  /** M7: たね を持って、くさ・つち を ねらっている（6。合図） */
  isSeedHintSpot?(): boolean;
  /** M7: やさい を持っている（7）。LIVE-1: たまご も たべる（9） */
  isVeg?(item: ItemId): boolean;
}

/** LIVE-1 版 3.2 §2.4: むしとりあみ で ふれる き の ブロック（人が 置いた はっぱ・き も 同じ） */
export const NET_TREE_BLOCKS: ReadonlySet<BlockId> = new Set<BlockId>(['log', 'leaves', 'momiji_leaves', 'matsu_leaves']);

/** だっこ（00）→ にわとり（0）→ あみ（0b）→ たんす → かまど → 防具 → じょうろ（4a くむ・4b まく・4c 合図）→ なでる → たがやす → まく → 合図 → たべる → 置く の順（M7-2 §2.4）。何も起きないなら null */
export function previewRightClick(c: RightClickCtx): RightClickPreview | null {
  const t = c.target;
  if (c.carrying?.()) return { kind: 'putDown', item: null };
  const an = c.animal?.();
  if (an) return an === 'idle' ? null : { kind: an, item: an === 'feed' ? c.held : null };
  if (c.held === 'mushi_ami' && t && NET_TREE_BLOCKS.has(t.id)) return { kind: 'net', item: c.held };
  if (t && c.isTansu(t.block.x, t.block.y, t.block.z)) return { kind: 'storage', item: null };
  if (t && c.isFurnace(t.block.x, t.block.y, t.block.z)) return { kind: 'furnace', item: null };
  if (c.held && c.canEquip(c.held)) return { kind: 'armor', item: c.held };
  const b = c.bucket?.();
  if (b) return b === 'idle' ? null : { kind: b, item: c.held };
  const w = c.water?.();
  if (w) return { kind: w, item: c.held };
  const pet = t ? c.petSpot?.() : null;
  if (pet) return { kind: 'pet', item: pet };
  if (t && c.canTill?.()) return { kind: 'till', item: c.held };
  if (t && c.held && c.canPlant?.()) return { kind: 'plant', item: c.held };
  if (t && c.held && c.isSeedHintSpot?.()) return { kind: 'seedHint', item: c.held };
  if (c.held === 'mushi_ami') return { kind: 'netHint', item: c.held }; // 8b: き で ない 所・何も ねらわない
  if (c.held && c.isVeg?.(c.held)) return { kind: 'eat', item: c.held };
  if (t && c.held && c.canPlace()) return { kind: 'place', item: c.held };
  return null;
}

/** ねらいの線 の 情報 を 入れる 入れもの（毎ステップ つくり直さない） */
export function createWaterRay(): WaterRay {
  return { throughWater: false, waterCell: null, hit: null };
}

/**
 * M7-2 §2.1: 目 から 線 を のばし、固いブロック・作物 に 当たる より 手前（`hitDistance`。当たりが 無ければ reach まで）で
 * `water` の マス を 通ったか。目 の ある マス は 数えない。いちばん 手前 の みず の マス を `out.waterCell` に 入れる。
 * `hit` は ねらった ブロック（無ければ null）。`out` を 書きかえて 返す。
 */
export function computeWaterRay(
  getBlock: (x: number, y: number, z: number) => BlockId | 'outside',
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  reach: number,
  hit: TargetInfo | null,
  out: WaterRay,
): WaterRay {
  out.throughWater = false;
  out.waterCell = null;
  out.hit = hit ? hit.block : null;
  const limit = hit ? hit.distance : reach;
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ;
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
    if (t > reach || (hit ? t >= limit : t > limit)) return out;
    if (getBlock(x, y, z) === 'water') {
      out.throughWater = true;
      out.waterCell = { x, y, z };
      return out;
    }
  }
}
