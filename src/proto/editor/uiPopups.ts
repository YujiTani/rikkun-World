// HOUSE-1B 試作: 確かめの まど（あたらしい せっけいず・ふとん だけ）・ひつような もの・建築士さんの ふきだし。
// 仕様 §2.5（Esc の 順）・§2.4 の 7・§3.2（まん中の ポップアップ・ふきだしは 見本・方眼の 上に 重ねる）。
import type { ItemId } from '../../contracts';
import { itemDef } from '../../content/items/registry';
import { itemIconUrl } from '../../ui/itemIcon';
import { withRuby } from '../../ui/text';
import { btn, el } from './dom';
import { MSG, type EditorController } from './editor';
import { ICONS } from './icons';

/** 確かめの まど（中身は ctl.confirm で かわる） */
export class ConfirmPop {
  readonly el = el('div', 'ed-pop');
  private shown: string | null = null;

  constructor(private readonly ctl: EditorController) {
    this.el.hidden = true;
    this.el.dataset.testid = 'editor-confirm';
  }

  update(): void {
    const c = this.ctl.confirm;
    this.el.hidden = c === null;
    if (c === this.shown) return;
    this.shown = c;
    if (c === null) return;
    const [l1, l2] = c === 'reset' ? MSG.reset : MSG.futonOnly;
    const card = el('div', 'ed-card');
    card.append(el('p', 'ed-card__msg', withRuby(l1)), el('p', 'ed-card__msg', withRuby(l2)));
    const row = el('div', 'ed-card__btns');
    // やさしい ほうを 目立たせる（けす ほうは ふつうの ボタン）
    const yes = btn({ html: c === 'reset' ? 'ぜんぶ けす' : 'このまま つくる', testid: 'editor-confirm-yes', onClick: () => this.ctl.confirmYes() });
    const no = btn({ cls: 'ed-btn--pri', html: c === 'reset' ? 'やめる' : 'かぐを おく', testid: 'editor-confirm-no', onClick: () => this.ctl.confirmNo() });
    row.append(yes, no);
    card.append(row);
    this.el.replaceChildren(card);
  }
}

/** ひつような もの（1 行 ＝ 絵・名前・ひつよう・くら・たりない。足りない 数は 赤、足りて いれば 緑の ✓） */
export class NeedPop {
  readonly el = el('div', 'ed-pop');

  constructor(private readonly ctl: EditorController) {
    this.el.hidden = true;
    this.el.dataset.testid = 'editor-need';
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
      const row = el('div', 'ed-need__row', `<img alt="" src="${itemIconUrl(r.item as ItemId)}"><span>${withRuby(name)}</span><span class="is-num">${r.need}</span><span class="is-num">${r.have}</span>${short}`);
      row.dataset.item = r.item;
      list.append(row);
    }
    card.append(list, btn({ cls: 'ed-btn--pri', html: 'とじる', testid: 'editor-need-close', onClick: () => this.ctl.closeNeed() }));
    this.el.replaceChildren(card);
  }
}

/** 建築士さんの ふきだし（顔の 小さな 絵 ＋ ふきだし）。3 秒で 消える。押しても 消える */
export class Say {
  readonly el = el('div', 'ed-say');
  private readonly text = el('p', 'ed-say__text');
  private seq = 0;
  private left = 0;

  constructor(private readonly ctl: EditorController, private readonly onHide: () => void) {
    this.el.hidden = true;
    this.el.dataset.testid = 'editor-bubble';
    this.el.append(el('div', 'ed-say__face', ICONS.face), this.text);
    this.el.addEventListener('click', () => this.onHide());
  }

  /** ふきだしが かわったら 出しなおす（3 秒 ＝ 180 ステップ） */
  update(ticks: number): void {
    const b = this.ctl.bubble;
    this.el.hidden = b === null;
    if (!b) return;
    if (b.seq !== this.seq) {
      this.seq = b.seq;
      this.left = ticks;
      this.text.innerHTML = withRuby(b.text);
      // 出しなおす アニメーション
      this.el.style.animation = 'none';
      void this.el.offsetWidth;
      this.el.style.animation = '';
    }
  }

  tick(): void {
    if (this.left <= 0) return;
    if (--this.left === 0) this.onHide();
  }
}
