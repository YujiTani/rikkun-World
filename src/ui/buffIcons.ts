import './buffIcons.css';
import { selfCluster } from './levelHud';
import type { BuffRow } from './buffIconsModel';

const ICON_URL: Record<BuffRow['id'], string> = { speed: './models/fx/buff_speed.png' };

/**
 * WEAPON-8 §3.3: 速さバフの アイコンの 絵（HUD）。`#buff-plate` の 中に `[data-buff="speed"]`。字は 出さない。
 * 1 ステップに 1 回 `sync(rows)`。出ている 行だけ DOM に ある（消えたら 取りのぞく）。
 */
export class BuffIcons {
  private readonly plate: HTMLDivElement;
  private readonly icons = new Map<string, HTMLSpanElement>();

  constructor(parent: HTMLElement) {
    this.plate = document.createElement('div');
    this.plate.id = 'buff-plate';
    this.plate.hidden = true;
    this.plate.setAttribute('aria-hidden', 'true');
    selfCluster(parent).append(this.plate);
  }

  sync(rows: readonly BuffRow[]): void {
    for (const [id, el] of this.icons) {
      if (!rows.some((r) => r.id === id)) {
        el.remove();
        this.icons.delete(id);
      }
    }
    for (const r of rows) {
      let el = this.icons.get(r.id);
      if (!el) {
        el = document.createElement('span');
        el.className = 'buff-icon';
        el.dataset.buff = r.id;
        const img = document.createElement('img');
        img.src = ICON_URL[r.id];
        img.alt = '';
        img.draggable = false;
        el.append(img);
        this.icons.set(r.id, el);
        this.plate.append(el);
      }
      el.style.transform = `scale(${r.scale.toFixed(3)})`;
      el.style.opacity = r.opacity.toFixed(3);
    }
    this.plate.hidden = this.icons.size === 0;
  }
}
