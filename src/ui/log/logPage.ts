import type { ItemId } from '../../contracts';
import { itemIconUrl } from '../itemIcon';
import { withRuby } from '../text';
import { createButton, createTab, setButtonDisabled } from '../theme';
import { createCategoryMark, createLogTabIcon, scrollIconUrl } from './icons';
import { LOG_VISIBLE_ROWS, type LogSystem } from './LogSystem';
import './logPage.css';

/** もちもの画面の 上の「できごと」タブ（まきもの の絵 ＋ 字）。選ぶ見た目は `setTabState` で */
export function createLogTab(onClick: () => void): HTMLButtonElement {
  const t = createTab({ text: 'できごと', onClick });
  t.classList.add('log-tab');
  t.dataset.tab = 'log';
  t.prepend(createLogTabIcon());
  return t;
}

export interface LogPageHost {
  /** できごと ページを 入れる場所（もちもの画面の ページ置き場） */
  pageSlot: HTMLElement;
}

/**
 * できごと ページ（CRAFT-2 §2.6 (4)）。毎フレーム `update()`。
 * DOM: `.log-page` の中に 見出し `.log-title`・行 `.log-row[data-cat][data-kind]`（新しい順）・`.log-up`・`.log-down`・0 件なら `.log-empty`。
 */
export class LogPage {
  readonly el: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly empty: HTMLDivElement;
  private readonly up: HTMLButtonElement;
  private readonly down: HTMLButtonElement;
  private builtVersion = -1;
  private scrollKey = '';
  private wasVisible = false;

  constructor(
    private readonly log: LogSystem,
    host: LogPageHost,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'rk-root rk-panel log-page';
    const title = document.createElement('div');
    title.className = 'log-title';
    title.textContent = 'できごと';
    const body = document.createElement('div');
    body.className = 'log-body';
    this.list = document.createElement('div');
    this.list.className = 'log-list';
    this.list.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        this.log.scrollRows(ev.deltaY > 0 ? 1 : ev.deltaY < 0 ? -1 : 0);
      },
      { passive: false },
    );
    this.empty = document.createElement('div');
    this.empty.className = 'log-empty';
    const art = document.createElement('img');
    art.className = 'log-empty__art rk-art';
    art.alt = '';
    art.src = scrollIconUrl();
    const msg = document.createElement('div');
    msg.className = 'log-empty__text';
    msg.textContent = 'まだ なにも ないよ';
    this.empty.append(art, msg);
    const side = document.createElement('div');
    side.className = 'log-side';
    this.up = createButton({ text: '▲', onClick: () => this.log.scroll(-1) });
    this.up.classList.add('log-up');
    this.down = createButton({ text: '▼', onClick: () => this.log.scroll(1) });
    this.down.classList.add('log-down');
    side.append(this.up, this.down);
    body.append(this.list, this.empty, side);
    this.el.append(title, body);
    host.pageSlot.append(this.el);
    this.el.style.display = 'none';
  }

  /** `visible`: もちもの画面が 開いていて できごと タブ */
  update(visible: boolean): void {
    this.el.style.display = visible ? '' : 'none';
    if (!visible) {
      this.wasVisible = false;
      this.builtVersion = -1;
      this.scrollKey = '';
      return;
    }
    if (!this.wasVisible) {
      this.wasVisible = true;
      this.log.resetScroll(); // 開いたときは いつも いちばん上
    }
    const v = this.log.version();
    if (v !== this.builtVersion) {
      this.builtVersion = v;
      this.build();
    }
    const key = `${v}|${this.log.ui().scrollRow}`;
    if (key !== this.scrollKey) {
      this.scrollKey = key;
      this.applyScroll();
    }
  }

  private build(): void {
    const entries = this.log.history();
    this.empty.hidden = entries.length > 0;
    this.list.hidden = entries.length === 0;
    const frag = document.createDocumentFragment();
    entries.forEach((e, i) => {
      const row = document.createElement('div');
      row.className = 'log-row';
      row.dataset.cat = e.category;
      row.dataset.kind = e.kind;
      if (e.item) row.dataset.item = e.item;
      if (i === 0) row.classList.add('is-latest');
      row.append(createCategoryMark(e.category));
      if (e.item) row.append(itemArt(e.item));
      const text = document.createElement('span');
      text.className = 'log-text';
      text.innerHTML = withRuby(e.text); // 文の 中の 名前は ［漢字｜よみ］ のまま 保存して いる（WEAPON-7 §2.7）
      row.append(text);
      if (e.kind === 'fromTansu') row.append(tansuBadge());
      frag.append(row);
    });
    this.list.replaceChildren(frag);
  }

  private applyScroll(): void {
    const ui = this.log.ui();
    setButtonDisabled(this.up, !ui.canUp);
    setButtonDisabled(this.down, !ui.canDown);
    const first = this.list.firstElementChild as HTMLElement | null;
    const second = first?.nextElementSibling as HTMLElement | null;
    const pitch = first && second ? second.offsetTop - first.offsetTop : first ? first.offsetHeight : 0;
    this.list.scrollTop = ui.scrollRow * pitch;
    this.el.dataset.visibleRows = String(LOG_VISIBLE_ROWS);
  }

  dispose(): void {
    this.el.remove();
  }
}

/** アイテムの絵（行の直接の子。印 → 絵 → 字 の順を守るため） */
export function itemArt(item: ItemId): HTMLImageElement {
  const img = document.createElement('img');
  img.className = 'log-art rk-art';
  img.alt = '';
  img.src = itemIconUrl(item);
  return img;
}

/** たんす から の件の しるし: アイテムの絵の左下に重ねる たんす の小さな絵（行の最後の子。位置は CSS） */
export function tansuBadge(): HTMLImageElement {
  const t = document.createElement('img');
  t.className = 'log-tansu rk-art';
  t.alt = '';
  t.dataset.tansu = '1';
  t.src = itemIconUrl('tansu');
  return t;
}
