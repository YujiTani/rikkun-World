import type { BladeStance, BladeState, BladeTech, W2Settings } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { STANCE_KANJI, STANCE_ORDER, TECH_NAME, WEAPON_FX, lockRingVisible, techNameOpacity } from '../fx/weaponFxModel';
import { ruby } from './text';
import './bladeHud.css';

/** かまえの 絵（刀の 向き）。16×16 を 2 倍の SVG。中段 = 前へ 水平、上段 = 上、下段 = 下 */
const ART: Record<BladeStance, string> = {
  chudan: '<rect x="1" y="7" width="3" height="2" fill="#8a5a2b"/><rect x="4" y="6" width="1" height="4" fill="#d6b04c"/><rect x="5" y="7" width="10" height="2" fill="#e8f1ff"/><rect x="5" y="9" width="10" height="1" fill="#9db4d6"/>',
  jodan: '<rect x="7" y="13" width="2" height="3" fill="#8a5a2b"/><rect x="6" y="12" width="4" height="1" fill="#d6b04c"/><rect x="7" y="1" width="2" height="11" fill="#e8f1ff"/><rect x="9" y="1" width="1" height="11" fill="#9db4d6"/>',
  gedan: '<rect x="7" y="0" width="2" height="3" fill="#8a5a2b"/><rect x="6" y="3" width="4" height="1" fill="#d6b04c"/><rect x="7" y="4" width="2" height="11" fill="#e8f1ff"/><rect x="9" y="4" width="1" height="11" fill="#9db4d6"/>',
};

function svg(stance: BladeStance): string {
  return `<svg viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges" aria-hidden="true">${ART[stance]}</svg>`;
}

/**
 * 刀の 画面（WEAPON-2 §3.3）。DOM: `#blade-hud`（刀を 持っている ときだけ 見える）
 * - `.stance[data-stance][data-current]` が 3 つ（中段・上段・下段）。今の かまえは 3 倍・アクセントの わく、ほかは 50%。
 * - `.stance-name`（今の かまえの 名前。ruby つき）・`.stance-key`（R）
 * - `#tech-name`（わざの 名前 24F）・`#tech-lock`（大げさ斬りの 硬直 前半の 灰色の わ）
 * 毎ステップ `update(state)` を 呼ぶ。
 */
export class BladeHud {
  readonly el: HTMLDivElement;
  readonly techEl: HTMLDivElement;
  readonly lockEl: HTMLDivElement;
  private readonly cells = new Map<BladeStance, HTMLDivElement>();
  private readonly nameEl: HTMLDivElement;
  private shownStance: BladeStance | null = null;
  private techAge = -1;
  private lastOpacity = -1;
  private lastLock = false;
  private visible = false;

  constructor(parent: HTMLElement, private readonly settings: () => W2Settings = () => W2_SETTING_DEFAULTS) {
    this.el = document.createElement('div');
    this.el.id = 'blade-hud';
    this.el.hidden = true;
    const row = document.createElement('div');
    row.className = 'stance-row';
    for (const s of STANCE_ORDER) {
      const c = document.createElement('div');
      c.className = 'stance';
      c.dataset.stance = s;
      c.innerHTML = svg(s);
      this.cells.set(s, c);
      row.append(c);
    }
    const key = document.createElement('div');
    key.className = 'stance-key';
    key.textContent = 'R';
    key.title = 'これで かわる';
    row.append(key);
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'stance-name';
    this.el.append(row, this.nameEl);
    this.techEl = document.createElement('div');
    this.techEl.id = 'tech-name';
    this.techEl.hidden = true;
    this.lockEl = document.createElement('div');
    this.lockEl.id = 'tech-lock';
    this.lockEl.hidden = true;
    parent.append(this.el, this.techEl, this.lockEl);
  }

  /** わざを 始めた（名前を 24F 出す） */
  techStarted(tech: BladeTech): void {
    this.techAge = 0;
    this.techEl.textContent = TECH_NAME[tech];
    this.techEl.dataset.tech = tech;
    this.techEl.hidden = false;
    this.lastOpacity = -1;
  }

  /** かまえが かわった（今の 絵が ぽよん） */
  stanceChanged(to: BladeStance): void {
    const el = this.cells.get(to);
    if (el && typeof el.animate === 'function') {
      const ms = (WEAPON_FX.stancePopSteps / 60) * 1000;
      el.animate([{ scale: '1' }, { scale: String(WEAPON_FX.stancePopScale), offset: 0.5 }, { scale: '1' }], { duration: ms, easing: 'ease-out' });
    }
  }

  update(s: BladeState): void {
    const on = s.item !== null;
    if (on !== this.visible) {
      this.visible = on;
      this.el.hidden = !on;
    }
    if (on && s.stance !== this.shownStance) {
      this.shownStance = s.stance;
      for (const [k, c] of this.cells) {
        if (k === s.stance) c.dataset.current = 'true';
        else delete c.dataset.current;
      }
      const [kanji, yomi] = STANCE_KANJI[s.stance];
      this.nameEl.innerHTML = ruby(kanji, yomi);
      this.nameEl.dataset.stance = s.stance;
    }
    if (this.techAge >= 0) {
      this.techAge++;
      const o = techNameOpacity(this.techAge);
      if (o !== this.lastOpacity) {
        this.lastOpacity = o;
        this.techEl.style.opacity = String(o);
      }
      if (o <= 0 || !on) {
        this.techAge = -1;
        this.techEl.hidden = true;
      }
    }
    const f = this.settings().bladeTech.kesa;
    const lock = on && lockRingVisible(s, f.startup, f.active, f.recovery);
    if (lock !== this.lastLock) {
      this.lastLock = lock;
      this.lockEl.hidden = !lock;
    }
  }

  dispose(): void {
    this.el.remove();
    this.techEl.remove();
    this.lockEl.remove();
  }
}
