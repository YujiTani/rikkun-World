/**
 * COOP-1（§2.1・§2.7・AC1・AC5・AC16）: パッドを 1P・2P に 振り分ける。
 * GamepadReader を 2 つ 内側に 持つ。それぞれに「見せる パッド」だけを 通す 窓（getPads）を かぶせて、
 * 1P の 読みは 今までと 同じ、2P は 別の ActionState・look に 入れる。
 * どの パッドが 1P・2P かは 「つかう コントローラー」の えらび（保存）で 決まる。決めていないときは
 * 1P = 番号の いちばん 小さい つながっている 物、2P = その つぎ。3 本目以降は むし（文字も 出さない）。
 */
import type { ActionState } from '../actions';
import { GamepadReader } from './reader';
import { detectMappingKind, faceTable } from './mapping';
import { readPadChoice, writePadChoice, type PadChoice } from './padChoice';

export interface DuoPadRouterOptions {
  /** 1P の ActionState（slot 0。キー・マウスと 同じ 物） */
  p1: ActionState;
  /** 2P の ActionState（slot 1） */
  p2: ActionState;
  look1: { push(dx: number, dy: number): void };
  look2: { push(dx: number, dy: number): void };
  storage: Storage | null;
  /** COOP-1 作業 2.5（#401）: 「つかう コントローラー」の えらびを 保存する 所(`rikkun.duo.pads.v1`。この 機械に 1 つ) */
  choiceStorage?: Storage | null;
  /** 「つかう コントローラー」が つかえる(作業 3 までは `?duo=dev` の ときだけ)。false なら 保存を 読まず、setChoice は false */
  choiceEnabled?: boolean;
}

export interface DuoPadPoll {
  /** 2P の パッドの ＋ が 押された（まだ 参加していないとき だけ true。参加するかは 呼んだ 側が 決める） */
  joinRequested: boolean;
}

type Pads = (Gamepad | null)[];

const connected = (p: Gamepad | null | undefined): p is Gamepad => !!p && p.connected;
const NONE = -1;
const toIdx = (v: number | null): number => (v === null ? NONE : v);
const fromIdx = (i: number): number | null => (i < 0 ? null : i);
const validSlot = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3);

export class DuoPadRouter {
  /** 1P の 読み（GAMEPAD-1 の 今の GamepadReader と 同じ） */
  readonly reader1: GamepadReader;
  /** 2P の 読み（参加している あいだだけ 動かす） */
  readonly reader2: GamepadReader;
  /** テストの 口で 差しかえる（GamepadReader.getPads と 同じ） */
  getPads: () => Pads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []);

  private readonly choiceStorage: Storage | null;
  private readonly choiceEnabled: boolean;
  /** 決めて 保存してある えらび（なし・こわれた・つかえない → null = はじめの 動き） */
  private saved: PadChoice | null = null;
  /** 参加した 時点の はじめの 動き（参加中に 1P の パッドが ぬけても 2P の パッドを 1P に しない） */
  private joinedBase1 = NONE;
  private joinedBase2 = NONE;
  /** 今 効いている えらび（番号。NONE = パッドなし）。assign が 毎回 書きかえる */
  private base1 = NONE;
  private base2 = NONE;
  private p1 = NONE;
  private p2 = NONE;
  private joined = false;
  private lost = false;
  private startWas = false;
  /** 「つかう コントローラー」で ＋ を 待っている あいだの えらんだ 番号（NONE = 待っていない） */
  private picking = NONE;
  private readonly out: DuoPadPoll = { joinRequested: false };
  private readonly eff: PadChoice = { p1: null, p2: null };
  private readonly view1: Pads = [];
  private readonly view2: Pads = [];
  /** poll の あいだだけ、そのステップで 取った パッドの 一覧を 使いまわす */
  private cache: Pads | null = null;

  constructor(opts: DuoPadRouterOptions) {
    this.choiceEnabled = opts.choiceEnabled ?? false;
    this.choiceStorage = opts.choiceStorage ?? null;
    if (this.choiceEnabled) this.saved = readPadChoice(this.choiceStorage);
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

  /** 今 効いている えらび（保存 → 参加した ときの はじめの 動き → はじめの 動き）を base1・base2 に 入れる */
  private resolveBase(pads: Pads): void {
    if (this.saved) {
      this.base1 = toIdx(this.saved.p1);
      this.base2 = toIdx(this.saved.p2);
      if (this.joined && this.base2 === NONE) {
        // 2P が パッドなしで 参加中: 2P の パッドが きまる まで 候補を さがし、きまったら そこから 動かさない
        if (this.joinedBase2 === NONE) this.joinedBase2 = this.firstOther(pads, this.base1);
        this.base2 = this.joinedBase2;
      }
      return;
    }
    if (this.joined) {
      // 2P の パッドが まだ きまっていない（パッドなしで 参加した）あいだは 2P の 候補だけ さがす。1P は 一度 きまったら 動かさない（AC73）
      if (this.joinedBase2 === NONE) {
        if (this.joinedBase1 === NONE) this.firstTwo(pads);
        else this.joinedBase2 = this.firstOther(pads, this.joinedBase1);
      }
      this.base1 = this.joinedBase1;
      this.base2 = this.joinedBase2;
      return;
    }
    this.firstTwo(pads);
    this.base1 = this.joinedBase1;
    this.base2 = this.joinedBase2;
  }

  /** exclude 以外の つながっている 物の いちばん 小さい 番号。なければ NONE */
  private firstOther(pads: Pads, exclude: number): number {
    for (let i = 0; i < pads.length; i++) if (i !== exclude && connected(pads[i])) return i;
    return NONE;
  }

  /**
   * はじめの 動き（joinedBase1・2 に 入れる。参加中は 呼ばない）: 1P = 番号の いちばん 小さい つながっている 物、2P = その つぎ。
   * 1P に 使っている 物が つながっている あいだは そのまま（あとから 小さい 番号が 来ても 遊んでいる 途中で 1P を 変えない）。
   */
  private firstTwo(pads: Pads): void {
    this.joinedBase1 = this.p1 >= 0 && connected(pads[this.p1]) ? this.p1 : NONE;
    this.joinedBase2 = NONE;
    for (let i = 0; i < pads.length; i++) {
      if (!connected(pads[i]) || i === this.joinedBase1) continue;
      if (this.joinedBase1 === NONE) this.joinedBase1 = i;
      else {
        this.joinedBase2 = i;
        break;
      }
    }
  }

  /** 1P の パッドを 決める。かわったら 読みを やりなおす（入力は 全部 はなす）。かわった なら true */
  private assign(pads: Pads): boolean {
    this.resolveBase(pads);
    let t = this.base1;
    // 1 本のときの かわり: 2P が いなくて 1P の 物が つながっていない とき、2P の 物で 1P を うごかす
    if (t >= 0 && !this.joined && !connected(pads[t]) && this.base2 >= 0 && connected(pads[this.base2])) t = this.base2;
    if (t === this.p1) return false;
    this.p1 = t;
    this.reader1.resetPad(t >= 0 && connected(pads[t]) ? t : null);
    return true;
  }

  /** 2P の 候補の 番号（参加の ＋ を 見る パッド）。なければ NONE */
  private candidate(pads: Pads): number {
    let c = NONE;
    if (this.base2 >= 0) c = connected(pads[this.base2]) ? this.base2 : NONE;
    else {
      for (let i = 0; i < pads.length; i++) {
        if (i !== this.base1 && connected(pads[i])) {
          c = i;
          break;
        }
      }
    }
    return c === this.p1 ? NONE : c;
  }

  /**
   * COOP-1 作業 3d（AC64）: 2P の 候補（その ＋ で 参加できる パッド）の 番号。いなければ null。
   * 型だけの スタブ（developer が `candidate()` に つなぐ。テストは duoPadsProd.test.ts）。
   */
  joinCandidate(): number | null {
    throw new Error('COOP-1 3d: joinCandidate は まだ ない');
  }

  /** 参加中の 2P の パッドの 番号（えらび。パッドなしなら 候補） */
  private target2(pads: Pads): number {
    return this.base2 >= 0 ? this.base2 : this.candidate(pads);
  }

  /** 2P の パッドを 決める。かわったら 読みを やりなおす。かわった なら true */
  private assign2(pads: Pads): boolean {
    const t = this.target2(pads);
    if (t === this.p2) return false;
    this.p2 = t;
    this.lost = false;
    this.reader2.resetPad(t >= 0 && connected(pads[t]) ? t : null);
    return true;
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
    const picking = this.picking !== NONE;
    this.reader1.setIgnoreStart(picking);
    this.reader2.setIgnoreStart(picking);
    this.assign(pads);
    this.reader1.poll(nowMs);
    this.out.joinRequested = false;
    if (!active) return this.out;
    if (!this.joined) {
      const c = this.candidate(pads);
      const start = c >= 0 && this.startPressed(pads[c]!);
      this.out.joinRequested = start && !this.startWas && !picking;
      this.startWas = start;
      return this.out;
    }
    this.assign2(pads);
    if (this.p2 >= 0) {
      const pad = pads[this.p2];
      if (!connected(pad)) {
        if (!this.lost) this.loseP2();
      } else if (this.lost && this.anyButton(pad)) {
        this.lost = false; // つなぎ直しに 押した ボタンは 2P の 操作に しない
        this.reader2.holdButtonsUntilReleased();
      }
    }
    if (!this.lost && this.p2 >= 0) this.reader2.poll(nowMs);
    return this.out;
  }

  private loseP2(): void {
    this.reader2.resetPad();
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
   * COOP-1 作業 2.5（#401。§2.7・§12.0）: タブで 決めたのと 同じ（＋ の 確認は とばす）。保存して すぐ 効く。
   * 決めた ＋ は だれの 操作にも ならない（はなすまで）。変な 値・使えない ときは false。
   */
  setChoice(c: PadChoice): boolean {
    if (!this.choiceEnabled) return false;
    if (!validSlot(c.p1) || !validSlot(c.p2) || c.p1 === c.p2) return false;
    this.saved = { p1: c.p1, p2: c.p2 };
    this.joinedBase2 = NONE; // 決めなおしたら 2P の 固定も やりなおす
    writePadChoice(this.choiceStorage, this.saved);
    const pads = this.getPads();
    if (this.assign(pads) && connected(pads[this.p1])) this.reader1.holdButtonsUntilReleased();
    if (this.joined && this.assign2(pads) && connected(pads[this.p2])) this.reader2.holdButtonsUntilReleased();
    this.startWas = this.candidate(pads) >= 0; // 決めた ＋ は はなすまで 参加の 求めに ならない
    return true;
  }

  /** 「つかう コントローラー」が つかえる（`?duo=dev` の とき。せってい画面の タブを 出すか どうか） */
  choiceUsable(): boolean {
    return this.choiceEnabled;
  }

  /** 保存してある えらび。なし・こわれた・使えない → null */
  choice(): PadChoice | null {
    return this.saved ? { p1: this.saved.p1, p2: this.saved.p2 } : null;
  }

  /** 今 効いている えらび（保存が なければ はじめの 動き）。返す 物は 使いまわす */
  effectiveChoice(): PadChoice {
    this.resolveBase(this.getPads());
    this.eff.p1 = fromIdx(this.base1);
    this.eff.p2 = fromIdx(this.base2);
    return this.eff;
  }

  /** 1P・2P が 今 読んでいる パッドの 番号（1 本のときの かわりも 出る）。パッドなし・2P が いない・ぬけている → null */
  padIndex(who: 1 | 2): number | null {
    const pads = this.cache ?? this.getPads();
    if (who === 1) {
      this.assign(pads);
      return this.p1 >= 0 && connected(pads[this.p1]) ? this.p1 : null;
    }
    return this.joined && !this.lost && this.p2 >= 0 && connected(pads[this.p2]) ? this.p2 : null;
  }

  /** 「つかう コントローラー」で ＋ を 待っている あいだ、どの コントローラーの ＋ も 何も しない（null で もどす） */
  setPicking(index: number | null): void {
    this.picking = toIdx(index);
  }

  /** 参加している あいだだけ 2P の パッドを 読む。false にすると 2P の 入力を ぜんぶ はなす */
  setJoined(on: boolean): void {
    if (on === this.joined) return;
    this.joined = on;
    this.lost = false;
    this.startWas = true; // 参加の ＋ を 押しっぱなしでも すぐ 次の 参加の 求めに ならない
    if (on) {
      const pads = this.getPads();
      if (this.saved) this.joinedBase2 = NONE; // 保存で 2P が パッドなしなら、参加中に きまった 物で 固定する(resolveBase)
      else this.firstTwo(pads); // 参加中は はじめの 動きを 固定する
      this.assign(pads);
      this.p2 = NONE;
      this.assign2(pads);
      if (this.p2 >= 0 && connected(pads[this.p2]) && this.anyButton(pads[this.p2]!)) this.reader2.holdButtonsUntilReleased();
    } else {
      this.reader2.resetPad();
      this.p2 = NONE;
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
    return this.padIndex(1);
  }

  /** 参加している ときだけ 番号。2P の パッドが ぬけて いても「つなぎ直し待ち」の あいだは null */
  p2PadIndex(): number | null {
    return this.padIndex(2);
  }

  /** 3 本目以降の パッドの 番号（ボタン確認画面の「つかっていない」用。GAMEPAD-1 §4.1） */
  ignoredPadIndexes(): number[] {
    const pads = this.getPads();
    this.assign(pads);
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
