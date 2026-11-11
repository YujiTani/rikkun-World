// HOUSE-1B ① そと の 画面（左 ＝ 回る 見本の 穴、右 ＝ パネル: よこ・たて ／ まどの かず ／ ばしょの ボタン 5 つ）。仕様 §3.2 の ① そと。
// HOUSE-2A（#364）: まどの しゅるい・やねの ボタンは なくし、ばしょの ボタン（やね・かべ・まど・と・かざり。絵 ＋ 字）を 押すと ポップアップ（placePopup.ts）が
// パネルと 同じ 場所に 重なって しゅるいの 一覧が 開く。名前の 行は なく、名前は ヘルプ（tipView.ts）で 出す。
// はじめから よこ 5・たて 5 を えらんだ 状態。戸は まえ 固定（えらぶ 画面は ない）。
import type { EditorController } from '../../house/editor/controller';
import { SIZES } from '../../house/editor/tuning';
import { PART_NAME, PARTS } from '../../house/recipes/kinds';
import { btn, el, markSel, type BtnOpts } from './dom';
import { ICONS } from './icons';
import { placeArt } from './kindArt';
import { PlacePopup } from './placePopup';

/** 1 つの すすみの 画面（section）。view ＝ 見本の 穴（ない すすみは null）。update は 状態が かわった とき */
export interface StepPanel {
  el: HTMLElement;
  view: HTMLElement | null;
  update(): void;
}

type Press = BtnOpts['onPress'];

export function buildSoto(ctl: EditorController, press: Press): StepPanel {
  const root = el('section', 'ed-stepview ed-stepview--soto');
  const left = el('div', 'ed-colL');
  left.dataset.col = 'L'; // ふきだしの はばを そろえる 左の 列
  const view = el('div', 'ed-view');
  view.dataset.testid = 'editor-preview';
  left.append(view);
  const side = el('aside', 'ed-side');
  const panel = el('div', 'ed-panel');
  const popup = new PlacePopup(ctl, press);
  side.append(panel, popup.el);
  root.append(left, side);

  /** まとまり（余白の 表の 14: まとまり → まとまり。中の 行 → 行 は 13） */
  const group = (): HTMLElement => {
    const g = el('div', 'ed-grp');
    panel.append(g);
    return g;
  };
  const gSize = group();
  const gWindow = group();
  const gPlace = group();

  /** 行 1 つ: 名前（絵 ＋ 1〜2 行の 字。1 行ずつ 分けて 作る ので 折りかえさない）と ボタンの ならび */
  const row = (g: HTMLElement, icon: string, lines: readonly string[]): HTMLElement => {
    const r = el('div', 'ed-row');
    r.append(el('div', 'ed-lab', `${icon}<span class="ed-lab__text">${lines.map((t) => `<span>${t}</span>`).join('')}</span>`));
    const opts = el('div', 'ed-opts');
    r.append(opts);
    g.append(r);
    return opts;
  };

  // よこ・たて: 5・7・9
  const sizeRow = (axis: 'width' | 'depth', label: string, icon: string): Array<[number, HTMLButtonElement]> => {
    const opts = row(gSize, icon, [label]);
    return SIZES.map((n) => {
      const b = btn({ cls: 'ed-opt', id: `${axis}-${n}`, html: String(n), onPress: press });
      opts.append(b);
      return [n, b];
    });
  };
  const wBtns = sizeRow('width', 'よこ', ICONS.width);
  const dBtns = sizeRow('depth', 'たて', ICONS.depth);

  // まどの かず: − 数 ＋
  const winOpts = row(gWindow, ICONS.window, ['まどの', 'かず']);
  const minus = btn({ cls: 'ed-opt', id: 'windowsDown', html: ICONS.minus, onPress: press });
  minus.setAttribute('aria-label', 'まどを へらす');
  const count = el('div', 'ed-count');
  count.dataset.testid = 'editor-win-count';
  const plus = btn({ cls: 'ed-opt', id: 'windowsUp', html: ICONS.plus, onPress: press });
  plus.setAttribute('aria-label', 'まどを ふやす');
  winOpts.append(minus, count, plus);

  // ばしょの ボタン（絵 ＋ 字）。押すと その ばしょの ポップアップが 開く。かざりは 1 つ おぼえる まで 出ない（出し入れは EditorView が 一覧どおりに）
  const places = el('div', 'ed-places');
  for (const part of PARTS) {
    const b = btn({ cls: 'ed-place', id: `part-${part}`, html: `<span class="ed-btn__in ed-place__in"><span class="ed-place__art">${placeArt(part)}</span><span class="ed-place__text">${PART_NAME[part]}</span></span>`, onPress: press });
    b.setAttribute('aria-label', PART_NAME[part]);
    b.style.setProperty('--chars', String([...PART_NAME[part]].length)); // はば ＝ 字の 数 × 24 ＋ 12（字体に よらず 表どおり）
    places.append(b);
  }
  gPlace.append(places);

  return {
    el: root,
    view,
    update(): void {
      const s = ctl.s;
      for (const [n, b] of wBtns) markSel(b, s.w === n);
      for (const [n, b] of dBtns) markSel(b, s.d === n);
      count.textContent = String(s.windows);
      count.classList.toggle('is-max', s.windows >= ctl.windowMax());
      // ポップアップが 開いて いる 間は、同じ 大きさの ポップアップが パネルを おおう（後ろの 字が 重ならない ように パネルは かくす）
      panel.hidden = ctl.popup !== null;
      popup.update();
    },
  };
}
