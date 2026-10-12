import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';
import { HintModel } from './craftModel';
import { drawPixels } from './itemIcon';
import { hammerPixels } from './itemArtM4';
import './craftHint.css';

/**
 * B「おしらせ」のかたまり（§3.6 (1)）の入れもの。ホットバーの右はしにそろえて、すぐ上に出す。
 * つくれる マーク（かなづち）・メダルの印（B）・ほかの おしらせが、ここに子として入る。
 * 中身が 1 つも見えていないあいだは かたまりごと出ない（CSS）。差しこみ口: `noticeCluster(hud).append(要素)`。
 */
export function noticeCluster(parent: HTMLElement): HTMLDivElement {
  let el = parent.querySelector<HTMLDivElement>(':scope > #hud-notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hud-notice';
    el.className = 'hud-cluster';
    parent.append(el);
  }
  return el;
}

/**
 * つくれる マーク（M4 §2.10）: つくる のカードが 1 まい以上 光っているとき、
 * ホットバーの右はしの外に かなづち の印。0 → 1 まい以上になった瞬間だけ ぴょこんと はねる（音なし）。
 * 毎ステップ update(craftable, dt) を呼ぶ。DOM: `#craft-hint`
 */
export class CraftHint {
  readonly el: HTMLCanvasElement;
  private readonly model: HintModel;
  private visible_ = false;

  constructor(parent: HTMLElement, cfg: CraftUiSettings = CRAFT_UI_SETTINGS) {
    this.model = new HintModel(cfg.hintHopSeconds);
    this.el = document.createElement('canvas');
    this.el.id = 'craft-hint';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    drawPixels(this.el, hammerPixels());
    noticeCluster(parent).append(this.el);
  }

  update(craftable: boolean, dt: number): void {
    const r = this.model.update(craftable, dt);
    this.visible_ = r.visible;
    this.el.hidden = !r.visible;
    this.el.style.setProperty('--hop', String(r.hop));
  }

  visible(): boolean {
    return this.visible_;
  }

  dispose(): void {
    this.el.remove();
  }
}
