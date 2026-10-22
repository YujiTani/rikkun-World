import type { ActionHintItem, ActionHintLines } from './actionHintModel';
import { animalIconUrl } from './animalArt';
import { heartPixels } from './heartsModel';
import { drawPixels, itemIconUrl } from './itemIcon';
import './actionHint.css';

/**
 * 照準（＋）の すぐ下の ヒント（FIX-action-hint）。左 = 左クリック、右 = 右クリック を横にならべる。
 * 1 つ = マウスの絵（L か R が光る）＋ すること の絵 ＋ 小さな 1 語。毎ステップ update(lines) を呼ぶ。DOM: `#action-hint`
 */
export class ActionHint {
  readonly el: HTMLDivElement;
  private readonly cells: { left: HTMLDivElement; right: HTMLDivElement };
  private shown: ActionHintLines = {};

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'action-hint';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.hidden = true;
    this.cells = { left: this.makeCell('left'), right: this.makeCell('right') };
    this.el.append(this.cells.left, this.cells.right);
    parent.append(this.el);
  }

  private makeCell(side: 'left' | 'right'): HTMLDivElement {
    const c = document.createElement('div');
    c.className = `action-hint__cell action-hint__cell--${side}`;
    c.hidden = true;
    c.innerHTML =
      `<span class="action-hint__mouse"><i class="action-hint__btn action-hint__btn--l"></i><i class="action-hint__btn action-hint__btn--r"></i></span>` +
      `<img class="action-hint__art" alt=""><span class="action-hint__word"></span>`;
    c.querySelector('.action-hint__mouse')!.classList.add(`action-hint__mouse--${side}`);
    return c;
  }

  update(lines: ActionHintLines): void {
    if (lines.progress !== this.shown.progress) this.setRing(lines.progress);
    if (same(lines.left, this.shown.left) && same(lines.right, this.shown.right)) {
      this.shown.progress = lines.progress;
      return;
    }
    this.shown = { left: lines.left && { ...lines.left }, right: lines.right && { ...lines.right }, progress: lines.progress };
    this.set(this.cells.left, lines.left);
    this.set(this.cells.right, lines.right);
    this.el.hidden = !lines.left && !lines.right;
  }

  /** 版 3.2: だっこ の わ の たまり（0〜1）。右 の 絵 の まわり に 1 しゅう する（CSS の `--p`）。無ければ わ を 消す */
  private setRing(p: number | undefined): void {
    const cell = this.cells.right;
    if (p === undefined) {
      cell.removeAttribute('data-ring');
      cell.style.removeProperty('--p');
    } else {
      cell.dataset.ring = '1';
      cell.style.setProperty('--p', p.toFixed(3));
    }
  }

  /** いま出している 絵と 語（`progress` = だっこ の わ の たまり。わ が なければ 無い） */
  current(): ActionHintLines {
    const out: ActionHintLines = { left: this.shown.left && { ...this.shown.left }, right: this.shown.right && { ...this.shown.right } };
    if (this.shown.progress !== undefined) out.progress = this.shown.progress;
    return out;
  }

  private set(cell: HTMLDivElement, it: ActionHintItem | undefined): void {
    cell.hidden = !it;
    cell.classList.toggle('action-hint__cell--disabled', !!it?.disabled);
    if (!it) return;
    (cell.querySelector('.action-hint__art') as HTMLImageElement).src = iconUrl(it.icon);
    cell.querySelector('.action-hint__word')!.textContent = it.word;
  }
}

/** 'full'・'carry' の 専用 の 絵 が できるまで は にわとり の 絵（ひとめ で 分かる ように 語 を そえる） */
function iconUrl(icon: ActionHintItem['icon']): string {
  if (icon === 'heart') return heartUrl();
  if (icon === 'chicken' || icon === 'carry' || icon === 'full') return animalIconUrl('chicken');
  return itemIconUrl(icon);
}

let heartCache: string | undefined;
function heartUrl(): string {
  if (!heartCache) {
    const c = document.createElement('canvas');
    drawPixels(c, heartPixels('full'));
    heartCache = c.toDataURL();
  }
  return heartCache;
}

function same(a: ActionHintItem | undefined, b: ActionHintItem | undefined): boolean {
  return a?.icon === b?.icon && a?.word === b?.word && !!a?.disabled === !!b?.disabled;
}
