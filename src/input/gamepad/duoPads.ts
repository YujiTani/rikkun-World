// DECLARATION ONLY（tester・COOP-1 作業 1）: 実装は developer が この ファイルを 書きかえて 入れる。テストは duoPads.test.ts。
import type { ActionState } from '../actions';

export interface DuoPadRouterOptions {
  /** 1P の ActionState（slot 0。キー・マウスと 同じ 物） */
  p1: ActionState;
  /** 2P の ActionState（slot 1） */
  p2: ActionState;
  look1: { push(dx: number, dy: number): void };
  look2: { push(dx: number, dy: number): void };
  storage: Storage | null;
}

export interface DuoPadPoll {
  /** 2 本目の パッドの ＋ が 押された（まだ 参加していないとき だけ true。参加するかは 呼んだ 側が 決める） */
  joinRequested: boolean;
}

/**
 * パッドを 1P・2P に 振り分ける（§2.1・AC1・AC5・AC16）。GamepadReader を 2 つ 内側に 持つ 作りを 想定（決めるのは developer）。
 * 1P = 最初に 使った 1 本。2P = 1P で ない もう 1 本（番号の 小さい 方）。3 本目以降は むし（文字も 出さない）。
 */
export declare class DuoPadRouter {
  constructor(opts: DuoPadRouterOptions);
  /** テストの 口で 差しかえる（GamepadReader.getPads と 同じ） */
  getPads: () => (Gamepad | null)[];
  /** 固定ステップごとに 呼ぶ */
  poll(nowMs: number): DuoPadPoll;
  /** 参加している あいだだけ 2P の パッドを 読む。false にすると 2P の 入力を ぜんぶ はなす */
  setJoined(on: boolean): void;
  p1PadIndex(): number | null;
  /** 参加している ときだけ 番号。2P の パッドが ぬけて いても 「つなぎ直し待ち」の あいだは null */
  p2PadIndex(): number | null;
  /** 3 本目以降の パッドの 番号（ボタン確認画面の「つかっていない」用。GAMEPAD-1 §4.1） */
  ignoredPadIndexes(): number[];
  /** 参加中で 2P の パッドが ない（つなぎ直して 何か 押すと false。AC5） */
  padLost(): boolean;
}
