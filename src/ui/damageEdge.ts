import { COMBAT_FX, edgeOpacity } from '../fx/combatFxModel';
import './damageEdge.css';

/**
 * ダメージのとき、画面の「ふち」だけがうすいピンクに 1 回ふわっと色づく（M3 §3.3）。
 * 画面全体の点滅はしない（中央は透明のまま）。
 */
export class DamageEdge {
  readonly el: HTMLDivElement;
  /** 経過秒（-1 = 出していない） */
  private t = -1;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'damage-edge';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.opacity = '0';
    parent.append(this.el);
  }

  flash(): void {
    this.t = 0;
  }

  update(dt: number): void {
    if (this.t < 0) return;
    this.t += dt;
    if (this.t >= COMBAT_FX.edgeSeconds) {
      this.t = -1;
      this.el.style.opacity = '0';
      return;
    }
    this.el.style.opacity = String(edgeOpacity(this.t));
  }
}
