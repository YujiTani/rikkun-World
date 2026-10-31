import type { BlockId, ItemId, TargetInfo, VoxelWorld } from '../contracts';
import { isFloraBlock } from '../world/blocks/flora';
import { CHALK_FACES, CHALK_NORMAL, chalkInfo, isChalkMarkId } from '../world/blocks/chalkMark';
import { futonPartner, isFutonId } from '../world/blocks/futon';
import { KOTATSU_CELLS, isKotatsuBlock, kotatsuAnchorOf } from '../world/blocks/kotatsu';
import { K_TANSU, doorInfo, furnSiblings, houseDropOf, isFurnKind } from '../world/blocks/houseBlocks';
import { GADGET_ID } from '../content/items/gadgetTuning';
import { BLADE_LIKE_ITEMS } from '../tools/bladeSets';
import { randInt, type Rng } from '../world/gen/random';
import { DUG_ALWAYS_ONE, FARM_BREAK_DROP, NO_DROP_BLOCKS } from './config';
import { DUG_ITEM } from './dugItems';
import { COOP_BLOCKS, HANGING_SUPPORT, TORCH_NEIGHBORS, type DigCore } from './digCore';

/** こわしたあとの しめくくり: abort = こわせなかった（クールダウンなし）、bodyDone = 体の上の ブロック、done = ふつうにこわした */
export type BreakEnd = 'abort' | 'bodyDone' | 'done';

/** 持ち物へ入れる。入らない分は 落とし物（なければ 捨てる） */
export function giveStacks(c: DigCore, stacks: ReadonlyArray<{ item: ItemId; count: number }>, x: number, y: number, z: number): void {
  for (const s of stacks) {
    if (s.count <= 0) continue;
    const left = c.inventory.add(s.item, s.count);
    const got = s.count - left;
    if (got > 0) c.m4.onPickup?.(s.item, got);
    if (left > 0) c.m4.scatterItem?.({ x: x + 0.5, y, z: z + 0.5 }, s.item, left);
  }
}

/** FLORA-75: (x, y, z) に くさ・のばな が あれば どける（のばな は 1 こ 持ち物へ。くさ は 何も出ない） */
export function liftFlora(c: DigCore, x: number, y: number, z: number): void {
  const id = c.world.getBlock(x, y, z);
  if (!isFloraBlock(id)) return;
  c.world.setBlock(x, y, z, 'air');
  if (id === 'nobana') giveStacks(c, [{ item: 'nobana', count: 1 }], x, y, z);
}

/** ブロックを こわす（ひびが MAX のあと）。世界の書きかえ・ドロップ・出来事・道具のたいきゅうまでを 受け持つ */
export class BlockBreaker {
  constructor(
    private readonly c: DigCore,
    /** ドロップ数の乱数（シード付き） */
    private readonly rng: Rng,
  ) {}

  breakBlock(t: TargetInfo, bodyGlass: boolean): BreakEnd {
    const c = this.c;
    if (c.bodyTgt()) return this.breakBodyBlock(t, bodyGlass);
    if (COOP_BLOCKS.has(t.id)) return this.breakCoopBlock(t);
    if (isChalkMarkId(t.id)) return this.breakChalkMark(t);
    const { x, y, z } = t.block;
    // こたつ 2×2: どの マス を こわして も 4 マス ぜんぶ 消える（`nukunuku` 1 と 中 の たまご は 1 回 だけ）
    if (isKotatsuBlock(t.id)) this.clearKotatsuCells(t);
    // HOUSE-1C: 戸は 上下 2 マス・長い 家具は ぜんぶの マスが 消えて、もとの アイテム 1 こ（向き・マス ちがいの id は もとの id に もどす）
    const houseDrop = houseDropOf(t.id);
    this.clearHouseCells(t);
    const dropId: BlockId = houseDrop ?? (isKotatsuBlock(t.id) ? 'nukunuku' : isFutonId(t.id) ? GADGET_ID.futon : t.id);
    // ふとん 2 マス: どちらを こわしても 相手の マスも 消えて ふとん 1 つ（相手が いない 1 マスだけの ふとんは そのまま）
    const pair = futonPartner(t.id, x, z);
    if (pair && c.world.getBlock(pair.x, y, pair.z) === pair.id) c.world.setBlock(pair.x, y, pair.z, 'air');
    const craft = c.m4.craft;
    const wasFurnace = craft?.isFurnace(x, y, z) ?? false;
    const wasTansu = isFurnKind(t.id, K_TANSU);
    c.world.setBlock(x, y, z, 'air');
    if (wasTansu) c.m4.storage?.broken(x, y, z);
    this.clearChalkMarks(x, y, z);
    this.dropUnsupportedTorches(x, y, z);
    liftFlora(c, x, y + 1, z); // FLORA-75: 下の ブロックを こわすと 上の くさ・のばな も 消える
    const farmDrop = FARM_BREAK_DROP[t.id] ?? (houseDrop ? { item: houseDrop, count: 1 } : null);
    const fixed = farmDrop ? farmDrop.count : DUG_ALWAYS_ONE.has(dropId) ? 1 : (craft?.fixedDrop(dropId) ?? null);
    const dropItem: ItemId = farmDrop ? farmDrop.item : (DUG_ITEM.get(dropId) ?? dropId);
    const max = Math.max(1, c.config.dropMax[c.config.rarity[dropId]] ?? 1);
    const n = NO_DROP_BLOCKS.has(dropId) ? 0 : fixed !== null ? fixed : randInt(this.rng, 1, max);
    const got = n - c.inventory.add(dropItem, n);
    if (got > 0) c.m4.onPickup?.(dropItem, got);
    // たんす は入らなければ 落とし物にする（なくさない。M6）
    if (wasTansu && got < n) c.m4.scatterItem?.({ x: x + 0.5, y, z: z + 0.5 }, dropItem, n - got);
    if (wasFurnace) craft!.furnaceBroken(x, y, z);
    // GOLD-1 §4.7: はらぱんみみず（べつ の 乱数。地下 の ブロック 0.5%・き 0.2%）。地面 に おちる
    if (c.m4.harapan?.(t.id, y)) c.m4.scatterItem?.({ x: x + 0.5, y, z: z + 0.5 }, 'harapan_mimizu', 1);
    // M7: はたけ の 上の作物・くさ の 上の やせいの やさい、くさ から たね
    const farm = c.m4.farm;
    if (farm) {
      giveStacks(c, farm.onBlockBroken(x, y, z, t.id), x, y, z);
      if (t.id === 'grass') {
        const seed = farm.grassSeed(x, z);
        if (seed) giveStacks(c, [{ item: seed, count: 1 }], x, y, z);
      }
    }
    c.emit({ type: 'break', tick: c.tick(), block: { x, y, z }, id: houseDrop ?? t.id, gotItem: got > 0, count: got });
    this.wearForBlock();
    return 'done';
  }

  /** HOUSE-1C: 戸の もう 半分・長い 家具の ほかの マスを 消す（ねらった マスは 呼んだ 側が 消す）。どちらでもなければ 何もしない */
  private clearHouseCells(t: TargetInfo): void {
    const { x, y, z } = t.block;
    const w = this.c.world;
    const d = doorInfo(t.id);
    if (d) {
      const oy = d.top ? y - 1 : y + 1;
      if (doorInfo(w.getBlock(x, oy, z))?.top === !d.top) w.setBlock(x, oy, z, 'air');
      return;
    }
    for (const s of furnSiblings(t.id, x, z)) if ((s.x !== x || s.z !== z) && w.getBlock(s.x, y, s.z) === s.id) w.setBlock(s.x, y, s.z, 'air');
  }

  /** MINE-1B: チョークの しるしは さわると すぐ 消えて 何も 出ない（持ち物は ふえない。道具の たいきゅうも へらない） */
  private breakChalkMark(t: TargetInfo): BreakEnd {
    const c = this.c;
    const { x, y, z } = t.block;
    c.world.setBlock(x, y, z, 'air');
    c.emit({ type: 'break', tick: c.tick(), block: { x, y, z }, id: t.id, gotItem: false, count: 0 });
    return 'done';
  }

  /** MINE-1B: (x, y, z) を こわした。その ブロックに かいて あった しるし（上の ゆか・まわりの かべ）も 消える。何も 出ない */
  private clearChalkMarks(x: number, y: number, z: number): void {
    const w = this.c.world;
    for (const face of CHALK_FACES) {
      const [dx, dy, dz] = CHALK_NORMAL[face];
      if (chalkInfo(w.getBlock(x + dx, y + dy, z + dz))?.face === face) w.setBlock(x + dx, y + dy, z + dz, 'air');
    }
  }

  /** 小屋 を こわす: A が 小屋 ぜんぶ（ブロック・すばこ の たまご）を 消す。`toriya` 1 を わたす */
  private breakCoopBlock(t: TargetInfo): BreakEnd {
    const c = this.c;
    const a = c.m4.animals;
    const co = a?.coopAt(t.block.x, t.block.y, t.block.z);
    if (!a || !co || !a.removeCoop(co.id)) return 'abort';
    const { x, y, z } = t.block;
    c.world.setBlock(x, y, z, 'air');
    // 仕様（AC14）: toriya 1 は すばこ の たまご と いっしょに 足もと に おちる（拾うと 持ち物 へ）
    if (c.m4.scatterItem) c.m4.scatterItem({ x: x + 0.5, y, z: z + 0.5 }, 'toriya', 1);
    else if (c.inventory.add('toriya', 1) === 0) c.m4.onPickup?.('toriya', 1);
    c.emit({ type: 'break', tick: c.tick(), block: { x, y, z }, id: t.id, gotItem: false, count: 0 });
    this.wearForBlock();
    return 'done';
  }

  /** #293: 体に 置いた ブロックを こわす（1 こ 持ち物に もどる。入りきらなければ 落とし物） */
  private breakBodyBlock(t: TargetInfo, bodyGlass: boolean): BreakEnd {
    const c = this.c;
    const { x, y, z } = t.block;
    const id = c.m4.bodyBlocks?.remove(t.block) ?? null;
    if (bodyGlass) {
      // ガラスの 雲: アイテムは 出ない（割れる 音と かけらは がしゃどくろ 側が 出す）
    } else if (id) {
      const got = 1 - c.inventory.add(id, 1);
      if (got > 0) c.m4.onPickup?.(id, got);
      else c.m4.scatterItem?.({ x: x + 0.5, y, z: z + 0.5 }, id, 1);
      c.emit({ type: 'break', tick: c.tick(), block: { x, y, z }, id, gotItem: got > 0, count: got });
      this.wearForBlock();
    }
    return 'bodyDone';
  }

  /** こたつ 2×2 の 4 マス（ねらった マス いがい。ねらった マス は 呼んだ 側 が 消す）を 空気 に する。本体 が 無い 古い 1 マス は 何も しない */
  private clearKotatsuCells(t: TargetInfo): void {
    const w: VoxelWorld = this.c.world;
    const { x, y, z } = t.block;
    const a = kotatsuAnchorOf(t.id, x, z);
    for (const k of KOTATSU_CELLS) {
      const cx = a.x + k.dx;
      const cz = a.z + k.dz;
      if ((cx === x && cz === z) || w.getBlock(cx, y, cz) !== k.block) continue;
      w.setBlock(cx, y, cz, 'air');
    }
  }

  /** ほった ブロックを こわした: 持っている 道具の たいきゅうを へらす（先に 効かせた あと。WEAPON-2 §4.6 (3)） */
  private wearForBlock(): void {
    const w = this.c.m4.w2?.toolWear;
    const it = this.c.inventory.held()?.item;
    if (!w || !it) return;
    let n = 0;
    if (it.endsWith('_pickaxe') || it.endsWith('_axe')) n = w.pickaxe.block;
    else if (it === 'kuwa') n = w.kuwa.block;
    else if (BLADE_LIKE_ITEMS.has(it)) n = w.blade.block;
    if (n > 0) this.c.inventory.wearHeld?.(n);
  }

  /** (x, y, z) をこわした。支えをなくした たいまつ・ちょうちん は落ちて アイテム になる（start_torch は こわれない） */
  private dropUnsupportedTorches(x: number, y: number, z: number): void {
    const c = this.c;
    for (const [dx, dy, dz] of TORCH_NEIGHBORS) {
      const tx = x + dx;
      const ty = y + dy;
      const tz = z + dz;
      const id = c.world.getBlock(tx, ty, tz);
      if (id === 'outside') continue;
      const support = HANGING_SUPPORT[id];
      if (!support || support(c.world, tx, ty, tz)) continue;
      c.world.setBlock(tx, ty, tz, 'air');
      if (c.m4.scatterItem) c.m4.scatterItem({ x: tx + 0.5, y: ty, z: tz + 0.5 }, id, 1);
      else {
        const left = c.inventory.add(id, 1);
        if (left === 0) c.m4.onPickup?.(id, 1);
      }
    }
  }
}
