// 「なまえを かえる」の 2 つの 画面（HOUSE-1C PR-1 #340。仕様 docs/design/HOUSE-1.md §2.6・§3.3・AC35b・AC53）。
//   一覧（page 'rename'）: 建てた 家の 名前の ボタンが 近い 順に 2 列。✕ で とじる。
//   名前の 画面（page 'renameName'）: ③ なまえ（1B）と 同じ 50 音の 画面 ＋ これで いい！・やめる。
// ボタンの id は 窓口 press(id) と 同じ（renamePick-<家の id>・char-*・renameOk …）。DOM: house-rename・house-rename-name・rename-name。
import type { RenameView } from '../../house/rename';
import { btn, el, setEnabled } from './dom';
import { ICONS } from './icons';
import { buildNamae } from './namae';
import './houseEditor.css';
import './houseEditorSteps.css';

type Press = (id: string) => void;

/** 一覧の 画面（家の 数が かわった ときに 作りなおす） */
export function buildRenameList(view: RenameView, press: Press): HTMLElement {
  const root = el('div', 'rn-list');
  root.dataset.testid = 'house-rename';
  const grid = el('div', 'rn-list__grid');
  for (const h of view.houses) {
    const b = btn({ cls: 'rn-pick', id: `renamePick-${h.id}`, html: '', onPress: (id) => press(id) });
    b.textContent = h.name; // 名前は かなだけ（漢字は 入らない）
    grid.append(b);
  }
  const close = btn({ cls: 'ed-btn--close rn-close', id: 'close', html: ICONS.close, onPress: (id) => press(id) });
  close.setAttribute('aria-label', 'とじる');
  root.append(grid, close);
  return root;
}

/** 名前の 画面。作りは 1 回、中身は update() で 今の 名前に あわせる */
export interface RenameNamePanel {
  root: HTMLElement;
  update(view: RenameView, buttons: ReadonlyArray<{ id: string; enabled: boolean }>): void;
}

export function buildRenameName(initial: RenameView, press: Press): RenameNamePanel {
  let view = initial;
  const root = el('div', 'rn-name');
  root.dataset.testid = 'house-rename-name';
  const panel = buildNamae({ name: () => view.name ?? { front: '', back: '' }, katakana: () => view.katakana }, (id) => press(id));
  panel.el.querySelector('[data-testid="editor-name"]')?.setAttribute('data-testid', 'rename-name'); // エディターの ③ と 見分ける
  const side = panel.el.querySelector('.ed-namae__side');
  const ok = btn({ cls: 'ed-btn--pri rn-ok', id: 'renameOk', html: 'これで いい！', onPress: (id) => press(id) });
  const cancel = btn({ cls: 'rn-cancel', id: 'renameCancel', html: 'やめる', onPress: (id) => press(id) });
  side?.append(ok, cancel);
  root.append(panel.el);
  return {
    root,
    update(v, buttons): void {
      view = v;
      panel.update();
      const on = new Map(buttons.map((b) => [b.id, b.enabled]));
      for (const b of root.querySelectorAll<HTMLButtonElement>('button[data-btn]')) setEnabled(b, on.get(b.dataset.btn ?? '') ?? true);
    },
  };
}
