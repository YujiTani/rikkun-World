/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§3.2・§9.6）: せっていの「つかう コントローラー」タブの 中身の 決まり(画面を 持たない)。
 * これは 型だけの スタブ(tester が 先行テストの ために 置いた。中身は developer が 書く)。
 *
 * ---- developer への つなぎ目の 約束 ----
 *   start(who, index)   えらぶ ボタンを おした(マウス・キー・1P の パッド)。その 行が「待ち」に なる。もう 決まっている 物 / つながっていない 物は 待ちに しない。
 *                       べつの ボタンで 待ちの 最中なら そちらに うつる。待ちの あいだ host.setPicking(index)、おわったら host.setPicking(null)。
 *   step()              固定ステップ 1 回ぶん(テストの __rikkun.step(n) では 1 回 = 1 回)。待ちの 数え・＋ の 確認・光る の 数えを する。
 *                       待ちの あいだ、えらんだ コントローラーの ＋ が 新しく おされたら 決める: host.commit(decidePadChoice(...).choice)。
 *                       1P の パッドの もどる(みぎの面 = standard の ボタン 1)・十字(12〜15)が 新しく おされたら 待ちを やめる。
 *                       えらんだ コントローラーが ぬけたら やめる。900 回で 時間切れ(お知らせ 'timeout')。
 *   advanceTime(sec)    世界が 止まっている あいだ(せってい画面)用: 1/60 秒 たつごとに step() を 1 回。やった 回数を 返す。
 *   cancel(reason)      待ちを やめる(何も かわらない)。'back' | 'esc' | 'mouse' | 'dpad'
 *   notice()            ヘルプ帯の お知らせ('decided' | 'swapped' | 'timeout')。出して 3 秒(固定ステップ 180 回)で null
 *   isLit(index)        ボタンを おしている あいだと はなして 30 ステップ(はなして 1 ステップ目 〜 30 ステップ目)は true、31 ステップ目に false。スティックの 傾きは 数えない
 *   litColor(index)     光っている 物の 色: host.padIndex(1) が その 番号 → 'p1'、host.padIndex(2) → 'p2'、どちらでも ない → 'white'。光っていない → null
 *   buttons(who)        その 行の えらぶ ボタン(つながっている 本数だけ。host.getPads() から 今 読む)
 *   isNone()            つながっている コントローラーが 0 本
 */
import type { PadChoice } from '../../input/gamepad/padChoice';

export type PickCancel = 'back' | 'esc' | 'mouse' | 'dpad';
export type PickNotice = 'decided' | 'swapped' | 'timeout';

export interface PadPickerHost {
  getPads(): ReadonlyArray<Gamepad | null>;
  /** 今 効いている えらび(はじめの 動きも ふくむ) */
  choice(): PadChoice;
  /** 保存して すぐ 効かせる */
  commit(choice: PadChoice): void;
  /** 1P・2P が 今 読んでいる パッドの 番号(1 本のときの かわりも ふくむ) */
  padIndex(who: 1 | 2): number | null;
  /** 待ちの あいだ、ルーターに「ほかの ＋ は 何も しない」を 頼む(null で もどす) */
  setPicking(index: number | null): void;
}

export interface PadButtonView {
  index: number;
  name: string;
  chosen: boolean;
  pending: boolean;
  lit: boolean;
}

const TODO = (): never => {
  throw new Error('COOP-1 作業 2.5 (#401): 未実装');
};

export class PadPicker {
  constructor(_host: PadPickerHost) {}
  pending(): { who: 1 | 2; index: number } | null {
    return TODO();
  }
  start(_who: 1 | 2, _index: number): void {
    TODO();
  }
  step(): void {
    TODO();
  }
  advanceTime(_sec: number): number {
    return TODO();
  }
  cancel(_reason: PickCancel): void {
    TODO();
  }
  notice(): PickNotice | null {
    return TODO();
  }
  isLit(_index: number): boolean {
    return TODO();
  }
  litColor(_index: number): 'p1' | 'p2' | 'white' | null {
    return TODO();
  }
  buttons(_who: 1 | 2): PadButtonView[] {
    return TODO();
  }
  isNone(): boolean {
    return TODO();
  }
}
