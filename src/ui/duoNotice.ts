/**
 * COOP-1 作業 3d（§2.1・§2.6・AC46・AC64・AC84）: 2 人あそびの 小さな 知らせ 2 つ。
 *  - `duo-join-hint`「＋で さんか」: 2 本目の パッドが つながった とき 3 秒（出し入れは src/duo/joinHint.ts）
 *  - `duo-wait`「ちょっと まってね」: 本・建築士さんが 世界を 止めている あいだ、開いて いない 人の 半分に 出す（1P が 開いたら 2P の 側〔右〕の `duo-wait`、2P が 開いたら 1P の 側〔左〕の `duo-wait-p1`。COOP-1 5d）
 *  - `duo-relock-p1`「ゲームに 戻る」: 2P が パッドで 本・建築士さんを とじた あと、1P の マウスの 錠が かけなおし待ちの あいだ 1P の 半分に（5d・AC171）
 *  - COOP-1 5e: ふとん。`duo-sleep-ask-p1`／`-p2`「おともだちが いっしょに ねたがっているよ」（ねて いない 人の 半分）・`duo-sleep-dim-p1`／`-p2`（待ち中の うすい 暗さ。先に ねた 人の 半分）・
 *    `duo-gadget-note-p2`（ひる・あさに 2P が ふとんを 使った 「よる に ねようね」。表の 秒数だけ。1P の 文は #sleep-notice）
 * 出す ときまで DOM を 作らない。変わった ときだけ 書く（毎フレーム 作らない）。
 */
import { GADGET_TUNING } from '../content/items/gadgetTuning';
import { INPUT_CONFIG } from '../input/config';
import { SLEEP_ASK_TEXT } from '../time/sleep';
import { escapeHtml, ruby } from './text';
import './duoNotice.css';

/** ＋ボタンの 絵（まる の 中に ＋。色は 文字と 同じ） */
const PLUS_SVG =
  '<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 9v14M9 16h14" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>';

export class DuoNotices {
  private hint: HTMLDivElement | null = null;
  private readonly waits: [HTMLDivElement | null, HTMLDivElement | null] = [null, null];
  private relock: HTMLDivElement | null = null;
  private hintOn = false;
  private readonly waitOn: [boolean, boolean] = [false, false];
  private relockOn = false;
  private readonly asks: [HTMLDivElement | null, HTMLDivElement | null] = [null, null];
  private readonly askOn: [boolean, boolean] = [false, false];
  private readonly dims: [HTMLDivElement | null, HTMLDivElement | null] = [null, null];
  private readonly dimValue: [number, number] = [0, 0];
  private gadgetNote: HTMLDivElement | null = null;
  /** 2P の 「よる に ねようね」の のこり（秒） */
  private gadgetLeft = 0;

  constructor(private readonly hud: HTMLElement) {}

  /** 「＋で さんか」を 出す / 消す */
  setJoinHint(on: boolean): void {
    if (on === this.hintOn) return;
    this.hintOn = on;
    if (on && !this.hint) {
      const el = document.createElement('div');
      el.className = 'duo-join-hint';
      el.setAttribute('data-testid', 'duo-join-hint');
      const icon = document.createElement('span');
      icon.className = 'duo-join-hint-icon';
      icon.innerHTML = PLUS_SVG;
      const text = document.createElement('span');
      text.textContent = 'で さんか';
      el.append(icon, text);
      this.hud.append(el);
      this.hint = el;
    }
    if (this.hint) this.hint.hidden = !on;
  }

  /** who の 半分の「ちょっと まってね」を 出す / 消す（2P の 半分〔右〕= who 2 → `duo-wait`、1P の 半分〔左〕= who 1 → `duo-wait-p1`） */
  setWait(who: 1 | 2, on: boolean): void {
    const i = who - 1;
    if (on === this.waitOn[i]) return;
    this.waitOn[i] = on;
    let el = this.waits[i] ?? null;
    if (on && !el) {
      el = document.createElement('div');
      el.className = who === 1 ? 'duo-wait duo-wait-p1' : 'duo-wait';
      el.setAttribute('data-testid', who === 1 ? 'duo-wait-p1' : 'duo-wait');
      el.textContent = 'ちょっと まってね';
      this.hud.append(el);
      this.waits[i] = el;
    }
    if (el) el.hidden = !on;
  }

  /** 1P の 半分の「ゲームに 戻る」（かけなおし待ちの あいだ）を 出す / 消す */
  setRelockHint(on: boolean): void {
    if (on === this.relockOn) return;
    this.relockOn = on;
    if (on && !this.relock) {
      const el = document.createElement('div');
      el.className = 'duo-wait duo-relock-p1';
      el.setAttribute('data-testid', 'duo-relock-p1');
      el.innerHTML = escapeHtml(INPUT_CONFIG.textResume).replace('戻', ruby('戻', 'もど')); // 案内画面と 同じ 字（戻る に ふりがな）
      this.hud.append(el);
      this.relock = el;
    }
    if (this.relock) this.relock.hidden = !on;
  }

  /** who の 半分の「おともだちが いっしょに ねたがっているよ」を 出す / 消す（ねて いない 人の 半分） */
  setSleepAsk(who: 1 | 2, on: boolean): void {
    const i = who - 1;
    if (on === this.askOn[i]) return;
    this.askOn[i] = on;
    let el = this.asks[i] ?? null;
    if (on && !el) {
      el = document.createElement('div');
      el.className = who === 1 ? 'duo-sleep-ask duo-sleep-ask-p1' : 'duo-sleep-ask';
      el.setAttribute('data-testid', who === 1 ? 'duo-sleep-ask-p1' : 'duo-sleep-ask-p2');
      el.textContent = SLEEP_ASK_TEXT;
      this.hud.append(el);
      this.asks[i] = el;
    }
    if (el) el.hidden = !on;
  }

  /** who の 半分の 待ち中の うすい 暗さ（0〜1。0 で 消す）。変わった ときだけ 書く */
  setSleepDim(who: 1 | 2, value: number): void {
    const i = who - 1;
    if (value === this.dimValue[i]) return;
    this.dimValue[i] = value;
    let el = this.dims[i] ?? null;
    if (value > 0 && !el) {
      el = document.createElement('div');
      el.className = who === 1 ? 'duo-sleep-dim duo-sleep-dim-p1' : 'duo-sleep-dim';
      el.setAttribute('data-testid', who === 1 ? 'duo-sleep-dim-p1' : 'duo-sleep-dim-p2');
      el.setAttribute('aria-hidden', 'true');
      this.hud.append(el);
      this.dims[i] = el;
    }
    if (el) {
      el.hidden = value <= 0;
      el.style.opacity = String(value);
    }
  }

  /** 2P の 半分に ふとんの 文（「よる に ねようね」）を 表の 秒数だけ 出す */
  showGadgetNote(text: string): void {
    let el = this.gadgetNote;
    if (!el) {
      el = document.createElement('div');
      el.className = 'duo-gadget-note';
      el.setAttribute('data-testid', 'duo-gadget-note-p2');
      this.hud.append(el);
      this.gadgetNote = el;
    }
    el.textContent = text;
    el.hidden = false;
    this.gadgetLeft = GADGET_TUNING.futon.noticeSeconds;
  }

  /** 毎ステップ（dt は 秒）: ふとんの 文の 時間 */
  step(dt: number): void {
    if (this.gadgetLeft <= 0) return;
    this.gadgetLeft -= dt;
    if (this.gadgetLeft <= 0) {
      this.gadgetLeft = 0;
      if (this.gadgetNote) this.gadgetNote.hidden = true;
    }
  }

  dispose(): void {
    this.hint?.remove();
    this.relock?.remove();
    this.gadgetNote?.remove();
    for (const a of this.asks) a?.remove();
    for (const m of this.dims) m?.remove();
    this.gadgetNote = null;
    this.gadgetLeft = 0;
    this.asks[0] = this.asks[1] = this.dims[0] = this.dims[1] = null;
    this.askOn[0] = this.askOn[1] = false;
    this.dimValue[0] = this.dimValue[1] = 0;
    for (const w of this.waits) w?.remove();
    this.hint = this.relock = null;
    this.waits[0] = this.waits[1] = null;
    this.hintOn = this.relockOn = false;
    this.waitOn[0] = this.waitOn[1] = false;
  }
}
