import type { ArmorSlot, ArmorSystem, DamageKind, Durability, Inventory, ItemId, ItemStack, W2Settings, WearEvent } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { addStack, isLow, maxDurability, readWear } from '../tools/durability';
import { ARMOR_SLOTS, ARMOR_SLOT_OF, type CraftConfig } from './config';

/** 防具が使う持ち物（カーソルを直接かえられるもの。InventoryImpl が合う） */
export type ArmorInventory = Inventory & { setCursor(stack: ItemStack | null): void };

export interface ArmorSnapshot {
  head: ItemId | null;
  body: ItemId | null;
  arms: ItemId | null;
  legs: ItemId | null;
  value: number;
  hitCount: number;
  hudIcons: ItemId[];
  /** WEAPON-2: 部位ごとの へった 量（0 か なし = 新品）。前の保存には 無い = 新品。担当 F が 持ち運ぶ */
  wear?: Partial<Record<ArmorSlot, number>>;
}

/** たいきゅうの 設定と 時計（WEAPON-2）。省くと 初期値・0 */
export interface ArmorWearOptions {
  settings?: () => Pick<W2Settings, 'toolDurability' | 'toolWear' | 'wearLowRatio'>;
  tick?: () => number;
}

/** かぶと・よろい・こて・すねあて（M4 §2.7）。そうびのマス 4 つ・着る・ふせぐ */
export class ArmorSystemImpl implements ArmorSystem {
  private worn: Record<ArmorSlot, ItemId | null> = { head: null, body: null, arms: null, legs: null };
  private hits = 0;
  private listeners: Array<() => void> = [];
  private snap: ArmorSnapshot | null = null;
  private snapVer = -1;

  constructor(
    private readonly inventory: ArmorInventory,
    private readonly config: Pick<CraftConfig, 'armorValue'>,
    private readonly wearOpts: ArmorWearOptions = {},
  ) {}

  /** 部位ごとの へった 量（0 = 新品） */
  private wear: Record<ArmorSlot, number> = { head: 0, body: 0, arms: 0, legs: 0 };
  private wearVer = 0;
  private wearEvents: WearEvent[] = [];
  private wearLog: WearEvent[] = [];

  equipped(slot: ArmorSlot): ItemId | null {
    return this.worn[slot];
  }

  /** そのアイテムが入るそうびのマス（入らないなら null） */
  slotFor(item: ItemId): ArmorSlot | null {
    return ARMOR_SLOT_OF[item] ?? null;
  }

  /** 手に持っている item を着る（もう着ていれば入れかえて、前のものが手のマスへ） */
  tryEquip(item: ItemId): boolean {
    const slot = this.slotFor(item);
    const held = this.inventory.held();
    if (!slot || !held || held.item !== item) return false;
    const prev = this.equippedStack(slot);
    this.put(slot, item, held.wear ?? 0);
    const sel = this.inventory.selected();
    if (held.count > 1) {
      // 防具は上限 1 なので通常は通らない
      this.inventory.setSlot(sel, { item, count: held.count - 1 });
      if (prev) addStack(this.inventory, prev);
    } else {
      this.inventory.setSlot(sel, prev);
    }
    return true;
  }

  /** もちもの画面で 防具のマス i を ダブルクリック: その部位に着る（前に着ていた物は そのマスへ） */
  equipFromSlot(i: number): boolean {
    const s = this.inventory.slots()[i];
    if (!s) return false;
    const slot = this.slotFor(s.item);
    if (!slot) return false;
    const prev = this.equippedStack(slot);
    this.put(slot, s.item, s.wear ?? 0);
    if (s.count > 1) {
      this.inventory.setSlot(i, { item: s.item, count: s.count - 1 });
      if (prev) addStack(this.inventory, prev);
    } else {
      this.inventory.setSlot(i, prev);
    }
    return true;
  }

  /** そうびのマスを ダブルクリック: はずして もちものへ（いっぱいなら そのまま） */
  unequipToBag(slot: ArmorSlot): boolean {
    const eq = this.equippedStack(slot);
    if (!eq) return false;
    if (addStack(this.inventory, eq) > 0) return false;
    this.put(slot, null);
    return true;
  }

  /** もちもの画面でそうびのマスをクリック（M2 §2.5 のクリックと同じやり方） */
  click(slot: ArmorSlot): void {
    const cur = this.inventory.cursor();
    const eq = this.equippedStack(slot);
    if (!cur) {
      if (!eq) return;
      this.inventory.setCursor(eq);
      this.put(slot, null);
      return;
    }
    if (this.slotFor(cur.item) !== slot) return; // 合わないものは入らない
    const rest = cur.count - 1;
    this.put(slot, cur.item, cur.wear ?? 0);
    if (rest > 0) {
      this.inventory.setCursor({ item: cur.item, count: rest });
      if (eq) addStack(this.inventory, eq);
    } else {
      this.inventory.setCursor(eq);
    }
  }

  /** 種類 kind のダメージをへらす量（着ている防具の合計） */
  valueOf(kind: DamageKind): number {
    const v = this.config.armorValue;
    let sum = 0;
    for (const slot of ARMOR_SLOTS) {
      const it = this.worn[slot];
      if (it) sum += v[it]?.[kind] ?? 0;
    }
    return sum;
  }

  /** 着ている防具の強さの目安（それぞれの いちばん大きい値の合計。HUD・テスト用） */
  value(): number {
    const v = this.config.armorValue;
    let sum = 0;
    for (const slot of ARMOR_SLOTS) {
      const it = this.worn[slot];
      const t = it ? v[it] : undefined;
      if (t) sum += Math.max(t.normal, t.ball, t.fall);
    }
    return sum;
  }

  /**
   * 妖怪の攻撃を受けた（むてきで受けなかった回は呼ばない）。カットする量（体力の単位）を返す。
   * 受けるダメージは max(1, 元のダメージ − カット)（落下は max(0, …)）で、PlayerCombat が計算する（オーナー決定）
   */
  cut(kind: DamageKind = 'normal', amount?: number): number {
    this.hits++;
    // カットは こわれる 前の 防具で 先に 決める（最後の 1 回も ちゃんと 守る）
    const cutBy = this.valueOf(kind);
    if (typeof amount === 'number' && amount > 0) this.wearGuards(kind, amount);
    return cutBy;
  }

  /** その 種類を ふせぐ 防具だけ、max(1, 切り捨て(amount ÷ armorDiv)) へらす */
  private wearGuards(kind: DamageKind, amount: number): void {
    const st = this.wearOpts.settings?.() ?? W2_SETTING_DEFAULTS;
    const n = Math.max(1, Math.floor(amount / st.toolWear.armorDiv));
    for (const slot of ARMOR_SLOTS) {
      const it = this.worn[slot];
      if (!it || !((this.config.armorValue[it]?.[kind] ?? 0) > 0)) continue;
      this.wearSlot(slot, n);
    }
  }

  /** 部位 slot の たいきゅうを n へらす。0 で こわれて そうびの マスが 空に なる */
  private wearSlot(slot: ArmorSlot, n: number): void {
    const it = this.worn[slot];
    const st = this.wearOpts.settings?.() ?? W2_SETTING_DEFAULTS;
    const max = it ? maxDurability(it, st.toolDurability) : null;
    if (!it || max === null) return;
    const before = Math.max(1, max - this.wear[slot]);
    const worn = Math.min(n, before);
    const left = before - worn;
    const tick = this.wearOpts.tick?.() ?? 0;
    this.wearVer++;
    if (left <= 0) {
      this.pushWear({ type: 'toolBreak', tick, item: it, slot });
      this.put(slot, null);
      return;
    }
    this.wear[slot] = max - left;
    if (!isLow(before, max, st.wearLowRatio) && isLow(left, max, st.wearLowRatio)) this.pushWear({ type: 'wearLow', tick, item: it, slot });
    this.notify();
  }

  private pushWear(ev: WearEvent): void {
    this.wearEvents.push(ev);
    this.wearLog.push(ev);
    if (this.wearLog.length > 256) this.wearLog.shift();
  }

  // ---- WEAPON-2: へった 量つきで 持つ
  equippedStack(slot: ArmorSlot): ItemStack | null {
    const it = this.worn[slot];
    if (!it) return null;
    return this.wear[slot] > 0 ? { item: it, count: 1, wear: this.wear[slot] } : { item: it, count: 1 };
  }
  durability(slot: ArmorSlot): Durability | null {
    const it = this.worn[slot];
    const max = it ? maxDurability(it, (this.wearOpts.settings?.() ?? W2_SETTING_DEFAULTS).toolDurability) : null;
    if (!it || max === null) return null;
    return { max, left: Math.max(1, max - this.wear[slot]) };
  }
  /** 準備用（テストの窓口 `armor.setDurability`）。left は 1〜max に そろえる */
  setDurability(slot: ArmorSlot, left: number): void {
    const d = this.durability(slot);
    if (!d || !Number.isFinite(left)) return;
    this.wear[slot] = d.max - Math.min(d.max, Math.max(1, Math.floor(left)));
    this.wearVer++;
    this.notify();
  }
  drainWearEvents(): WearEvent[] {
    if (this.wearEvents.length === 0) return [];
    const out = this.wearEvents;
    this.wearEvents = [];
    return out;
  }
  peekWearEvents(): WearEvent[] {
    return this.wearLog.slice();
  }

  hitCount(): number {
    return this.hits;
  }

  /** 「受けた回数」k を 0 にもどす（復活したとき） */
  resetHits(): void {
    this.hits = 0;
  }

  /** そうびを変える（準備用。持ち物は変えない。k は 0 にもどる） */
  set(head: ItemId | null, body: ItemId | null, arms: ItemId | null = null, legs: ItemId | null = null): void {
    const want: Record<ArmorSlot, ItemId | null> = { head, body, arms, legs };
    for (const slot of ARMOR_SLOTS) {
      const it = want[slot];
      this.worn[slot] = it && this.slotFor(it) === slot ? it : null;
      this.wear[slot] = 0;
    }
    this.wearVer++;
    this.hits = 0;
    this.notify();
  }

  /** そうびのマスを空にして中身を返す（やられたとき落とす用） */
  take(slot: ArmorSlot): ItemId | null {
    const it = this.equipped(slot);
    if (it) this.put(slot, null);
    return it;
  }

  snapshot(): ArmorSnapshot {
    // 毎ステップ呼ばれる。変わったときだけ作る
    const s = this.snap;
    if (s && this.snapVer === this.wearVer && s.value === this.value() && s.hitCount === this.hits && ARMOR_SLOTS.every((k) => s[k] === this.worn[k])) return s;
    const hudIcons: ItemId[] = [];
    for (const slot of ARMOR_SLOTS) {
      const it = this.worn[slot];
      if (it) hudIcons.push(it);
    }
    const snap: ArmorSnapshot = { head: this.worn.head, body: this.worn.body, arms: this.worn.arms, legs: this.worn.legs, value: this.value(), hitCount: this.hits, hudIcons };
    const w = this.wearRecord();
    if (w) snap.wear = w;
    this.snap = snap;
    this.snapVer = this.wearVer;
    return this.snap;
  }

  serialize(): unknown {
    const out: Record<string, unknown> = { head: this.worn.head, body: this.worn.body, arms: this.worn.arms, legs: this.worn.legs };
    const w = this.wearRecord();
    if (w) out.wear = w;
    return out;
  }

  /** へった 部位だけの 表（ぜんぶ 新品なら null） */
  private wearRecord(): Partial<Record<ArmorSlot, number>> | null {
    let out: Partial<Record<ArmorSlot, number>> | null = null;
    for (const slot of ARMOR_SLOTS) {
      if (this.worn[slot] && this.wear[slot] > 0) (out ??= {})[slot] = this.wear[slot];
    }
    return out;
  }

  /** 古い保存（あたま・からだ の 2 部位）もそのまま開ける */
  deserialize(data: unknown): void {
    const d = (data ?? {}) as Record<string, unknown>;
    for (const slot of ARMOR_SLOTS) {
      const v = d[slot];
      this.worn[slot] = typeof v === 'string' && ARMOR_SLOT_OF[v] === slot ? (v as ItemId) : null;
      const it = this.worn[slot];
      const max = it ? maxDurability(it, (this.wearOpts.settings?.() ?? W2_SETTING_DEFAULTS).toolDurability) : null;
      const w = (d.wear ?? {}) as Record<string, unknown>;
      this.wear[slot] = readWear(w?.[slot], max);
    }
    this.wearVer++;
    this.hits = 0;
    this.notify();
  }

  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private put(slot: ArmorSlot, item: ItemId | null, wear = 0): void {
    this.worn[slot] = item;
    const max = item ? maxDurability(item, (this.wearOpts.settings?.() ?? W2_SETTING_DEFAULTS).toolDurability) : null;
    this.wear[slot] = readWear(wear, max);
    this.wearVer++;
    this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
