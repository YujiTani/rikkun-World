import type { FarmHintKind } from '../contracts';
import { heartPixels } from './heartsModel';
import { drawPixels, extraIconUrl, itemIconUrl } from './itemIcon';
import { FARM_HINT_VIEW, FarmHintModel } from './farmHintModel';
import { createChip } from './theme';
import './farmHint.css';

/**
 * たがやす・たべる の合図のチップ（左に `--rk-info` の帯）。DOM: `#farm-hint`（`data-hint`）。
 * つなぎ込み: `farmHint.model.feed(farm.drainEvents())`（または FarmFx 経由）と、毎ステップ `step()`
 */
export class FarmHint {
  readonly el: HTMLDivElement;
  readonly model = new FarmHintModel();
  private shownKind: string | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'farm-hint';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    parent.append(this.el);
  }

  show(kind: FarmHintKind): void {
    this.model.show(kind);
    this.sync();
  }

  step(): void {
    this.model.step();
    this.sync();
  }

  private sync(): void {
    const k = this.model.current();
    this.el.hidden = k === null;
    if (k === this.shownKind) return;
    this.shownKind = k;
    this.el.replaceChildren();
    if (k === null) return;
    this.el.dataset.hint = k;
    const view = FARM_HINT_VIEW[k];
    const chip = createChip({ html: view.html, tone: 'info', head: true });
    const text = chip.querySelector('.rk-chip__text')!;
    for (const a of view.art) {
      const img = document.createElement('img');
      img.className = 'rk-chip__art rk-art';
      img.alt = '';
      if (a === 'heart') {
        const c = document.createElement('canvas');
        drawPixels(c, heartPixels('full'));
        img.src = c.toDataURL();
      } else if (a === 'droplet') {
        img.src = extraIconUrl('droplet');
      } else {
        img.src = itemIconUrl(a);
      }
      chip.insertBefore(img, text);
    }
    this.el.append(chip);
  }
}
