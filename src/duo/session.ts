// DECLARATION ONLY（tester・COOP-1 作業 1）: 実装は developer が この ファイルを 書きかえて 入れる。テストは session.test.ts。
import type { P2State } from './p2State';
import type { DuoLeaveReason, P2Save } from './types';

export interface DuoSessionDeps {
  p2: P2State;
  /** やめる前に 呼ぶ（2P の 持ち物を セーブへ。AC7・AC17）。joined が まだ true の あいだに 呼ぶ */
  saveP2(p2: P2Save): void;
  /** 参加の とき 呼ぶ。前に 参加した ことが あれば その セーブ、なければ null（からっぽで 始める。AC7） */
  loadP2(): P2Save | null;
  /** 2P が いなく なった あと（joined が false に なってから）呼ぶ */
  onLeft?(reason: DuoLeaveReason): void;
}

/** 毎ステップ 渡す 入力（固定ステップ 1/60 秒） */
export interface DuoStepInput {
  /** 2P の パッドが つながって いる */
  padPresent: boolean;
  /** 2P の もちもの画面の「やめる」を 押している */
  quitHeld: boolean;
}

/** 参加・やめる・パッドぬけ・カメラの 引きを まとめる 小さな 状態機械（DOM・Three.js なし） */
export declare class DuoSession {
  constructor(deps: DuoSessionDeps);
  readonly joined: boolean;
  /** すぐ 参加させる。参加できたら true（もう 参加して いたら false） */
  join(): boolean;
  /** 毎ステップ。長押し 120 ステップで 'quit'、パッドなし 3600 ステップで 'padLost' で やめる */
  step(input: DuoStepInput): void;
  /** 「やめる」の ゲージ 0〜1（120 ステップで 1。はなすと 0） */
  quitGauge(): number;
  padLost(): boolean;
  /** いなくなる: saveP2 → joined = false → onLeft の 順。いなければ 何もしない */
  leave(reason: DuoLeaveReason): void;
  /** なめらかに 変わる カメラの 距離（1 人 4.0・2 人 6.0。§9.1。0.5 秒 = 30 ステップで とどく） */
  cameraDistance(): number;
  cameraDistanceTarget(): number;
}
