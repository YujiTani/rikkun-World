import type { Inventory, ItemStack, Rarity, Vec3, VoxelWorld } from '../contracts';
import { itemType } from '../inventory/items';
import { RARITY_ORDER, itemRarity, topRarity } from './rarity';
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
} as const;

/** ばらまき方（やられた = 大きく、妖怪 = 小さく） */
export type DropKind = 'death' | 'yokai';

export interface ScatterOptions {
  /** ばらまき方の型。ふつうは 'death' */
  kind?: DropKind;
  /** 水平の速さの最小〜最大（ブロック/秒） */
  speedMin?: number;
  speedMax?: number;
  /** 上向きの速さの最小〜最大 */
  upMin?: number;
  upMax?: number;
}

const KIND_SCATTER: Record<DropKind, Required<Omit<ScatterOptions, 'kind'>>> = {
  death: { speedMin: 1.5, speedMax: 3.5, upMin: 4, upMax: 6 },
  yokai: { speedMin: 0.8, speedMax: 1.8, upMin: 3, upMax: 4.5 },
};

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
}

export interface DropSave {
  x: number;
  y: number;
  z: number;
  item: string;
  count: number;
  ticksLeft: number;
  batch: number;
  rarity: Rarity;
}

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
  /** 拾った・消えたとき 保存してほしい */
  requestSave?: () => void;
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
    const kind = opts.kind ?? 'death';
    const o = { ...KIND_SCATTER[kind], ...opts };
    let total = 0;
    const batch = this.nextBatch++;
    const rarity = topRarity(stacks.filter((x) => x.count >= 1).map((x) => x.item));
    for (const st of stacks) {
      if (st.count < 1) continue;
      const ang = this.rng() * Math.PI * 2;
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
        item: { item: st.item, count: st.count },
        ticksLeft: this.life,
        batch,
        rarity,
      });
      total += st.count;
      if (this.items.length > DROP.maxItems) this.items.shift();
    }
    return total;
  }

  list(): DropView[] {
    return this.items.map((b) => ({
      id: b.id,
      position: { x: b.x, y: b.y, z: b.z },
      slots: [{ item: b.item.item, count: b.item.count }],
      ticksLeft: b.ticksLeft,
      batch: b.batch,
      rarity: b.rarity,
    }));
  }

  size(): number {
    return this.items.length;
  }

  /** 1 ステップ進める。canPickup = false のあいだは拾わない。拾った（一部でも）アイテムの id を返す */
  update(canPickup: boolean): number[] {
    const picked: number[] = [];
    if (this.items.length === 0) return picked;
    const p = this.d.player();
    let changed = false;
    for (const b of this.items) {
      b.ticksLeft--;
      if (b.ticksLeft <= 0) {
        changed = true;
        continue;
      }
      this.step(b);
      if (!canPickup) continue;
      if (Math.hypot(p.x - b.x, p.z - b.z) <= this.radius && Math.abs(p.y - b.y) <= DROP.pickupHeight) {
        const left = this.d.inventory.add(b.item.item, b.item.count);
        if (left !== b.item.count) {
          b.item = { item: b.item.item, count: left };
          picked.push(b.id);
          changed = true;
        }
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
      b.vx = b.vy = b.vz = 0;
      b.resting = true;
    } else if (b.vy > 0 && w.isSolid(cx, Math.floor(ny + 0.3), cz)) {
      b.vy = 0; // 天井
    } else {
      b.y = Math.max(0, ny);
      if (b.y <= 0) {
        b.vx = b.vy = b.vz = 0;
        b.resting = true;
      }
    }
  }

  /** 横に動く。固いブロックにぶつかったらその向きは止める */
  private moveXZ(b: Entity): void {
    const w = this.d.world;
    const nx = b.x + b.vx * DT;
    const nz = b.z + b.vz * DT;
    const fy = Math.floor(b.y + 0.2);
    if (w.isSolid(Math.floor(nx), fy, Math.floor(b.z))) b.vx = 0;
    else b.x = nx;
    if (w.isSolid(Math.floor(b.x), fy, Math.floor(nz))) b.vz = 0;
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
        const rarity: Rarity = RARITY_ORDER.includes(r.rarity as Rarity) ? (r.rarity as Rarity) : itemRarity(ty.id);
        out.push({
          id: this.nextId++,
          x,
          y,
          z,
          vx: 0,
          vy: 0,
          vz: 0,
          resting: false,
          item: { item: ty.id, count: c },
          ticksLeft: Math.min(Math.floor(t), this.life),
          batch,
          rarity,
        });
      }
    }
    this.items = out;
    this.nextBatch = Math.max(this.nextBatch, maxBatch + 1);
  }
}
