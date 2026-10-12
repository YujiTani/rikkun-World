import type { ItemId } from '../contracts';
import { drawPixels, itemIconUrl } from './itemIcon';
import { HEART_CONFIG, HeartsModel, heartPixels, type HeartState } from './heartsModel';
import './hearts.css';

const urls = new Map<HeartState, string>();

/** ハートの絵（data URL。使いまわす） */
function heartUrl(state: HeartState): string {
  let u = urls.get(state);
  if (!u) {
    const c = document.createElement('canvas');
    drawPixels(c, heartPixels(state));
    u = c.toDataURL();
    urls.set(state, u);
  }
  return u;
}

/** バーストの 4 つの赤い四角が飛ぶ向き */
const BIT_DIRS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

/**
 * ホットバーのすぐ上の ハート 10 こ（M3 §3.3）。毎ステップ update(dt, hp, invincible) を呼ぶ。
 * DOM: `#hearts` の中に `.heart[data-state=full|half|empty]` が 10 こ。
 */
export class Hearts {
  readonly model = new HeartsModel();
  readonly el: HTMLDivElement;
  private readonly cellEls: HTMLDivElement[] = [];
  private readonly imgs: HTMLImageElement[] = [];
  private readonly bits: HTMLSpanElement[][] = [];
  private shown: Array<HeartState | null> = [];
  /** ハートの左の防具の絵（M4 §3）。DOM: `.hearts-armor` の中に `img[data-item]` */
  readonly armorEl: HTMLDivElement;
  private armorKey = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'hearts';
    this.el.setAttribute('aria-hidden', 'true');
    this.armorEl = document.createElement('div');
    this.armorEl.className = 'hearts-armor';
    this.el.append(this.armorEl);
    for (let i = 0; i < this.model.count; i++) {
      const cell = document.createElement('div');
      cell.className = 'heart';
      const img = document.createElement('img');
      img.className = 'heart-img';
      img.alt = '';
      cell.append(img);
      const bits: HTMLSpanElement[] = [];
      for (let b = 0; b < 4; b++) {
        const s = document.createElement('span');
        s.className = 'heart-bit';
        s.hidden = true;
        cell.append(s);
        bits.push(s);
      }
      this.el.append(cell);
      this.cellEls.push(cell);
      this.imgs.push(img);
      this.bits.push(bits);
      this.shown.push(null);
    }
    parent.append(this.el);
    this.update(0, this.model.hp, false);
  }

  /** 着ている防具の絵を出す（`armor.get().hudIcons` と同じ。何も着ていなければ空） */
  setArmor(icons: readonly ItemId[]): void {
    const key = icons.join(',');
    if (key === this.armorKey) return;
    this.armorKey = key;
    this.armorEl.replaceChildren();
    for (const it of icons) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = itemIconUrl(it);
      img.dataset.item = it;
      this.armorEl.append(img);
    }
  }

  update(dt: number, hp: number, invincible: boolean): void {
    const m = this.model;
    m.set(hp, invincible);
    m.update(dt);
    this.el.dataset.invincible = String(invincible);
    this.el.dataset.hp = String(m.hp);
    this.el.dataset.low = String(m.low());
    this.el.style.setProperty('--shake', `${m.rowOffsetX()}`);
    m.cells.forEach((cell, i) => {
      const el = this.cellEls[i];
      if (this.shown[i] !== cell.state) {
        this.imgs[i].src = heartUrl(cell.state);
        el.dataset.state = cell.state;
        this.shown[i] = cell.state;
      }
      el.style.setProperty('--hop', `${m.cellOffsetY(i)}`);
      el.style.setProperty('--pop', `${m.cellScale(i)}`);
      const burst = cell.burstT >= 0;
      const k = burst ? cell.burstT / HEART_CONFIG.burstSeconds : 0;
      this.bits[i].forEach((bit, b) => {
        bit.hidden = !burst;
        if (!burst) return;
        const [dx, dy] = BIT_DIRS[b];
        bit.style.setProperty('--bx', `${dx * k * 1.1}`);
        bit.style.setProperty('--by', `${dy * k * 1.1 - k * 0.6}`);
        bit.style.opacity = String(1 - k);
      });
    });
  }

  dispose(): void {
    this.el.remove();
  }
}
