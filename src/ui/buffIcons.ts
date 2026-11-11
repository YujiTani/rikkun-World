import './buffIcons.css';
import { selfCluster } from './levelHud';
import { halfId } from './duoHalfIds';
import type { BuffRow } from './buffIconsModel';

const ICON_URL: Record<BuffRow['id'], string> = { speed: './models/fx/buff_speed.png' };

/**
 * WEAPON-8 §3.3: 速さバフの アイコンの 絵（HUD）。`#buff-plate` の 中に `[data-buff="speed"]`。字は 出さない。
 * 1 ステップに 1 回 `sync(rows)`。出ている 行だけ DOM に ある（消えたら 取りのぞく）。
 */
export class BuffIcons {
  private readonly plate: HTMLDivElement;
  private readonly icons = new Map<string, HTMLSpanElement>();

  /** who = 2: 2 人の とき 2P の かたまり（`#hud-self-p2`。cluster で 渡す）に 入れる もう 1 つ（COOP-1 5f-2 #22） */
  constructor(parent: HTMLElement, private readonly who: 1 | 2 = 1, cluster?: HTMLElement) {
    this.plate = document.createElement('div');
    this.plate.id = who === 1 ? 'buff-plate' : 'buff-plate-p2';
    if (who === 2) this.plate.className = 'buff-plate--p2';
    this.plate.hidden = true;
    this.plate.setAttribute('aria-hidden', 'true');
    (cluster ?? selfCluster(parent)).append(this.plate);
  }

  /** 2 人の あいだ だけ UI 検査の 目印を つける */
  mark(on: boolean): void {
    if (on) this.plate.setAttribute('data-testid', halfId('buffPlate', this.who));
    else this.plate.removeAttribute('data-testid');
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
