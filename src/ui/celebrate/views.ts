import { createButton, createChip, createMedal, createModal, popAnimation, setRarity, type MedalTier, type Rarity4 } from '../theme';
import { CELEBRATE } from './config';
import type { BannerLook } from './bannerModel';
import { makeRng, poyonScale, type SparkPool } from './sparkModel';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.append(e);
  return e;
}

/** 星の位置（横断幕・メダルのまわり。8 こ、2 組が 交互） */
function makeStars(parent: HTMLElement, w: number, h: number): HTMLElement[] {
  const stars: HTMLElement[] = [];
  for (let i = 0; i < CELEBRATE.starCount; i++) {
    const s = el('div', 'cel-star', parent);
    const a = (i / CELEBRATE.starCount) * Math.PI * 2;
    s.style.left = `${50 + 52 * Math.cos(a) * (w / Math.max(w, h))}%`;
    s.style.top = `${50 + 52 * Math.sin(a) * (h / Math.max(w, h))}%`;
    s.style.opacity = '0';
    stars.push(s);
  }
  return stars;
}

export function paintStars(stars: readonly HTMLElement[], light: readonly number[]): void {
  stars.forEach((s, i) => {
    s.style.opacity = String(light[i % CELEBRATE.starGroups] ?? 0);
  });
}

/** つぶ・輪・ぽよん・×N（画面の上の 固定の入れもの。毎フレーム new しない） */
export class EffectsView {
  readonly layer = el('div', 'cel-layer');
  private readonly sparks: HTMLElement[] = [];
  private readonly rings: { el: HTMLElement; x: number; y: number; age: number }[] = [];
  private readonly combo = el('div', 'cel-combo', this.layer);
  private poyon: { tile: HTMLElement; age: number } | null = null;
  private comboPos = { x: 0, y: 0 };

  constructor(parent: HTMLElement, private readonly pool: SparkPool) {
    for (let i = 0; i < pool.max; i++) {
      const s = el('div', 'cel-spark', this.layer);
      s.hidden = true;
      this.sparks.push(s);
    }
    for (let i = 0; i < 3; i++) {
      const r = el('div', 'cel-ring', this.layer);
      r.hidden = true;
      this.rings.push({ el: r, x: 0, y: 0, age: -1 });
    }
    this.combo.hidden = true;
    parent.append(this.layer);
  }

  startPoyon(tile: HTMLElement): void {
    if (this.poyon && this.poyon.tile !== tile) this.poyon.tile.style.transform = '';
    this.poyon = { tile, age: 0 };
  }

  startRing(x: number, y: number, rarity: Rarity4): void {
    const r = this.rings.find((q) => q.age < 0) ?? this.rings[0];
    r.x = x;
    r.y = y;
    r.age = 0;
    setRarity(r.el, rarity);
    r.el.hidden = false;
  }

  setCombo(n: number, x: number, y: number): void {
    this.comboPos = { x, y };
    if (n >= 2) {
      this.combo.textContent = `×${n}`;
      popAnimation(this.combo);
    }
  }

  /** 毎ステップ: amount = 進める画面ステップ */
  step(amount: number, comboLabel: number): void {
    if (this.poyon) {
      this.poyon.age += amount;
      const t = this.poyon.age / CELEBRATE.poyonSteps;
      this.poyon.tile.style.transform = t >= 1 ? '' : `scale(${poyonScale(t)})`;
      if (t >= 1) this.poyon = null;
    }
    this.pool.step(amount);
    this.sparks.forEach((e, i) => {
      const s = this.pool.items[i];
      if (s.life <= 0) {
        e.hidden = true;
        return;
      }
      const p = this.pool.posAt(s);
      e.hidden = false;
      e.classList.toggle('is-gold', s.color === 1);
      e.style.opacity = String(p.opacity);
      e.style.transform = `translate(${p.x}px, ${p.y}px)`;
    });
    for (const r of this.rings) {
      if (r.age < 0) continue;
      r.age += amount;
      const t = r.age / CELEBRATE.ringSteps;
      if (t >= 1) {
        r.age = -1;
        r.el.hidden = true;
        continue;
      }
      const sc = 1 + 1.5 * t;
      r.el.style.opacity = String(1 - t);
      r.el.style.transform = `translate(${r.x - 28}px, ${r.y - 28}px) scale(${sc})`;
    }
    this.combo.hidden = comboLabel < 2;
    if (comboLabel >= 2) this.combo.style.transform = `translate(${this.comboPos.x}px, ${this.comboPos.y}px)`;
  }

  dispose(): void {
    this.layer.remove();
  }
}

/** 横断幕（はじめて作った・焼いた） */
export class BannerView {
  readonly root = el('div', 'cel-layer');
  private readonly wrap = el('div', 'cel-banner-wrap', this.root);
  private readonly halo = el('div', 'cel-halo', this.wrap);
  private readonly banner = el('div', 'cel-banner', this.wrap);
  private readonly disc = el('div', 'cel-banner__disc', this.banner);
  private readonly icon = el('img', 'cel-banner__icon rk-art', this.disc);
  private readonly head = el('div', 'cel-banner__head', el('div', 'cel-banner__text', this.banner));
  private readonly name = el('div', 'cel-banner__name', this.head.parentElement!);
  private readonly shine = el('div', 'cel-banner__shine', this.banner);
  private readonly stars = makeStars(this.wrap, 720, 140);
  private readonly confetti: HTMLElement[] = [];
  private readonly confettiSeed: { x: number; sway: number; speed: number; color: number }[] = [];
  private shownRecipe: string | null = null;

  constructor(parent: HTMLElement) {
    el('div', 'cel-banner__sea rk-seigaiha', this.banner);
    this.icon.alt = '';
    const rng = makeRng(77);
    for (let i = 0; i < CELEBRATE.confettiCount; i++) {
      const c = el('div', 'cel-confetti', this.root);
      c.hidden = true;
      const col = i % 3;
      c.style.background = col === 0 ? 'var(--rk-shu)' : col === 1 ? 'var(--rk-text)' : 'var(--rk-accent)';
      this.confetti.push(c);
      this.confettiSeed.push({ x: rng(), sway: rng() * 6.28, speed: 0.7 + rng() * 0.6, color: col });
    }
    this.wrap.hidden = true;
    parent.append(this.root);
  }

  /** look が null なら 隠す。iconUrl/name/rarity は 出し始めに 1 回だけ使う */
  paint(look: BannerLook | null, info: { name: string; iconUrl: string; rarity: Rarity4; stars: number } | null): void {
    if (!look || !info) {
      this.wrap.hidden = true;
      this.shownRecipe = null;
      for (const c of this.confetti) c.hidden = true;
      return;
    }
    if (this.shownRecipe !== look.recipe + look.kind) {
      this.shownRecipe = look.recipe + look.kind;
      this.head.textContent = look.kind === 'bake' ? 'はじめて やいた！' : 'はじめて つくった！';
      this.name.textContent = `${info.name} ${'★'.repeat(info.stars)}`;
      this.icon.src = info.iconUrl;
      setRarity(this.wrap, info.rarity);
    }
    this.wrap.hidden = false;
    this.wrap.style.opacity = String(look.opacity);
    this.wrap.style.transform = `translateY(${look.offsetY}px)`;
    this.banner.style.transform = `perspective(900px) rotateX(${look.rotationDeg % 360}deg) rotateZ(${look.tiltDeg}deg) scale(${look.scale})`;
    this.halo.style.transform = `rotate(${look.haloDeg}deg)`;
    this.halo.style.opacity = look.haloDeg > 0 ? '1' : '0';
    this.shine.hidden = look.shine < 0;
    if (look.shine >= 0) this.shine.style.left = `${look.shine * 100}%`;
    paintStars(this.stars, look.starLight);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.confetti.forEach((c, i) => {
      if (look.confetti < 0) {
        c.hidden = true;
        return;
      }
      const s = this.confettiSeed[i];
      c.hidden = false;
      const x = w * (0.2 + 0.6 * s.x) + Math.sin(look.confetti * 12 * s.speed + s.sway) * 24;
      const y = -20 + look.confetti * s.speed * h * 0.8;
      c.style.transform = `translate(${x}px, ${y}px) rotate(${look.confetti * 540 * s.speed}deg)`;
    });
  }

  dispose(): void {
    this.root.remove();
  }
}

export interface ModalRowInfo {
  name: string;
  tier: MedalTier;
  artUrl: string;
}

/** おめでとう画面 */
export class ModalView {
  readonly parts = createModal();
  private readonly title = el('div', 'cel-title');
  private readonly main = el('div', 'cel-main');
  private readonly mainName = el('div', 'cel-main-name');
  private readonly rows = el('div', 'cel-rows');
  private readonly more = el('div', 'cel-more');
  private readonly closeWrap = el('div', 'cel-close-wrap');
  readonly button = createButton({ text: 'とじる', kind: 'primary', disabled: true });
  private stars: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    this.parts.scrim.classList.add('cel-scrim');
    this.parts.modal.classList.add('cel-modal');
    this.title.textContent = 'おめでとう！';
    this.button.classList.add('cel-close');
    this.closeWrap.append(this.button);
    this.parts.modal.append(this.title, this.main, this.mainName, this.rows, this.more, this.closeWrap);
    this.parts.scrim.hidden = true;
    parent.append(this.parts.scrim);
  }

  show(main: ModalRowInfo, rows: readonly ModalRowInfo[], more: number): void {
    this.parts.scrim.hidden = false;
    this.main.replaceChildren(createMedal(main.tier, 128, main.artUrl));
    this.stars = makeStars(this.main, 224, 144);
    this.main.append(...this.stars);
    this.mainName.textContent = main.name;
    this.rows.replaceChildren(
      ...rows.map((r) => {
        const row = el('div', 'cel-row');
        const t = document.createElement('span');
        t.textContent = r.name;
        row.append(createMedal(r.tier, 40, r.artUrl), t);
        return row;
      }),
    );
    this.more.hidden = more <= 0;
    this.more.textContent = more > 0 ? `ほか ${more} こ` : '';
    this.rotateMain(0);
    popAnimation(this.title);
  }

  hide(): void {
    this.parts.scrim.hidden = true;
  }

  rotateMain(age: number): void {
    const m = this.main.firstElementChild as HTMLElement | null;
    if (!m) return;
    const t = Math.min(1, age / 36);
    const e = 1 - (1 - t) ** 3;
    m.style.transform = `rotateY(${720 * e}deg) scale(${0.3 + 0.7 * e})`;
  }

  paint(age: number, enabled: boolean, delay: number, starLight: readonly number[]): void {
    this.rotateMain(age);
    paintStars(this.stars, starLight);
    const p = Math.min(1, age / Math.max(1, delay));
    this.closeWrap.style.setProperty('--p', String(enabled ? 1 : p));
    if (this.button.disabled === enabled) {
      this.button.disabled = !enabled;
      this.button.classList.toggle('is-disabled', !enabled);
    }
  }

  isOnButton(target: EventTarget | null): boolean {
    return target instanceof Node && this.button.contains(target);
  }
}

/** ロックがかけ直せなかったときの札 */
export function createLockTag(parent: HTMLElement, onClick: () => void): HTMLElement {
  const tag = createChip({ text: 'クリック で つづける' });
  tag.classList.add('cel-lock-tag');
  tag.hidden = true;
  tag.addEventListener('click', onClick);
  parent.append(tag);
  return tag;
}
