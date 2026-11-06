import type { LevelState } from '../level/LevelSystem';
import { levelBarView } from './levelHudModel';
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

/** LevelHud の 置き場所（2 人あそびの 2P は 自分の かたまりと id の 末尾を 渡す） */
export interface LevelHudOpts {
  /** バーを 入れる かたまり。省くと 1P の `#hud-self` */
  cluster?: HTMLElement;
  /** id の 末尾（2P は `-p2`）。省くと 1P の `#levelbar`・`#levelup` */
  idSuffix?: string;
}

/**
 * レベルと経験値のバー（ハートのすぐ上）と、レベルアップの演出。1P も 2P も この 1 つの 作りを 使う。
 * DOM: `#levelbar`（`data-level`・`data-xp`・`data-next`）、`#levelup`（出ているあいだ `hidden` でない）。
 * 2P は `#levelbar-p2`・`#levelup-p2`。見た目の css は class（`.levelbar`・`.levelup`）で 共通。
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

  constructor(parent: HTMLElement, opts: LevelHudOpts = {}) {
    const suffix = opts.idSuffix ?? '';
    this.barEl = document.createElement('div');
    this.barEl.id = `levelbar${suffix}`;
    this.barEl.className = 'levelbar';
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
    this.upEl.id = `levelup${suffix}`;
    this.upEl.className = 'levelup';
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
    (opts.cluster ?? selfCluster(parent)).append(this.barEl);
    parent.append(this.upEl);
    this.update({ level: 1, xp: 0, next: 5 });
  }

  update(st: LevelState): void {
    const key = `${st.level}/${st.xp}/${st.next}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.wordEl.textContent = 'レベル ';
    const v = levelBarView(st);
    this.badgeEl.textContent = v.badge;
    this.numEl.textContent = v.num;
    this.fillEl.style.width = `${v.fillPct}%`;
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
