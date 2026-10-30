// HOUSE-1B ③ なまえ の 画面（名札・50 音の ボタン 11×6・後ろの 文字 5 つ・カタカナ・1 もじ けす）。仕様 §2.6・§3.2 の ③ なまえ。
// ボタンの id は ひらがな（カタカナに しても id は ひらがなの まま）。押すと 入る 字は カタカナ。
import type { EditorController } from '../../house/editor/controller';
import { KANA_LAYOUT, toKatakana } from '../../house/editor/model';
import { NAME_FRONT_MAX, SUFFIXES } from '../../house/editor/tuning';
import { btn, el, markSel, type BtnOpts } from './dom';
import { ICONS } from './icons';
import type { StepPanel } from './soto';

const MARKS: Readonly<Record<string, { id: 'dakuten' | 'handakuten'; label: string }>> = {
  '゛': { id: 'dakuten', label: 'てんてん' },
  '゜': { id: 'handakuten', label: 'まる' },
};

export function buildNamae(ctl: EditorController, press: BtnOpts['onPress']): StepPanel {
  const root = el('section', 'ed-stepview ed-stepview--namae');
  const wrap = el('div', 'ed-namae');
  const main = el('div', 'ed-namae__main');
  const plate = el('div', 'ed-plate');
  plate.dataset.testid = 'editor-name';
  const slots = Array.from({ length: NAME_FRONT_MAX }, () => el('div', 'ed-slot'));
  const suffixText = el('div', 'ed-suffix-text');
  plate.append(...slots, suffixText);
  const kana = el('div', 'ed-kana');
  const kbtns: Array<{ b: HTMLButtonElement; ch: string }> = [];
  for (const row of KANA_LAYOUT) {
    for (const ch of row) {
      if (!ch) {
        kana.append(el('div'));
        continue;
      }
      const mark = MARKS[ch];
      const b = btn({ cls: 'ed-kbtn', id: mark ? mark.id : `char-${ch}`, html: mark ? ICONS[mark.id] : ch, onPress: press });
      if (mark) b.setAttribute('aria-label', mark.label);
      else kbtns.push({ b, ch });
      kana.append(b);
    }
  }
  main.append(plate, kana);

  const side = el('div', 'ed-namae__side');
  const sufBtns = SUFFIXES.map((suf, i) => {
    const b = btn({ id: `suffix-${i}`, html: suf, onPress: press });
    side.append(b);
    return { b, suf };
  });
  side.append(el('div', 'ed-namae__gap'));
  const kata = btn({ id: 'katakana', html: 'カタカナ', onPress: press });
  const erase = btn({ id: 'erase', html: '1 もじ けす', onPress: press });
  side.append(kata, erase);
  wrap.append(main, side);
  root.append(wrap);

  return {
    el: root,
    view: null,
    update(): void {
      const chars = [...ctl.s.name.front];
      slots.forEach((slot, i) => {
        slot.textContent = chars[i] ?? '';
        slot.classList.toggle('is-filled', i < chars.length);
      });
      suffixText.textContent = ctl.s.name.back;
      for (const { b, ch } of kbtns) {
        const label = ctl.katakana ? toKatakana(ch) : ch;
        if (b.firstChild?.textContent !== label) b.textContent = label;
      }
      for (const { b, suf } of sufBtns) markSel(b, ctl.s.name.back === suf);
      markSel(kata, ctl.katakana);
    },
  };
}
