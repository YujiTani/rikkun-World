import { itemRarity, rarityIndex } from '../drops/rarity';
import type { TansuApi } from '../storage/TansuView';
import { tansuBandIds, type InvLayout } from '../duo/invRules';
import { tansuPixels } from '../storage/tansuArt';
import { paintWear } from './wearGauge';
import { paintPower } from './powerBadge';
import { paintWater } from './waterGauge';
import { createButton, createSlot, paintSlot, type SlotParts } from './theme';
import { drawPixels, itemIconUrl } from './itemIcon';
import './storageScreen.css';

/** もちもの画面の右の場所（storageSlot）を切りかえる口（InventoryScreen が合う） */
export interface StorageHost {
  storageSlot: HTMLElement;
  setSide(side: 'craft' | 'storage'): void;
  setMarker?(m: { active(): boolean; toggle(i: number): void; has(i: number): boolean } | null): void;
  refresh?(): void;
  /** 2P の 画面: ボタンに id を 付けない（1P の 画面と 重なるので） */
  noIds?: boolean;
  /** 画面の 形（2 人用は「えらんだ もの を しまう」を 出さない。1P も 2P も 同じ 3 つ。なければ 全面） */
  layout?(): InvLayout;
}

const hexRgba = (c: string): [number, number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/**
 * たんす画面: 見出し（桐色の帯＋金具の点＋たんすの絵＋とじる）と 9×6 のマス。
 * マスのクリック = `storage.click(i)`、シフトクリック = `storage.shiftClick('tansu', i)`。
 * 毎ステップ（または毎フレーム）update() を呼ぶ。開いたとき host.setSide('storage')、閉じたとき 'craft' にもどす
 */
export class StorageScreen {
  readonly el: HTMLDivElement;
  private readonly cells: SlotParts[] = [];
  private shown = false;
  private markedBtn!: HTMLButtonElement;
  private markKey = '';

  constructor(
    private readonly host: StorageHost,
    private readonly storage: TansuApi,
    slots = 54,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'tansu-panel';
    const band = document.createElement('div');
    band.className = 'tansu-band';
    for (const pos of ['l1', 'l2', 'r1', 'r2']) {
      const k = document.createElement('span');
      k.className = 'tansu-kana';
      k.dataset.pos = pos;
      band.append(k);
    }
    const head = document.createElement('div');
    head.className = 'tansu-head';
    const icon = document.createElement('canvas');
    icon.className = 'tansu-icon';
    drawPixels(icon, tansuPixels('icon').map(hexRgba));
    const title = document.createElement('h2');
    title.className = 'tansu-title';
    title.textContent = 'たんす';
    // とじる は もちもの画面の右上の 1 こだけ。ここには しまう・とりだす ボタン
    const bar = document.createElement('div');
    bar.className = 'tansu-actions';
    const btn = (text: string, id: string, fn: () => void) => {
      const b = createButton({ text, kind: 'normal', onClick: () => { fn(); this.host.refresh?.(); } });
      // id は 1P の 画面の 物だけ（2 人用で 2 つ 作っても 重ならない ように）。十字の 名前は data-tansu-act
      if (!host.noIds) b.id = id;
      b.dataset.tansuAct = id.replace('tansu-', '');
      b.classList.add('tansu-act');
      return b;
    };
    this.markedBtn = btn('えらんだ もの を しまう', 'tansu-store-marked', () => this.storage.storeMarked());
    this.markedBtn.hidden = true;
    bar.append(
      btn('ぜんぶ しまう', 'tansu-store-all', () => this.storage.storeAll()),
      btn('おなじ もの を しまう', 'tansu-store-same', () => this.storage.storeSame()),
      btn('ぜんぶ とりだす', 'tansu-take-all', () => this.storage.takeAll()),
      this.markedBtn,
    );
    head.append(icon, title, bar);
    host.setMarker?.({
      active: () => this.storage.ui().open,
      toggle: (i) => this.storage.mark(i),
      has: (i) => this.storage.marks().includes(i),
    });

    const grid = document.createElement('div');
    grid.className = 'tansu-grid';
    for (let i = 0; i < slots; i++) {
      const c = createSlot({ size: 'tansu' });
      c.root.dataset.tansu = String(i);
      c.root.dataset.menuItem = ''; // 十字で えらべる（もちものの マスと 同じ。COOP-1 4c）
      c.root.tabIndex = 0;
      c.root.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.shiftKey) this.storage.shiftClick('tansu', i);
        else this.storage.click(i);
      });
      this.cells.push(c);
      grid.append(c.root);
    }
    this.el.append(band, head, grid);
    host.storageSlot.append(this.el);
  }

  update(): void {
    const open = this.storage.ui().open;
    if (open !== this.shown) {
      this.shown = open;
      this.host.setSide(open ? 'storage' : 'craft');
    }
    const mk = this.storage.marks();
    const mkKey = mk.join(',');
    if (mkKey !== this.markKey) {
      this.markKey = mkKey;
      this.host.refresh?.();
    }
    // 2 人用は しるし用の ボタンを 出さない（マウスの Ctrl クリックは 全面だけ）
    this.markedBtn.hidden = mk.length === 0 || !tansuBandIds(this.host.layout?.() ?? 'full').includes('tansu-store-marked');
    const slots = this.storage.openSlots();
    if (!open || !slots) return;
    for (let i = 0; i < this.cells.length; i++) {
      const s = slots[i] ?? null;
      paintSlot(
        this.cells[i],
        s
          ? { size: 'tansu', art: itemIconUrl(s.item), count: s.count, rarity: rarityIndex(itemRarity(s.item)) }
          : { size: 'tansu' },
      );
      if (s) this.cells[i].root.dataset.rarity = String(rarityIndex(itemRarity(s.item)));
      else delete this.cells[i].root.dataset.rarity;
      paintWear(this.cells[i].root, s);
      paintPower(this.cells[i].root, s);
      paintWater(this.cells[i].root, s);
    }
  }

  dispose(): void {
    this.el.remove();
  }
}
