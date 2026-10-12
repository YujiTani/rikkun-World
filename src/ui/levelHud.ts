import type { LevelState } from '../level/LevelSystem';
import './levelHud.css';

const SPARKLES = 14;
/** 演出を出している長さ（秒）。点滅はしない（ゆっくり ふわっと出て消える） */
export const LEVEL_UP_SECONDS = 2.4;

/**
 * A「じぶん」のかたまり（§3.6 (1)）: レベル・バー・ハート・防具を 1 まいにまとめる入れもの。
 * ホットバーの左はしにそろえて、すぐ上に出す。LevelHud と Hearts が同じものを使う（先に作ったほうが作る）。
 */
export function selfCluster(parent: HTMLElement): HTMLDivElement {
  let el = parent.querySelector<HTMLDivElement>(':scope > #hud-self');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hud-self';
    el.className = 'hud-cluster';
    parent.append(el);
  }
  return el;
}

/**
 * レベルと経験値のバー（ハートのすぐ上）と、レベルアップの演出。
 * DOM: `#levelbar`（`data-level`・`data-xp`・`data-next`）、`#levelup`（出ているあいだ `hidden` でない）
 */
export class LevelHud {
  readonly barEl: HTMLDivElement;
  readonly upEl: HTMLDivElement;
  private readonly labelEl: HTMLSpanElement;
  private readonly wordEl: HTMLSpanElement;
  private readonly badgeEl: HTMLSpanElement;
  private readonly numEl: HTMLSpanElement;
  private readonly fillEl: HTMLDivElement;
  private left = 0;
  private shownKey = '';

  constructor(parent: HTMLElement) {
    this.barEl = document.createElement('div');
    this.barEl.id = 'levelbar';
    this.barEl.setAttribute('aria-hidden', 'true');
    this.labelEl = document.createElement('span');
    this.labelEl.className = 'lv-label';
    this.wordEl = document.createElement('span');
    this.wordEl.className = 'lv-word';
    this.badgeEl = document.createElement('span');
    this.badgeEl.className = 'lv-badge';
    this.labelEl.append(this.wordEl, this.badgeEl);
    const track = document.createElement('div');
    track.className = 'lv-track';
    this.fillEl = document.createElement('div');
    this.fillEl.className = 'lv-fill';
    track.append(this.fillEl);
    this.numEl = document.createElement('span');
    this.numEl.className = 'lv-num';
    this.barEl.append(this.labelEl, track, this.numEl);

    this.upEl = document.createElement('div');
    this.upEl.id = 'levelup';
    this.upEl.hidden = true;
    const text = document.createElement('div');
    text.className = 'lu-text';
    text.textContent = 'レベル アップ！';
    this.upEl.append(text);
    for (let i = 0; i < SPARKLES; i++) {
      const s = document.createElement('span');
      s.className = 'lu-star';
      s.textContent = '★';
      // 決まった並び（乱数を使わない）
      const a = (i / SPARKLES) * Math.PI * 2;
      s.style.setProperty('--sx', `${Math.round(Math.cos(a) * (120 + (i % 3) * 50))}px`);
      s.style.setProperty('--sy', `${Math.round(Math.sin(a) * (70 + (i % 4) * 25)) - 30}px`);
      s.style.setProperty('--sd', `${(i % 5) * 0.12}s`);
      this.upEl.append(s);
    }
    selfCluster(parent).append(this.barEl);
    parent.append(this.upEl);
    this.update({ level: 1, xp: 0, next: 5 });
  }

  update(st: LevelState): void {
    const key = `${st.level}/${st.xp}/${st.next}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.wordEl.textContent = 'レベル ';
    this.badgeEl.textContent = String(st.level);
    this.numEl.textContent = `${st.xp} / ${st.next}`;
    this.fillEl.style.width = `${Math.min(100, (st.xp / st.next) * 100)}%`;
    this.barEl.dataset.level = String(st.level);
    this.barEl.dataset.xp = String(st.xp);
    this.barEl.dataset.next = String(st.next);
  }

  /** レベルアップの演出を始める */
  celebrate(): void {
    this.left = LEVEL_UP_SECONDS;
    // いちど外して付けなおすと、動きが最初からになる
    this.upEl.hidden = true;
    void this.upEl.offsetWidth;
    this.upEl.hidden = false;
  }

  /** 演出が出ているか */
  celebrating(): boolean {
    return !this.upEl.hidden;
  }

  tick(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0) this.upEl.hidden = true;
  }
}
