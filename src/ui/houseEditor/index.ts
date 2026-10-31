// HOUSE-1B エディターの 画面の 外がわ（上の 帯・見出し・下の 帯・3 つの すすみ・ポップアップ）。仕様 §3.2。
// 見本（3D）は 画面の「穴」（.ed-view）に ゲームの レンダラーで 描く（render() が 毎コマ 穴の 場所を 読んで preview.draw に わたす）。
// ボタンは どれも 窓口 press(id) と 同じ 道（house/editor/ops.ts）を 通る。見えるか・押せるかは editor/buttons.ts の 一覧が 決める。
// DOM: house-editor（全体）・editor-title・editor-heading・editor-progress（editor-step-soto/naka/namae）・editor-preview（見本の 穴）・
//   editor-grid / editor-cell / editor-furniture（② 方眼）・editor-name（③）・house-confirm・house-need・ボタン house-btn-<id>。
import { baseButtons, glowsWindows } from '../../house/editor/buttons';
import type { EditorController } from '../../house/editor/controller';
import { STEPS, type Step } from '../../house/editor/tuning';
import type { Preview3D, PreviewMode, ViewRect } from '../../house/preview/preview';
import type { SoundFx } from '../../fx/sound';
import { ruby } from '../text';
import { bindDrag } from './drag';
import { btn, el, makeTileUrls, setEnabled } from './dom';
import { PressFx, type PressKind } from './feedback';
import { ICONS } from './icons';
import { NakaPanel } from './naka';
import { buildNamae } from './namae';
import { ConfirmPop, NeedPop } from './popups';
import { buildSoto, type StepPanel } from './soto';
import { BAND_PX, CELL_MIN_PX } from './tuning';
import './houseEditor.css';
import './houseEditorSteps.css';
import './houseEditorPopups.css';

export interface EditorViewOpts {
  parent: HTMLElement;
  ctl: EditorController;
  /** 見本（3D）。はじめて 使う とき 作る（エディターを 開くまでは 作らない） */
  preview: () => Preview3D;
  /** 見本を しまう（とじた とき 呼ぶ。次に ひらく とき preview() が 作りなおす） */
  release: () => void;
  /** ゲームの キャンバス（穴の 場所を この 左上から はかる） */
  canvas: HTMLCanvasElement;
  /** ボタンを 押した（窓口 press と 同じ） */
  press: (id: string) => void;
  /** ゲームの 効果音（ない ときは ボタンの 音なし） */
  sound?: Pick<SoundFx, 'playTones'> | null;
}

const STEP_LABEL: Readonly<Record<Step, { label: string; icon: 'soto' | 'naka' | 'namae' }>> = {
  soto: { label: 'そと', icon: 'soto' },
  naka: { label: 'なか', icon: 'naka' },
  namae: { label: 'なまえ', icon: 'namae' },
};
/** いちばん 上の タイトルと、すすみごとの 見出し（漢字は ruby() で ふりがな） */
const TITLE = `おうちの ${ruby('設計図', 'せっけいず')}を ${ruby('作', 'つく')}ろう`;
const LEAD: Readonly<Record<Step, string>> = {
  soto: `おうちの ${ruby('外観', 'がいかん')}を かんがえよう`,
  naka: `おうちの ${ruby('内装', 'ないそう')}を かんがえよう`,
  namae: `${ruby('設計図', 'せっけいず')}に おなまえを つけよう`,
};

/** 見本が ある すすみと、その 見せ方（手の 印を さわった かどうかで 出し入れする） */
const PREVIEW_STEPS = [['soto', 'outside'], ['naka', 'inside']] as const satisfies ReadonlyArray<readonly [Step, PreviewMode]>;

/** ボタンの 音の しゅるい（そばの［とる］は 低く・まわす は 高く） */
function pressKind(id: string): PressKind {
  return id === 'take' ? 'take' : id === 'turnRight' || id === 'turnLeft' ? 'turn' : 'press';
}

export class EditorView {
  readonly root = el('div', 'ed-root');
  /** 建築士さんの ふきだしを 入れる 場所（見出しの だんの 左から 重ねる ので root に 置く。HouseUi の ふきだし 1 つを 移して 使う） */
  readonly sayHost = el('div', 'ed-say');
  private readonly panels: Record<Step, StepPanel>;
  private readonly naka: NakaPanel;
  private readonly stepEls = new Map<Step, HTMLElement>();
  private readonly lead = el('h2', 'ed-lead');
  private readonly mid = el('main', 'ed-mid');
  private readonly confirm: ConfirmPop;
  private readonly need: NeedPop;
  private readonly fx: PressFx;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  /** 「あたらしい せっけいず → ぜんぶ けす」を 見た 回数（見本の 向きを はじめに もどす ため） */
  private resets = 0;
  private shown = false;
  /** 手の 印を 消して いる か（すすみごと。かわった ときだけ 画面を さわる） */
  private readonly touchedShown: Record<'soto' | 'naka', boolean | null> = { soto: null, naka: null };
  /** 見本の 穴の 四角（measure が 書きかえる 1 つ）と、いま 穴が あるか */
  private readonly hole: ViewRect = { x: 0, y: 0, w: 0, h: 0 };
  private hasHole = false;

  constructor(private readonly o: EditorViewOpts) {
    const { ctl } = o;
    this.root.dataset.testid = 'house-editor';
    this.fx = new PressFx(o.sound ?? null);
    const press = (id: string, b: HTMLButtonElement): void => {
      if (!b.disabled) this.fx.press(b, pressKind(id));
      o.press(id);
    };
    this.naka = new NakaPanel(ctl, o.preview, makeTileUrls(), this.fx, press);
    this.panels = { soto: buildSoto(ctl, press), naka: this.naka, namae: buildNamae(ctl, press) };

    // 上の 帯 1 だん目: 左 ＝ タイトル・その 右に すすみ（印）、右 ＝ もどす・すすむ・✕。すぐ 下に 見出しの だん
    const top = el('header', 'ed-top');
    const head = el('div', 'ed-top__main');
    const title = el('h1', 'ed-title', TITLE);
    title.dataset.testid = 'editor-title';
    const steps = el('div', 'ed-steps');
    steps.dataset.testid = 'editor-progress';
    STEPS.forEach((st, i) => {
      if (i > 0) steps.append(el('span', 'ed-step__line'));
      const { label, icon } = STEP_LABEL[st];
      const e = el('div', 'ed-step', `<span class="ed-step__dot">${ICONS[icon]}</span><span>${label}</span>`);
      e.dataset.testid = `editor-step-${st}`;
      this.stepEls.set(st, e);
      steps.append(e);
    });
    const undo = btn({ cls: 'ed-btn--stack', id: 'undo', html: `${ICONS.undo}<span>もどす</span>`, onPress: press });
    const redo = btn({ cls: 'ed-btn--stack', id: 'redo', html: `${ICONS.redo}<span>すすむ</span>`, onPress: press });
    const close = btn({ cls: 'ed-btn--close', id: 'close', html: ICONS.close, onPress: press });
    close.setAttribute('aria-label', 'とじる');
    const topRight = el('div', 'ed-bar-group');
    topRight.append(undo, redo, close);
    head.append(title, steps);
    top.append(head, topRight);

    // 見出しの だん（ふきだしが 出ている 間は 見出しが かくれる）。ふきだしは 見出しの 左から 重ねる ので root に 置く（見本・方眼の 上の はしに かかって よい）
    this.lead.dataset.testid = 'editor-heading';
    this.sayHost.hidden = true;
    this.sayHost.append(el('div', 'ed-say__face', ICONS.face));

    this.mid.append(this.panels.soto.el, this.panels.naka.el, this.panels.namae.el);

    // 下の 帯: 左 ＝ あたらしい せっけいず・ひつような もの、右 ＝ まえへ・つぎへ・できた！（字は ぜんぶ 1 行。ほかの ボタンの 場所は 動かさない）
    const bottom = el('footer', 'ed-bottom');
    const bl = el('div', 'ed-bar-group');
    bl.append(
      btn({ cls: 'ed-btn--wide', id: 'new', html: 'あたらしい せっけいず', onPress: press }),
      btn({ cls: 'ed-btn--wide', id: 'need', html: 'ひつような もの', onPress: press }),
    );
    const prev = btn({ cls: 'ed-btn--nav', id: 'prev', html: `${ICONS.prev}<span>まえへ</span>`, onPress: press });
    const next = btn({ cls: 'ed-btn--nav', id: 'next', html: `<span>つぎへ</span>${ICONS.next}`, onPress: press });
    const done = btn({ cls: 'ed-btn--go', id: 'done', html: 'できた！', onPress: press });
    const br = el('div', 'ed-bar-group');
    br.append(prev, next, done);
    bottom.append(bl, br);

    this.confirm = new ConfirmPop(ctl, press);
    this.need = new NeedPop(ctl, press);
    this.root.append(top, this.lead, this.mid, bottom, this.sayHost, this.confirm.el, this.need.el);
    this.root.hidden = true;
    o.parent.append(this.root);
    for (const b of this.root.querySelectorAll<HTMLButtonElement>('button[data-btn]')) this.buttons.set(b.dataset.btn!, b);

    // 見本を ドラッグ・wheel で まわす（押すと 置いた 家具の えらびは はずれる）。さわる 前は 右下に 手の 印
    for (const [step] of PREVIEW_STEPS) {
      const view = this.panels[step].view;
      if (view) bindDrag(view, o.preview, () => void ctl.clearPlaced());
    }
    // まどの かず・しゅるいの ボタンの ならびに 手を おいて いる 間、見本の 窓が ぜんぶ 光る（キーボードで 来ても 同じ）
    const rows = new Set<HTMLElement>();
    for (const [id, b] of this.buttons) if (glowsWindows(id) && b.parentElement) rows.add(b.parentElement);
    for (const row of rows) {
      for (const ev of ['pointerenter', 'focusin'] as const) row.addEventListener(ev, () => this.glowWindows(true));
      for (const ev of ['pointerleave', 'focusout'] as const) row.addEventListener(ev, () => this.glowWindows(false));
    }

    // ゲームの 操作に ならない ように（マウスの 押す・まわす・右クリックは ここで 止める）
    for (const ev of ['mousedown', 'mouseup', 'wheel', 'click'] as const) this.root.addEventListener(ev, (e) => e.stopPropagation());
    // つぎに 何か 押したら ふきだしは 消える（そのまま ふきだしが 出る 押し方なら 新しい ふきだしが 出る）
    this.root.addEventListener('pointerdown', () => ctl.hideBubble(), true);
    this.root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener('resize', () => {
      if (!this.shown) return;
      this.layout();
      this.refresh();
    });
  }

  /** 方眼の マス（§3.2: (まん中の 高さ − 48) ÷ 9 の 切り捨て → 48・54・61）。まん中の 高さは 画面に 出て いる 実際の 高さ（余白の 表。ui の houseEditor.css の --e-*） */
  private layout(): void {
    const mid = this.mid.clientHeight;
    if (mid <= 0) return; // とじて いる 間は はからない（ひらく とき もう 1 回）
    const cell = Math.max(CELL_MIN_PX, Math.floor((mid - (2 * BAND_PX + 16)) / 9));
    this.root.style.setProperty('--ed-cell', `${cell}px`);
    this.naka.setCell(cell);
  }

  /** まどの ボタンに 手を おいた／はなした（見本が 見えて いる 間だけ。見本の 窓が 光る） */
  private glowWindows(on: boolean): void {
    if (this.shown) this.o.preview().hover(on);
  }

  /** ひらく／とじる。ひらく とき 見本の 向きを はじめに もどす（戸が 光る） */
  show(on: boolean): void {
    if (on === this.shown) return;
    this.shown = on;
    this.root.hidden = !on;
    document.body.classList.toggle('house-editor-open', on);
    if (on) {
      this.layout();
      this.o.preview().restart();
      this.refresh();
    } else {
      this.o.release();
    }
  }

  /** 状態が かわった: 画面を あわせる */
  refresh(): void {
    if (!this.shown) return;
    const { ctl } = this.o;
    const s = ctl.s;
    const preview = this.o.preview();
    this.root.dataset.step = s.step;
    const now = STEPS.indexOf(s.step);
    for (const [step, e] of this.stepEls) {
      const i = STEPS.indexOf(step);
      e.classList.toggle('is-now', i === now);
      e.classList.toggle('is-done', i < now);
      if (i === now) e.setAttribute('aria-current', 'step');
      else e.removeAttribute('aria-current');
    }
    // 見えるか・押せるかは 一覧どおり（一覧に 無い ボタンは かくす）。ポップアップが 出て いる 間も 後ろの 状態は 一覧に あわせる
    const list = new Map(baseButtons(ctl).map((b) => [b.id, b.enabled]));
    for (const [id, b] of this.buttons) {
      const enabled = list.get(id);
      if (b.closest('.ed-pop')) continue;
      b.hidden = enabled === undefined;
      if (enabled !== undefined) setEnabled(b, enabled);
    }
    if (this.lead.dataset.step !== s.step) {
      this.lead.dataset.step = s.step;
      this.lead.innerHTML = LEAD[s.step];
    }
    this.root.classList.toggle('has-say', ctl.bubble !== null);
    this.sayWidth(s.step);
    if (ctl.resets !== this.resets) {
      this.resets = ctl.resets;
      preview.restart();
    }
    this.panels[s.step].update();
    if (s.step === 'namae') preview.hide();
    else preview.setShape(s, s.step === 'naka' ? 'inside' : 'outside');
    this.syncTouched(preview);
    this.confirm.update();
    this.need.update();
    this.sayHost.hidden = ctl.bubble === null;
    this.measure();
  }

  /** ふきだしの はば ＝ その すすみの 左の 列の はば（§3.2。ふきだしの 字は これ − 100 で 折りかえす） */
  private sayWidth(step: Step): void {
    const col = this.root.querySelector<HTMLElement>(`.ed-stepview--${step} [data-col='L']`);
    const w = col?.getBoundingClientRect().width ?? 0;
    if (w > 0) this.root.style.setProperty('--ed-say-w', `${Math.round(w)}px`);
  }

  /**
   * 見本の 穴の 四角（キャンバスの 左上から）を はかって `hole` に 書きこむ（見本が ない すすみは hasHole ＝ false）。
   * 穴の 場所は 画面の 大きさ・すすみ・ふきだし など 状態が かわった ときだけ かわる ので、refresh（と resize の あと）で はかる。
   * 毎コマ はかると 新しい DOMRect と オブジェクトが 毎コマ できて しまう
   */
  private measure(): void {
    const view = this.panels[this.o.ctl.s.step].view;
    this.hasHole = view !== null && this.shown;
    if (!view || !this.shown) return;
    const r = view.getBoundingClientRect();
    const c = this.o.canvas.getBoundingClientRect();
    this.hole.x = r.left - c.left;
    this.hole.y = r.top - c.top;
    this.hole.w = r.width;
    this.hole.h = r.height;
  }

  /** 毎コマ（ゲームの 時間が 止まって いても 描く） */
  render(): void {
    if (this.shown) this.o.preview().draw(this.hasHole ? this.hole : null);
  }

  /** 手の 印: さわった 見本の すすみは 消す（また 回り出しても 出さない）。かわった ときだけ 画面を さわる */
  private syncTouched(preview: Preview3D): void {
    for (const [step, mode] of PREVIEW_STEPS) {
      const touched = preview.touched(mode);
      if (this.touchedShown[step] === touched) continue;
      this.touchedShown[step] = touched;
      this.panels[step].view?.classList.toggle('is-touched', touched);
    }
  }

  /** 1 ステップ（1/60 秒）: 見本の 向き・時間 */
  tick(): void {
    if (!this.shown) return;
    const preview = this.o.preview();
    preview.tick();
    this.syncTouched(preview);
  }
}
