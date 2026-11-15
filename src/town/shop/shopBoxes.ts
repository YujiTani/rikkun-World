import { chestBlockId, chestBlockInfo, type ChestTier } from '../../world/blocks/chestBlock';
import { SHOP_TUNING, type ShopBoxId } from './shopTable';
import type { Cell, ShopSpot } from './shopSpots';

/**
 * よろずやの 前に 出た たからばこ（TOWN-1-shop §2.7 の 6〜13・§4.3b、TOWN-1.md §6.1 `shop.boxes()`。1.5）。DOM・three なし。
 * - こうかん した とき 置き場（4 か所）の あいて いる 所に 坑道と 同じ 2 マスの 宝箱を 置く（`pick`・`place`）。
 * - あけるのは 坑道の 宝箱の あける 口（ブロックが あいた 形に なる）。それを 毎ステップ 見て、ふたが あいて から vanishSteps で 2 マス とも 消す。
 * - 記録（保存）と ブロックが ずれた ときは 記録に 合わせる（記録の 箱を 置く／記録の ない 置き場の 箱の ブロックを 消す）。
 * 世界・街の なおしの 記録・体は 小さな 口（ShopBoxPorts）で 受ける。
 */

type Who = 1 | 2;

/** 置いて ある 箱 1 こ（窓口 `shop.boxes()` の もと。保存も 同じ 中身〔あいた 箱は 保存しない〕） */
export interface ShopBoxRecord {
  /** 置き場の 番号（spots() の 番号） */
  spot: number;
  box: ShopBoxId;
  /** 買った 人 */
  p: Who;
  /** 買った 人の その 箱の こうかん 回数（0 から）＝ たね */
  n: number;
  tier: ChestTier;
  opened: boolean;
  /** きえる まで の ステップ（あいて いなければ null） */
  vanishIn: number | null;
}

export interface ShopBoxPorts {
  /** 置き場（街が なければ 空） */
  spots(): readonly ShopSpot[];
  world: {
    /** 読みこんで いない・高さの 外は 'outside' */
    getBlock(x: number, y: number, z: number): string;
    setBlock(x: number, y: number, z: number, id: string): void;
    isLoaded(x: number, z: number): boolean;
    /** 立てる ブロックか */
    isSolid(x: number, y: number, z: number): boolean;
  };
  /** 街の なおしの 記録（まだ もどって いない マス）に ある か */
  recorded(x: number, y: number, z: number): boolean;
  /** 人（1P・2P・街の 人）・妖怪・動物の 体が その マスに かかるか */
  bodyAt(x: number, y: number, z: number): boolean;
  /** 箱が 出た（ぽん・けむり） */
  popped?(spot: ShopSpot, rec: Readonly<ShopBoxRecord>): void;
  /** あいた 箱が きえた（けむり） */
  vanished?(spot: ShopSpot, rec: Readonly<ShopBoxRecord>): void;
}

/** 置き場を えらんだ 答え: 番号、または 置けない わけ（full ＝ 4 か所 とも 箱・blocked ＝ 人や こわれた 地面で 置けない） */
export type ShopSpotPick = number | 'full' | 'blocked';

interface SavedBox {
  spot: number;
  box: ShopBoxId;
  p: Who;
  n: number;
  tier: ChestTier;
}

const AIR = 'air';
const isTier = (t: unknown): t is ChestTier => t === 1 || t === 2 || t === 3 || t === 4;

export class ShopBoxes {
  private recs: ShopBoxRecord[] = [];

  constructor(private readonly d: ShopBoxPorts) {}

  /** 置いて ある 箱（置いた 順。写し） */
  list(): ShopBoxRecord[] {
    return this.recs.map((r) => ({ ...r }));
  }

  /** その マスに ある 箱（2 マスの どちらでも）。なければ null */
  at(x: number, y: number, z: number): Readonly<ShopBoxRecord> | null {
    const spots = this.d.spots();
    for (const r of this.recs) {
      const s = spots[r.spot];
      if (s && s.cells.some((c) => c.x === x && c.y === y && c.z === z)) return r;
    }
    return null;
  }

  /** つぎに 置く 置き場（①→④ の 順で はじめに 置ける 所） */
  pick(): ShopSpotPick {
    const spots = this.d.spots();
    let boxed = 0;
    for (let i = 0; i < spots.length; i++) {
      if (this.recs.some((r) => r.spot === i)) {
        boxed++;
        continue;
      }
      if (this.canPlace(spots[i]!)) return i;
    }
    return spots.length > 0 && boxed === spots.length ? 'full' : 'blocked';
  }

  /** 置く（pick の 答えの 番号に。ブロックも すぐ 置く） */
  place(spot: number, box: ShopBoxId, p: Who, n: number, tier: ChestTier): void {
    const s = this.d.spots()[spot];
    if (!s) return;
    const rec: ShopBoxRecord = { spot, box, p, n, tier, opened: false, vanishIn: null };
    this.recs.push(rec);
    this.putBlocks(s, tier);
    this.d.popped?.(s, rec);
  }

  /** 固定ステップごと: あいた 箱を 見つける・きえる まで 数える・記録と ブロックを 合わせる */
  step(): void {
    const spots = this.d.spots();
    if (spots.length === 0) return;
    for (let i = this.recs.length - 1; i >= 0; i--) {
      const r = this.recs[i]!;
      const s = spots[r.spot];
      if (!s) {
        this.recs.splice(i, 1);
        continue;
      }
      if (!this.loaded(s)) continue;
      if (r.vanishIn === null) {
        const info = chestBlockInfo(this.d.world.getBlock(s.main.x, s.main.y, s.main.z));
        if (info?.open === true) {
          r.opened = true;
          r.vanishIn = SHOP_TUNING.vanishSteps;
        } else if (!this.closedThere(s, r.tier)) {
          this.putBlocks(s, r.tier); // 記録 だけ ある（ブロックが ない・ちがう）: 記録の 箱を 置く
          continue;
        } else continue;
      }
      r.vanishIn--;
      if (r.vanishIn <= 0) {
        this.clearBlocks(s);
        this.recs.splice(i, 1);
        this.d.vanished?.(s, r);
      }
    }
    // ブロック だけ ある（記録の ない 置き場に 宝箱）: 消す
    for (let i = 0; i < spots.length; i++) {
      if (this.recs.some((r) => r.spot === i)) continue;
      const s = spots[i]!;
      if (this.loaded(s) && s.cells.some((c) => chestBlockInfo(this.d.world.getBlock(c.x, c.y, c.z)) !== null)) this.clearBlocks(s);
    }
  }

  /** 保存（あいた 箱は 入れない。中身は もう もちものに ある） */
  serialize(): SavedBox[] {
    return this.recs.filter((r) => !r.opened).map((r) => ({ spot: r.spot, box: r.box, p: r.p, n: r.n, tier: r.tier }));
  }

  /** 読む（形が ちがう 物は とばす。同じ 置き場は 1 こ だけ） */
  deserialize(data: unknown): void {
    this.recs = [];
    if (!Array.isArray(data)) return;
    for (const x of data as Partial<SavedBox>[]) {
      if (typeof x !== 'object' || x === null) continue;
      const okSpot = typeof x.spot === 'number' && Number.isInteger(x.spot) && x.spot >= 0 && x.spot < SHOP_TUNING.spotCount;
      const okBox = x.box === 'kobako' || x.box === 'obako';
      const okWho = x.p === 1 || x.p === 2;
      const okN = typeof x.n === 'number' && Number.isInteger(x.n) && x.n >= 0;
      if (!okSpot || !okBox || !okWho || !okN || !isTier(x.tier)) continue;
      if (this.recs.some((r) => r.spot === x.spot)) continue;
      this.recs.push({ spot: x.spot!, box: x.box!, p: x.p!, n: x.n!, tier: x.tier, opened: false, vanishIn: null });
    }
  }

  // ---------------------------------------------------------------- 中

  private loaded(s: ShopSpot): boolean {
    return s.cells.every((c) => this.d.world.isLoaded(c.x, c.z));
  }

  private closedThere(s: ShopSpot, tier: ChestTier): boolean {
    return s.cells.every((c, i) => this.d.world.getBlock(c.x, c.y, c.z) === chestBlockId(tier, false, i === 1));
  }

  private putBlocks(s: ShopSpot, tier: ChestTier): void {
    s.cells.forEach((c, i) => this.d.world.setBlock(c.x, c.y, c.z, chestBlockId(tier, false, i === 1)));
  }

  private clearBlocks(s: ShopSpot): void {
    for (const c of s.cells) if (chestBlockInfo(this.d.world.getBlock(c.x, c.y, c.z)) !== null) this.d.world.setBlock(c.x, c.y, c.z, AIR);
  }

  /** 1 か所に 置ける か（§4.3b の 表の「ぜんぶ」） */
  private canPlace(s: ShopSpot): boolean {
    const w = this.d.world;
    if (!this.loaded(s) || !w.isLoaded(s.stand.x, s.stand.z)) return false;
    const clear = (c: Cell, dy: number): boolean => w.getBlock(c.x, c.y + dy, c.z) === AIR && !this.d.recorded(c.x, c.y + dy, c.z);
    for (const c of s.cells) {
      if (!clear(c, 0) || !clear(c, 1)) return false;
      if (!w.isSolid(c.x, c.y - 1, c.z) || this.d.recorded(c.x, c.y - 1, c.z)) return false;
      if (this.d.bodyAt(c.x, c.y, c.z) || this.d.bodyAt(c.x, c.y + 1, c.z)) return false;
    }
    return clear(s.stand, 0) && clear(s.stand, 1);
  }
}
