import { W2_SETTING_DEFAULTS } from '../contracts';
import { addStack, copyStack, maxDurability, readPlan, readPower, readWater, readWear } from '../tools/durability';
import type { Inventory, ItemStack, Rarity, Vec3, VoxelWorld } from '../contracts';
import { itemType } from '../inventory/items';
import { isRarity, itemRarity, topRarity } from './rarity';
import { cellInWall } from '../world/wall';
import { createRng, type Rng } from '../world/gen/random';

/** 落ちたアイテムの数値。やられた落とし物も 妖怪のドロップも同じ部品を使う */
export const DROP = {
  /** 消えるまで（10 分） */
  ticks: 36000,
  /** 拾える水平の距離・高さの差 */
  pickupRadius: 1.5,
  pickupHeight: 2,
  gravity: 20,
  /** 水の中で水面へうかぶ速さ（ブロック/秒） */
  floatSpeed: 3,
  maxItems: 400,
  /** ぴょんと散らばる: 横の速さ(マス/秒) 最小・最大 */
  scatterSpeed: [2, 3.5],
  /** 上向きの速さ(マス/秒) 最小・最大 */
  popUpSpeed: [5, 6.5],
  /** はね返り（上下 0.4 倍・横 0.6 倍）と はねる回数の上限（PSO ふう: 高い弧で 1 回だけ小さく） */
  bounce: { vertical: 0.4, horizontal: 0.6, maxCount: 1, minImpact: 1.5 },
  /** 出てから拾えるまで（ステップ。0.3 秒） */
  pickupDelay: 18,
  /** 向きのゆらぎ（360°/こ数 のうち 何割まで） */
  angleJitter: 0.35,
} as const;

/** ばらまき方（やられた = 大きく、妖怪 = 小さく） */
export type DropKind = 'death' | 'yokai';

export interface ScatterOptions {
  /** ばらまき方の型。ふつうは 'death' */
  kind?: DropKind;
  /** 水平の速さの最小〜最大（ブロック/秒）。なければ DROP.scatterSpeed */
  speedMin?: number;
  speedMax?: number;
  /** 上向きの速さの最小〜最大。なければ DROP.popUpSpeed */
  upMin?: number;
  upMax?: number;
}

/** 外から見える 1 つ（`combat.bags()` の 1 件。slots は 1 つだけ） */
export interface DropView {
  id: number;
  position: Vec3;
  slots: ItemStack[];
  ticksLeft: number;
  /** 同じ回にばらまいたものは同じ batch（光の柱は batch ごとに 1 本） */
  batch: number;
  /** その回でいちばんめずらしいアイテムのめずらしさ（柱の色） */
  rarity: Rarity;
  /** じっと止まっている（とんでいるあいだは false → アイコンがくるっと回る） */
  resting: boolean;
  /** プレイヤーがすてたもの（M6） */
  thrown: boolean;
  /** 拾えるようになるまでの のこりステップ（0 なら拾える。M6） */
  pickupDelay: number;
}

export type DropSave = {
  x: number;
  y: number;
  z: number;
  item: string;
  count: number;
  ticksLeft: number;
  batch: number;
  rarity: Rarity;
  /** WEAPON-2: へった たいきゅう（なし = 新品） */
  wear?: number;
  /** M7-2: じょうろ の みず の 量（なし = からっぽ） */
  water?: number;
  /** WEAPON-9: 虹の 強さ */
  power?: number;
  /** HOUSE-1B: せっけいずの 番号（なし = せっけいず じゃない） */
  plan?: number;
  /** 妖怪の おとしもの */
  yokai?: boolean;
};

interface Entity {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  resting: boolean;
  item: ItemStack;
  ticksLeft: number;
  batch: number;
  rarity: Rarity;
  /** 出てからのステップ数 */
  age: number;
  bounces: number;
  /** すてたもの（M6） */
  thrown: boolean;
  /** 出てから これだけたつと拾える（age がこの数に なるまで拾わない） */
  pickupAt: number;
  /** 妖怪の おとしもの（実績の「ようかいからたね」用。あふれ・すてたものは false） */
  yokai: boolean;
}

export interface DropFieldDeps {
  world: VoxelWorld;
  inventory: Inventory;
  /** プレイヤーの足もと */
  player: () => Vec3;
  /** 散らす向きと速さをきめる乱数（シード付き） */
  rng?: Rng;
  ticks?: number;
  pickupRadius?: number;
  /** あれば「消えるまで」と「拾える距離」を毎回ここから読む（settings で変えたら すぐ効く） */
  live?: {
    dropBagTicks: number;
    pickupRadius: number;
    /** M6: すてたものを拾わない時間・投げる速さ（横・上、ブロック/秒） */
    dropPickupDelay?: number;
    dropThrowSpeed?: number;
    dropThrowUp?: number;
  };
  /** 拾った・消えたとき 保存してほしい */
  requestSave?: () => void;
  /** 近づいたのに 1 つも入らなかった（もちものがいっぱい）。ステップごとに呼ばれうる */
  onFull?: () => void;
  /** 拾って持ち物に入った（入った数）。拾ったログ用（M4） */
  onPickup?: (item: ItemStack['item'], count: number, fromYokai: boolean) => void;
}

const DT = 1 / 60;

/** 落ちたアイテム: ばらまく・重力で落ちて止まる・水にうかぶ・拾う・10 分で消える・保存 */
export class DropField {
  private readonly rng: Rng;
  private readonly life: number;
  private readonly radius: number;
  private items: Entity[] = [];
  private nextId = 1;
  private nextBatch = 1;

  constructor(private readonly d: DropFieldDeps) {
    this.rng = d.rng ?? createRng(4242);
    this.life = d.ticks ?? DROP.ticks;
    this.radius = d.pickupRadius ?? DROP.pickupRadius;
  }

  /** stacks（1 つ = 1 アイテム）を position からまわりにばらまく。ばらまいた数（こ数の合計）を返す */
  scatter(position: Vec3, stacks: readonly ItemStack[], opts: ScatterOptions = {}): number {
    const o = {
      speedMin: opts.speedMin ?? DROP.scatterSpeed[0],
      speedMax: opts.speedMax ?? DROP.scatterSpeed[1],
      upMin: opts.upMin ?? DROP.popUpSpeed[0],
      upMax: opts.upMax ?? DROP.popUpSpeed[1],
    };
    let total = 0;
    const n = stacks.filter((x) => x.count >= 1).length;
    const base = this.rng() * Math.PI * 2;
    const slice = (Math.PI * 2) / Math.max(1, n);
    let idx = 0;
    const batch = this.nextBatch++;
    const rarity = topRarity(stacks.filter((x) => x.count >= 1).map((x) => x.item));
    for (const st of stacks) {
      if (st.count < 1) continue;
      // 向きを 360°/こ数 で分けて、ゆらぎを足す（となりと重ならない）
      const ang = base + idx * slice + (this.rng() - 0.5) * slice * DROP.angleJitter;
      idx++;
      const sp = o.speedMin + this.rng() * (o.speedMax - o.speedMin);
      this.items.push({
        id: this.nextId++,
        x: position.x,
        y: position.y + 0.5,
        z: position.z,
        vx: Math.cos(ang) * sp,
        vy: o.upMin + this.rng() * (o.upMax - o.upMin),
        vz: Math.sin(ang) * sp,
        resting: false,
        item: copyStack(st),
        ticksLeft: this.d.live?.dropBagTicks ?? this.life,
        batch,
        rarity,
        age: 0,
        bounces: 0,
        thrown: false,
        pickupAt: DROP.pickupDelay,
        yokai: opts.kind === 'yokai',
      });
      total += st.count;
      if (this.items.length > DROP.maxItems) this.items.shift();
    }
    return total;
  }

  /**
   * プレイヤーが 1 つ すてる（M6 §2.8）。目の高さから 0.3 下、向いている方へ 横・上へ とび出す。
   * 出る所がブロックの中なら 足もとに出す。dropPickupDelay ステップは拾わない。
   */
  throwItem(stack: ItemStack, yawDeg: number, eyeHeight: number): void {
    if (stack.count < 1) return;
    const p = this.d.player();
    const yaw = (yawDeg * Math.PI) / 180;
    const dx = Math.sin(yaw);
    const dz = -Math.cos(yaw);
    let x = p.x + dx * 0.3;
    let y = p.y + eyeHeight - 0.3;
    let z = p.z + dz * 0.3;
    if (this.d.world.isSolid(Math.floor(x), Math.floor(y), Math.floor(z))) {
      x = p.x;
      y = p.y + 0.1;
      z = p.z;
    }
    const speed = this.d.live?.dropThrowSpeed ?? 4;
    this.items.push({
      id: this.nextId++,
      x,
      y,
      z,
      vx: dx * speed,
      vy: this.d.live?.dropThrowUp ?? 2,
      vz: dz * speed,
      resting: false,
      item: copyStack(stack),
      ticksLeft: this.d.live?.dropBagTicks ?? this.life,
      batch: this.nextBatch++,
      rarity: itemRarity(stack.item),
      age: 0,
      bounces: 0,
      thrown: true,
        yokai: false,
      pickupAt: this.d.live?.dropPickupDelay ?? 60,
    });
    if (this.items.length > DROP.maxItems) this.items.shift();
    this.d.requestSave?.();
  }

  private views: DropView[] = [];
  private viewById = new Map<number, DropView>();
  private static readonly EMPTY: DropView[] = [];

  /**
   * 外から見える一覧。毎フレーム呼ばれるので、入れ物は使いまわす（0 件なら同じ空配列、
   * 数が変わったときだけ並べ直し、あとは中の値を書きかえる）。呼んだ側は保存せずその場で読むこと
   */
  list(): DropView[] {
    if (this.items.length === 0) return DropField.EMPTY;
    let same = this.views.length === this.items.length;
    for (let i = 0; same && i < this.items.length; i++) if (this.views[i]!.id !== this.items[i]!.id) same = false;
    if (!same) {
      const next: DropView[] = [];
      const map = new Map<number, DropView>();
      for (const b of this.items) {
        const v = this.viewById.get(b.id) ?? {
          id: b.id,
          position: { x: 0, y: 0, z: 0 },
          slots: [{ item: b.item.item, count: b.item.count }],
          ticksLeft: 0,
          batch: b.batch,
          rarity: b.rarity,
          resting: b.resting,
          thrown: b.thrown,
          pickupDelay: Math.max(0, b.pickupAt - b.age),
        };
        next.push(v);
        map.set(b.id, v);
      }
      this.views = next;
      this.viewById = map;
    }
    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i]!;
      const v = this.views[i]!;
      v.position.x = b.x;
      v.position.y = b.y;
      v.position.z = b.z;
      const sl = v.slots[0]!;
      sl.item = b.item.item;
      sl.count = b.item.count;
      v.ticksLeft = b.ticksLeft;
      v.batch = b.batch;
      v.rarity = b.rarity;
      v.resting = b.resting;
      v.thrown = b.thrown;
      v.pickupDelay = Math.max(0, b.pickupAt - b.age);
    }
    return this.views;
  }

  size(): number {
    return this.items.length;
  }

  /** 1 ステップ進める。canPickup = false のあいだは拾わない。拾った（一部でも）アイテムの id を返す */
  update(canPickup: boolean): number[] {
    const picked: number[] = [];
    if (this.items.length === 0) return picked;
    const p = this.d.player();
    const radius = this.d.live?.pickupRadius ?? this.radius;
    let changed = false;
    for (const b of this.items) {
      b.ticksLeft--;
      if (b.ticksLeft <= 0) {
        changed = true;
        continue;
      }
      // 読みこんでいない列の上では 動かさない・ひろえない（消えるまでの時間だけ進む。VOX-D）
      if (!this.d.world.isLoaded(Math.floor(b.x), Math.floor(b.z))) continue;
      b.age++;
      this.step(b);
      if (!canPickup || b.age < b.pickupAt) continue;
      if (Math.hypot(p.x - b.x, p.z - b.z) <= radius && Math.abs(p.y - b.y) <= DROP.pickupHeight) {
        const left = addStack(this.d.inventory, b.item);
        if (left !== b.item.count) {
          this.d.onPickup?.(b.item.item, b.item.count - left, b.yokai);
          b.item = { ...b.item, count: left };
          picked.push(b.id);
          changed = true;
        } else this.d.onFull?.();
      }
    }
    const before = this.items.length;
    this.items = this.items.filter((b) => b.ticksLeft > 0 && b.item.count > 0);
    if (changed || this.items.length !== before) this.d.requestSave?.();
    return picked;
  }

  private waterSurface(x: number, y: number, z: number): number {
    const w = this.d.world;
    let yy = y;
    while (yy < w.size.y && w.getBlock(x, yy, z) === 'water') yy++;
    return yy;
  }

  private step(b: Entity): void {
    const w = this.d.world;
    const fx = Math.floor(b.x);
    const fz = Math.floor(b.z);
    if (b.resting) {
      // 足もとが消えたら また落ちる（水にうかんでいるものは水がなくなったら）
      const yb = Math.floor(b.y - 1e-3);
      const below = w.getBlock(fx, yb, fz);
      if (w.isSolid(fx, yb, fz) || below === 'outside' || below === 'water') return;
      b.resting = false;
    }
    if (w.getBlock(fx, Math.floor(b.y), fz) === 'water') {
      const top = this.waterSurface(fx, Math.floor(b.y), fz);
      b.vx *= 0.9;
      b.vz *= 0.9;
      b.vy = 0;
      b.y = Math.min(top, b.y + DROP.floatSpeed * DT);
      this.moveXZ(b);
      if (b.y >= top) {
        b.y = top;
        b.vx = b.vz = 0;
        b.resting = true;
      }
      return;
    }
    b.vy -= DROP.gravity * DT;
    this.moveXZ(b);
    const ny = b.y + b.vy * DT;
    const cx = Math.floor(b.x);
    const cz = Math.floor(b.z);
    if (b.vy <= 0 && w.isSolid(cx, Math.floor(ny), cz)) {
      b.y = Math.floor(ny) + 1;
      this.land(b);
    } else if (b.vy > 0 && w.isSolid(cx, Math.floor(ny + 0.3), cz)) {
      b.vy = 0; // 天井
    } else {
      b.y = Math.max(0, ny);
      if (b.y <= 0) this.land(b);
    }
  }

  /** 地面についた: 勢いがあれば ぴょんと はねる（最大 2 回）。なければ止まる */
  private land(b: Entity): void {
    const k = DROP.bounce;
    if (-b.vy > k.minImpact && b.bounces < k.maxCount) {
      b.bounces++;
      b.vy = -b.vy * k.vertical;
      b.vx *= k.horizontal;
      b.vz *= k.horizontal;
      return;
    }
    b.vx = b.vy = b.vz = 0;
    b.resting = true;
  }

  /** 横に動く。固いブロックにぶつかったらその向きは止める */
  private moveXZ(b: Entity): void {
    const w = this.d.world;
    const nx = b.x + b.vx * DT;
    const nz = b.z + b.vz * DT;
    const fy = Math.floor(b.y + 0.2);
    // 見えない壁と、読みこんでいない列は こえない
    if (!cellInWall(Math.floor(nx), Math.floor(b.z)) || !w.isLoaded(Math.floor(nx), Math.floor(b.z)) || w.isSolid(Math.floor(nx), fy, Math.floor(b.z))) b.vx = 0;
    else b.x = nx;
    if (!cellInWall(Math.floor(b.x), Math.floor(nz)) || !w.isLoaded(Math.floor(b.x), Math.floor(nz)) || w.isSolid(Math.floor(b.x), fy, Math.floor(nz))) b.vz = 0;
    else b.z = nz;
  }

  /** 保存用（アイテムごと） */
  serialize(): DropSave[] {
    return this.items.map((b) => ({
      x: b.x,
      y: b.y,
      z: b.z,
      item: b.item.item,
      count: b.item.count,
      ticksLeft: b.ticksLeft,
      batch: b.batch,
      rarity: b.rarity,
      ...(b.yokai ? { yokai: true } : {}),
      ...(b.item.wear && b.item.wear > 0 ? { wear: b.item.wear } : {}),
      ...(b.item.water && b.item.water > 0 ? { water: b.item.water } : {}),
      ...(b.item.plan && b.item.plan > 0 ? { plan: b.item.plan } : {}),
      ...(b.item.power && b.item.power > 0 ? { power: b.item.power } : {}),
    }));
  }

  /** 読みこみ用。おかしい分・古い形（ふくろ）は捨てる（こわれた保存でも遊べる） */
  deserialize(data: unknown): void {
    const out: Entity[] = [];
    let maxBatch = 0;
    if (Array.isArray(data)) {
      for (const raw of data.slice(0, DROP.maxItems)) {
        const r = raw as Record<string, unknown> | null;
        if (!r || typeof r.item !== 'string') continue;
        const x = Number(r.x);
        const y = Number(r.y);
        const z = Number(r.z);
        const t = Number(r.ticksLeft);
        if (![x, y, z, t].every(Number.isFinite) || t < 1) continue;
        const ty = itemType(r.item);
        const c = r.count;
        if (!ty || typeof c !== 'number' || !Number.isInteger(c) || c < 1 || c > ty.maxStack) continue;
        const batch = Number.isInteger(r.batch) && (r.batch as number) > 0 ? (r.batch as number) : this.nextBatch++;
        maxBatch = Math.max(maxBatch, batch);
        const rarity: Rarity = isRarity(r.rarity) ? (r.rarity as Rarity) : itemRarity(ty.id);
        out.push({
          id: this.nextId++,
          x,
          y,
          z,
          vx: 0,
          vy: 0,
          vz: 0,
          resting: false,
          age: DROP.pickupDelay,
          bounces: DROP.bounce.maxCount,
          item: copyStack({ item: ty.id, count: c, wear: readWear(r.wear, maxDurability(ty.id, W2_SETTING_DEFAULTS.toolDurability)), water: readWater(r.water, ty.id), power: readPower(r.power, ty.id), plan: readPlan(r.plan, ty.id) }),
          ticksLeft: Math.min(Math.floor(t), this.life),
          batch,
          rarity,
          thrown: false,
          pickupAt: 0,
          yokai: r.yokai === true,
        });
      }
    }
    this.items = out;
    this.nextBatch = Math.max(this.nextBatch, maxBatch + 1);
  }
}
