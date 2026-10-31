import type { TansuMaterialStore, Inventory, ItemId, ItemStack, StorageEvent, Vec3, VoxelWorld } from '../contracts';
import { K_TANSU, isFurnKind } from '../world/blocks/houseBlocks';
import { addInto } from '../inventory/Inventory';
import { itemType } from '../inventory/items';
import { addStack, copyStack, readPlan, readPower, readWater, readWear, maxDurability } from '../tools/durability';
import { W2_SETTING_DEFAULTS } from '../contracts';

/** たんす 1 つの中身（M6 §2.9）。場所ごとにべつべつ */
export type Facing = 'n' | 'e' | 's' | 'w';
export type TansuSlot = ItemStack | null;

export interface TansuRecord {
  x: number;
  y: number;
  z: number;
  /** 前（引き出しの面）が向いている方。向きが分からない（テストで置いた）ときは null */
  facing: Facing | null;
  slots: TansuSlot[];
}

export interface StorageLive {
  tansuSlots: number;
  tansuCloseDist: number;
}

export const STORAGE_DEFAULTS: Readonly<StorageLive> = { tansuSlots: 54, tansuCloseDist: 6 };

export type StorageSound = 'drawerOpen' | 'drawerClose';
export type ShiftReason = null | 'full' | 'closed';

export interface StorageDeps {
  world: VoxelWorld;
  inventory: Inventory & {
    setCursor(stack: ItemStack | null): void;
    setReturnHandler?(fn: ((stack: ItemStack) => boolean) | null): void;
  };
  player: () => Vec3;
  /** 落とし物としてばらまく（DropField.scatter）。こわしたときの中身用 */
  scatter: (pos: Vec3, stacks: ItemStack[]) => void;
  inventoryOpen: () => boolean;
  /** もちもの画面を開く・閉じる（ScreenController.toggle を呼ぶ） */
  openScreen: () => void;
  closeScreen: () => void;
  live?: StorageLive;
  tick?: () => number;
  requestSave?: () => void;
  onSound?: (name: StorageSound) => void;
  /** 入りきらなかった（合図の文字を出す）。which = どっちが いっぱい */
  onFull?: (which: 'inv' | 'tansu') => void;
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;

/** マスのクリック 2 回の決まり（M2 §2.5）を 1 回ぶん。変わらないなら null */
export function clickRule(slot: TansuSlot, cur: ItemStack | null): { slot: TansuSlot; cur: ItemStack | null } | null {
  if (!cur) {
    if (!slot) return null;
    return { slot: null, cur: slot };
  }
  if (!slot) return { slot: cur, cur: null };
  if (slot.item === cur.item) {
    const max = itemType(slot.item)!.maxStack;
    const n = Math.min(max - slot.count, cur.count);
    if (n <= 0) return null;
    return {
      slot: { item: slot.item, count: slot.count + n },
      cur: cur.count - n > 0 ? { item: cur.item, count: cur.count - n } : null,
    };
  }
  return { slot: cur, cur: slot };
}

/** 向き: プレイヤーが向いている方（yaw）から、前の面が向く方（プレイヤーの方）を決める */
export function facingFromYaw(yawDeg: number): Facing {
  const r = (yawDeg * Math.PI) / 180;
  const dx = Math.sin(r);
  const dz = -Math.cos(r);
  if (Math.abs(dz) >= Math.abs(dx)) return dz < 0 ? 's' : 'n';
  return dx > 0 ? 'w' : 'e';
}

/**
 * たんす（和だんす）の中身・開く・閉じる・うつす・こわす・保存。世界のブロックは 'tansu'。
 * 毎ステップ update() を呼ぶ。
 */
export class StorageSystem implements TansuMaterialStore {
  private readonly records = new Map<string, TansuRecord>();
  private opened: TansuRecord | null = null;
  private lookOpenNow = false;
  private events: StorageEvent[] = [];
  /** カーソルに持ち上げたマス（たんす）。画面を閉じたときそこへもどす */
  private liftedFrom: { rec: TansuRecord; index: number; item: ItemId } | null = null;
  private fullNow = new Set<TansuRecord>();
  private ver = 0;

  constructor(private readonly d: StorageDeps) {
    d.inventory.setReturnHandler?.((st) => this.returnToLifted(st));
  }

  private get live(): StorageLive {
    return this.d.live ?? STORAGE_DEFAULTS;
  }
  private tick(): number {
    return this.d.tick?.() ?? 0;
  }

  isTansu(x: number, y: number, z: number): boolean {
    return isFurnKind(this.d.world.getBlock(x, y, z), K_TANSU);
  }

  /** そのマスが 読みこまれていて、たんす でなくなった（読みこんでいない列は 'outside' = まだ分からない。記録は消さない。VOX-D） */
  private changedAway(x: number, y: number, z: number): boolean {
    const b = this.d.world.getBlock(x, y, z);
    return !isFurnKind(b, K_TANSU) && b !== 'outside';
  }

  /** そこの たんす の記録。たんす でなければ null。記録がなければ（テストで置いた）空で作る */
  private ensure(x: number, y: number, z: number): TansuRecord | null {
    if (!this.isTansu(x, y, z)) return null;
    const k = key(x, y, z);
    let r = this.records.get(k);
    if (!r) {
      r = { x, y, z, facing: null, slots: new Array<TansuSlot>(this.live.tansuSlots).fill(null) };
      this.records.set(k, r);
    }
    return r;
  }

  /** たんす を置いた（向きを記録する） */
  placed(x: number, y: number, z: number, yawDeg: number): void {
    const r = this.ensure(x, y, z);
    if (r) {
      r.facing = facingFromYaw(yawDeg);
      this.d.requestSave?.();
    }
  }

  get(x: number, y: number, z: number): { slots: TansuSlot[]; facing: Facing | null } | null {
    const r = this.ensure(x, y, z);
    return r ? { slots: r.slots.map((s) => (s ? copyStack(s) : null)), facing: r.facing } : null;
  }

  /** 準備用: マス i を決める（出来事・実績なし） */
  set(x: number, y: number, z: number, i: number, stack: ItemStack | null): boolean {
    const r = this.ensure(x, y, z);
    if (!r || !Number.isInteger(i) || i < 0 || i >= r.slots.length) return false;
    r.slots[i] = stack && stack.count > 0 ? copyStack(stack) : null;
    this.ver++;
    this.d.requestSave?.();
    return true;
  }

  list(): Vec3[] {
    const out: Vec3[] = [];
    for (const r of this.records.values()) if (!this.changedAway(r.x, r.y, r.z)) out.push({ x: r.x, y: r.y, z: r.z });
    return out;
  }

  // ------------------------------------------------------------ ひらく・とじる

  open(x: number, y: number, z: number, opts?: { screenOpens?: boolean }): boolean {
    const r = this.ensure(x, y, z);
    if (!r) return false;
    if (this.opened && this.opened !== r) this.markClosed();
    this.opened = r;
    this.lookOpenNow = true;
    this.d.onSound?.('drawerOpen');
    if (!opts?.screenOpens && !this.d.inventoryOpen()) this.d.openScreen();
    return true;
  }

  /** とじる ボタンと同じ */
  close(): void {
    if (!this.opened) return;
    this.markClosed();
    if (this.d.inventoryOpen()) this.d.closeScreen();
  }

  private markClosed(): void {
    this.markSet.clear();
    this.opened = null;
    this.lookOpenNow = false;
    this.d.onSound?.('drawerClose');
  }

  openedAt(): Vec3 | null {
    return this.opened ? { x: this.opened.x, y: this.opened.y, z: this.opened.z } : null;
  }

  ui(): { open: boolean; position: Vec3 | null; slots: number; full: boolean; lookOpen: boolean } {
    return {
      open: this.opened !== null,
      position: this.openedAt(),
      slots: this.live.tansuSlots,
      full: this.opened ? this.opened.slots.every((s) => s !== null) : false,
      lookOpen: this.lookOpenNow,
    };
  }

  /** 開いている たんす のマス（画面用。コピーしない。開いていなければ null） */
  openSlots(): readonly TansuSlot[] | null {
    return this.opened ? this.opened.slots : null;
  }

  // ------------------------------------------------------------ うつす

  /** 開いている たんす のマス i をクリック（カーソルで運ぶ。M2 §2.5） */
  click(i: number): boolean {
    const r = this.opened;
    if (!r || !Number.isInteger(i) || i < 0 || i >= r.slots.length) return false;
    const inv = this.d.inventory;
    const curBefore = inv.cursor();
    const before = r.slots[i];
    const res = clickRule(before, curBefore);
    if (!res) return false;
    if (!curBefore) this.liftedFrom = null; // 空のカーソルからは、古い目印は使わない
    const liftedBefore = this.liftedFrom;
    r.slots[i] = res.slot;
    inv.setCursor(res.cur);
    // たんす から持ち上げた → 目印をつける（画面を閉じたとき そこへもどす）。置ききったら消す
    this.liftedFrom = res.cur ? { rec: r, index: i, item: res.cur.item } : null;
    // 持ち物から たんす へ入れた分を「しまった」と数える（たんす から出したものを戻すだけなら数えない）
    if (curBefore && liftedBefore?.item !== curBefore.item) {
      const put = before && before.item === curBefore.item ? res.slot!.count - before.count : curBefore.count;
      if (put > 0) this.pushStore(curBefore.item, put);
    }
    this.afterChange(r);
    return true;
  }

  /**
   * シフトクリック（そのマスのぜんぶを もう片方へ）。from = 'tansu' か 'inv'（持ち物のマス）。
   * カーソルに何か持っているときは ふつうのクリック
   */
  shiftClick(from: 'tansu' | 'inv', i: number): { moved: number; reason: ShiftReason } {
    const r = this.opened;
    if (!r) return { moved: 0, reason: 'closed' };
    const inv = this.d.inventory;
    if (inv.cursor()) {
      if (from === 'tansu') this.click(i);
      else inv.click(i);
      return { moved: 0, reason: null };
    }
    if (from === 'inv') {
      const s = inv.slots()[i];
      if (!s) return { moved: 0, reason: null };
      const left = addInto(r.slots, s.item, s.count, 0, r.slots.length, s.wear ?? 0, s.water ?? 0, s.power ?? 0, s.plan ?? 0);
      const moved = s.count - left;
      if (moved === 0) {
        this.d.onFull?.('tansu');
        return { moved: 0, reason: 'full' };
      }
      inv.setSlot(i, left > 0 ? { ...s, count: left } : null);
      this.pushStore(s.item, moved);
      this.afterChange(r);
      return { moved, reason: null };
    }
    const s = r.slots[i];
    if (!s) return { moved: 0, reason: null };
    const left = addStack(inv, s);
    const moved = s.count - left;
    if (moved === 0) {
      this.d.onFull?.('inv');
      return { moved: 0, reason: 'full' };
    }
    r.slots[i] = left > 0 ? { ...s, count: left } : null;
    this.afterChange(r);
    return { moved, reason: null };
  }

  // ------------------------------------------------------------ いっきに しまう・とりだす（FIX-tansu）

  private readonly markSet = new Set<number>();

  /** 持ち物のマス i のぜんぶを たんす へ。入らない分は のこる。しまった数を返す */
  private storeSlot(r: TansuRecord, i: number): number {
    const inv = this.d.inventory;
    const s = inv.slots()[i];
    if (!s) return 0;
    const left = addInto(r.slots, s.item, s.count, 0, r.slots.length, s.wear ?? 0, s.water ?? 0, s.power ?? 0, s.plan ?? 0);
    const moved = s.count - left;
    if (moved <= 0) return 0;
    inv.setSlot(i, left > 0 ? { ...s, count: left } : null);
    this.pushStore(s.item, moved);
    return moved;
  }

  private storeWhere(pred: (i: number, item: ItemId) => boolean): { moved: number; reason: ShiftReason | 'nothing' } {
    const r = this.opened;
    if (!r) return { moved: 0, reason: 'closed' };
    let moved = 0;
    let tried = 0;
    for (let i = 0; i < this.d.inventory.slots().length; i++) {
      const s = this.d.inventory.slots()[i];
      if (!s || !pred(i, s.item)) continue;
      tried++;
      moved += this.storeSlot(r, i);
    }
    if (moved > 0) this.afterChange(r);
    else if (tried > 0) {
      this.d.onFull?.('tansu');
      return { moved: 0, reason: 'full' };
    }
    return { moved, reason: moved > 0 || tried === 0 ? null : 'full' };
  }

  /** ぜんぶ しまう: もちもの の上 3 だん（9〜35）。ホットバー と そうび は うごかさない */
  storeAll(): { moved: number; reason: ShiftReason } {
    return this.storeWhere((i) => i >= 9) as { moved: number; reason: ShiftReason };
  }

  /** おなじ もの を しまう: たんす に もう ある アイテム と おなじ ものだけ（ホットバー以外） */
  storeSame(): { moved: number; reason: ShiftReason } {
    const r = this.opened;
    const have = new Set<ItemId>();
    for (const t of r?.slots ?? []) if (t) have.add(t.item);
    return this.storeWhere((i, item) => i >= 9 && have.has(item)) as { moved: number; reason: ShiftReason };
  }

  /** ぜんぶ とりだす: たんす の中身を もちもの へ（入る分だけ） */
  takeAll(): { moved: number; reason: ShiftReason } {
    const r = this.opened;
    if (!r) return { moved: 0, reason: 'closed' };
    const inv = this.d.inventory;
    let moved = 0;
    let tried = 0;
    for (let i = 0; i < r.slots.length; i++) {
      const s = r.slots[i];
      if (!s) continue;
      tried++;
      const left = addStack(inv, s);
      moved += s.count - left;
      r.slots[i] = left > 0 ? { ...s, count: left } : null;
    }
    if (moved > 0) this.afterChange(r);
    else if (tried > 0) {
      this.d.onFull?.('inv');
      return { moved: 0, reason: 'full' };
    }
    return { moved, reason: null };
  }

  /** Ctrl（⌘）クリックの ✓。つけたら true・はずしたら false。たんす が開いていて 中身のあるマスだけ */
  mark(i: number): boolean {
    if (!this.opened || !Number.isInteger(i) || i < 0 || i >= this.d.inventory.slots().length) return false;
    if (this.markSet.has(i)) {
      this.markSet.delete(i);
      return false;
    }
    if (!this.d.inventory.slots()[i]) return false;
    this.markSet.add(i);
    return true;
  }

  marks(): number[] {
    return [...this.markSet].sort((a, b) => a - b);
  }

  /** えらんだ もの を しまう。✓ は消える */
  storeMarked(): { moved: number; reason: ShiftReason } {
    const ids = new Set(this.markSet);
    this.markSet.clear();
    return this.storeWhere((i) => ids.has(i)) as { moved: number; reason: ShiftReason };
  }

  /** そのマスから 1 こ（all ならぜんぶ）取り出す（すてる用）。開いていなければ null */
  takeFromSlot(i: number, all: boolean): ItemStack | null {
    const r = this.opened;
    if (!r || !Number.isInteger(i) || i < 0 || i >= r.slots.length) return null;
    const s = r.slots[i];
    if (!s) return null;
    const n = all ? s.count : 1;
    r.slots[i] = n >= s.count ? null : { ...s, count: s.count - n };
    this.afterChange(r);
    return copyStack({ ...s, count: n });
  }

  private pushStore(item: ItemId, count: number): void {
    this.events.push({ type: 'store', tick: this.tick(), item, count });
  }

  private afterChange(r: TansuRecord): void {
    this.ver++;
    const full = r.slots.every((s) => s !== null);
    if (full && !this.fullNow.has(r)) {
      this.fullNow.add(r);
      this.events.push({ type: 'storeFull', tick: this.tick() });
    } else if (!full) this.fullNow.delete(r);
    this.d.requestSave?.();
  }

  /** 画面を閉じるとき、カーソルのものが たんす から持ち上げたものなら そのマスへもどす */
  private returnToLifted(st: ItemStack): boolean {
    const f = this.liftedFrom;
    this.liftedFrom = null;
    if (!f || f.item !== st.item || !this.records.has(key(f.rec.x, f.rec.y, f.rec.z))) return false;
    const res = clickRule(f.rec.slots[f.index], st);
    if (!res || res.cur) return false;
    f.rec.slots[f.index] = res.slot;
    this.afterChange(f.rec);
    return true;
  }

  // ------------------------------------------------------------ こわす

  /**
   * たんす をこわした（DigSystem が ブロックを消したあとに呼ぶ）。中身を まわりに落とし物として ばらまく。
   * 開いていたら画面を閉じて、カーソルのものは 持ち物へ（入らなければ 足もとへ）。ばらまいたこ数を返す
   */
  broken(x: number, y: number, z: number): number {
    const k = key(x, y, z);
    const r = this.records.get(k);
    if (!r) return 0;
    this.records.delete(k);
    this.fullNow.delete(r);
    this.ver++;
    if (this.opened === r) {
      this.opened = null;
      this.lookOpenNow = false;
      this.liftedFrom = null;
      if (this.d.inventoryOpen()) this.d.closeScreen();
      const inv = this.d.inventory;
      inv.returnCursor();
      const cur = inv.cursor();
      if (cur) {
        inv.setCursor(null);
        this.d.scatter(this.d.player(), [cur]);
      }
    }
    const stacks = r.slots.filter((s): s is ItemStack => s !== null).map((s) => copyStack(s));
    if (stacks.length > 0) this.d.scatter({ x: x + 0.5, y, z: z + 0.5 }, stacks);
    this.d.requestSave?.();
    return stacks.reduce((n, s) => n + s.count, 0);
  }

  // ------------------------------------------------------------ 毎ステップ・出来事

  update(): void {
    // カーソルが空なら持ち上げ元の目印は古い（置いた・すてた）。消す
    if (this.liftedFrom && !this.d.inventory.cursor()) this.liftedFrom = null;
    const o = this.opened;
    if (o) {
      const p = this.d.player();
      const gone = this.changedAway(o.x, o.y, o.z);
      const far = Math.hypot(p.x - (o.x + 0.5), p.z - (o.z + 0.5), p.y - o.y) > this.live.tansuCloseDist;
      if (gone) {
        this.records.delete(key(o.x, o.y, o.z));
        this.ver++;
        this.opened = null;
        this.lookOpenNow = false;
        if (this.d.inventoryOpen()) this.d.closeScreen();
      } else if (far || !this.d.inventoryOpen()) {
        // 画面が閉じられた（E・Esc・とじる）か、遠くなった
        this.markClosed();
        if (this.d.inventoryOpen()) this.d.closeScreen();
      }
    }
    // ブロックが書きかえられて消えた たんす は 中身も消える（落とさない）
    for (const [k, r] of this.records) {
      if (this.changedAway(r.x, r.y, r.z)) {
        this.records.delete(k);
        this.fullNow.delete(r);
        this.ver++;
      }
    }
  }

  /** C の記録へ渡す出来事（呼ぶと空） */
  // ------------------------------------------------------------ CRAFT-2: つくる・やく の 素材（TansuMaterialStore）

  /** 中身・置き場所が変わるたびに ふえる数（CraftSystem の しらべ直しの合図。保存はしない） */
  version(): number {
    return this.ver;
  }

  /** そこの たんす に item が 全部で何こ あるか（たんす でなければ 0。記録を作らない） */
  countItem(x: number, y: number, z: number, item: ItemId): number {
    if (!this.isTansu(x, y, z)) return 0;
    const r = this.records.get(key(x, y, z));
    if (!r) return 0;
    let n = 0;
    for (const s of r.slots) if (s && s.item === item) n += s.count;
    return n;
  }

  /**
   * item を 最大 count こ 取り出して 取れた数を返す（§2.3: うしろのマス（53 → 0）から。もちもの と同じ向き）。
   * 出来事 `store` は出さない（しまったのではない）。いっぱいの印は 空きができたら はずれる
   */
  takeItem(x: number, y: number, z: number, item: ItemId, count: number): number {
    if (!this.isTansu(x, y, z) || !(count > 0)) return 0;
    const r = this.records.get(key(x, y, z));
    if (!r) return 0;
    let left = Math.floor(count);
    for (let i = r.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = r.slots[i];
      if (!s || s.item !== item) continue;
      const n = Math.min(s.count, left);
      left -= n;
      r.slots[i] = n === s.count ? null : { ...s, count: s.count - n };
    }
    const took = Math.floor(count) - left;
    if (took > 0) this.afterChange(r);
    return took;
  }

  drainEvents(): StorageEvent[] {
    if (this.events.length === 0) return NO_EVENTS;
    const out = this.events;
    this.events = [];
    return out;
  }

  // ------------------------------------------------------------ 保存

  serialize(): unknown {
    return [...this.records.values()].map((r) => ({
      x: r.x,
      y: r.y,
      z: r.z,
      facing: r.facing,
      slots: r.slots.map((s) => (s ? copyStack(s) : null)),
    }));
  }

  /** こわれた保存・古い保存（たんす なし）でも開ける */
  deserialize(data: unknown): void {
    this.records.clear();
    this.fullNow.clear();
    this.ver++;
    this.opened = null;
    this.lookOpenNow = false;
    this.liftedFrom = null;
    if (!Array.isArray(data)) return;
    const n = this.live.tansuSlots;
    for (const raw of data) {
      const r = raw as Record<string, unknown> | null;
      if (!r) continue;
      const x = Number(r.x);
      const y = Number(r.y);
      const z = Number(r.z);
      if (![x, y, z].every(Number.isInteger)) continue;
      const slots = new Array<TansuSlot>(n).fill(null);
      if (Array.isArray(r.slots)) {
        for (let i = 0; i < Math.min(n, r.slots.length); i++) {
          const s = r.slots[i] as { item?: unknown; count?: unknown; wear?: unknown; water?: unknown; power?: unknown; plan?: unknown } | null;
          const t = s && typeof s.item === 'string' ? itemType(s.item) : undefined;
          if (!s || !t || typeof s.count !== 'number' || !Number.isInteger(s.count) || s.count < 1 || s.count > t.maxStack) continue;
          slots[i] = copyStack({ item: t.id, count: s.count, wear: readWear(s.wear, maxDurability(t.id, W2_SETTING_DEFAULTS.toolDurability)), water: readWater(s.water, t.id), power: readPower(s.power, t.id), plan: readPlan(s.plan, t.id) });
        }
      }
      const f = r.facing;
      this.records.set(key(x, y, z), { x, y, z, facing: f === 'n' || f === 'e' || f === 's' || f === 'w' ? f : null, slots });
    }
  }
}

const NO_EVENTS: StorageEvent[] = [];
