// HOUSE-1B 確かめの まど（あたらしい せっけいず・ふとん だけ）と ひつような もの。
// 仕様 §2.5（Esc の 順）・§3.2（まん中の ポップアップ）。ふきだしは HouseUi の 1 つを 見出しの だんへ 移して 使う（index.ts の sayHost）。
import { itemDef } from '../../content/items/registry';
import type { EditorController } from '../../house/editor/controller';
import { CONFIRM_TEXT } from '../../house/editor/tuning';
import { itemIconUrl } from '../itemIcon';
import { withRuby } from '../text';
import { btn, el, type BtnOpts } from './dom';
import { ICONS } from './icons';

/** 確かめの まど（中身は ctl.confirm で かわる）。ボタンは yes（けす・このまま つくる）と no（やめる・かぐを おく） */
export class ConfirmPop {
  readonly el = el('div', 'ed-pop');
  private shown: string | null = null;

  constructor(private readonly ctl: EditorController, private readonly press: BtnOpts['onPress']) {
    this.el.hidden = true;
    this.el.dataset.testid = 'house-confirm';
  }

  update(): void {
    const c = this.ctl.confirm;
    this.el.hidden = c === null;
    if (c === this.shown) return;
    this.shown = c;
    if (c === null) return;
    this.el.dataset.kind = c;
    const [l1, l2] = CONFIRM_TEXT[c];
    const card = el('div', 'ed-card');
    card.append(el('p', 'ed-card__msg', withRuby(l1)), el('p', 'ed-card__msg', withRuby(l2)));
    const row = el('div', 'ed-card__btns');
    // やさしい ほうを 目立たせる（けす ほうは ふつうの ボタン）
    const yes = btn({ id: 'yes', html: c === 'reset' ? 'ぜんぶ けす' : 'このまま つくる', onPress: this.press });
    const no = btn({ cls: 'ed-btn--pri', id: 'no', html: c === 'reset' ? 'やめる' : 'かぐを おく', onPress: this.press });
    row.append(yes, no);
    card.append(row);
    this.el.replaceChildren(card);
  }
}

/** ひつような もの（1 行 ＝ 絵・名前・ひつよう・くら・たりない。足りない 数は 赤、足りて いれば 緑の ✓） */
export class NeedPop {
  readonly el = el('div', 'ed-pop');

  constructor(private readonly ctl: EditorController, private readonly press: BtnOpts['onPress']) {
    this.el.hidden = true;
    this.el.dataset.testid = 'house-need';
  }

  update(): void {
    this.el.hidden = !this.ctl.needOpen;
    if (!this.ctl.needOpen) return;
    const card = el('div', 'ed-card ed-need');
    card.append(el('h2', 'ed-need__title', 'ひつような もの'));
    const list = el('div', 'ed-need__list');
    list.append(el('div', 'ed-need__row ed-need__row--head', '<span></span><span></span><span class="is-num">ひつよう</span><span class="is-num">くら</span><span class="is-num">たりない</span>'));
    const rows = this.ctl.need();
    if (rows.length === 0) list.append(el('div', 'ed-need__row', '<span></span><span>まだ なにも いらないよ</span><span></span><span></span><span></span>'));
    for (const r of rows) {
      const name = itemDef(r.item)?.name ?? r.item;
      const short = r.short > 0 ? `<span class="ed-need__short">×${r.short}</span>` : `<span class="ed-need__short is-ok">${ICONS.check}</span>`;
      const row = el('div', 'ed-need__row', `<img alt="" src="${itemIconUrl(r.item)}"><span>${withRuby(name)}</span><span class="is-num">${r.need}</span><span class="is-num">${r.have}</span>${short}`);
      row.dataset.testid = 'need-row';
      row.dataset.item = r.item;
      row.dataset.need = String(r.need);
      row.dataset.have = String(r.have);
      row.dataset.short = String(r.short);
      list.append(row);
    }
    card.append(list, btn({ cls: 'ed-btn--pri', id: 'needClose', html: 'とじる', onPress: this.press }));
    this.el.replaceChildren(card);
  }
}
