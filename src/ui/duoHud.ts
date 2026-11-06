/**
 * COOP-1（docs/design/COOP-1.md §3.1・§9.4）: 2 人のときの HUD。
 * 2P の ホットバー・ハート・もちもの、距離メーター、パッドぬけの 文。参加するまで DOM を 作らない（1 人のときは 今までと 同じ）。
 * data-testid は e2e/helpers/duoUi.ts の 約束どおり。
 */
import type { Inventory } from '../contracts';
import { DUO_COLORS, DUO_TUNING } from '../duo/tuning';
import type { DuoTier } from '../duo/types';
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
}

interface Built {
  meter: HTMLDivElement;
  bar: HTMLDivElement;
  more: HTMLSpanElement;
  padLost: HTMLDivElement;
  root: HTMLDivElement;
  hotbar2: Hotbar;
  hearts2: Hearts;
  panel: HTMLDivElement;
  quit: HTMLButtonElement;
  cells: SlotEls[];
  off: () => void;
}

/** 満タンの ハート（体力 20 = 10 こ）。2P の ダメージは 作業 3 */
const FULL_HP = HEART_CONFIG.count * 2;

export class DuoHud {
  private b: Built | null = null;
  private on = false;
  private dirty = true;
  private lastW = -1;
  private tier: DuoTier | -1 = -1;

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
    const pin1 = document.createElement('span');
    pin1.className = 'duo-pin duo-pin-1';
    pin1.textContent = '▼P1';
    const pin2 = document.createElement('span');
    pin2.className = 'duo-pin duo-pin-2';
    pin2.textContent = '▼P2';
    const more = document.createElement('span');
    more.className = 'duo-more';
    more.textContent = '▶';
    more.hidden = true;
    track.append(bar, mark, pin1, pin2, more);
    meter.append(track);

    const padLost = document.createElement('div');
    padLost.className = 'duo-pad-lost';
    padLost.setAttribute('data-testid', 'duo-pad-lost');
    padLost.textContent = 'コントローラーを つないでね';
    padLost.hidden = true;

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
    hud.append(meter, padLost, panel);

    document.documentElement.style.setProperty('--duo-p1', DUO_COLORS.p1);
    document.documentElement.style.setProperty('--duo-p2', DUO_COLORS.p2);
    const off = inv.onChange(() => (this.dirty = true));
    return { meter, bar, more, padLost, root, hotbar2, hearts2, panel, quit, cells, off };
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
      this.d.hotbar1.setAttribute('data-testid', 'duo-hotbar-p1');
      this.d.hearts1.setAttribute('data-testid', 'duo-hearts-p1');
      html.setAttribute('data-duo', '');
    } else {
      html.removeAttribute('data-duo');
      html.style.removeProperty('--duo-scale');
      this.d.hotbar1.removeAttribute('data-testid');
      this.d.hearts1.removeAttribute('data-testid');
    }
    const b = this.b;
    if (b) {
      b.meter.hidden = !on;
      b.hotbar2.el.hidden = !on;
      b.root.hidden = !on;
      if (!on) {
        b.padLost.hidden = true;
        b.panel.hidden = true;
      }
    }
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
    b.meter.style.setProperty('--duo-meter', v.meter.toFixed(4));
    b.more.hidden = v.distance <= DUO_TUNING.meterFullTiles;
    b.padLost.hidden = !v.padLost;
    b.panel.hidden = !v.panelOpen;
    if (v.panelOpen) {
      if (this.dirty) this.paintPanel();
      b.quit.style.setProperty('--duo-quit', v.quitGauge.toFixed(3));
    } else b.quit.style.setProperty('--duo-quit', '0');
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
    b.panel.remove();
    this.b = null;
  }
}
