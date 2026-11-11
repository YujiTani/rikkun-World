import type { AchievementId, ItemId } from '../../contracts';
import type { Owner } from '../duoHalves';
import type { CelebrateSettings } from './config';
import { HOUSE_BAND_STEPS, TOP_BAND } from './config';
import { ModalModel } from './modalModel';
import type { TelopSource } from './telopText';

const WORLD: readonly Owner[] = ['world'];
const NO_OWNERS: readonly Owner[] = [];

export type BandKind = 'achieve' | 'telop' | 'appear' | 'house' | null;

export interface TopBandInfo {
  kind: BandKind;
  item: ItemId | null;
  /** テロップの 出どころ（kind が telop の とき。それ以外は null） */
  source: TelopSource | null;
  age: number;
  leftSteps: number;
  /** 待っている もの（じゅんばん） */
  queue: string[];
  /** 今 出ている 帯の 持ち主（COOP-1 5f-2。出す 半分 = halvesOfAll。出ていなければ []。null は 両方の 半分） */
  owners: readonly (Owner | null)[];
}

export interface TelopLook {
  item: ItemId;
  source: TelopSource;
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
 * 家の 名前の 帯（HOUSE-1 §3.3。180 ステップ）は いちばん あと: テロップ・実績が 出ている／待っている 間は ならんで 待つ。
 * 実績の おしらせは ModalModel（240 ステップ）、テロップは ここ（300 ステップ）。DOM を知らない。
 */
export class TopBandModel {
  readonly toast: ModalModel;
  private telop: { item: ItemId; source: TelopSource; age: number; owner: Owner } | null = null;
  private queue: { item: ItemId; source: TelopSource; owner: Owner }[] = [];
  /** 家の 帯（名前〔戸を 通った〕か、完成〔done。「<名前> が できた！」〕）。どちらも 同じ 列で 1 つずつ */
  private house: { text: string; age: number; done: boolean; owner: Owner; tag?: string } | null = null;
  private houseQueue: Array<{ text: string; done: boolean; owner: Owner; tag?: string }> = [];

  constructor(private readonly cfg: () => CelebrateSettings) {
    this.toast = new ModalModel(cfg);
  }

  /** source = 出どころ（省くと nushi = 今までの「ヌシ が 〜 を おとした！」）。owner = 出す 半分の 持ち主（省くと 世界 = 両方の 半分。宝箱は あけた 人） */
  enqueueTelop(item: ItemId, source: TelopSource = 'nushi', owner: Owner = 'world'): void {
    this.queue.push({ item, source, owner });
  }

  /** 家の 名前の 帯を 列に 入れる（戸を 外から 通った とき） */
  enqueueHouseName(text: string, owner: Owner = 'world'): void {
    this.houseQueue.push({ text, done: false, owner });
  }

  /**
   * 完成の 帯「<名前> が できた！」を 列に 入れる（HOUSE-1C PR-2。列が 空なら 次の ステップで すぐ 出る）。
   * owner = 出す 半分の 持ち主（省くと 世界）。tag ＝ 窓口の 目印を かえる（HOUSE-2A の 「レシピを おぼえた」の 帯は 'recipe-band'。省くと 'house-done-banner'）
   */
  enqueueHouseDone(text: string, owner: Owner = 'world', tag?: string): void {
    // 同じ 目印の 帯は 新しい 1 つだけ のこす（レシピを つづけて おぼえても 古い 帯が ならんで 待たない。窓口 recipeBand() も 新しい 方だけ）
    if (tag !== undefined) this.houseQueue = this.houseQueue.filter((q) => q.tag !== tag);
    this.houseQueue.push({ text, done: true, owner, tag });
  }

  /** 実績の おしらせを 出して よいか（テロップが 出ている・待っている・家の 名前が 出ている・あらわれたが 出ている 間は だめ） */
  canOpenToast(appearing: boolean): boolean {
    return !appearing && this.telop === null && this.queue.length === 0 && this.house === null;
  }

  /** テストの 準備用: 出ている テロップと 待ちを すてる・出ている 実績の おしらせは 出しなおす（`achievements.flush()` が 今すぐ 出せるように） */
  preempt(): void {
    this.telop = null;
    this.queue = [];
    this.house = null;
    this.houseQueue = [];
    if (this.toast.isOpen()) this.toast.restart();
  }

  telopShowing(): boolean {
    return this.telop !== null;
  }

  telopTotal(): number {
    return this.cfg().legendTelopTicks;
  }

  /** 家の 名前の 帯（窓口 `ui.houseNameBand()`）。出ている 間は のこり ステップ、列で 待っている 間は 出はじめの 数。なければ null */
  houseLook(): { text: string; ticksLeft: number } | null {
    if (this.house && !this.house.done) return { text: this.house.text, ticksLeft: Math.max(0, HOUSE_BAND_STEPS - Math.floor(this.house.age + 1e-9)) };
    const next = this.houseQueue.find((q) => !q.done);
    return next === undefined ? null : { text: next.text, ticksLeft: HOUSE_BAND_STEPS };
  }

  /**
   * 1 ステップ（amount = 画面ステップ。案内画面は 0）。appearing の 間は 止まる。
   * 戻りは { telopStarted: 今 出し始めた テロップの 武器, toastEnded: きえた 実績の おしらせの id の列 }
   */
  step(amount: number, appearing: boolean): { telopStarted: ItemId | null; telopSource: TelopSource | null; toastEnded: AchievementId[] | null; houseStarted: string | null; houseDone: boolean; houseTag: string | null } {
    let telopStarted: ItemId | null = null;
    let telopSource: TelopSource | null = null;
    let toastEnded: AchievementId[] | null = null;
    let houseStarted: string | null = null;
    let houseDone = false;
    let houseTag: string | null = null;
    // あらわれた が 出ている 間・案内画面（amount 0）は 止まる
    if (appearing || amount <= 0) return { telopStarted, telopSource, toastEnded, houseStarted, houseDone, houseTag };
    if (!this.telop && !this.house && !this.toast.isOpen() && this.queue.length > 0) {
      const q = this.queue.shift()!;
      this.telop = { item: q.item, source: q.source, age: 0, owner: q.owner };
      telopStarted = q.item;
      telopSource = q.source;
    }
    if (this.telop) {
      this.telop.age += amount;
      if (this.telop.age >= this.telopTotal() - 1e-9) this.telop = null;
    } else if (this.toast.isOpen()) {
      toastEnded = this.toast.step(amount);
    } else {
      // 家の 名前: テロップ・実績が 出ても 待ってもいない ときだけ（いちばん あと）
      if (!this.house && this.houseQueue.length > 0) {
        const q = this.houseQueue.shift()!;
        houseStarted = q.text;
        houseDone = q.done;
        houseTag = q.tag ?? null;
        this.house = { text: q.text, age: 0, done: q.done, owner: q.owner, tag: q.tag };
      }
      if (this.house) {
        this.house.age += amount;
        if (this.house.age >= HOUSE_BAND_STEPS - 1e-9) this.house = null;
      }
    }
    return { telopStarted, telopSource, toastEnded, houseStarted, houseDone, houseTag };
  }

  telopLook(): TelopLook | null {
    if (!this.telop) return null;
    const age = Math.floor(this.telop.age + 1e-9);
    return { item: this.telop.item, source: this.telop.source, age, leftSteps: Math.max(0, this.telopTotal() - age) };
  }

  info(appear: { ticksLeft: number } | null): TopBandInfo {
    const queue: string[] = this.queue.map(() => 'telop');
    if (appear) {
      if (this.telop) queue.unshift('telop');
      if (this.toast.isOpen()) queue.push('achieve');
      if (this.house) queue.push('house');
      queue.push(...this.houseQueue.map(() => 'house'));
      return { kind: 'appear', item: null, source: null, age: 0, leftSteps: Math.max(0, appear.ticksLeft), queue, owners: WORLD };
    }
    const t = this.telopLook();
    if (t) return { kind: 'telop', item: t.item, source: t.source, age: t.age, leftSteps: t.leftSteps, queue, owners: [this.telop!.owner] };
    if (this.toast.isOpen()) {
      const v = this.toast.view([]);
      return { kind: 'achieve', item: null, source: null, age: v.age, leftSteps: v.leftSteps, queue, owners: this.toast.owners() };
    }
    if (this.house) {
      const age = Math.floor(this.house.age + 1e-9);
      return { kind: 'house', item: null, source: null, age, leftSteps: Math.max(0, HOUSE_BAND_STEPS - age), queue: [...queue, ...this.houseQueue.map(() => 'house')], owners: [this.house.owner] };
    }
    return { kind: null, item: null, source: null, age: 0, leftSteps: 0, queue, owners: NO_OWNERS };
  }

  /** 見た目: 出る・きえる */
  ease(): { kind: 'telop' | 'achieve' | 'house'; opacity: number; slide: number; age: number } | null {
    if (this.telop) return { kind: 'telop', age: this.telop.age, ...bandEase(this.telop.age, this.telopTotal(), TOP_BAND.telopIn, TOP_BAND.telopOut) };
    if (this.toast.isOpen()) return { kind: 'achieve', age: this.toast.ageSteps(), ...bandEase(this.toast.ageSteps(), this.toast.total(), TOP_BAND.toastIn, TOP_BAND.toastOut) };
    if (this.house) return { kind: 'house', age: this.house.age, ...bandEase(this.house.age, HOUSE_BAND_STEPS, TOP_BAND.houseIn, TOP_BAND.houseOut) };
    return null;
  }
}
