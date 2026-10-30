// HOUSE-1B 試作: ① そと の 画面（左 6 わり ＝ 回る 見本の 穴、右 4 わり ＝ よこ・たて・まど・と）。仕様 §3.2 の ① そと。
import { btn, el, markSel, setOff } from './dom';
import type { EditorController } from './editor';
import { houseTopIcon, ICONS } from './icons';
import { SIZES, WALL_LABEL, type Size, type Wall } from './tuning';

/** 1 つの すすみの 画面（section）。view ＝ 見本の 穴（ない すすみは null） */
export interface StepPanel {
  el: HTMLElement;
  view: HTMLElement | null;
  update(): void;
}

export function buildSoto(ctl: EditorController): StepPanel {
  const root = el('section', 'ed-stepview ed-stepview--soto');
  const left = el('div', 'ed-left');
  const view = el('div', 'ed-view');
  view.dataset.testid = 'editor-preview';
  left.append(view);
  const side = el('aside', 'ed-side');
  const panel = el('div', 'ed-panel');
  side.append(panel);
  root.append(left, side);

  // よこ・たて: 5・7・9
  const sizeRow = (axis: 'w' | 'd', label: string, icon: string, testid: string): Array<[Size, HTMLButtonElement]> => {
    const row = el('div', 'ed-row');
    row.dataset.testid = testid;
    row.append(el('div', 'ed-lab', `${icon}<span>${label}</span>`));
    const opts = el('div', 'ed-opts');
    const out: Array<[Size, HTMLButtonElement]> = [];
    for (const n of SIZES) {
      const b = btn({ cls: 'ed-opt', html: String(n), testid: `${testid}-${n}`, onClick: () => void ctl.setSize({ [axis]: n }) });
      opts.append(b);
      out.push([n, b]);
    }
    row.append(opts);
    panel.append(row);
    return out;
  };
  const wBtns = sizeRow('w', 'よこ', ICONS.width, 'editor-size-w');
  const dBtns = sizeRow('d', 'たて', ICONS.depth, 'editor-size-d');

  // まど: − 数 ＋
  const winRow = el('div', 'ed-row');
  winRow.dataset.testid = 'editor-windows';
  winRow.append(el('div', 'ed-lab', `${ICONS.window}<span>まど</span>`));
  const winOpts = el('div', 'ed-opts');
  const minus = btn({ cls: 'ed-opt', html: ICONS.minus, testid: 'editor-win-minus', onClick: () => void ctl.windows(-1) });
  const count = el('div', 'ed-count');
  count.dataset.testid = 'editor-win-count';
  const plus = btn({ cls: 'ed-opt', html: ICONS.plus, testid: 'editor-win-plus', onClick: () => void ctl.windows(1) });
  winOpts.append(minus, count, plus);
  winRow.append(winOpts);
  panel.append(winRow);

  // と: まえ・うしろ・ひだり・みぎ（家の 絵の まわりに）
  const door = el('div', 'ed-door');
  door.dataset.testid = 'editor-door';
  const house = el('div', 'ed-door__house');
  const doorBtn = (wall: Wall, col: number, row: number): [Wall, HTMLButtonElement] => {
    const b = btn({ html: WALL_LABEL[wall], testid: `editor-door-${wall}`, onClick: () => void ctl.door(wall) });
    b.style.gridColumn = String(col);
    b.style.gridRow = String(row);
    return [wall, b];
  };
  const doors = [doorBtn('back', 2, 1), doorBtn('left', 1, 2), doorBtn('right', 3, 2), doorBtn('front', 2, 3)];
  door.append(house, ...doors.map(([, b]) => b));
  panel.append(door);

  return {
    el: root,
    view,
    update(): void {
      const s = ctl.s;
      for (const [n, b] of wBtns) markSel(b, s.w === n);
      for (const [n, b] of dBtns) markSel(b, s.d === n);
      const max = ctl.windowMax();
      count.textContent = String(s.windows);
      count.classList.toggle('is-max', ctl.sizeChosen() && s.windows >= max);
      setOff(minus, !ctl.sizeChosen() || s.windows <= 0, true);
      setOff(plus, !ctl.sizeChosen() || s.windows >= max, true);
      for (const [wall, b] of doors) markSel(b, s.door === wall);
      house.innerHTML = houseTopIcon(s.door);
    },
  };
}
