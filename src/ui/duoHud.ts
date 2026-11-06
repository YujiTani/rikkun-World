/**
 * COOP-1（docs/design/COOP-1.md §3.1・§9.4）: 2 人のときの HUD。
 * 2P の ホットバー・ハート・もちもの、距離メーター、パッドぬけの 文。参加するまで DOM を 作らない（1 人のときは 今までと 同じ）。
 * data-testid は e2e/helpers/duoUi.ts の 約束どおり。
 */
import type { Inventory } from '../contracts';
import { DUO_COLORS, DUO_TUNING } from '../duo/tuning';
import type { DuoTier, DuoView } from '../duo/types';
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

export interface DuoHudView {
  tier: DuoTier;
  /** 棒の 長さ 0〜1 */
  meter: number;
  distance: number;
  padLost: boolean;
  /** 「やめる」ゲージ 0〜1 */
  quitGauge: number;
  panelOpen: boolean;
  /** 画面の ようす（ルーペ・分割の 部品を 出し入れ する） */
  view: DuoView;
  /** ルーペ（丸）の 今の 位置と 大きさ（CSS px。中心 x・y と 直径 d）。出さない ときは null */
  loupe: { x: number; y: number; d: number } | null;
  /** ルーペの わくの 太さ(px) */
  loupeBorderPx: number;
  /** ルーペの 外の 三角が 指す 向き（度。画面で 右 = 0・下 = 90） */
  arrowDeg: number;
  /** 2P の 頭の 上の「？」を 出す 画面の 位置（CSS px）。出さない ときは null */
  question: { x: number; y: number } | null;
}

interface Built {
  meter: HTMLDivElement;
  bar: HTMLDivElement;
  more: HTMLSpanElement;
  padLost: HTMLDivElement;
  root: HTMLDivElement;
  hotbar2: Hotbar;
  hearts2: Hearts;
  loupe: HTMLDivElement;
  arrow: HTMLDivElement;
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

/** 満タンの ハート（体力 20 = 10 こ）。2P の ダメージは 作業 3 */
const FULL_HP = HEART_CONFIG.count * 2;

export class DuoHud {
  private b: Built | null = null;
  private on = false;
  private dirty = true;
  /** 「たおれちゃった」（倒れているあいだだけ ある） */
  private downEl: HTMLDivElement | null = null;
  private lastW = -1;
  private tier: DuoTier | -1 = -1;
  /** 画面に 書いた 最後の 値（変わらなければ style・hidden を 書かない） */
  private shown = { meter: '', more: false, padLost: false, panel: false, quit: '', view: '' as string, lp: [NaN, NaN, NaN, NaN, NaN, 0] as number[], q: [NaN, NaN, 0] as number[], tier: -1 };

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
    const mark = document.createElement('div');
    mark.className = 'duo-mark';
    mark.setAttribute('data-testid', 'duo-meter-mark');
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
    track.append(bar, mark, pin1, pin2, more);
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

    // ルーペの 丸わく・外の 三角・分割の 線・2P の 頭の 上の「？」
    const loupe = document.createElement('div');
    loupe.className = 'duo-loupe';
    loupe.setAttribute('data-testid', 'duo-loupe');
    loupe.hidden = true;
    const arrow = document.createElement('div');
    arrow.className = 'duo-loupe-arrow';
    arrow.setAttribute('data-testid', 'duo-loupe-arrow');
    loupe.append(arrow);
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
    hud.append(meter, padLost, panel, loupe, line, question);

    // 色は tokens.css の 変数（案 B）。DUO_COLORS は 同じ 値の 写し（palette.test.ts が 見はる）。css は --rk-* を 直接 使う
    document.documentElement.style.setProperty('--duo-p1', DUO_COLORS.p1);
    document.documentElement.style.setProperty('--duo-p2', DUO_COLORS.p2);
    DUO_COLORS.tier.forEach((c, i) => document.documentElement.style.setProperty(`--duo-tier-${i}`, c));
    const off = inv.onChange(() => (this.dirty = true));
    return { meter, bar, more, padLost, root, hotbar2, hearts2, loupe, arrow, line, question, panel, quit, cells, off };
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
      this.tier = -1;
      this.shown = { meter: '', more: false, padLost: false, panel: false, quit: '', view: '', lp: [NaN, NaN, NaN, NaN, NaN, 0] as number[], q: [NaN, NaN, 0] as number[], tier: -1 };
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
        b.loupe.hidden = true;
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
    if (v.tier !== this.tier) {
      this.tier = v.tier;
      b.meter.dataset.tier = String(v.tier);
    }
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

  /** ルーペ・外の 三角・分割の 線・「？」（変わったときだけ 書く） */
  private updateViewParts(b: Built, v: DuoHudView): void {
    const lp = v.loupe;
    const sl = this.shown.lp;
    const lx = lp === null ? -1 : Math.round(lp.x * 10);
    const ly = lp === null ? -1 : Math.round(lp.y * 10);
    const ld = lp === null ? -1 : Math.round(lp.d * 10);
    const la = Math.round(v.arrowDeg);
    if (lx !== sl[0] || ly !== sl[1] || ld !== sl[2] || v.loupeBorderPx !== sl[3] || la !== sl[4]) {
      sl[0] = lx;
      sl[1] = ly;
      sl[2] = ld;
      sl[3] = v.loupeBorderPx;
      sl[4] = la;
      b.loupe.hidden = lp === null;
      if (lp !== null) {
        const st = b.loupe.style;
        st.left = `${(lp.x - lp.d / 2).toFixed(1)}px`;
        st.top = `${(lp.y - lp.d / 2).toFixed(1)}px`;
        st.width = st.height = `${lp.d.toFixed(1)}px`;
        // 外の 三角: ルーペの ふちの すぐ 外（指す 向きに おく）。ふちの 太さは 内がわに ふくまれる
        const rad = (v.arrowDeg * Math.PI) / 180;
        const r = lp.d / 2 + DUO_TUNING.loupeArrowGapPx;
        const c = lp.d / 2 - v.loupeBorderPx; // 子の 位置は ふちの 内がわ(padding box)から 数える
        b.arrow.style.left = `${(c + Math.cos(rad) * r).toFixed(1)}px`;
        b.arrow.style.top = `${(c + Math.sin(rad) * r).toFixed(1)}px`;
        b.arrow.style.transform = `translate(-50%, -50%) rotate(${(v.arrowDeg + 90).toFixed(0)}deg)`;
        b.arrow.setAttribute('data-angle', String(Math.round(v.arrowDeg)));
      }
    }
    if (v.tier !== this.shown.tier) {
      this.shown.tier = v.tier;
      b.loupe.dataset.tier = String(v.tier);
    }
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
    b.loupe.remove();
    b.line.remove();
    b.question.remove();
    b.panel.remove();
    this.b = null;
  }
}
