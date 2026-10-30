// HOUSE-1B ① そと の 画面（左 6 わり ＝ 回る 見本の 穴、右 4 わり ＝ よこ・たて・まどの かず・まどの しゅるい・やね）。仕様 §3.2 の ① そと。
// はじめから よこ 5・たて 5 を えらんだ 状態。戸は まえ 固定（えらぶ 画面は ない）。
// しゅるいの 行は ボタンが ふえても ならんで 折りかえす（あとで レシピで ふえる）。
import type { EditorController } from '../../house/editor/controller';
import { ROOF_KINDS, ROOF_LABEL, SIZES, WINDOW_KIND_LABEL, WINDOW_KINDS } from '../../house/editor/tuning';
import { btn, el, markSel, type BtnOpts } from './dom';
import { ICONS } from './icons';

/** 1 つの すすみの 画面（section）。view ＝ 見本の 穴（ない すすみは null）。update は 状態が かわった とき */
export interface StepPanel {
  el: HTMLElement;
  view: HTMLElement | null;
  update(): void;
}

type Press = BtnOpts['onPress'];

export function buildSoto(ctl: EditorController, press: Press): StepPanel {
  const root = el('section', 'ed-stepview ed-stepview--soto');
  const left = el('div', 'ed-left');
  const view = el('div', 'ed-view');
  view.dataset.testid = 'editor-preview';
  left.append(view);
  const side = el('aside', 'ed-side');
  const panel = el('div', 'ed-panel');
  side.append(panel);
  root.append(left, side);

  /** 行 1 つ: 名前（絵 ＋ 1〜2 行の 字。1 行ずつ 分けて 作る ので 折りかえさない）と ボタンの ならび */
  const row = (icon: string, lines: readonly string[]): HTMLElement => {
    const r = el('div', 'ed-row');
    r.append(el('div', 'ed-lab', `${icon}<span class="ed-lab__text">${lines.map((t) => `<span>${t}</span>`).join('')}</span>`));
    const opts = el('div', 'ed-opts');
    r.append(opts);
    panel.append(r);
    return opts;
  };

  // よこ・たて: 5・7・9
  const sizeRow = (axis: 'width' | 'depth', label: string, icon: string): Array<[number, HTMLButtonElement]> => {
    const opts = row(icon, [label]);
    return SIZES.map((n) => {
      const b = btn({ cls: 'ed-opt', id: `${axis}-${n}`, html: String(n), onPress: press });
      opts.append(b);
      return [n, b];
    });
  };
  const wBtns = sizeRow('width', 'よこ', ICONS.width);
  const dBtns = sizeRow('depth', 'たて', ICONS.depth);

  // まどの かず: − 数 ＋
  const winOpts = row(ICONS.window, ['まどの', 'かず']);
  const minus = btn({ cls: 'ed-opt', id: 'windowsDown', html: ICONS.minus, onPress: press });
  minus.setAttribute('aria-label', 'まどを へらす');
  const count = el('div', 'ed-count');
  count.dataset.testid = 'editor-win-count';
  const plus = btn({ cls: 'ed-opt', id: 'windowsUp', html: ICONS.plus, onPress: press });
  plus.setAttribute('aria-label', 'まどを ふやす');
  winOpts.append(minus, count, plus);

  // まどの しゅるい・やね: えらぶ ボタン（いまは 1 つずつ。1 つでも えらんで いる ✓）
  const kindOpts = row(ICONS.shoji, ['まどの', 'しゅるい']);
  const kindBtns = WINDOW_KINDS.map((k) => {
    const b = btn({ cls: 'ed-opt ed-opt--text', id: `windowKind-${k}`, html: WINDOW_KIND_LABEL[k], onPress: press });
    kindOpts.append(b);
    return [k, b] as const;
  });
  const roofOpts = row(ICONS.roof, ['やね']);
  const roofBtns = ROOF_KINDS.map((k) => {
    const b = btn({ cls: 'ed-opt ed-opt--text', id: `roof-${k}`, html: ROOF_LABEL[k], onPress: press });
    roofOpts.append(b);
    return [k, b] as const;
  });

  return {
    el: root,
    view,
    update(): void {
      const s = ctl.s;
      for (const [n, b] of wBtns) markSel(b, s.w === n);
      for (const [n, b] of dBtns) markSel(b, s.d === n);
      count.textContent = String(s.windows);
      count.classList.toggle('is-max', s.windows >= ctl.windowMax());
      for (const [k, b] of kindBtns) markSel(b, s.windowKind === k);
      for (const [k, b] of roofBtns) markSel(b, s.roof === k);
    },
  };
}
