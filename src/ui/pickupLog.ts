import type { ItemId, Rarity } from '../contracts';
import { PickupLogModel, liveRowText, type PickupRow } from './pickupLogModel';
import { createCategoryMark } from './log/icons';
import { itemArt, tansuBadge } from './log/logPage';
import type { LogSystem } from './log/LogSystem';
import './pickupLog.css';

export interface PickupLogDeps {
  nameOf(item: ItemId): string;
  /** 使わなくなった（字は 白。CRAFT-2 §2.5）。古い呼び方のため 残してある */
  rarityOf?(item: ItemId): Rarity;
  /**
   * CRAFT-2: ログの中身。わたすと その `liveModel` を読み、`push` は 履歴にも入り、`step` は ログの時間を進める。
   * 渡さないときは 今までどおり（モデルを自分で持つ）
   */
  log?: LogSystem;
}

/**
 * 左のログ（M4 §2.12 ＋ CRAFT-2 §2.5）。画面の左はし、たての真ん中より少し下。
 * 新しい行は いちばん下。DOM: `#pickup-log` の中に `.pickup-row[data-item][data-kind]`。
 * 子の順は カテゴリーの印（`[data-cat]`）→ アイテムの絵 → 字（白。`かみ ×2`・`たんす から き ×1`）。
 * 出来事は push() で受け、毎ステップ step() を呼ぶ（ゲームのステップで数える）。
 */
export class PickupLog {
  readonly model: PickupLogModel;
  readonly el: HTMLDivElement;
  private readonly rowEls = new Map<string, { root: HTMLDivElement; text: HTMLSpanElement; bump: number }>();

  constructor(
    parent: HTMLElement,
    private readonly d: PickupLogDeps,
    model: PickupLogModel = new PickupLogModel(),
  ) {
    this.model = d.log ? d.log.liveModel : model;
    this.el = document.createElement('div');
    this.el.id = 'pickup-log';
    this.el.setAttribute('aria-hidden', 'true');
    parent.append(this.el);
  }

  /** 拾って入った（入った数。0 こなら出さない） */
  push(item: ItemId, count: number): void {
    if (this.d.log) this.d.log.pickup(item, count);
    else this.model.push(item, count);
    this.render();
  }

  /** 1 ステップ */
  step(): void {
    if (this.d.log) this.d.log.step();
    else this.model.step();
    this.render();
  }

  private render(): void {
    const rows = this.model.rows();
    const alive = new Set<string>();
    rows.forEach((r: PickupRow, i) => {
      const key = `${r.kind}:${r.item}`;
      alive.add(key);
      let e = this.rowEls.get(key);
      if (!e) {
        const root = document.createElement('div');
        root.className = 'pickup-row';
        root.dataset.item = r.item;
        root.dataset.kind = r.kind;
        const text = document.createElement('span');
        text.className = 'pickup-text';
        root.append(createCategoryMark(r.kind === 'fromTansu' ? 'craft' : 'pickup'), itemArt(r.item), text);
        if (r.kind === 'fromTansu') root.append(tansuBadge());
        e = { root, text, bump: 0 };
        this.rowEls.set(key, e);
        if (typeof root.animate === 'function') {
          root.animate([{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 160 });
        }
      }
      const label = liveRowText(r.kind, this.d.nameOf(r.item), r.count);
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
    for (const [key, e] of this.rowEls) {
      if (!alive.has(key)) {
        e.root.remove();
        this.rowEls.delete(key);
      }
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
