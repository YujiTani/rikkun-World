import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';
import { HintModel } from './craftModel';
import { drawPixels } from './itemIcon';
import { hammerPixels } from './itemArtM4';
import { halfId } from './duoHalfIds';
import './craftHint.css';

/**
 * B「おしらせ」のかたまり（§3.6 (1)）の入れもの。ホットバーの右はしにそろえて、すぐ上に出す。
 * つくれる マーク（かなづち）・メダルの印（B）・ほかの おしらせが、ここに子として入る。
 * 中身が 1 つも見えていないあいだは かたまりごと出ない（CSS）。差しこみ口: `noticeCluster(hud).append(要素)`。
 */
export function noticeCluster(parent: HTMLElement, who: 1 | 2 = 1): HTMLDivElement {
  const id = who === 1 ? 'hud-notice' : 'hud-notice-p2';
  let el = parent.querySelector<HTMLDivElement>(`:scope > #${id}`);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'hud-cluster';
    if (who === 2) el.setAttribute('data-testid', halfId('hudNotice', 2));
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
  private readonly who: 1 | 2;

  /** who = 2: 2 人の とき 2P の ホットバーの 右上の かたまり（`#hud-notice-p2`）に 入れる もう 1 つ（COOP-1 5f-2 #20。メダルの 印は 入れない） */
  constructor(parent: HTMLElement, cfg: CraftUiSettings = CRAFT_UI_SETTINGS, who: 1 | 2 = 1) {
    this.model = new HintModel(cfg.hintHopSeconds);
    this.el = document.createElement('canvas');
    this.el.id = who === 1 ? 'craft-hint' : 'craft-hint-p2';
    if (who === 2) this.el.className = 'craft-hint--p2';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    drawPixels(this.el, hammerPixels());
    noticeCluster(parent, who).append(this.el);
    this.who = who;
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

  /** 2 人の あいだ だけ UI 検査の 目印を つける（かたまり 全体。2P の 分は かたまりを 作った ときに つけて いる ので 1P の 分だけ 動く） */
  mark(on: boolean): void {
    const cluster = this.el.parentElement;
    if (!cluster || this.who !== 1) return;
    if (on) cluster.setAttribute('data-testid', halfId('hudNotice', 1));
    else cluster.removeAttribute('data-testid');
  }

  dispose(): void {
    this.el.remove();
  }
}
