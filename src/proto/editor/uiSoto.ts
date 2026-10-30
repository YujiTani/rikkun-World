// HOUSE-1B 試作: ① そと の 画面（左 6 わり ＝ 回る 見本の 穴、右 4 わり ＝ よこ・たて・まどの かず・まどの しゅるい・やね）。仕様 §3.2 の ① そと。
// はじめから よこ 5・たて 5 を えらんだ 状態。戸は まえ 固定（えらぶ 画面は ない）。
// しゅるいの 行は ボタンが ふえても ならんで 折りかえす（あとで レシピで ふえる）。まどの 行に 手を おくと 見本の 窓が 光る。
import { btn, el, markSel, setOff } from './dom';
import type { EditorController } from './editor';
import { ICONS } from './icons';
import type { Preview3D } from './preview';
import { ROOF_KINDS, ROOF_LABEL, SIZES, WINDOW_KIND_LABEL, WINDOW_KINDS, type Size } from './tuning';
import { bindDrag } from './uiDrag';

/** 1 つの すすみの 画面（section）。view ＝ 見本の 穴（ない すすみは null） */
export interface StepPanel {
  el: HTMLElement;
  view: HTMLElement | null;
  update(): void;
}

export function buildSoto(ctl: EditorController, preview: Preview3D): StepPanel {
  const root = el('section', 'ed-stepview ed-stepview--soto');
  const left = el('div', 'ed-left');
  const view = el('div', 'ed-view');
  view.dataset.testid = 'editor-preview';
  bindDrag(view, preview);
  left.append(view);
  const side = el('aside', 'ed-side');
  const panel = el('div', 'ed-panel');
  side.append(panel);
  root.append(left, side);

  /** 行 1 つ: 名前（絵 ＋ 1〜2 行の 字。1 行ずつ 分けて 作る ので 折りかえさない）と ボタンの ならび */
  const row = (testid: string, icon: string, lines: readonly string[]): HTMLElement => {
    const r = el('div', 'ed-row');
    r.dataset.testid = testid;
    r.append(el('div', 'ed-lab', `${icon}<span class="ed-lab__text">${lines.map((t) => `<span>${t}</span>`).join('')}</span>`));
    const opts = el('div', 'ed-opts');
    r.append(opts);
    panel.append(r);
    return opts;
  };
  /** この ボタンの ならびに 手を おいて いる 間、見本の 窓を 光らせる */
  const glowOnHover = (opts: HTMLElement): void => {
    opts.addEventListener('pointerenter', () => preview.setHover(true));
    opts.addEventListener('pointerleave', () => preview.setHover(false));
    opts.addEventListener('focusin', () => preview.setHover(true));
    opts.addEventListener('focusout', () => preview.setHover(false));
  };

  // よこ・たて: 5・7・9
  const sizeRow = (axis: 'w' | 'd', label: string, icon: string, testid: string): Array<[Size, HTMLButtonElement]> => {
    const opts = row(testid, icon, [label]);
    return SIZES.map((n) => {
      const b = btn({ cls: 'ed-opt', html: String(n), testid: `${testid}-${n}`, onClick: () => void ctl.setSize({ [axis]: n }) });
      opts.append(b);
      return [n, b];
    });
  };
  const wBtns = sizeRow('w', 'よこ', ICONS.width, 'editor-size-w');
  const dBtns = sizeRow('d', 'たて', ICONS.depth, 'editor-size-d');

  // まどの かず: − 数 ＋
  const winOpts = row('editor-windows', ICONS.window, ['まどの', 'かず']);
  const minus = btn({ cls: 'ed-opt', html: ICONS.minus, testid: 'editor-win-minus', onClick: () => void ctl.windows(-1) });
  minus.setAttribute('aria-label', 'まどを へらす');
  const count = el('div', 'ed-count');
  count.dataset.testid = 'editor-win-count';
  const plus = btn({ cls: 'ed-opt', html: ICONS.plus, testid: 'editor-win-plus', onClick: () => void ctl.windows(1) });
  plus.setAttribute('aria-label', 'まどを ふやす');
  winOpts.append(minus, count, plus);
  glowOnHover(winOpts);

  // まどの しゅるい・やね: えらぶ ボタン（いまは 1 つずつ。1 つでも えらんで いる ✓）
  const kindOpts = row('editor-window-kind', ICONS.shoji, ['まどの', 'しゅるい']);
  const kindBtns = WINDOW_KINDS.map((k) => {
    const b = btn({ cls: 'ed-opt ed-opt--text', html: WINDOW_KIND_LABEL[k], testid: `editor-window-kind-${k}`, onClick: () => void ctl.setWindowKind(k) });
    kindOpts.append(b);
    return [k, b] as const;
  });
  glowOnHover(kindOpts);
  const roofOpts = row('editor-roof', ICONS.roof, ['やね']);
  const roofBtns = ROOF_KINDS.map((k) => {
    const b = btn({ cls: 'ed-opt ed-opt--text', html: ROOF_LABEL[k], testid: `editor-roof-${k}`, onClick: () => void ctl.setRoof(k) });
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
      const max = ctl.windowMax();
      count.textContent = String(s.windows);
      count.classList.toggle('is-max', s.windows >= max);
      setOff(minus, s.windows <= 0, true);
      setOff(plus, s.windows >= max, true);
      for (const [k, b] of kindBtns) markSel(b, s.windowKind === k);
      for (const [k, b] of roofBtns) markSel(b, s.roof === k);
    },
  };
}
