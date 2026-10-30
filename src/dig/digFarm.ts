import type { BucketPreview, ItemId, PlayerState, TargetInfo, Vec3, WaterRay } from '../contracts';
import { LIVE_SETTING_DEFAULTS, cropKindOfBlock, seedKindOfItem, vegKindOfItem } from '../contracts';
import { MINE_ITEM } from '../content/items/ids';
import { itemDef } from '../content/items/registry';
import { isFloraBlock } from '../world/blocks/flora';
import { overlapsBody, sameBlock, type DigCore } from './digCore';
import { giveStacks, liftFlora } from './digBreak';
import { lookDirection } from './raycast';
import { computeWaterRay, createWaterRay } from './rightClick';

/** じょうろか（登録表の `can` 部品を持つ物 = じょうろ・ながい じょうろ） */
const isCan = (item: string): boolean => itemDef(item)?.can !== undefined;

/** 畑・水・なでる・食べるの係が DigSystemImpl から受け取る物（DigCore のほか） */
export interface DigFarmDeps extends DigCore {
  /** ねらいの線を 引くとき 使う 入れもの（向き・出どころ）。DigAim と同じ物 */
  readonly dir: Vec3;
  readonly originScratch: Vec3;
  origin(p: PlayerState, out: Vec3): Vec3;
  /** 届く距離のはかり始め（reachOrigin）が つながっているか */
  hasReachOrigin(): boolean;
  /** primary を押した瞬間か */
  justPressed(): boolean;
}

/** `tryHarvest` の答え: none = 作物ではない、unripe = まだ（ほった量を 少しもどす）、done = しゅうかくした（ほった量を 消す）、held = 作物だが 何もしない */
export type HarvestEnd = 'none' | 'unripe' | 'done' | 'held';

/** はたけ（たがやす・たねまき・しゅうかく）・みず（じょうろ・バケツ）・なでる・食べる の係（M7・BUCKET-1） */
export class DigFarm {
  /** すで の たがやし: 数えている ブロック・回数・前の 1 回の ステップ */
  private tillBlock: Vec3 | null = null;
  private tillCount = 0;
  private tillLast = -Infinity;
  /** まだ の作物を ゆらした ブロック（押しつづけで くりかえさない） */
  private unripeBlock: Vec3 | null = null;
  /** ねらいの線の みず の 情報（毎回 つくらず 書きかえる） */
  private readonly waterRay: WaterRay = createWaterRay();

  constructor(private readonly d: DigFarmDeps) {}

  /** primary を はなしている ステップ */
  releaseUnripe(): void {
    this.unripeBlock = null;
  }

  /** ひだりクリックで 作物・やせいの やさい を しゅうかく（§2.5）。作物をねらっていれば 'none' 以外（ほらない） */
  tryHarvest(t: TargetInfo): HarvestEnd {
    const c = this.d;
    const farm = c.m4.farm;
    if (!farm || !cropKindOfBlock(t.id)) return 'none';
    const { x, y, z } = t.block;
    const ripe = farm.crop(x, y, z)?.ripe ?? false;
    if (!ripe) {
      const same = this.unripeBlock && sameBlock(this.unripeBlock, t.block);
      if (!same || c.justPressed()) {
        this.unripeBlock = { ...t.block };
        farm.harvest(x, y, z); // 出来事 notRipe
      }
      return 'unripe';
    }
    const r = farm.harvest(x, y, z);
    if (r.ok) {
      giveStacks(c, r.items, x, y, z);
      c.m4.tools?.pushSwing('dig');
      return 'done';
    }
    return 'held';
  }

  doTill(t: TargetInfo): void {
    const c = this.d;
    const farm = c.m4.farm!;
    const ground = this.groundOf(t);
    const { x, y, z } = ground;
    const need = c.inventory.held() ? 1 : Math.max(1, farm.settings().farmHandTillPresses);
    if (!this.tillBlock || !sameBlock(this.tillBlock, ground) || c.tick() - this.tillLast >= farm.settings().farmHandTillResetTicks) {
      this.tillBlock = { ...ground };
      this.tillCount = 0;
    }
    this.tillLast = c.tick();
    this.tillCount++;
    c.m4.tools?.pushSwing('dig');
    if (this.tillCount >= need) {
      liftFlora(c, x, y + 1, z); // くさ・のばな を どけてから たがやす（FLORA-75 §2.1）
      farm.till(x, y, z);
      if (c.inventory.held()?.item === 'kuwa') {
        const n = c.m4.w2?.toolWear.kuwa.till ?? 0;
        if (n > 0) c.inventory.wearHeld?.(n);
      }
      this.tillBlock = null;
      this.tillCount = 0;
    } else farm.noteTillPress(x, y, z, this.tillCount);
  }

  doPlant(t: TargetInfo, item: ItemId | null): void {
    const c = this.d;
    const kind = item ? seedKindOfItem(item) : null;
    if (!kind || !c.m4.farm) return;
    if (c.m4.farm.plant(t.block.x, t.block.y, t.block.z, kind)) {
      c.inventory.consumeHeld();
      c.m4.tools?.pushSwing('place');
    }
  }

  playerChest(): Vec3 {
    const p = this.d.player().position;
    return { x: p.x, y: p.y + 1, z: p.z };
  }

  /** 4a くむ（押した瞬間 だけ）。みず を 通った いちばん 手前 の マス を わたす */
  doFill(): void {
    const c = this.d;
    const cell = this.waterRay.waterCell;
    if (!cell || !c.m4.water) return;
    c.m4.water.fill(c.inventory.selected(), { x: cell.x, y: cell.y, z: cell.z });
    c.m4.tools?.pushSwing('place');
  }

  /** 4d くむ（押した瞬間 だけ）。水の マスは そのまま */
  doBucketFill(): void {
    const c = this.d;
    const cell = this.waterRay.waterCell;
    if (!cell || !c.m4.bucket) return;
    c.m4.bucket.fill(c.inventory.selected(), { x: cell.x, y: cell.y, z: cell.z });
    c.m4.tools?.pushSwing('place');
  }

  /** 4e おく（押した瞬間 だけ）。ブロックを 置くのと 同じ マスに water を 1 マス */
  doBucketPlace(): void {
    const c = this.d;
    const spot = this.bucketSpotCell();
    if (!spot || !c.m4.bucket) return;
    if (!c.world.setBlock(spot.x, spot.y, spot.z, 'water')) return;
    c.m4.bucket.placed(c.inventory.selected(), spot);
    c.m4.tools?.pushSwing('place');
  }

  /** 4b まく（押した瞬間 と 30 ステップ ごと）。向き = 見ている 向き の 水平 ベクトル */
  doPour(t: TargetInfo): void {
    const c = this.d;
    if (!c.m4.water) return;
    c.m4.water.pour(c.inventory.selected(), { x: t.block.x, y: t.block.y, z: t.block.z }, { dx: c.dir.x, dz: c.dir.z });
    c.m4.tools?.pushSwing('place');
  }

  /** 5 なでる（押した瞬間 だけ） */
  doPet(t: TargetInfo): void {
    const c = this.d;
    const farm = c.m4.farm;
    const pet = c.m4.pet;
    const ck = cropKindOfBlock(t.id);
    if (!farm || !pet || !ck) return;
    const { x, y, z } = t.block;
    const info = farm.crop(x, y, z);
    if (!info) return;
    const result = pet.pet(x, y, z, { ...info, wild: ck.wild });
    if (!result) return;
    c.m4.emitFarm?.({ type: 'pet', tick: c.m4.nowTick?.() ?? c.tick(), x, y, z, result });
    c.m4.tools?.pushSwing('place');
  }

  doEat(item: ItemId): void {
    const c = this.d;
    const farm = c.m4.farm;
    const v = c.m4.vitals;
    if (!farm || !v) return;
    const p = c.player().position;
    const at = { x: p.x, y: p.y + 1, z: p.z };
    if (v.hp() >= v.maxHp()) {
      farm.noteHint('full', at);
      return;
    }
    const got = v.heal(farm.eatHeal(item) || (item === 'egg' ? (c.m4.eggHeal?.() ?? LIVE_SETTING_DEFAULTS.animalEggHeal) : item === 'momo_yaki' ? (c.m4.meatHeal?.() ?? LIVE_SETTING_DEFAULTS.meatHeal) : 0));
    c.inventory.consumeHeld();
    c.m4.tools?.pushSwing('place');
    farm.noteEat(item, got, at);
  }

  /** 4a〜4c: じょうろ を 持っているとき だけ、みず を 通る 線 を しらべて A の 口 に 聞く */
  waterPreview(repeat: boolean): 'fill' | 'pour' | 'fillHint' | null {
    const w = this.d.m4.water;
    const held = this.d.inventory.held();
    if (!w || !held || !isCan(held.item)) return null;
    return w.canPreview(held, this.waterRayNow(), repeat);
  }

  /** 4d〜4g: バケツ を 持っているとき だけ。じょうろ と 同じ ねらいの 線で 水を 通るか 見る */
  bucketPreview(repeat: boolean): BucketPreview | null {
    const b = this.d.m4.bucket;
    const held = this.d.inventory.held();
    if (!b || !held || (held.item !== 'bucket' && held.item !== 'water_bucket')) return null;
    const ray = this.waterRayNow();
    const spot = held.item === 'water_bucket' && !ray.throughWater ? this.bucketSpotCell() : null;
    return b.preview(held, ray, this.d.tgt() !== null, spot, repeat);
  }

  /** `farm.bucketSpot()`: 今の ねらいで 4e が 水を 置く マス（置けない・水を ねらう ときは null） */
  bucketSpot(): Vec3 | null {
    if (!this.d.lock.playInputEnabled() || this.d.gate?.blocksInput()) return null;
    if (this.d.inventory.held()?.item !== 'water_bucket' || this.waterRayNow().throughWater) return null;
    return this.bucketSpotCell();
  }

  /** 水を 置ける マス（ぜんぶ 満たす: air・体と 重ならない・妖怪の箱で ない・ねらった ブロックが 作物で ない） */
  private bucketSpotCell(): Vec3 | null {
    const c = this.d;
    const t = c.tgt();
    if (!t || cropKindOfBlock(t.id)) return null;
    const { x, y, z } = t.place;
    if (c.world.getBlock(x, y, z) !== 'air') return null;
    if (overlapsBody(c.player().position, x, y, z)) return null;
    if (c.gate?.placeBlocked(x, y, z)) return null;
    return { x, y, z };
  }

  private waterRayNow(): WaterRay {
    const c = this.d;
    const p = c.player();
    const d = lookDirection(p.yawDeg, p.pitchDeg, c.dir);
    const o = c.origin(p, c.originScratch);
    return computeWaterRay(
      (x, y, z) => c.world.getBlock(x, y, z),
      o.x,
      o.y,
      o.z,
      d.x,
      d.y,
      d.z,
      c.hasReachOrigin() ? c.config.reach + 1.1 : c.config.reach,
      c.tgt(),
      this.waterRay,
    );
  }

  /** 5: 作物・やせいの やさい を ねらっている（防具・じょうろ 以外 なんでも）。その やさい の 絵 を 返す */
  petSpot(): ItemId | null {
    const c = this.d;
    const t = c.tgt();
    const farm = c.m4.farm;
    if (!t || !farm || !c.m4.pet) return null;
    const ck = cropKindOfBlock(t.id);
    if (!ck) return null;
    const h = c.inventory.held()?.item;
    if ((h !== undefined && isCan(h)) || h === 'bucket' || h === 'water_bucket') return null;
    if (!farm.crop(t.block.x, t.block.y, t.block.z)) return null;
    return ck.kind;
  }

  /**
   * MINE-1B: いしばい を 持って、みのる 前の 作物（段 0〜2）か その 下の はたけ を ねらっている とき、その 作物の マスの 高さ（ねらった ブロックが 作物なら 同じ、はたけなら 1 つ 上）。
   * みのった 作物・やせいの やさい・作物の ない はたけ・ほかの ブロックでは null（新しい 物は 作らない）
   */
  private ripenCropY(): number | null {
    const c = this.d;
    const t = c.tgt();
    const farm = c.m4.farm;
    if (!t || !farm || c.inventory.held()?.item !== MINE_ITEM.ishibai) return null;
    let y = t.block.y;
    if (!cropKindOfBlock(t.id)) {
      if (t.id !== 'farmland' && t.id !== 'farmland_wet') return null;
      y++;
    }
    const info = farm.crop(t.block.x, y, t.block.z);
    return info && info.stage < 3 ? y : null;
  }

  /** 4 の 前: いしばい で みのらせる 作物を ねらっている（ヒント「まく」と 実行が 同じ 判定） */
  ripenSpot(): boolean {
    return this.ripenCropY() !== null;
  }

  /** いしばい を まく（作物を すぐ 段 3 に して いしばい 1 へる。みのらせた ときだけ） */
  doRipen(): void {
    const c = this.d;
    const t = c.tgt();
    const y = this.ripenCropY();
    if (!t || y === null || !c.m4.farm?.ripen(t.block.x, y, t.block.z)) return;
    c.inventory.consumeHeld();
    c.m4.tools?.pushSwing('place');
  }

  /** くわ か すで で、上が くうき の くさ・つち を ねらっている */
  tillSpot(): boolean {
    const c = this.d;
    const t = c.tgt();
    if (!t || !c.m4.farm) return false;
    const g = this.groundOf(t);
    const id = c.world.getBlock(g.x, g.y, g.z);
    if (id !== 'grass' && id !== 'dirt') return false;
    const h = c.inventory.held()?.item ?? null;
    if (h !== null && h !== 'kuwa') return false;
    const above = c.world.getBlock(g.x, g.y + 1, g.z);
    return above === 'air' || isFloraBlock(above); // くさ・のばな は くうき と数える
  }

  /** FLORA-75: ねらった ブロックが くさ・のばな なら その下の ブロック（くさ・つち）、そうでなければ ねらったブロック */
  private groundOf(t: TargetInfo): Vec3 {
    const { x, y, z } = t.block;
    return isFloraBlock(t.id) ? { x, y: y - 1, z } : { x, y, z };
  }

  /** たね を持って、上が くうき の はたけ を ねらっている */
  plantSpot(): boolean {
    const c = this.d;
    const t = c.tgt();
    const h = c.inventory.held()?.item;
    if (!t || !h || !c.m4.farm || seedKindOfItem(h) === null) return false;
    if (t.id !== 'farmland' && t.id !== 'farmland_wet') return false;
    return c.world.getBlock(t.block.x, t.block.y + 1, t.block.z) === 'air';
  }

  seedHintSpot(): boolean {
    const c = this.d;
    const t = c.tgt();
    const h = c.inventory.held()?.item;
    if (!t || !h || !c.m4.farm || seedKindOfItem(h) === null) return false;
    const g = this.groundOf(t);
    const id = c.world.getBlock(g.x, g.y, g.z);
    return id === 'grass' || id === 'dirt';
  }

  /** 食べられる物か（やさい・たまご・やいた もも にく）。つながりが そろっているときだけ */
  isVeg(item: ItemId): boolean {
    const m4 = this.d.m4;
    return !!m4.farm && !!m4.vitals && (vegKindOfItem(item) !== null || item === 'egg' || item === 'momo_yaki');
  }
}
