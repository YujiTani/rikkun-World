// HOUSE-2A（#364）① そと の ばしょの ポップアップ（しゅるいの 一覧）。仕様 §2.3・§3.2。DOM。
// ばしょの ボタン（part-<ばしょ>）を 押すと 開き、① の パネルと 同じ 場所・同じ はば・まん中の 高さ いっぱいで パネルの 上に 重なる（見本は かくさない）。
// 上の だん ＝ ばしょの 絵と 名前・✕（popupClose）。一覧 ＝ しゅるいの ボタン（絵 だけ・正方形）。行の 見出し・印・名前の 行は 置かない。
// 行の ならびは 窓口 `editor().popupRows`（ctl.popupRows()）の とおり。しゅるいを えらんでも とじない。
// DOM: editor-popup（外わく）・popup-title（上の だん 左）・popup-list（一覧）・popup-row（行）・ボタン house-btn-<ばしょ>-<しゅるい>・house-btn-popupClose。
import type { EditorController } from '../../house/editor/controller';
import type { EditorState } from '../../house/editor/model';
import { PART_NAME, kindName, type Part } from '../../house/recipes/kinds';
import { btn, el, markSel, type BtnOpts } from './dom';
import { ICONS } from './icons';
import { kindArt, placeArt } from './kindArt';

/** そのばしょで えらんで いる しゅるい（かざりは つけて いる 物 ぜんぶ） */
function selectedOf(part: Part, s: Readonly<EditorState>): ReadonlySet<string> {
  switch (part) {
    case 'roof': return new Set([s.roof]);
    case 'wall': return new Set([s.wall]);
    case 'window': return new Set([s.windowKind]);
    case 'door': return new Set([s.door]);
    case 'deco': return new Set(s.deco);
    default: return part satisfies never;
  }
}

export class PlacePopup {
  readonly el = el('div', 'ed-popup');
  private readonly ico = el('span', 'ed-popup__ico');
  private readonly name = el('span', 'ed-popup__name');
  private readonly list = el('div', 'ed-popup__list');
  /** しゅるいの ボタン（ばしょ ＋ しゅるいの id → ボタン） */
  private readonly kinds = new Map<string, HTMLButtonElement>();
  /** いま 並べて いる 行の 目印（ばしょ ＋ 行。かわった ときだけ 並べなおす） */
  private key = '';

  constructor(private readonly ctl: EditorController, private readonly press: BtnOpts['onPress']) {
    this.el.hidden = true;
    this.el.dataset.testid = 'editor-popup';
    const title = el('div', 'ed-popup__title');
    title.dataset.testid = 'popup-title';
    title.append(this.ico, this.name);
    const close = btn({ cls: 'ed-btn--close', id: 'popupClose', html: ICONS.close, onPress: press });
    close.setAttribute('aria-label', 'とじる');
    const top = el('div', 'ed-popup__top');
    top.append(title, close);
    this.list.dataset.testid = 'popup-list';
    this.el.append(top, this.list);
  }

  /** 状態が かわった: 開く・とじる・行の ならべなおし・えらんで いる しるし */
  update(): void {
    const part = this.ctl.popup;
    this.el.hidden = part === null;
    if (part === null) {
      this.key = '';
      return;
    }
    const rows = this.ctl.popupRows();
    const key = `${part}|${JSON.stringify(rows)}`;
    if (key !== this.key) {
      this.key = key;
      this.rebuild(part, rows);
    }
    const on = selectedOf(part, this.ctl.s);
    for (const [id, b] of this.kinds) markSel(b, on.has(id.slice(part.length + 1)));
  }

  private rebuild(part: Part, rows: readonly (readonly string[])[]): void {
    this.ico.innerHTML = placeArt(part);
    this.name.textContent = PART_NAME[part];
    this.kinds.clear();
    const els = rows.map((ids) => {
      const row = el('div', 'ed-popup__row');
      row.dataset.testid = 'popup-row';
      for (const id of ids) {
        const kind = id.slice(part.length + 1);
        const b = btn({ cls: 'ed-kind', id, html: kindArt(part, kind), onPress: this.press });
        b.setAttribute('aria-label', kindName(kind));
        this.kinds.set(id, b);
        row.append(b);
      }
      return row;
    });
    this.list.replaceChildren(...els);
    this.list.scrollTop = 0;
  }
}
