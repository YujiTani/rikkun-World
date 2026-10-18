import type { AnimalEvent, AnimalHintKind } from '../contracts';
import { animalIconUrl } from './animalArt';
import { ANIMAL_HINT_VIEW, AnimalHintModel } from './animalHintModel';
import { heartPixels } from './heartsModel';
import { drawPixels, itemIconUrl } from './itemIcon';
import { createChip } from './theme';
import './animalHint.css';

/**
 * にわとり の 合図のチップ（左に `--rk-info` の帯）。DOM: `#animal-hint`（`data-hint`）。
 * つなぎ込み: `animalHint.feed(animals.events())` を 流し、毎ステップ `step()`
 */
export class AnimalHint {
  readonly el: HTMLDivElement;
  readonly model = new AnimalHintModel();
  private shownKind: string | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'animal-hint';
    this.el.setAttribute('role', 'status');
    this.el.hidden = true;
    parent.append(this.el);
  }

  show(kind: AnimalHintKind): void {
    this.model.show(kind);
    this.sync();
  }

  /** 出来事の列から 合図を 拾って 出す */
  feed(events: readonly AnimalEvent[]): void {
    this.model.feed(events);
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
    const view = ANIMAL_HINT_VIEW[k];
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
      } else if (a === 'chicken' || a === 'chickenRibbon' || a === 'sun') {
        img.src = animalIconUrl(a);
      } else {
        img.src = itemIconUrl(a);
      }
      chip.insertBefore(img, text);
    }
    this.el.append(chip);
  }
}
