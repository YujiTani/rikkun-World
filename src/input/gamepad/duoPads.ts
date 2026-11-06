/**
 * COOP-1（§2.1・AC1・AC5・AC16）: パッドを 1P・2P に 振り分ける。
 * GamepadReader を 2 つ 内側に 持つ。それぞれに「見せる パッド」だけを 通す 窓（getPads）を かぶせて、
 * 1P の 読みは 今までと 同じ、2P は 別の ActionState・look に 入れる。
 * 1P = 最初に 使った 1 本。2P = 1P で ない 番号の 小さい 方。3 本目以降は むし（文字も 出さない）。
 */
import type { ActionState } from '../actions';
import { GamepadReader } from './reader';
import { detectMappingKind, faceTable } from './mapping';
import type { PadChoice } from './padChoice';

export interface DuoPadRouterOptions {
  /** 1P の ActionState（slot 0。キー・マウスと 同じ 物） */
  p1: ActionState;
  /** 2P の ActionState（slot 1） */
  p2: ActionState;
  look1: { push(dx: number, dy: number): void };
  look2: { push(dx: number, dy: number): void };
  storage: Storage | null;
  /** 開発用（`?duo=dev&pad=2p`）: 1 本目の パッドを 2P に する。1P は パッドを 持たず キーボード・マウスだけ */
  firstPadIs2P?: boolean;
  /** COOP-1 作業 2.5（#401）: 「つかう コントローラー」の えらびを 保存する 所(`rikkun.duo.pads.v1`。この 機械に 1 つ) */
  choiceStorage?: Storage | null;
  /** 「つかう コントローラー」が つかえる(作業 3 までは `?duo=dev` の ときだけ)。false なら 保存を 読まず、setChoice は false */
  choiceEnabled?: boolean;
}

export interface DuoPadPoll {
  /** 2 本目の パッドの ＋ が 押された（まだ 参加していないとき だけ true。参加するかは 呼んだ 側が 決める） */
  joinRequested: boolean;
}

type Pads = (Gamepad | null)[];

const connected = (p: Gamepad | null | undefined): p is Gamepad => !!p && p.connected;

export class DuoPadRouter {
  /** 1P の 読み（GAMEPAD-1 の 今の GamepadReader と 同じ） */
  readonly reader1: GamepadReader;
  /** 2P の 読み（参加している あいだだけ 動かす） */
  readonly reader2: GamepadReader;
  /** テストの 口で 差しかえる（GamepadReader.getPads と 同じ） */
  getPads: () => Pads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []);

  private readonly firstPadIs2P: boolean;
  private p1 = -1;
  private p2 = -1;
  private joined = false;
  private lost = false;
  private startWas = false;
  /** 参加の ＋ を 押したままの あいだは 2P を 読まない（参加した とたんに もちもの画面が 開かない ように） */
  private waitRelease = false;
  private readonly out: DuoPadPoll = { joinRequested: false };
  private readonly view1: Pads = [];
  private readonly view2: Pads = [];
  /** poll の あいだだけ、そのステップで 取った パッドの 一覧を 使いまわす */
  private cache: Pads | null = null;

  constructor(opts: DuoPadRouterOptions) {
    this.firstPadIs2P = opts.firstPadIs2P ?? false;
    this.reader1 = new GamepadReader(opts.p1, opts.look1, opts.storage);
    this.reader2 = new GamepadReader(opts.p2, opts.look2, opts.storage);
    this.reader1.getPads = () => this.windowOf(this.view1, this.p1, true);
    this.reader2.getPads = () => this.windowOf(this.view2, this.p2, false);
  }

  /** index の 場所だけ 本物、あとは null の 配列（作りなおさず 使いまわす） */
  private windowOf(view: Pads, index: number, isP1: boolean): Pads {
    const pads = this.cache ?? this.getPads();
    if (isP1) this.assign(pads);
    view.length = 0;
    if (index >= 0) {
      for (let i = 0; i < index; i++) view.push(null);
      view.push(pads[index] ?? null);
    }
    return view;
  }

  /** 1P の パッドを 決める（最初に 使った 1 本。参加前に ぬけたら 次の 1 本） */
  private assign(pads: Pads): void {
    if (this.firstPadIs2P) return; // 1P は パッドなし（p1 は -1 のまま。候補は 1 本目の パッド）
    if (this.p1 >= 0 && connected(pads[this.p1])) return;
    if (this.p1 >= 0 && this.joined) return; // 参加中は 2P を 1P に しない（段階 1）。つなぎ直しを まつ
    this.p1 = -1;
    for (let i = 0; i < pads.length; i++) {
      if (connected(pads[i]) && i !== this.p2Held()) {
        this.p1 = i;
        break;
      }
    }
  }

  private p2Held(): number {
    return this.joined ? this.p2 : -1;
  }

  /** 1P で ない 番号の 小さい 方（2P の 候補）。なければ -1 */
  private candidate(pads: Pads): number {
    for (let i = 0; i < pads.length; i++) if (i !== this.p1 && connected(pads[i])) return i;
    return -1;
  }

  /** 固定ステップごとに 呼ぶ */
  poll(nowMs: number, active = true): DuoPadPoll {
    const pads = this.getPads();
    this.cache = pads;
    try {
      return this.pollWith(pads, nowMs, active);
    } finally {
      this.cache = null;
    }
  }

  /** active = false は 世界が 止まっている あいだ（1P の パッドだけ 読む。2P の 押した 物を ためない・参加も 受けない） */
  private pollWith(pads: Pads, nowMs: number, active: boolean): DuoPadPoll {
    this.assign(pads);
    this.reader1.poll(nowMs);
    this.out.joinRequested = false;
    if (!active) return this.out;
    if (!this.joined) {
      const c = this.candidate(pads);
      const start = c >= 0 && this.startPressed(pads[c]!);
      this.out.joinRequested = start && !this.startWas;
      this.startWas = start;
      return this.out;
    }
    if (this.lost) {
      const c = this.candidate(pads);
      if (c >= 0 && this.anyButton(pads[c]!)) {
        this.lost = false;
        this.p2 = c;
        this.waitRelease = true; // つなぎ直しに 押した ボタンは 2P の 操作に しない
      }
    } else if (this.p2 >= 0 && !connected(pads[this.p2])) {
      this.loseP2();
    } else if (this.p2 < 0) {
      // パッドなしで 参加した（テストの 口）あと、2 本目が つながったら それを 2P の パッドに する
      const c = this.candidate(pads);
      if (c >= 0) this.p2 = c;
    }
    if (this.waitRelease && (this.p2 < 0 || !this.anyButton(pads[this.p2] ?? ({ buttons: [] } as unknown as Gamepad)))) this.waitRelease = false;
    if (!this.lost && this.p2 >= 0 && !this.waitRelease) this.reader2.poll(nowMs);
    return this.out;
  }

  private loseP2(): void {
    this.reader2.releaseAllPadActions();
    if (this.reader2.assignedPadIndex() !== null) this.reader2.onDisconnected(this.reader2.assignedPadIndex()!);
    this.lost = true;
  }

  private startPressed(pad: Gamepad): boolean {
    const table = faceTable(detectMappingKind(pad));
    for (let i = 0; i < pad.buttons.length; i++) if (table[i] === 'start' && pad.buttons[i]?.pressed) return true;
    return false;
  }

  private anyButton(pad: Gamepad): boolean {
    for (let i = 0; i < pad.buttons.length; i++) if (pad.buttons[i]?.pressed) return true;
    return false;
  }

  /**
   * COOP-1 作業 2.5（#401。§2.7・§12.0）。型だけの スタブ(developer が 実装する)。
   *  setChoice        タブで 決めたのと 同じ(＋ の 確認は とばす)。保存して すぐ 効く。決めた ＋ は だれの 操作にも ならない(離すまで)。変な 値・使えない ときは false
   *  choice           保存してある えらび。なし・こわれた・使えない ときは null
   *  effectiveChoice  今 効いている えらび(保存が なければ はじめの 動き)
   *  padIndex         1P・2P が 今 読んでいる パッドの 番号(1 本のときの かわりも 出る。パッドなし・2P が いない・ぬけている → null)
   *  setPicking       えらんで ＋ を 待っている あいだ、どの コントローラーの ＋ も 何も しない(null で もどす)
   */
  setChoice(_c: PadChoice): boolean {
    throw new Error('COOP-1 作業 2.5 (#401): 未実装');
  }
  choice(): PadChoice | null {
    throw new Error('COOP-1 作業 2.5 (#401): 未実装');
  }
  effectiveChoice(): PadChoice {
    throw new Error('COOP-1 作業 2.5 (#401): 未実装');
  }
  padIndex(_who: 1 | 2): number | null {
    throw new Error('COOP-1 作業 2.5 (#401): 未実装');
  }
  setPicking(_index: number | null): void {
    throw new Error('COOP-1 作業 2.5 (#401): 未実装');
  }

  /** 参加している あいだだけ 2P の パッドを 読む。false にすると 2P の 入力を ぜんぶ はなす */
  setJoined(on: boolean): void {
    if (on === this.joined) return;
    this.joined = on;
    this.lost = false;
    this.startWas = true; // 参加の ＋ を 押しっぱなしでも すぐ 次の 参加の 求めに ならない
    if (on) {
      const pads = this.getPads();
      this.assign(pads);
      this.p2 = this.candidate(pads);
      this.waitRelease = this.p2 >= 0 && this.anyButton(pads[this.p2]!);
    } else {
      this.reader2.releaseAllPadActions();
      this.p2 = -1;
      this.waitRelease = false;
    }
  }

  /** 2P の もちもの画面が 開いている（A = きめる、B = とじる に なる） */
  setMenuOpen2(on: boolean): void {
    this.reader2.setMenuOpen(on);
  }

  /** 1P の 接続 / ぬけ（window の gamepadconnected / gamepaddisconnected から） */
  onConnected(_index: number): void {
    this.assign(this.getPads());
  }
  onDisconnected(index: number): void {
    if (index === this.p1) this.reader1.onDisconnected(index);
  }

  /** 起動時に すでに 刺さっている パッドを 拾う */
  bootstrap(): void {
    this.assign(this.getPads());
    this.reader1.bootstrap();
  }

  p1PadIndex(): number | null {
    return this.p1 >= 0 && connected(this.getPads()[this.p1]) ? this.p1 : null;
  }

  /** 参加している ときだけ 番号。2P の パッドが ぬけて いても「つなぎ直し待ち」の あいだは null */
  p2PadIndex(): number | null {
    return this.joined && !this.lost && this.p2 >= 0 && connected(this.getPads()[this.p2]) ? this.p2 : null;
  }

  /** 3 本目以降の パッドの 番号（ボタン確認画面の「つかっていない」用。GAMEPAD-1 §4.1） */
  ignoredPadIndexes(): number[] {
    const pads = this.getPads();
    const second = this.joined ? this.p2 : this.candidate(pads);
    const out: number[] = [];
    for (let i = 0; i < pads.length; i++) if (connected(pads[i]) && i !== this.p1 && i !== second) out.push(i);
    return out;
  }

  /** 参加中で 2P の パッドが ない（つなぎ直して 何か 押すと false。AC5） */
  padLost(): boolean {
    return this.joined && this.lost;
  }
}
