import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';
import { HintModel } from './craftModel';
import { drawPixels } from './itemIcon';
import { hammerPixels } from './itemArtM4';
import './craftHint.css';

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
    parent.append(this.el);
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
