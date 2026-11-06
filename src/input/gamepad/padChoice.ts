/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§9.6）: 「つかう コントローラー」の えらびを あつかう 部品。
 * これは 型だけの スタブ(tester が 先行テストの ために 置いた。中身は developer が 書く)。
 *
 * ---- developer への つなぎ目の 約束 ----
 *   PAD_CHOICE_KEY      localStorage の キー(この 機械に 1 つ。世界の セーブには 入れない)
 *   PadChoice           { p1, p2 } 番号は Gamepad.index(0〜3 の 整数)。null = パッドなし
 *   readPadChoice       保存を 読む。なし・JSON でない・形が ちがう・知らない 値(0〜3 の 整数 以外)・2 つが 同じ 番号・両方 null・
 *                       storage が 投げる・storage が null → null(はじめの 動き)。エラーは 投げない。何も 書かない
 *   writePadChoice      決めた ときだけ 呼ぶ。storage が 投げても 投げ返さない
 *   defaultPadChoice    はじめの 動き: 1P = 番号の いちばん 小さい つながっている 物、2P = その つぎ。足りない 方は null
 *   decidePadChoice     1P か 2P に index を 決める(AC49)。相手と 同じ なら 相手は「のこりの つながっている 物の いちばん 小さい 番号」(なければ null)
 *   listPads            つながっている コントローラーの 一覧。名前は 並び(index の 小さい 順)で「コントローラー 1」「コントローラー 2」…
 */

export const PAD_CHOICE_KEY = 'rikkun.duo.pads.v1';

export interface PadChoice {
  p1: number | null;
  p2: number | null;
}

export interface PadDecision {
  choice: PadChoice;
  /** もう 片方が 自動で かわった(ヘルプ帯は「1P と 2P を いれかえたよ」) */
  swapped: boolean;
}

export interface PadListItem {
  /** Gamepad.index */
  index: number;
  /** 「コントローラー 1」 */
  name: string;
}

const TODO = (): never => {
  throw new Error('COOP-1 作業 2.5 (#401): 未実装');
};

export function readPadChoice(_storage: Storage | null): PadChoice | null {
  return TODO();
}

export function writePadChoice(_storage: Storage | null, _choice: PadChoice): void {
  TODO();
}

export function defaultPadChoice(_connected: readonly number[]): PadChoice {
  return TODO();
}

export function decidePadChoice(_current: PadChoice, _who: 1 | 2, _index: number, _connected: readonly number[]): PadDecision {
  return TODO();
}

export function listPads(_pads: ReadonlyArray<Gamepad | null>): PadListItem[] {
  return TODO();
}
