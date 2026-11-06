/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§3.2・§9.6）: せっていの「つかう コントローラー」タブの 中身の 決まり(画面を 持たない)。
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
import { decidePadChoice, listPadsInto, type PadChoice, type PadListItem } from '../../input/gamepad/padChoice';
import { detectMappingKind, faceTable } from '../../input/gamepad/mapping';

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

/** 待ちの 時間切れ: 15 秒 = 固定ステップ 900 回（§9.6） */
const PICK_TIMEOUT_STEPS = 900;
/** お知らせを 出す 長さ: 3 秒 = 固定ステップ 180 回（§9.6） */
const NOTICE_STEPS = 180;
/** 光る 長さ: はなして 0.5 秒 = 固定ステップ 30 回（§9.6） */
const LIT_STEPS = 30;
/** ブラウザの パッドは 4 本まで */
const MAX_PADS = 4;

type Face = ReturnType<typeof faceTable>[number];

export class PadPicker {
  private pend: { who: 1 | 2; index: number } = { who: 1, index: -1 };
  private waitSteps = 0;
  private noticeKind: PickNotice | null = null;
  private noticeLeft = 0;
  /** 光る 残り（押している あいだは LIT_STEPS + 1。0 で 消える） */
  private readonly litLeft: number[] = [0, 0, 0, 0];
  /** 前の ステップの 「ボタンを 押している」「＋」「もどる」「十字」 */
  private readonly wasStart: boolean[] = [false, false, false, false];
  private readonly wasBack: boolean[] = [false, false, false, false];
  private readonly wasDpad: boolean[] = [false, false, false, false];
  private timeAcc = 0;
  private readonly buttonViews: [PadButtonView[], PadButtonView[]] = [[], []];
  /** つながっている 一覧(使いまわす) */
  private readonly listBuf: PadListItem[] = [];
  /** 1P の パッドの もどる・十字で 待ちを やめた(このステップ。advanceTime は 中の どれか) */
  private endedByPadFlag = false;

  constructor(private readonly host: PadPickerHost) {}

  /** 待ちの 中身を そのまま 返す(読むだけ。使いまわし) */
  pending(): Readonly<{ who: 1 | 2; index: number }> | null {
    return this.pend.index >= 0 ? this.pend : null;
  }

  /** このステップ(advanceTime なら 今回の 中の どれか)に 1P の パッドで 待ちを やめた。呼んだ 側は フォーカスを 動かさない */
  endedByPad(): boolean {
    return this.endedByPadFlag;
  }

  private list(): PadListItem[] {
    return listPadsInto(this.listBuf, this.host.getPads());
  }

  private isConnected(index: number): boolean {
    const p = this.host.getPads()[index];
    return !!p && p.connected;
  }

  start(who: 1 | 2, index: number): void {
    if (!this.isConnected(index)) return;
    const c = this.host.choice();
    if ((who === 1 ? c.p1 : c.p2) === index) {
      this.cancel('mouse'); // もう 決まっている 物を おしても 待ちは つづけない
      return;
    }
    this.pend.who = who;
    this.pend.index = index;
    this.waitSteps = 0;
    this.host.setPicking(index);
    // 押したままの ＋ は 「新しく おされた」に しない
    this.sample(this.host.getPads(), false);
  }

  private end(): void {
    if (this.pend.index < 0) return;
    this.pend.index = -1;
    this.host.setPicking(null);
  }

  cancel(_reason: PickCancel): void {
    this.end();
  }

  notice(): PickNotice | null {
    return this.noticeKind;
  }

  private setNotice(n: PickNotice): void {
    this.noticeKind = n;
    this.noticeLeft = NOTICE_STEPS;
  }

  /** パッドの ボタンの 今の ようすを 読む。edge = true なら 新しく おされた 物を 返す */
  private sample(pads: ReadonlyArray<Gamepad | null>, edge: boolean): number {
    // 返す 値の ビット: 1 = 選んだ 物の ＋、2 = 1P の パッドの もどる・十字
    let bits = 0;
    const p1 = this.host.padIndex(1);
    for (let i = 0; i < MAX_PADS; i++) {
      const pad = pads[i];
      let start = false;
      let back = false;
      let dpad = false;
      let any = false;
      if (pad && pad.connected) {
        const table = faceTable(detectMappingKind(pad));
        for (let b = 0; b < pad.buttons.length; b++) {
          if (!pad.buttons[b]?.pressed) continue;
          any = true;
          const f: Face | undefined = table[b];
          if (f === 'start') start = true;
          else if (f === 'faceRight') back = true;
          else if (f === 'dpadUp' || f === 'dpadDown' || f === 'dpadLeft' || f === 'dpadRight') dpad = true;
        }
      }
      if (edge && i === this.pend.index && start && !this.wasStart[i]) bits |= 1;
      if (edge && i === p1 && ((back && !this.wasBack[i]) || (dpad && !this.wasDpad[i]))) bits |= 2;
      this.wasStart[i] = start;
      this.wasBack[i] = back;
      this.wasDpad[i] = dpad;
      this.litLeft[i] = any ? LIT_STEPS + 1 : Math.max(0, (this.litLeft[i] ?? 0) - 1);
    }
    return bits;
  }

  step(): void {
    this.endedByPadFlag = false;
    this.stepOnce();
  }

  private stepOnce(): void {
    if (this.noticeLeft > 0 && --this.noticeLeft === 0) this.noticeKind = null;
    const pads = this.host.getPads();
    const bits = this.sample(pads, this.pend.index >= 0);
    if (this.pend.index < 0) return;
    if (!this.isConnected(this.pend.index) || bits & 2) {
      if (bits & 2) this.endedByPadFlag = true;
      this.end();
      return;
    }
    if (bits & 1) {
      const d = decidePadChoice(this.host.choice(), this.pend.who, this.pend.index, this.list().map((x) => x.index));
      this.end();
      this.host.commit(d.choice);
      this.setNotice(d.swapped ? 'swapped' : 'decided');
      return;
    }
    if (++this.waitSteps >= PICK_TIMEOUT_STEPS) {
      this.end();
      this.setNotice('timeout');
    }
  }

  advanceTime(sec: number): number {
    this.timeAcc += sec * 60;
    const n = Math.floor(this.timeAcc + 1e-6);
    this.timeAcc -= n;
    this.endedByPadFlag = false;
    let ended = false;
    for (let i = 0; i < n; i++) {
      this.stepOnce();
      if (this.endedByPadFlag) ended = true;
    }
    this.endedByPadFlag = ended;
    return n;
  }

  isLit(index: number): boolean {
    return (this.litLeft[index] ?? 0) > 0;
  }

  litColor(index: number): 'p1' | 'p2' | 'white' | null {
    if (!this.isLit(index)) return null;
    if (this.host.padIndex(1) === index) return 'p1';
    if (this.host.padIndex(2) === index) return 'p2';
    return 'white';
  }

  buttons(who: 1 | 2): PadButtonView[] {
    const list = this.list();
    const c = this.host.choice();
    const mine = who === 1 ? c.p1 : c.p2;
    const out = this.buttonViews[who - 1]!;
    list.forEach((it, n) => {
      const v = out[n] ?? (out[n] = { index: 0, name: '', chosen: false, pending: false, lit: false });
      v.index = it.index;
      v.name = it.name;
      v.chosen = mine === it.index;
      v.pending = this.pend.index === it.index && this.pend.who === who;
      v.lit = this.isLit(it.index);
    });
    out.length = list.length;
    return out;
  }

  isNone(): boolean {
    return this.list().length === 0;
  }
}
