import type { AchievementId, ItemId } from '../../contracts';
import type { CelebrateSettings } from './config';
import { TOP_BAND } from './config';
import { ModalModel } from './modalModel';

export type BandKind = 'achieve' | 'telop' | 'appear' | null;

export interface TopBandInfo {
  kind: BandKind;
  item: ItemId | null;
  age: number;
  leftSteps: number;
  /** 待っている もの（じゅんばん） */
  queue: string[];
}

export interface TelopLook {
  item: ItemId;
  age: number;
  leftSteps: number;
}

/** 上の 帯の 出入り（0〜1）。in ステップで 出て、out ステップで きえる */
export function bandEase(age: number, total: number, inSteps: number, outSteps: number): { opacity: number; slide: number } {
  const a = Math.max(0, age);
  const inP = Math.min(1, a / Math.max(1, inSteps));
  const outP = Math.min(1, Math.max(0, (total - a) / Math.max(1, outSteps)));
  const p = Math.min(inP, outP);
  const e = 1 - (1 - p) ** 3;
  return { opacity: e, slide: 1 - e };
}

/**
 * 画面の 上の 帯（WEAPON-7 §2.6）。1 つずつ（重ねない）。
 * じゅんばん: ヌシの「あらわれた」(appear) が 出ている 間は 何も 進めない／出さない。テロップは 待っている 実績より 先。
 * 実績の おしらせは ModalModel（240 ステップ）、テロップは ここ（300 ステップ）。DOM を知らない。
 */
export class TopBandModel {
  readonly toast: ModalModel;
  private telop: { item: ItemId; age: number } | null = null;
  private queue: ItemId[] = [];

  constructor(private readonly cfg: () => CelebrateSettings) {
    this.toast = new ModalModel(cfg);
  }

  enqueueTelop(item: ItemId): void {
    this.queue.push(item);
  }

  /** 実績の おしらせを 出して よいか（テロップが 出ている・待っている・あらわれたが 出ている 間は だめ） */
  canOpenToast(appearing: boolean): boolean {
    return !appearing && this.telop === null && this.queue.length === 0;
  }

  /** テストの 準備用: 出ている テロップと 待ちを すてる・出ている 実績の おしらせは 出しなおす（`achievements.flush()` が 今すぐ 出せるように） */
  preempt(): void {
    this.telop = null;
    this.queue = [];
    if (this.toast.isOpen()) this.toast.restart();
  }

  telopShowing(): boolean {
    return this.telop !== null;
  }

  telopTotal(): number {
    return this.cfg().legendTelopTicks;
  }

  /**
   * 1 ステップ（amount = 画面ステップ。案内画面は 0）。appearing の 間は 止まる。
   * 戻りは { telopStarted: 今 出し始めた テロップの 武器, toastEnded: きえた 実績の おしらせの id の列 }
   */
  step(amount: number, appearing: boolean): { telopStarted: ItemId | null; toastEnded: AchievementId[] | null } {
    let telopStarted: ItemId | null = null;
    let toastEnded: AchievementId[] | null = null;
    // あらわれた が 出ている 間・案内画面（amount 0）は 止まる
    if (appearing || amount <= 0) return { telopStarted, toastEnded };
    if (!this.telop && !this.toast.isOpen() && this.queue.length > 0) {
      this.telop = { item: this.queue.shift()!, age: 0 };
      telopStarted = this.telop.item;
    }
    if (this.telop) {
      this.telop.age += amount;
      if (this.telop.age >= this.telopTotal() - 1e-9) this.telop = null;
    } else if (this.toast.isOpen()) {
      toastEnded = this.toast.step(amount);
    }
    return { telopStarted, toastEnded };
  }

  telopLook(): TelopLook | null {
    if (!this.telop) return null;
    const age = Math.floor(this.telop.age + 1e-9);
    return { item: this.telop.item, age, leftSteps: Math.max(0, this.telopTotal() - age) };
  }

  info(appear: { ticksLeft: number } | null): TopBandInfo {
    const queue: string[] = this.queue.map(() => 'telop');
    if (appear) {
      if (this.telop) queue.unshift('telop');
      if (this.toast.isOpen()) queue.push('achieve');
      return { kind: 'appear', item: null, age: 0, leftSteps: Math.max(0, appear.ticksLeft), queue };
    }
    const t = this.telopLook();
    if (t) return { kind: 'telop', item: t.item, age: t.age, leftSteps: t.leftSteps, queue };
    if (this.toast.isOpen()) {
      const v = this.toast.view([]);
      return { kind: 'achieve', item: null, age: v.age, leftSteps: v.leftSteps, queue };
    }
    return { kind: null, item: null, age: 0, leftSteps: 0, queue };
  }

  /** 見た目: 出る・きえる */
  ease(): { kind: 'telop' | 'achieve'; opacity: number; slide: number; age: number } | null {
    if (this.telop) return { kind: 'telop', age: this.telop.age, ...bandEase(this.telop.age, this.telopTotal(), TOP_BAND.telopIn, TOP_BAND.telopOut) };
    if (this.toast.isOpen()) return { kind: 'achieve', age: this.toast.ageSteps(), ...bandEase(this.toast.ageSteps(), this.toast.total(), TOP_BAND.toastIn, TOP_BAND.toastOut) };
    return null;
  }
}
