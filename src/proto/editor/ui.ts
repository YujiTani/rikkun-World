// HOUSE-1B 試作: エディターの 画面の 外がわ（上の 帯・下の 帯・3 つの すすみ・ポップアップ・ふきだし）。仕様 §3.2。
// 見本（3D）は 画面の「穴」（.ed-view）に ゲームの レンダラーで 描く（render() が 毎コマ 穴の 場所を 読んで preview.draw に わたす）。
import './ui.css';
import { btn, el, makeTileUrls, markSel, setOff } from './dom';
import type { EditorController } from './editor';
import { ICONS } from './icons';
import type { Preview3D, ViewRect } from './preview';
import { BAND_PX, BAR, BUBBLE_MS, type Step } from './tuning';
import { NakaPanel } from './uiNaka';
import { buildNamae } from './uiNamae';
import { ConfirmPop, NeedPop, Say } from './uiPopups';
import { buildSoto, type StepPanel } from './uiSoto';

export interface EditorUiOpts {
  parent: HTMLElement;
  ctl: EditorController;
  preview: Preview3D;
  /** ゲームの キャンバス（穴の 場所を この 左上から はかる） */
  canvas: HTMLCanvasElement;
  open: () => void;
  close: () => void;
}

const STEPS: ReadonlyArray<{ step: Step; label: string; icon: 'soto' | 'naka' | 'namae' }> = [
  { step: 'soto', label: 'そと', icon: 'soto' },
  { step: 'naka', label: 'なか', icon: 'naka' },
  { step: 'namae', label: 'なまえ', icon: 'namae' },
];
const STEP_ORDER: readonly Step[] = ['soto', 'naka', 'namae'];
/** ふきだしが 出ている ステップ（3 秒 ＝ 180） */
const BUBBLE_TICKS = Math.round(BUBBLE_MS / (1000 / 60));

export class EditorUi {
  readonly root = el('div', 'ed-root');
  private readonly panels: Record<Step, StepPanel>;
  private readonly naka: NakaPanel;
  private readonly stepEls = new Map<Step, HTMLElement>();
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly confirm: ConfirmPop;
  private readonly need: NeedPop;
  private readonly say: Say;
  private readonly hand = el('div', 'ed-hand', ICONS.hand);
  private readonly reopen: HTMLButtonElement;

  constructor(private readonly o: EditorUiOpts) {
    const { ctl } = o;
    this.root.dataset.testid = 'editor';
    this.naka = new NakaPanel(ctl, o.preview, makeTileUrls());
    this.panels = { soto: buildSoto(ctl), naka: this.naka, namae: buildNamae(ctl) };

    // 上の 帯: すすみ（印）・もどす・すすむ・✕
    const top = el('header', 'ed-top');
    const steps = el('div', 'ed-steps');
    steps.dataset.testid = 'editor-steps';
    STEPS.forEach((st, i) => {
      if (i > 0) steps.append(el('span', 'ed-step__line'));
      const e = el('div', 'ed-step', `<span class="ed-step__dot">${ICONS[st.icon]}</span><span>${st.label}</span>`);
      e.dataset.step = st.step;
      this.stepEls.set(st.step, e);
      steps.append(e);
    });
    this.undoBtn = btn({ cls: 'ed-btn--stack', html: `${ICONS.undo}<span>もどす</span>`, testid: 'editor-undo', onClick: () => void ctl.undo() });
    this.redoBtn = btn({ cls: 'ed-btn--stack', html: `${ICONS.redo}<span>すすむ</span>`, testid: 'editor-redo', onClick: () => void ctl.redo() });
    const closeBtn = btn({ cls: 'ed-btn--close', html: ICONS.close, testid: 'editor-close', onClick: () => o.close() });
    closeBtn.setAttribute('aria-label', 'とじる');
    const topRight = el('div', 'ed-bar-group');
    topRight.append(this.undoBtn, this.redoBtn, closeBtn);
    top.append(steps, topRight);

    // まん中
    const mid = el('main', 'ed-mid');
    mid.append(this.panels.soto.el, this.panels.naka.el, this.panels.namae.el);
    this.say = new Say(ctl, () => ctl.hideBubble());
    mid.append(this.say.el);

    // 下の 帯: 左 ＝ あたらしい せっけいず・ひつような もの、右 ＝ まえへ・つぎへ・できた！（ほかの ボタンの 場所は 動かさない）
    const bottom = el('footer', 'ed-bottom');
    const bl = el('div', 'ed-bar-group');
    bl.append(
      btn({ cls: 'ed-btn--two', html: '<span>あたらしい</span><span>せっけいず</span>', testid: 'editor-reset', onClick: () => ctl.openReset() }),
      btn({ cls: 'ed-btn--two', html: '<span>ひつような</span><span>もの</span>', testid: 'editor-need-open', onClick: () => ctl.openNeed() }),
    );
    this.prevBtn = btn({ cls: 'ed-btn--nav', html: `${ICONS.prev}<span>まえへ</span>`, testid: 'editor-prev', onClick: () => void ctl.prev() });
    this.nextBtn = btn({ cls: 'ed-btn--nav', html: `<span>つぎへ</span>${ICONS.next}`, testid: 'editor-next', onClick: () => void ctl.next() });
    const doneBtn = btn({ cls: 'ed-btn--go', html: 'できた！', testid: 'editor-done', onClick: () => void ctl.done() });
    const br = el('div', 'ed-bar-group');
    br.append(this.prevBtn, this.nextBtn, doneBtn);
    bottom.append(bl, br);

    this.confirm = new ConfirmPop(ctl);
    this.need = new NeedPop(ctl);
    this.root.append(top, mid, bottom, this.confirm.el, this.need.el, this.hand);
    o.parent.append(this.root);

    this.reopen = btn({ cls: 'ed-reopen', html: 'せっけいずを ひらく', testid: 'editor-reopen', onClick: () => o.open() });
    this.reopen.hidden = true;
    o.parent.append(this.reopen);

    // ゲームの 操作に ならない ように（マウスの 押す・まわす・右クリックは ここで 止める）
    for (const ev of ['mousedown', 'mouseup', 'wheel', 'click'] as const) this.root.addEventListener(ev, (e) => e.stopPropagation());
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    ctl.onChange(() => this.refresh());
    window.addEventListener('resize', () => {
      this.layout();
      this.refresh();
    });
    this.layout();
    this.refresh();
  }

  /** 方眼の マス（§3.2: (まん中の 高さ − 48) ÷ 9 の 切り捨て → 48・59・70） */
  private layout(): void {
    const mid = window.innerHeight - (BAR.top + BAR.bottom);
    const cell = Math.max(48, Math.floor((mid - (2 * BAND_PX + 16)) / 9));
    this.root.style.setProperty('--ed-cell', `${cell}px`);
    this.naka.setCell(cell);
  }

  /** ひらく／とじる（とじて いる 間は「せっけいずを ひらく」を 出す） */
  show(on: boolean): void {
    this.root.hidden = !on;
    this.reopen.hidden = on;
    if (on) {
      this.layout();
      this.refresh();
    }
  }

  /** 状態が かわった: 画面を あわせる */
  refresh(): void {
    const { ctl } = this.o;
    const s = ctl.s;
    this.root.dataset.step = s.step;
    const now = STEP_ORDER.indexOf(s.step);
    for (const [step, e] of this.stepEls) {
      const i = STEP_ORDER.indexOf(step);
      e.classList.toggle('is-now', i === now);
      e.classList.toggle('is-done', i < now);
    }
    setOff(this.undoBtn, !ctl.canUndo(), true);
    setOff(this.redoBtn, !ctl.canRedo(), true);
    this.prevBtn.classList.toggle('is-hidden', s.step === 'soto');
    this.nextBtn.classList.toggle('is-hidden', s.step === 'namae');
    setOff(this.nextBtn, s.step === 'soto' && !ctl.sizeChosen());
    markSel(this.nextBtn, false);
    this.panels[s.step].update();
    this.o.preview.setShape(s, s.step === 'naka' ? 'inside' : 'outside');
    this.confirm.update();
    this.need.update();
    this.say.update(BUBBLE_TICKS);
  }

  /** 見本の 穴の 四角（キャンバスの 左上から。見本が ない すすみは null） */
  rect(): ViewRect | null {
    const view = this.panels[this.o.ctl.s.step].view;
    if (!view || this.root.hidden) return null;
    const r = view.getBoundingClientRect();
    const c = this.o.canvas.getBoundingClientRect();
    return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
  }

  /** 毎コマ（ゲームの 時間が 止まって いても 描く） */
  render(): void {
    this.o.preview.draw(this.rect());
  }

  /** 1 ステップ（1/60 秒） */
  tick(): void {
    this.say.tick();
  }

  /** キー（Esc いがいは ゲームの 操作に ならない。Backspace ＝ 1 もじ けす〔③ だけ〕） */
  key(e: KeyboardEvent): void {
    const { ctl } = this.o;
    if (e.key === 'Escape') this.escape();
    else if (e.key === 'Backspace' && ctl.s.step === 'namae' && !ctl.confirm && !ctl.needOpen) ctl.erase();
  }

  /** Esc: 確かめの まど → ひつような もの → エディターを とじる */
  escape(): void {
    if (!this.o.ctl.escape()) this.o.close();
  }

  /** 手の 絵（GIF を 撮る ときだけ）。pos ＝ 画面の px、null で かくす */
  showHand(pos: { x: number; y: number; down?: boolean } | null): void {
    this.hand.classList.toggle('is-on', pos !== null);
    if (!pos) return;
    this.hand.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    this.hand.classList.toggle('is-down', !!pos.down);
  }
}
