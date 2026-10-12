import type { ItemId, Rarity } from '../contracts';
import { itemIconUrl } from './itemIcon';
import { PickupLogModel, type PickupRow } from './pickupLogModel';
import { rarityCss } from './tooltipModel';
import './pickupLog.css';

export interface PickupLogDeps {
  nameOf(item: ItemId): string;
  rarityOf(item: ItemId): Rarity;
}

/**
 * 拾ったときの ログ（M4 §2.12）。画面の左はし、たての真ん中より少し下。
 * 新しい行は いちばん下。DOM: `#pickup-log` の中に `.pickup-row[data-item]`（文字は `かみ ×2`）。
 * 出来事は push() で受け、毎ステップ step() を呼ぶ（ゲームのステップで数える）。
 */
export class PickupLog {
  readonly model: PickupLogModel;
  readonly el: HTMLDivElement;
  private readonly rowEls = new Map<ItemId, { root: HTMLDivElement; text: HTMLSpanElement; bump: number }>();

  constructor(
    parent: HTMLElement,
    private readonly d: PickupLogDeps,
    model: PickupLogModel = new PickupLogModel(),
  ) {
    this.model = model;
    this.el = document.createElement('div');
    this.el.id = 'pickup-log';
    this.el.setAttribute('aria-hidden', 'true');
    parent.append(this.el);
  }

  /** 拾って入った（入った数。0 こなら出さない） */
  push(item: ItemId, count: number): void {
    this.model.push(item, count);
    this.render();
  }

  /** 1 ステップ */
  step(): void {
    this.model.step();
    this.render();
  }

  private render(): void {
    const rows = this.model.rows();
    const alive = new Set<ItemId>();
    rows.forEach((r: PickupRow, i) => {
      alive.add(r.item);
      let e = this.rowEls.get(r.item);
      if (!e) {
        const root = document.createElement('div');
        root.className = 'pickup-row';
        root.dataset.item = r.item;
        const img = document.createElement('img');
        img.alt = '';
        img.src = itemIconUrl(r.item);
        const text = document.createElement('span');
        text.className = 'pickup-text';
        text.style.color = rarityCss(this.d.rarityOf(r.item));
        root.append(img, text);
        e = { root, text, bump: 0 };
        this.rowEls.set(r.item, e);
        if (typeof root.animate === 'function') {
          root.animate([{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 160 });
        }
      }
      const label = `${this.d.nameOf(r.item)} ×${r.count}`;
      if (e.text.textContent !== label) e.text.textContent = label;
      if (e.bump !== r.bump) {
        e.bump = r.bump;
        if (typeof e.root.animate === 'function') {
          e.root.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.4 }, { transform: 'scale(1)' }],
            { duration: 220, easing: 'ease-out' },
          );
        }
      }
      e.root.style.opacity = String(this.model.opacity(r));
      // 並び順（上＝古い）をそろえる
      if (this.el.children[i] !== e.root) this.el.insertBefore(e.root, this.el.children[i] ?? null);
    });
    for (const [item, e] of this.rowEls) {
      if (!alive.has(item)) {
        e.root.remove();
        this.rowEls.delete(item);
      }
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
