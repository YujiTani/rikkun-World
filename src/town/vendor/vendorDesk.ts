import type { ItemId } from '../../contracts';
import type { ShopPad, ShopSfx } from '../shop/shopSession';
import type { FoodEatResult, FoodService } from './food';
import type { KaitoriGiveResult, KaitoriService } from './kaitori';
import type { SmithFixResult, SmithService, SmithSlot } from './smith';
import { VENDOR_SAY_STEPS, type FoodKind } from './vendorTable';
import { MEAL_TEXT, SMITH_TEXT, STALL_TEXT, VENDOR_TEXT } from './vendorText';

/**
 * かじやさん・かいとりの やたい・食事の 画面の 状態（人ごと。TOWN-1-shop §2.11〜§2.13・§3.2、TOWN-1 §2.9・§5）。DOM なし。
 * よろずや（`shop/shopSession.ts`）と 同じ きまり: 1P と 2P は 別々に 開ける・やられた／街の 中から 外へ 出たら とじる・
 * 2 人で 開いて いる 人に 当たっても とじない・1 人で 1P が 開いて いる 間だけ 世界を 止める。1 人が 開けるのは 1 つ だけ。
 * なおす 物・わたせる 物が 1 つも ない ときは 画面を 開かず ふきだし だけ（`saying`）。
 */

type Who = 1 | 2;

/** 画面の しゅるい */
export type VendorKind = 'smith' | 'stall' | 'meal';
/** 話しかける 人（`town.info().npcs` の kind） */
export type VendorNpc = 'smith' | 'stall' | 'dango' | 'gohan';

export interface VendorView {
  kind: VendorKind | null;
  /** えらんだ カード（かじや ＝ slot の 文字〔'1'・'armor:head'〕、やたい ＝ 物の id） */
  selected: string | null;
  /** ふきだしの 文（なければ null） */
  bubble: string | null;
  /** ふきだしが 「たりない・いっぱい」の 知らせ（ボタンの 上に 大きな 色つきの 帯で 出す） */
  warn: boolean;
  /** 食事の しゅるい（食事の 画面 だけ） */
  meal: FoodKind | null;
}

interface Session extends VendorView {
  version: number;
  wasIn: boolean;
}

export interface VendorDeskDeps {
  smith: SmithService;
  kaitori: KaitoriService;
  food: FoodService;
  play?(e: ShopSfx): void;
  onOpen?(who: Who, kind: VendorKind): void;
  onClose?(who: Who, kind: VendorKind): void;
  /** なおした（トンカン・炉の 火） */
  fixed?(who: Who): void;
}

const closed = (): Session => ({ kind: null, selected: null, bubble: null, warn: false, meal: null, version: 0, wasIn: false });

/** 世界を 止めるか（よろずやと 同じ: 1 人の ときに 1P が 開いて いる 間 だけ） */
export function vendorFreezesWorld(s: { open1: boolean; joined: boolean }): boolean {
  return s.open1 && !s.joined;
}

/** かじやの カードの 文字 → slot（数字なら もちものの マス） */
export function smithSlotOf(id: string): SmithSlot {
  return /^\d+$/.test(id) ? Number(id) : (id as SmithSlot);
}

export class VendorDesk {
  private readonly s: [Session, Session] = [closed(), closed()];
  private readonly said: [{ text: string | null; left: number }, { text: string | null; left: number }] = [
    { text: null, left: 0 },
    { text: null, left: 0 },
  ];

  constructor(private readonly d: VendorDeskDeps) {}

  private at(who: Who): Session {
    return this.s[who - 1]!;
  }

  private touch(who: Who): void {
    this.at(who).version++;
  }

  view(who: Who): VendorView {
    const x = this.at(who);
    return { kind: x.kind, selected: x.selected, bubble: x.bubble, warn: x.warn, meal: x.meal };
  }

  version(who: Who): number {
    return this.at(who).version;
  }

  isOpen(who: Who, kind?: VendorKind): boolean {
    const k = this.at(who).kind;
    return kind === undefined ? k !== null : k === kind;
  }

  /** 画面の かわりに 出して いる ふきだし（なければ null） */
  saying(who: Who): string | null {
    const t = this.said[who - 1]!;
    return t.left > 0 ? t.text : null;
  }

  /** 画面を 開かず ふきだし だけ 出す（name は 画面の つなぎが 出す） */
  say(who: Who, text: string): void {
    this.said[who - 1] = { text, left: VENDOR_SAY_STEPS };
  }

  /** 話した（画面が 開けば true。ふきだし だけ なら false）。inTown ＝ いま 街の はんいの 中か */
  talk(who: Who, npc: VendorNpc, inTown = true): boolean {
    switch (npc) {
      case 'smith':
        if (this.d.smith.items(who).length === 0) {
          this.say(who, SMITH_TEXT.none);
          return false;
        }
        return this.open(who, 'smith', inTown, SMITH_TEXT.greet, null);
      case 'stall':
        if (this.d.kaitori.state(who).rows.length === 0) {
          this.say(who, STALL_TEXT.none);
          return false;
        }
        return this.open(who, 'stall', inTown, STALL_TEXT.greet, null);
      case 'dango':
      case 'gohan':
        return this.open(who, 'meal', inTown, MEAL_TEXT.greet, npc);
      default: {
        const never: never = npc;
        throw new Error(`話す 人 ${String(never)}`);
      }
    }
  }

  private open(who: Who, kind: VendorKind, inTown: boolean, greet: string, meal: FoodKind | null): boolean {
    const x = this.at(who);
    if (x.kind === kind && x.meal === meal) return true;
    if (x.kind !== null) this.close(who);
    const v = this.at(who).version;
    this.s[who - 1] = { kind, selected: null, bubble: greet, warn: false, meal, version: v + 1, wasIn: inTown };
    this.said[who - 1] = { text: null, left: 0 };
    this.d.onOpen?.(who, kind);
    return true;
  }

  close(who: Who): void {
    const x = this.at(who);
    const k = x.kind;
    if (k === null) return;
    this.s[who - 1] = { ...closed(), version: x.version + 1 };
    this.d.onClose?.(who, k);
  }

  select(who: Who, id: string | null): void {
    const x = this.at(who);
    if (x.kind === null || x.kind === 'meal' || x.selected === id) return;
    x.selected = id;
    x.bubble = x.kind === 'smith' ? SMITH_TEXT.greet : STALL_TEXT.greet;
    x.warn = false;
    this.touch(who);
    if (id !== null) this.d.play?.({ k: 'select' });
  }

  /** 大きな ボタン（なおす・わたす・たべる）。えらんで いない ときは null */
  press(who: Who): SmithFixResult | KaitoriGiveResult | FoodEatResult | null {
    const x = this.at(who);
    switch (x.kind) {
      case null:
        return null;
      case 'smith':
        return x.selected === null ? null : this.fix(who, smithSlotOf(x.selected));
      case 'stall':
        return x.selected === null ? null : this.give(who, x.selected as ItemId);
      case 'meal':
        return this.eat(who, x.meal!);
      default: {
        const never: never = x.kind;
        throw new Error(`画面 ${String(never)}`);
      }
    }
  }

  /** なおす（窓口 smith.fix と 同じ）。開いて いれば ふきだしを かえる */
  fix(who: Who, slot: SmithSlot): SmithFixResult {
    const short = this.d.smith.short(who, slot);
    const r = this.d.smith.fix(who, slot);
    const x = this.at(who);
    if (r === 'ok') {
      this.d.play?.({ k: 'buy' });
      this.d.fixed?.(who);
    } else this.d.play?.({ k: 'short' });
    if (x.kind === 'smith') {
      if (r === 'ok') {
        x.selected = null;
        x.bubble = SMITH_TEXT.fixed;
      } else if (r === 'short') x.bubble = VENDOR_TEXT.short(short);
      x.warn = r !== 'ok';
      this.touch(who);
    }
    return r;
  }

  /** わたす（窓口 stall.give と 同じ） */
  give(who: Who, item: ItemId): KaitoriGiveResult {
    const short = this.d.kaitori.short(who, item);
    const r = this.d.kaitori.give(who, item);
    this.d.play?.({ k: r === 'ok' ? 'buy' : 'short' });
    const x = this.at(who);
    if (x.kind === 'stall') {
      x.bubble = r === 'ok' ? STALL_TEXT.thanks : r === 'cap' ? STALL_TEXT.cap : STALL_TEXT.short(Math.max(1, short));
      x.warn = r !== 'ok';
      if (r === 'ok' && this.d.kaitori.state(who).rows.every((row) => row.item !== item)) x.selected = null;
      this.touch(who);
    }
    return r;
  }

  /** たべる（窓口 food.eat と 同じ）。ok なら 画面を とじて その 場で もぐもぐ */
  eat(who: Who, kind: FoodKind): FoodEatResult {
    const short = this.d.food.short(who, kind);
    const r = this.d.food.eat(who, kind);
    const x = this.at(who);
    if (r === 'ok') {
      if (x.kind === 'meal') this.close(who);
      return r;
    }
    this.d.play?.({ k: 'short' });
    if (x.kind === 'meal') {
      x.bubble = r === 'full' ? MEAL_TEXT.full : VENDOR_TEXT.short(short);
      x.warn = true;
      this.touch(who);
    }
    return r;
  }

  /** いまの 画面の カードの 文字（パッドの 順） */
  ids(who: Who): string[] {
    const x = this.at(who);
    if (x.kind === 'smith') return this.d.smith.items(who).map((i) => String(i.slot));
    if (x.kind === 'stall') return this.d.kaitori.state(who).rows.map((r) => r.item);
    return [];
  }

  /** パッド（十字・A・B）。cols ＝ いまの 画面の 1 行の カードの 数 */
  pad(who: Who, a: ShopPad, cols: number): void {
    const x = this.at(who);
    if (x.kind === null) return;
    if (a === 'confirm') {
      this.press(who);
      return;
    }
    if (a === 'back') {
      this.close(who);
      return;
    }
    const ids = this.ids(who);
    if (ids.length === 0) return;
    const i = x.selected === null ? -1 : ids.indexOf(x.selected);
    const c = Math.max(1, Math.floor(cols));
    const n = ids.length;
    const to = i < 0 ? 0 : a === 'left' ? i - 1 : a === 'right' ? i + 1 : a === 'up' ? (i - c >= 0 ? i - c : i) : i + c < n ? i + c : i;
    this.select(who, ids[Math.max(0, Math.min(n - 1, to))]!);
  }

  /** 固定ステップごと（開いて いなくても）: 画面の かわりの ふきだしの 時間 */
  tickSay(): void {
    for (const t of this.said) if (t.left > 0) t.left--;
  }

  /** 世界が 動いて いる 間の 1 ステップ（日が かわる・もぐもぐ） */
  stepWorld(): void {
    this.d.kaitori.step();
    this.d.food.step();
  }

  /** 毎ステップ: やられた・街の はんいの 中から 外へ 出た で とじる */
  step(who: Who, s: { alive: boolean; inTown: boolean }): void {
    const x = this.at(who);
    if (x.kind === null) return;
    if (!s.alive || (x.wasIn && !s.inTown)) {
      this.close(who);
      return;
    }
    if (s.inTown) x.wasIn = true;
  }
}
