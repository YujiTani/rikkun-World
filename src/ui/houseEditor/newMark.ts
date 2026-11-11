// HOUSE-2A（#364）「あたらしい！」の 印。仕様 §2.3。印の ある ボタンの 中に 1 こ（data-testid="editor-new-mark"）。ボタンの 外へ はみ出さない（右上に おさめる）。動かない。
// 印の ある ボタンは 窓口 `editor().marks`（ctl.recipes.marks()）の id。しゅるいの ボタン・ばしょの ボタン・あかり・まねきねこ・後ろの 文字。
import { btnInner, el } from './dom';
import { NEW_MARK } from './kindArt';

/** root の 中の ボタン（data-btn）に、marks に ある id なら 印を つけ、なければ はずす（かわった ボタンだけ さわる） */
export function syncNewMarks(root: ParentNode, marks: ReadonlySet<string>): void {
  for (const b of root.querySelectorAll<HTMLElement>('button[data-btn]')) {
    const on = marks.has(b.dataset.btn!);
    const host = btnInner(b);
    const mark = host.querySelector(':scope > .ed-newmark');
    if (on && !mark) {
      const m = el('span', 'ed-newmark', NEW_MARK);
      m.dataset.testid = 'editor-new-mark';
      host.append(m);
    } else if (!on && mark) mark.remove();
  }
}
