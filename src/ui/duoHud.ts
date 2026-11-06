/**
 * COOP-1（docs/design/COOP-1.md §3.1・§9.4）: 2 人のときの HUD。
 * 2P の ホットバー・ハート・もちもの、距離メーター、相手の 向きの 矢印（1.8）、パッドぬけの 文。参加するまで DOM を 作らない（1 人のときは 今までと 同じ）。
 * data-testid は e2e/helpers/duoUi.ts の 約束どおり。
 */
import type { Inventory } from '../contracts';
import { DUO_COLORS, DUO_TUNING } from '../duo/tuning';
import type { DuoView } from '../duo/types';
import { INVENTORY_SIZE } from '../inventory/items';
import { Hearts } from './hearts';
import { Hotbar, createSlotEl, paintSlot, type SlotEls } from './hotbar';
import { HEART_CONFIG } from './heartsModel';
import './duoHud.css';

export interface DuoHudDeps {
  hud: HTMLElement;
  p2Inventory: Inventory;
  /** 1P の ホットバー（#hotbar）と ハート（#hearts） */
  hotbar1: HTMLElement;
  hearts1: HTMLElement;
}

/** 矢印 1 つの 画面への 出し方（`DuoArrowTracker` の last() と opacity()）。濃さ 0 なら かくす */
export interface DuoHudArrow {
  /** 矢印の 先の 画面の 位置（CSS px） */
  x: number;
  y: number;
  /** 度（画面の 上 0°・時計回り） */
  angle: number;
  /** 0〜1 */
  opacity: number;
}

export interface DuoHudView {
  /** 棒の 長さ 0〜1 */
  meter: number;
  distance: number;
  padLost: boolean;
  /** 「やめる」ゲージ 0〜1 */
  quitGauge: number;
  panelOpen: boolean;
  /** 画面の ようす（分割の 線を 出し入れ する） */
  view: DuoView;
  /** 相手の 向きの 矢印。[1P の 半分（2P を さす）, 2P の 半分（1P を さす）] */
  arrows: readonly [DuoHudArrow, DuoHudArrow];
  /** 矢印の 三角の 高さ（px。置き場の 計算と 同じ 値: arrowHeightPx(画面の 高さ)） */
  arrowHeight: number;
  /** 2P の 頭の 上の「？」を 出す 画面の 位置（CSS px）。出さない ときは null */
  question: { x: number; y: number } | null;
}

/** 矢印の 部品（HTML。3D では 描かない） */
interface ArrowEls {
  root: HTMLDivElement;
  /** 三角を 先を 中心に 回す 入れもの */
  tri: HTMLDivElement;
  badge: HTMLSpanElement;
}

/** 三角の はば / 高さ。「▼」と 同じ 形（二等辺） */
const ARROW_WIDTH_RATIO = 0.9;
/** 三角の 色の ふちの 太さ（px。こい --rk-bg-900） */
const ARROW_OUTLINE_PX = 2;
/** ねもとの バッジの 中心を 三角の ねもとから 外へ ずらす 割合（バッジの 半径に 対して） */
const ARROW_BADGE_SHIFT = 0.3;

interface Built {
  meter: HTMLDivElement;
  bar: HTMLDivElement;
  more: HTMLSpanElement;
  padLost: HTMLDivElement;
  root: HTMLDivElement;
  hotbar2: Hotbar;
  hearts2: Hearts;
  arrows: [ArrowEls, ArrowEls];
  line: HTMLDivElement;
  question: HTMLDivElement;
  panel: HTMLDivElement;
  quit: HTMLButtonElement;
  cells: SlotEls[];
  off: () => void;
}

/** パッドの 絵（コントローラー。線だけ。色は 文字と 同じ） */
const PAD_SVG =
  '<svg viewBox="0 0 48 32" width="100%" height="100%" aria-hidden="true"><path d="M12 5h24c5 0 8 4 10 12l1 8c1 4-3 6-6 3l-5-5H12l-5 5c-3 3-7 1-6-3l1-8C6 9 7 5 12 5z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M13 12v6M10 15h6" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="13" r="2" fill="currentColor"/><circle cx="37" cy="17" r="2" fill="currentColor"/></svg>';

/** 画面に 書いた 最後の 値の 初期値（変わらなければ style・hidden を 書かない） */
function newShown() {
  return { meter: '', more: false, padLost: false, panel: false, quit: '', view: '' as string, q: [NaN, NaN, 0] as number[], arrows: [[NaN, NaN, NaN, NaN], [NaN, NaN, NaN, NaN]] as number[][] };
}

/** 満タンの ハート（体力 20 = 10 こ）。2P の ダメージは 作業 3 */
const FULL_HP = HEART_CONFIG.count * 2;

export class DuoHud {
  private b: Built | null = null;
  private on = false;
  private dirty = true;
  /** 「たおれちゃった」（倒れているあいだだけ ある） */
  private downEl: HTMLDivElement | null = null;
  private lastW = -1;
  /** 矢印の バッジの 大きさ（px。画面の 大きさが かわったら 0 に して はかりなおす） */
  private badgePx = 0;
  /** 画面に 書いた 最後の 値（変わらなければ style・hidden を 書かない） */
  private shown = newShown();

  constructor(private readonly d: DuoHudDeps) {}

  private build(): Built {
    const { hud, p2Inventory: inv } = this.d;
    const meter = document.createElement('div');
    meter.className = 'duo-meter';
    meter.setAttribute('data-testid', 'duo-meter');
    meter.hidden = true;
    const track = document.createElement('div');
    track.className = 'duo-track';
    const bar = document.createElement('div');
    bar.className = 'duo-bar';
    bar.setAttribute('data-testid', 'duo-meter-bar');
    // P1・P2 の 丸い バッジ（色は 1P・2P の 色。棒の はじ / 棒の さき に ついていく）
    const pin1 = document.createElement('span');
    pin1.className = 'duo-pin duo-pin-1 duo-badge duo-badge-1';
    pin1.setAttribute('data-testid', 'duo-meter-badge-p1');
    pin1.textContent = 'P1';
    const pin2 = document.createElement('span');
    pin2.className = 'duo-pin duo-pin-2 duo-badge duo-badge-2';
    pin2.setAttribute('data-testid', 'duo-meter-badge-p2');
    pin2.textContent = 'P2';
    const more = document.createElement('span');
    more.className = 'duo-more';
    more.textContent = '▶';
    more.hidden = true;
    track.append(bar, pin1, pin2, more);
    meter.append(track);

    const padLost = document.createElement('div');
    padLost.className = 'duo-pad-lost';
    padLost.setAttribute('data-testid', 'duo-pad-lost');
    const padIcon = document.createElement('span');
    padIcon.className = 'duo-pad-lost-icon';
    padIcon.setAttribute('data-testid', 'duo-pad-lost-icon');
    padIcon.innerHTML = PAD_SVG;
    const padText = document.createElement('span');
    padText.className = 'duo-pad-lost-text';
    padText.textContent = 'コントローラーを つないでね';
    padLost.append(padIcon, padText);
    padLost.hidden = true;

    // 相手の 向きの 矢印（2 つ）・分割の 線・2P の 頭の 上の「？」
    const arrows: [ArrowEls, ArrowEls] = [this.buildArrow(1), this.buildArrow(2)];
    const line = document.createElement('div');
    line.className = 'duo-split-line';
    line.setAttribute('data-testid', 'duo-split-line');
    line.style.setProperty('--duo-split-px', `${DUO_TUNING.splitLinePx}px`);
    line.hidden = true;
    const question = document.createElement('div');
    question.className = 'duo-p2-question';
    question.setAttribute('data-testid', 'duo-p2-question');
    question.textContent = '？';
    question.hidden = true;

    // 2P の ホットバー（ふつうの Hotbar の 別の 持ち物）とハート（Hearts を 別の 入れものに 作る）
    const hotbar2 = new Hotbar(hud, inv, { showName: () => undefined });
    hotbar2.el.id = 'hotbar-p2';
    hotbar2.el.setAttribute('data-testid', 'duo-hotbar-p2');
    hotbar2.el.hidden = true;
    const root = document.createElement('div');
    root.id = 'duo-p2-root';
    root.hidden = true;
    hud.append(root);
    const hearts2 = new Hearts(root);
    hearts2.el.id = 'hearts-p2';
    hearts2.el.setAttribute('data-testid', 'duo-hearts-p2');
    (hearts2.el.parentElement as HTMLElement).id = 'hud-self-p2';
    hearts2.update(0, FULL_HP, false);

    // 2P の もちもの（右半分。読むだけ。「やめる」の 長押しが ある）
    const panel = document.createElement('div');
    panel.className = 'duo-inv';
    panel.setAttribute('data-testid', 'duo-inv-p2');
    panel.hidden = true;
    const title = document.createElement('div');
    title.className = 'duo-inv-title';
    title.textContent = 'P2 の もちもの';
    const grid = document.createElement('div');
    grid.className = 'duo-inv-grid';
    const cells: SlotEls[] = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const c = createSlotEl();
      cells.push(c);
      grid.append(c.root);
    }
    const quit = document.createElement('button');
    quit.type = 'button';
    quit.className = 'duo-quit';
    quit.setAttribute('data-testid', 'duo-quit');
    const fill = document.createElement('span');
    fill.className = 'duo-quit-fill';
    const text = document.createElement('span');
    text.className = 'duo-quit-text';
    text.textContent = 'ながおし で やめる';
    quit.append(fill, text);
    panel.append(title, grid, quit);
    hud.append(meter, padLost, panel, arrows[0].root, arrows[1].root, line, question);

    // 色は tokens.css の 変数（案 B）。DUO_COLORS は 同じ 値の 写し（palette.test.ts が 見はる）。css は --rk-* を 直接 使う
    document.documentElement.style.setProperty('--duo-p1', DUO_COLORS.p1);
    document.documentElement.style.setProperty('--duo-p2', DUO_COLORS.p2);
    const off = inv.onChange(() => (this.dirty = true));
    return { meter, bar, more, padLost, root, hotbar2, hearts2, arrows, line, question, panel, quit, cells, off };
  }

  /** 矢印 1 つ。who = 矢印が 出る 画面の 持ち主（1 = 1P の 半分。2P を さすので バッジは「P2」）。色は css が 相手の 色に する */
  private buildArrow(who: 1 | 2): ArrowEls {
    const root = document.createElement('div');
    root.className = `duo-arrow duo-arrow-p${who}`;
    root.setAttribute('data-testid', `duo-arrow-p${who}`);
    root.hidden = true;
    const tri = document.createElement('div');
    tri.className = 'duo-arrow-tri';
    const shape = document.createElement('div');
    shape.className = 'duo-arrow-shape';
    tri.append(shape);
    const badge = document.createElement('span');
    badge.className = 'duo-arrow-badge';
    badge.textContent = who === 1 ? 'P2' : 'P1';
    root.append(tri, badge);
    return { root, tri, badge };
  }

  /** 参加した / やめた。やめたら 2 人用の 物を ぜんぶ かくし、1 人の 見た目に もどす */
  setJoined(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    const html = document.documentElement;
    if (on) {
      this.b ??= this.build();
      this.dirty = true;
      this.lastW = -1;
      this.badgePx = 0;
      this.shown = newShown();
      this.d.hotbar1.setAttribute('data-testid', 'duo-hotbar-p1');
      this.d.hearts1.setAttribute('data-testid', 'duo-hearts-p1');
      html.setAttribute('data-duo', '');
    } else {
      html.removeAttribute('data-duo');
      html.style.removeProperty('--duo-scale');
      this.d.hotbar1.removeAttribute('data-testid');
      this.d.hearts1.removeAttribute('data-testid');
    }
    if (!on) this.clearDown();
    const b = this.b;
    if (b) {
      b.meter.hidden = !on;
      b.hotbar2.el.hidden = !on;
      b.root.hidden = !on;
      if (!on) {
        b.padLost.hidden = true;
        b.panel.hidden = true;
        for (const a of b.arrows) a.root.hidden = true;
        b.line.hidden = true;
        b.question.hidden = true;
      }
    }
  }

  /** 2P の ハート（毎ステップ）と、倒れているあいだだけ「たおれちゃった」（COOP-1 3a。出ていないときは 画面に 置かない） */
  updateLife(dt: number, hp: number, invincible: boolean, down: boolean): void {
    const b = this.b;
    if (!b || !this.on) return;
    b.hearts2.update(dt, hp, invincible);
    if (down && !this.downEl) {
      const el = document.createElement('div');
      el.className = 'duo-p2-down';
      el.setAttribute('data-testid', 'duo-p2-down');
      el.textContent = 'たおれちゃった';
      this.d.hud.append(el);
      this.downEl = el;
    } else if (!down) this.clearDown();
  }

  private clearDown(): void {
    this.downEl?.remove();
    this.downEl = null;
  }

  /** 2P の ホットバー（選んでいる マスの 表示を 毎ステップ 直す） */
  update(v: DuoHudView): void {
    const b = this.b;
    if (!b || !this.on) return;
    this.fit();
    b.hotbar2.update();
    const meter = v.meter.toFixed(3);
    if (meter !== this.shown.meter) {
      this.shown.meter = meter;
      b.meter.style.setProperty('--duo-meter', meter);
    }
    const more = v.distance > DUO_TUNING.meterFullTiles;
    if (more !== this.shown.more) {
      this.shown.more = more;
      b.more.hidden = !more;
    }
    if (v.padLost !== this.shown.padLost) {
      this.shown.padLost = v.padLost;
      b.padLost.hidden = !v.padLost;
    }
    if (v.panelOpen !== this.shown.panel) {
      this.shown.panel = v.panelOpen;
      b.panel.hidden = !v.panelOpen;
    }
    this.updateViewParts(b, v);
    if (v.panelOpen && this.dirty) this.paintPanel();
    const quit = v.panelOpen ? v.quitGauge.toFixed(2) : '0';
    if (quit !== this.shown.quit) {
      this.shown.quit = quit;
      b.quit.style.setProperty('--duo-quit', quit);
    }
  }

  /** 相手の 向きの 矢印（変わったときだけ 書く）: 外接の 四角を 先・三角の 角・バッジから 決め、中の 三角と バッジを その 四角の 中に 置く */
  private updateArrow(i: 0 | 1, a: ArrowEls, v: DuoHudArrow, h: number): void {
    const sa = this.shown.arrows[i]!;
    const show = v.opacity > 0.001;
    if (a.root.hidden === show) {
      a.root.hidden = !show;
      if (show) sa.fill(NaN);
    }
    if (!show) return;
    const op = Math.round(v.opacity * 100);
    const x = Math.round(v.x * 10);
    const y = Math.round(v.y * 10);
    const ang = Math.round(v.angle * 10);
    if (op === sa[3] && x === sa[0] && y === sa[1] && ang === sa[2]) return;
    if (op !== sa[3]) a.root.style.opacity = (op / 100).toFixed(2);
    sa[0] = x;
    sa[1] = y;
    sa[2] = ang;
    sa[3] = op;
    if (this.badgePx <= 0) this.badgePx = Math.max(a.badge.offsetWidth, a.badge.offsetHeight);
    const rad = (v.angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const tw = h * ARROW_WIDTH_RATIO;
    const o = ARROW_OUTLINE_PX;
    const br = this.badgePx / 2;
    // 三角の 角: 先 と ねもとの 両はし（ねもとの まん中 = 先 から うしろへ h）
    const bx = v.x - dx * h;
    const by = v.y - dy * h;
    const px = (dy * tw) / 2; // ねもとの 横むき（-dy, dx）の 半分
    const py = (dx * tw) / 2;
    // バッジの 中心: ねもとの すこし うしろ
    const cx = bx - dx * br * ARROW_BADGE_SHIFT;
    const cy = by - dy * br * ARROW_BADGE_SHIFT;
    const left = Math.min(v.x, bx - px, bx + px, cx - br) - o;
    const right = Math.max(v.x, bx - px, bx + px, cx + br) + o;
    const top = Math.min(v.y, by + py, by - py, cy - br) - o;
    const bottom = Math.max(v.y, by + py, by - py, cy + br) + o;
    const st = a.root.style;
    st.left = `${left.toFixed(1)}px`;
    st.top = `${top.toFixed(1)}px`;
    st.width = `${(right - left).toFixed(1)}px`;
    st.height = `${(bottom - top).toFixed(1)}px`;
    a.root.setAttribute('data-angle', String(Math.round(v.angle)));
    const tt = a.tri.style;
    tt.width = `${tw.toFixed(1)}px`;
    tt.height = `${h.toFixed(1)}px`;
    tt.left = `${(v.x - left - tw / 2).toFixed(1)}px`;
    tt.top = `${(v.y - top).toFixed(1)}px`;
    tt.transform = `rotate(${v.angle.toFixed(1)}deg)`;
    const bs = a.badge.style;
    bs.left = `${(cx - left).toFixed(1)}px`;
    bs.top = `${(cy - top).toFixed(1)}px`;
  }

  /** 矢印・分割の 線・「？」（変わったときだけ 書く） */
  private updateViewParts(b: Built, v: DuoHudView): void {
    this.updateArrow(0, b.arrows[0], v.arrows[0], v.arrowHeight);
    this.updateArrow(1, b.arrows[1], v.arrows[1], v.arrowHeight);
    const split = v.view === 'split';
    if (split !== (this.shown.view === 'split')) b.line.hidden = !split;
    this.shown.view = v.view;
    const q = v.question;
    const sq = this.shown.q;
    const qx = q === null ? -1 : Math.round(q.x);
    const qy = q === null ? -1 : Math.round(q.y);
    if (qx !== sq[0] || qy !== sq[1]) {
      sq[0] = qx;
      sq[1] = qy;
      b.question.hidden = q === null;
      if (q !== null) {
        b.question.style.left = `${q.x.toFixed(0)}px`;
        b.question.style.top = `${q.y.toFixed(0)}px`;
      }
    }
  }

  /** 画面の 幅が かわったら、ホットバーを 半分の 幅の 90% に おさまる 倍に 縮める（§3.1） */
  private fit(): void {
    const w = window.innerWidth;
    if (w === this.lastW) return;
    this.lastW = w;
    this.badgePx = 0;
    const hbW = this.d.hotbar1.offsetWidth;
    if (hbW <= 0) {
      this.lastW = -1;
      return;
    }
    const s = Math.min(DUO_TUNING.hotbarFit, (w / 2) * DUO_TUNING.hotbarFit / hbW);
    document.documentElement.style.setProperty('--duo-scale', s.toFixed(4));
  }

  private paintPanel(): void {
    const b = this.b!;
    this.dirty = false;
    const slots = this.d.p2Inventory.slots();
    for (let i = 0; i < b.cells.length; i++) paintSlot(b.cells[i]!, slots[i] ?? null, this.d.p2Inventory.durability(i));
  }

  dispose(): void {
    const b = this.b;
    if (!b) return;
    this.setJoined(false);
    b.off();
    b.hotbar2.dispose();
    b.hearts2.dispose();
    b.root.remove();
    b.meter.remove();
    b.padLost.remove();
    for (const a of b.arrows) a.root.remove();
    b.line.remove();
    b.question.remove();
    b.panel.remove();
    this.b = null;
  }
}
