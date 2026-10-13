import type { ItemId } from '../contracts';
import { WEAPON_FX, brokenLogText, lowChipText } from '../fx/weaponFxModel';
import { itemIconUrl } from './itemIcon';
import { createChip } from './theme';
import './wearNotice.css';

/**
 * たいきゅうの お知らせ（WEAPON-2 §4.6 (4)(5)）。
 * - `#wear-hint`: `〇〇 が もうすぐ こわれるよ` の チップ（120F。1 回 だけ）。DOM: `.rk-chip[data-item]`
 * - `#wear-log`: `〇〇 が こわれた`（`--rk-info` の 帯）。DOM: `.wear-row[data-item]`
 * 毎ステップ `step()`。画面全体は 光らせない・点滅 しない。
 */
export class WearNotice {
  readonly hintEl: HTMLDivElement;
  readonly logEl: HTMLDivElement;
  private hintLeft = 0;
  private readonly rows: { el: HTMLElement; left: number }[] = [];
  /** 出した 回数（テスト用） */
  lowShown = 0;
  brokenShown = 0;

  constructor(parent: HTMLElement) {
    this.hintEl = document.createElement('div');
    this.hintEl.id = 'wear-hint';
    this.hintEl.setAttribute('role', 'status');
    this.hintEl.hidden = true;
    this.logEl = document.createElement('div');
    this.logEl.id = 'wear-log';
    this.logEl.setAttribute('aria-hidden', 'true');
    parent.append(this.hintEl, this.logEl);
  }

  low(item: ItemId, name: string): void {
    this.lowShown++;
    this.hintEl.replaceChildren();
    const chip = createChip({ art: itemIconUrl(item), text: lowChipText(name), tone: 'info', head: true });
    chip.dataset.item = item;
    this.hintEl.append(chip);
    this.hintEl.dataset.item = item;
    this.hintEl.hidden = false;
    this.hintLeft = WEAPON_FX.chipSteps;
  }

  broken(item: ItemId, name: string): void {
    this.brokenShown++;
    const row = document.createElement('div');
    row.className = 'wear-row';
    row.dataset.item = item;
    const chip = createChip({ art: itemIconUrl(item), text: brokenLogText(name), tone: 'info' });
    row.append(chip);
    this.logEl.append(row);
    this.rows.push({ el: row, left: 180 });
    while (this.rows.length > 3) this.rows.shift()!.el.remove();
  }

  step(): void {
    if (this.hintLeft > 0 && --this.hintLeft <= 0) this.hintEl.hidden = true;
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i];
      if (--r.left <= 0) {
        r.el.remove();
        this.rows.splice(i, 1);
      } else if (r.left < 30) {
        r.el.style.opacity = String(r.left / 30);
      }
    }
  }

  dispose(): void {
    this.hintEl.remove();
    this.logEl.remove();
  }
}
