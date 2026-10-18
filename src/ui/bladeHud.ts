import type { BladeStance, BladeState, BladeTech, W2Settings } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { lockRingVisible } from '../fx/weaponFxModel';
import './bladeHud.css';

/**
 * 刀の 画面（FIX-katana-tune で かまえ アイコン・わざの 名前は 廃止）。
 * DOM: `#tech-lock`（大げさ斬りの 硬直 前半の 灰色の わ）だけ。
 * 毎ステップ `update(state)` を 呼ぶ。
 */
export class BladeHud {
  readonly lockEl: HTMLDivElement;
  private lastLock = false;

  constructor(parent: HTMLElement, private readonly settings: () => W2Settings = () => W2_SETTING_DEFAULTS) {
    this.lockEl = document.createElement('div');
    this.lockEl.id = 'tech-lock';
    this.lockEl.hidden = true;
    parent.append(this.lockEl);
  }

  /** わざの 名前は 出さない（FIX-katana-tune）。呼び出し口だけ のこす */
  techStarted(_tech: BladeTech): void {}

  /** かまえの アイコンは 出さない（FIX-katana-tune）。呼び出し口だけ のこす */
  stanceChanged(_to: BladeStance): void {}

  update(s: BladeState): void {
    const on = s.item !== null;
    const f = s.tech === 'kesa' && s.lengths ? s.lengths : this.settings().bladeTech.kesa;
    const lock = on && lockRingVisible(s, f.startup, f.active, f.recovery);
    if (lock !== this.lastLock) {
      this.lastLock = lock;
      this.lockEl.hidden = !lock;
    }
  }

  dispose(): void {
    this.lockEl.remove();
  }
}
