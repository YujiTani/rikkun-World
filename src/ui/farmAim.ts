import type { FarmAim } from '../contracts';
import { extraIconUrl } from './itemIcon';
import { farmAimView } from './farmAimModel';
import './farmAim.css';

/**
 * ねらった作物の しるし（HUD）。まる 4 つ・しずく・くらい ときの 月と文。DOM: `#farm-aim`
 * 毎ステップ `update(farm.aim(...) , 名前)`（ねらい が 無ければ null）。明るくなった次のステップで 消える
 */
export class FarmAimHud {
  readonly el: HTMLDivElement;
  private readonly name: HTMLSpanElement;
  private readonly dots: HTMLSpanElement[] = [];
  private readonly drop: HTMLImageElement;
  private readonly moon: HTMLImageElement;
  private readonly dark: HTMLSpanElement;
  private key = '';

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'farm-aim';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    this.name = document.createElement('span');
    this.name.className = 'farm-aim__name';
    const dots = document.createElement('span');
    dots.className = 'farm-aim__dots';
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('i');
      d.className = 'farm-aim__dot';
      this.dots.push(d);
      dots.append(d);
    }
    this.drop = document.createElement('img');
    this.drop.id = 'farm-aim-drop';
    this.drop.className = 'farm-aim__art rk-art';
    this.drop.alt = '';
    this.drop.src = extraIconUrl('droplet');
    this.moon = document.createElement('img');
    this.moon.id = 'farm-aim-moon';
    this.moon.className = 'farm-aim__art rk-art';
    this.moon.alt = '';
    this.moon.src = extraIconUrl('moon');
    this.dark = document.createElement('span');
    this.dark.id = 'farm-aim-dark';
    this.dark.className = 'farm-aim__dark';
    this.el.append(this.name, dots);
    parent.append(this.el);
  }

  update(aim: FarmAim | null, label = ''): void {
    const v = farmAimView(aim);
    const key = v ? `${label}|${v.dots.join()}|${v.dim}|${v.droplet}` : '';
    if (key === this.key) return;
    this.key = key;
    this.el.hidden = !v;
    if (!v) return;
    this.name.textContent = label;
    this.name.hidden = label === '';
    this.el.dataset.dim = String(v.dim);
    this.dots.forEach((d, i) => {
      d.dataset.state = v.dots[i];
      d.hidden = v.soilOnly;
    });
    // 暗い・しずく の要素は あるときだけ DOM に入れる（かわいた はたけ には しずく の要素が無い）
    this.present(this.drop, v.droplet);
    this.present(this.moon, v.moon);
    this.present(this.dark, v.darkText !== null);
    this.dark.textContent = v.darkText ?? '';
  }

  private present(el: HTMLElement, on: boolean): void {
    if (on && !el.isConnected) this.el.append(el);
    else if (!on && el.isConnected) el.remove();
  }

  /** テスト・窓口用: いま出している しるし */
  current(): { dots: string[]; droplet: boolean; dark: boolean; text: string } | null {
    if (this.el.hidden) return null;
    return {
      dots: this.dots.filter((d) => !d.hidden).map((d) => d.dataset.state ?? ''),
      droplet: this.drop.isConnected,
      dark: this.moon.isConnected,
      text: this.dark.textContent ?? '',
    };
  }
}
