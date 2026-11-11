import { COMBAT_FX, edgeOpacity } from '../fx/combatFxModel';
import { halfId } from './duoHalfIds';
import './damageEdge.css';

/**
 * ダメージのとき、画面の「ふち」だけがうすいピンクに 1 回ふわっと色づく（M3 §3.3）。
 * 画面全体の点滅はしない（中央は透明のまま）。
 */
export class DamageEdge {
  readonly el: HTMLDivElement;
  /** 経過秒（-1 = 出していない） */
  private t = -1;

  /** who = 2: 2 人の とき 2P の 半分の ふち（COOP-1 5f-2 #15。2P が 当たった とき だけ 光る） */
  constructor(parent: HTMLElement, private readonly who: 1 | 2 = 1) {
    this.el = document.createElement('div');
    this.el.id = who === 1 ? 'damage-edge' : 'damage-edge-p2';
    if (who === 2) this.el.className = 'damage-edge--p2';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.style.opacity = '0';
    parent.append(this.el);
  }

  /** 2 人の あいだ だけ UI 検査の 目印を つける */
  mark(on: boolean): void {
    if (on) this.el.setAttribute('data-testid', halfId('damageEdge', this.who));
    else this.el.removeAttribute('data-testid');
  }

  /** すぐ 消す（2P が やめた とき） */
  clear(): void {
    this.t = -1;
    this.el.style.opacity = '0';
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
