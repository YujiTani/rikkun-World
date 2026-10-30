import type { ItemId } from '../contracts';
import { KURA_MAX } from './kura';
import { KuraPicker, type KuraSide } from './kuraPicker';

/**
 * くらの 画面の 中身（HOUSE-1A。docs/design/HOUSE-1.md §2.4 の 4・5）。DOM なし。
 * 左 = 持ち物の マス（1 マス 1 つ。空きも 出す）、右 = くらの マス（1 こ以上 ある 種類だけ）。
 * マスを えらぶ → 数を かえる（−10 −1 ＋1 ＋10 ぜんぶ）→「あずける」か「とりだす」。画面（HouseUi）は `view()` を 描き、押された ものを ここへ 渡す。
 */

export interface KuraScreenDeps {
  /** 持ち物の マス（空きは null） */
  slots(): ReadonlyArray<{ item: ItemId; count: number } | null>;
  /** 持ち物 ぜんぶの 中の その 物の 数 */
  bagCount(item: ItemId): number;
  /** くらの 中身（1 こ以上 ある 種類だけ。登録表の 並び） */
  entries(): ReadonlyArray<{ item: ItemId; count: number }>;
  kuraCount(item: ItemId): number;
  /** あずけられる 物か（1 マスに 2 こ以上 重なる） */
  canStack(item: ItemId): boolean;
  /** 動いた 数を 返す */
  deposit(item: ItemId, n: number): number;
  withdraw(item: ItemId, n: number): number;
}

export interface KuraCellView {
  /** 空きマスは null */
  item: ItemId | null;
  count: number;
  selected: boolean;
  /** あずけられない（重ならない 物。うすく 出す。えらべない） */
  locked: boolean;
}

export interface KuraScreenView {
  bag: KuraCellView[];
  store: KuraCellView[];
  selected: { side: KuraSide; item: ItemId } | null;
  /** 数の えらびに 出す 数 */
  amount: number;
  /** 動かせる 数の 上 */
  max: number;
  /** 押せる ボタン（えらんで いなければ null） */
  action: 'deposit' | 'withdraw' | null;
}

export class KuraScreen {
  private readonly picker = new KuraPicker();

  constructor(private readonly d: KuraScreenDeps) {}

  /** 開く・とじる とき えらびを けす */
  reset(): void {
    this.picker.clear();
  }

  /** 持ち物の i 番目の マスを えらぶ。空き・あずけられない 物は 何も おきない */
  selectBag(i: number): boolean {
    const s = this.d.slots()[i];
    if (!s || !this.d.canStack(s.item)) return false;
    this.choose('bag', s.item);
    return true;
  }

  /** くらの マスを えらぶ。くらに ない 物は 何も おきない */
  selectStore(item: ItemId): boolean {
    if (this.d.kuraCount(item) <= 0) return false;
    this.choose('store', item);
    return true;
  }

  /** 数を delta だけ かえる（−10 −1 ＋1 ＋10） */
  plus(delta: number): void {
    this.fit();
    if (this.picker.sel) this.picker.plus(delta, this.max());
  }

  /** ぜんぶ */
  all(): void {
    this.fit();
    if (this.picker.sel) this.picker.all(this.max());
  }

  /** 「あずける」「とりだす」。動いた 数（えらんで いなければ 0） */
  act(): number {
    this.fit();
    const sel = this.picker.sel;
    const how = this.picker.action();
    if (!sel || !how) return 0;
    const moved = how === 'deposit' ? this.d.deposit(sel.item, this.picker.amount) : this.d.withdraw(sel.item, this.picker.amount);
    this.fit();
    return moved;
  }

  /** 今の 見た目（えらびは 今の 数に あわせて から 返す） */
  view(): KuraScreenView {
    this.fit();
    const sel = this.picker.sel;
    const on = (side: KuraSide, item: ItemId | null): boolean => sel !== null && item !== null && sel.side === side && sel.item === item;
    return {
      bag: this.d.slots().map((s) => ({
        item: s ? s.item : null,
        count: s ? s.count : 0,
        selected: on('bag', s ? s.item : null),
        locked: s !== null && !this.d.canStack(s.item),
      })),
      store: this.d.entries().map((e) => ({ item: e.item, count: e.count, selected: on('store', e.item), locked: false })),
      selected: sel ? { ...sel } : null,
      amount: this.picker.amount,
      max: this.max(),
      action: this.picker.action(),
    };
  }

  // ------------------------------------------------------------ 中の 動き

  private choose(side: KuraSide, item: ItemId): void {
    const sel = this.picker.sel;
    if (sel && sel.side === side && sel.item === item) return; // 同じ マスを もう いちど: 数は そのまま
    this.picker.select(side, item);
  }

  /** 動かせる 数の 上。持ち物 → くら は 持ち物の 数 と くらの あき（999 まで）の 小さい 方。くらが いっぱいでも 持ち物に あれば 1（おして みると ふきだしで 知らせる） */
  private max(): number {
    const sel = this.picker.sel;
    if (!sel) return 0;
    if (sel.side === 'store') return this.d.kuraCount(sel.item);
    const have = this.d.bagCount(sel.item);
    return have <= 0 ? 0 : Math.max(1, Math.min(have, KURA_MAX - this.d.kuraCount(sel.item)));
  }

  /** えらびを 今の 数に あわせる（動かす 物が なくなれば えらびを けす） */
  private fit(): void {
    if (this.picker.sel) this.picker.fit(this.max());
  }
}
