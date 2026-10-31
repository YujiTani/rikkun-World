import { GADGET_ID } from '../content/items/gadgetTuning';
import { isFutonId } from '../world/blocks/futon';
import { doorInfo } from '../world/blocks/houseBlocks';
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
  /**
   * LIVE-2.1 §2.2 の 00: だっこ 中 の 答え。'throw' = なげる、'throwNo' = なげられない 所（うすく）、'putDown' = d＜1 で そっと おろす。
   * なければ（古い つなぎ）'putDown'
   */
  throwKind?(): 'throw' | 'throwNo' | 'putDown';
  /**
   * LIVE-2 §2.11 の 1a: ねらって いる ブロック が こたつ（`nukunuku`）の とき の ようす。こたつ で なければ null。
   * occupied = たまご が 入って いる。LIVE-2.1: full = 3 こ いっぱい（なければ occupied と 同じ = 前 の きまり）
   */
  kit?(): { occupied: boolean; full?: boolean } | null;
  /** LIVE-2 §2.11 の 1b: ねらって いる ブロック が 小屋（さく・もん・ねぐら・すばこ）の とき の すばこ の たまご の 数（`egg`＋`kin_tamago`）。小屋 で なければ null */
  coop?(): { eggs: number; /** LIVE-3: えらべる 子 が 1 わ 以上 いる（メニュー を ひらく） */ menu?: boolean } | null;
  /** LIVE-2 §2.11 の 10a: `toriya` を 持って 地面 を ねらって いる とき の 答え。'ok' = 置ける、'noRoom' = どこ も 入らない、'max' = 3 つ まで。ねらって いなければ null */
  coopSpot?(): 'ok' | 'noRoom' | 'max' | null;
  /** HOUSE-1C PR-2: みずもり（'level'）・どうづき（'tamp'）を 持って、ブロックを ねらっている。そうでなければ null */
  siteTool?(): 'level' | 'tamp' | null;
  /** 持っているものを、ねらっている所の前に置けるか */
  canPlace(): boolean;
  /** MINE-1B: チョークを 持って、かける 面（ゆか・かべ）か かきなおせる しるしを ねらっている */
  canChalk?(): boolean;
  /** MINE-1B: いしばいを 持って、みのる 前の 作物（段 0〜2）か その 下の はたけを ねらっている */
  canRipen?(): boolean;
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

/** LIVE-2: たまご（こたつ に 入れられる もの。`kin_tamago` は かならず マッチョ） */
export function isKitEgg(item: ItemId | null): boolean {
  return item === 'egg' || item === 'kin_tamago';
}

/** だっこ（00）→ にわとり（0）→ あみ（0b）→ こたつ（1a）→ 小屋（1b）→ たんす → かまど → 家の 戸 → ふとん（ねる）→ たこ → みずもり・どうづき → 防具 → チョーク（かく）→ バケツ → じょうろ（4a くむ・4b まく・4c 合図）→ いしばい（まく）→ なでる → たがやす → まく → 合図 → たべる → 置く の順（M7-2 §2.4）。何も起きないなら null */
export function previewRightClick(c: RightClickCtx): RightClickPreview | null {
  const t = c.target;
  if (c.carrying?.()) return { kind: c.throwKind?.() ?? 'putDown', item: null };
  const an = c.animal?.();
  if (an) return an === 'idle' ? null : { kind: an, item: an === 'feed' ? c.held : null };
  if (c.held === 'mushi_ami' && t && NET_TREE_BLOCKS.has(t.id)) return { kind: 'net', item: c.held };
  // LIVE-2 1a: こたつ。たまご を 持って から → 入れる（ほか の 答え は 「たべる」の 前 に 下 で）
  const kit = t ? c.kit?.() : null;
  // LIVE-2.1: 3 こ まで 1 こ ずつ（full が 無い とき は 前 の きまり = 入って いれば まってね）
  const kitFull = kit ? (kit.full ?? kit.occupied) : false;
  if (kit && isKitEgg(c.held) && !kitFull) return { kind: 'kitPut', item: c.held };
  // LIVE-2 1b: 小屋 の ブロック。すばこ に たまご が あれば あつめる。LIVE-3: えらべる 子 が いれば メニュー（置ける 物 を 持って いても ひらく）
  const coop = t ? c.coop?.() : null;
  if (coop && coop.menu === true) return { kind: 'coopMenu', item: null };
  if (coop && coop.eggs >= 1) return { kind: 'coopCollect', item: null };
  if (t && c.isTansu(t.block.x, t.block.y, t.block.z)) return { kind: 'storage', item: null };
  if (t && c.isFurnace(t.block.x, t.block.y, t.block.z)) return { kind: 'furnace', item: null };
  // HOUSE-1C: 家の 戸（あける・しめる。置くより 先。上下 どちらを ねらっても 同じ）
  const door = t ? doorInfo(t.id) : null;
  if (door) return { kind: door.open ? 'doorClose' : 'doorOpen', item: null };
  // ITEM-FX-1: ふとん（ねる。置くより 先）・たこ（持って 右クリック。ねらいが なくても）
  if (t && isFutonId(t.id)) return { kind: 'sleep', item: null };
  if (c.held === GADGET_ID.kite) return { kind: 'kite', item: c.held };
  // HOUSE-1C PR-2: みずもり・どうづき（置けない 道具。ブロックを ねらって いる とき）
  const tool = t ? c.siteTool?.() : null;
  if (tool) return { kind: tool, item: c.held };
  if (c.held && c.canEquip(c.held)) return { kind: 'armor', item: c.held };
  if (t && c.canChalk?.()) return { kind: 'chalkDraw', item: c.held }; // MINE-1B: たんす・かまど・ふとん の あと（そちらの 働きが 先）
  const b = c.bucket?.();
  if (b) return b === 'idle' ? null : { kind: b, item: c.held };
  const w = c.water?.();
  if (w) return { kind: w, item: c.held };
  if (t && c.canRipen?.()) return { kind: 'ripen', item: c.held }; // MINE-1B: なでる より 先（みのった 作物は なでる）
  const pet = t ? c.petSpot?.() : null;
  if (pet) return { kind: 'pet', item: pet };
  if (t && c.canTill?.()) return { kind: 'till', item: c.held };
  if (t && c.held && c.canPlant?.()) return { kind: 'plant', item: c.held };
  if (t && c.held && c.isSeedHintSpot?.()) return { kind: 'seedHint', item: c.held };
  if (c.held === 'mushi_ami') return { kind: 'netHint', item: c.held }; // 8b: き で ない 所・何も ねらわない
  // LIVE-2 1a・1b の ほか: 置ける 物（と toriya）は 10 へ。それ いがい は 合図（こたつ: まってね／たまご が いる、小屋: むし を あげて）。たべる（9）より 先
  const placing = c.held !== null && (c.held === 'toriya' || c.canPlace());
  if (kit && !placing) {
    if (kit.full === true && isKitEgg(c.held)) return { kind: 'kitFull', item: c.held };
    return { kind: kit.occupied ? 'kitWait' : 'kitNeedEgg', item: null };
  }
  if (coop && !placing) return { kind: 'coopNoEgg', item: null };
  // LIVE-3 9: なま もも にく は たべられない（合図 rawMeat）。やいた もも にく は isVeg で たべる
  if (c.held === 'momo_nama') return { kind: 'rawMeat', item: c.held };
  if (c.held && c.isVeg?.(c.held)) return { kind: 'eat', item: c.held };
  // LIVE-2 10a: toriya を 持って 地面 を ねらう → 小屋 を 置く（入らない 所 は うすく）
  if (t && c.held === 'toriya') {
    const spot = c.coopSpot?.();
    if (spot) return { kind: spot === 'ok' ? 'coopPlace' : spot === 'max' ? 'coopMax' : 'coopNoRoom', item: c.held };
  }
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
