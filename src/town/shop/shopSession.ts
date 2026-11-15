import type { ShopBoxResult, ShopBuyResult, ShopService } from './shop';
import { SHOP_ORDER, SHOP_TUNING, type ShopBoxId, type ShopItemId } from './shopTable';
import { SHOP_TEXT } from './shopText';

/**
 * よろずやの 画面の 状態（人ごと。TOWN-1-shop §2.6・§2.7・§3.2、TOWN-1 §2.9・§5）。DOM なし。
 * 1P と 2P は 別々に 開ける（別々の 半分）。開く・えらぶ・こうかん・とじる・パッドの 十字・やられた／街を 出た で とじる。
 */

type Who = 1 | 2;

/** 音の 合図（音の 係が 鳴らす。select ＝ カードを えらんだ・buy ＝ こうかん・short ＝ たりない／売り切れ・box ＝ 箱が あいた〔top ＝ いちばん 大きい ★〕） */
export type ShopSfx = { k: 'select' } | { k: 'buy' } | { k: 'short' } | { k: 'box'; box: ShopBoxId; top: number };

export type ShopPad = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

export interface ShopView {
  open: boolean;
  selected: ShopItemId | null;
  result: ShopBoxResult | null;
  /** よろずやさんの ふきだしの 文 */
  bubble: string | null;
}

interface Session extends ShopView {
  /** 画面を 作りなおす 目印（かわる たびに ふえる） */
  version: number;
  /** 開いて から 街の はんいの 中に いた（中から 外へ 出た ときに とじる。テストの 窓口で 街の 外で 開いた ときは とじない） */
  wasIn: boolean;
}

export interface ShopSessionDeps {
  shop: Pick<ShopService, 'buy' | 'short'>;
  play?(e: ShopSfx): void;
  /** 開いた（マウスを 出す・世界を 止める 合図） */
  onOpen?(who: Who): void;
  /** とじた */
  onClose?(who: Who): void;
  /** たからばこの 中身の 表示を とじた（よろずやの 画面は 開いた まま） */
  onResultClose?(who: Who): void;
}

const closed = (): Session => ({ open: false, selected: null, result: null, bubble: null, version: 0, wasIn: false });

/** 世界を 止めるか: 1 人の ときに 1P が 開いて いる 間 だけ（2 人の ときは 1P でも 2P でも 止めない。§2.6 の 7） */
export function shopFreezesWorld(s: { open1: boolean; joined: boolean }): boolean {
  return s.open1 && !s.joined;
}

export class ShopSessions {
  private readonly s: [Session, Session] = [closed(), closed()];

  constructor(private readonly d: ShopSessionDeps) {}

  private at(who: Who): Session {
    return this.s[who - 1]!;
  }

  private touch(who: Who): void {
    this.at(who).version++;
  }

  isOpen(who: Who): boolean {
    return this.at(who).open;
  }

  version(who: Who): number {
    return this.at(who).version;
  }

  view(who: Who): ShopView {
    const x = this.at(who);
    return { open: x.open, selected: x.selected, result: x.result, bubble: x.bubble };
  }

  /** 開く（よろずやさんに 話した）。inTown ＝ いま 街の はんいの 中か。もう 開いて いれば そのまま true */
  open(who: Who, inTown = true): boolean {
    const x = this.at(who);
    if (x.open) return true;
    x.open = true;
    x.wasIn = inTown;
    x.selected = null;
    x.result = null;
    x.bubble = SHOP_TEXT.greet;
    this.touch(who);
    this.d.onOpen?.(who);
    return true;
  }

  close(who: Who): void {
    const x = this.at(who);
    if (!x.open) return;
    const v = x.version;
    this.s[who - 1] = { ...closed(), version: v + 1 };
    this.d.onClose?.(who);
  }

  select(who: Who, id: ShopItemId | null): void {
    const x = this.at(who);
    if (!x.open || x.selected === id) return;
    x.selected = id;
    x.bubble = SHOP_TEXT.greet;
    this.touch(who);
    if (id !== null) this.d.play?.({ k: 'select' });
  }

  /** 「こうかん」ボタン（えらんで いなければ null） */
  press(who: Who): ShopBuyResult | null {
    const x = this.at(who);
    if (!x.open || x.selected === null) return null;
    return this.buy(who, x.selected);
  }

  /** その 品を えらんで こうかん（窓口 shop.buy と 同じ） */
  buy(who: Who, id: ShopItemId): ShopBuyResult {
    const x = this.at(who);
    if (x.open) x.selected = id;
    const r = this.d.shop.buy(who, id);
    switch (r.status) {
      case 'ok':
        x.bubble = SHOP_TEXT.greet;
        if (r.result) {
          if (x.open) x.result = r.result;
          let top = 0;
          for (const it of r.result.items) top = Math.max(top, it.rarity);
          this.d.play?.({ k: 'box', box: r.result.box, top });
        } else this.d.play?.({ k: 'buy' });
        break;
      case 'short':
        x.bubble = SHOP_TEXT.short(this.d.shop.short(who, id));
        this.d.play?.({ k: 'short' });
        break;
      case 'soldOut':
        x.bubble = SHOP_TEXT.soldOut;
        this.d.play?.({ k: 'short' });
        break;
      default: {
        const never: never = r.status;
        throw new Error(`こうかんの 答え ${String(never)}`);
      }
    }
    if (!x.open) x.bubble = null;
    this.touch(who);
    return r.status;
  }

  /** たからばこの 中身の 表示を とじる（よろずやの 画面は 開いた まま） */
  closeResult(who: Who): void {
    const x = this.at(who);
    if (x.result === null) return;
    x.result = null;
    this.touch(who);
    this.d.onResultClose?.(who);
  }

  /** パッド（十字・A・B）。cols ＝ いまの 画面の 1 行の カードの 数 */
  pad(who: Who, a: ShopPad, cols: number): void {
    const x = this.at(who);
    if (!x.open) return;
    if (x.result !== null) {
      if (a === 'confirm' || a === 'back') this.closeResult(who);
      return;
    }
    const n = SHOP_ORDER.length;
    const i = x.selected === null ? -1 : SHOP_ORDER.indexOf(x.selected);
    const c = Math.max(1, Math.floor(cols));
    const move = (to: number): void => this.select(who, SHOP_ORDER[Math.max(0, Math.min(n - 1, to))]!);
    switch (a) {
      case 'left':
        move(i < 0 ? 0 : i - 1);
        break;
      case 'right':
        move(i < 0 ? 0 : i + 1);
        break;
      case 'up':
        move(i < 0 ? 0 : i - c >= 0 ? i - c : i);
        break;
      case 'down':
        move(i < 0 ? 0 : i + c < n ? i + c : i);
        break;
      case 'confirm':
        this.press(who);
        break;
      case 'back':
        this.close(who);
        break;
      default: {
        const never: never = a;
        throw new Error(`パッド ${String(never)}`);
      }
    }
  }

  /** 毎ステップ: やられた・街の はんいの 中から 外へ 出た で とじる（2 人で 開いて いる 人に 当たっても とじない） */
  step(who: Who, s: { alive: boolean; inTown: boolean }): void {
    const x = this.at(who);
    if (!x.open) return;
    if (!s.alive || (x.wasIn && !s.inTown)) {
      this.close(who);
      return;
    }
    if (s.inTown) x.wasIn = true;
  }
}

/** いちばん 大きい ★が キラキラの 音に なるか */
export const sparkles = (top: number): boolean => top >= SHOP_TUNING.sparkleStars;
