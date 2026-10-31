// HOUSE-1B ③ なまえ の 画面（名札・50 音の ボタン 11×6〔6 行めに カタカナ・1 もじ けす〕・後ろの 文字 5 つ）。仕様 §2.6・§3.2 の ③ なまえ。
// ボタンの id は ひらがな（カタカナに しても id は ひらがなの まま）。押すと 入る 字は カタカナ。
import { KANA_LAYOUT, toKatakana, type EditorState } from '../../house/editor/model';
import { NAME_FRONT_MAX, SUFFIXES } from '../../house/editor/tuning';
import { btn, el, markSel, type BtnOpts } from './dom';
import { ICONS } from './icons';
import type { StepPanel } from './soto';

/** 6 行めの 3〜10 列め（0 から数えて 2〜9）。ここは 空きの マスを 並べず、カタカナ・1 もじ けす の 入れ物 1 つで うめる（CSS の grid-column 3 / 11） */
const EXTRA_FROM = 2;
const EXTRA_TO = 9;

const MARKS: Readonly<Record<string, { id: 'dakuten' | 'handakuten'; label: string }>> = {
  '゛': { id: 'dakuten', label: 'てんてん' },
  '゜': { id: 'handakuten', label: 'まる' },
};

/** 名前の 画面が 読む もの（エディターの ③ と、なまえを かえる〔HOUSE-1C〕の 両方が 同じ 画面を 使う） */
export interface NameSource {
  name(): EditorState['name'];
  katakana(): boolean;
}

export function buildNamae(src: NameSource, press: BtnOpts['onPress']): StepPanel {
  const root = el('section', 'ed-stepview ed-stepview--namae');
  const wrap = el('div', 'ed-namae');
  const main = el('div', 'ed-namae__main');
  main.dataset.col = 'L'; // ふきだしの はばを そろえる 左の 列
  const plate = el('div', 'ed-plate');
  plate.dataset.testid = 'editor-name';
  const slots = Array.from({ length: NAME_FRONT_MAX }, () => el('div', 'ed-slot'));
  const suffixText = el('div', 'ed-suffix-text');
  plate.append(...slots, suffixText);
  const kana = el('div', 'ed-kana');
  const kbtns: Array<{ b: HTMLButtonElement; ch: string }> = [];
  /** 6 行めの ー の 右に 1 マス あけて ならべる ボタン（カタカナ・1 もじ けす。下で 作って 6 行めに 入れる） */
  const extra = el('div', 'ed-kana__extra');
  KANA_LAYOUT.forEach((row, r) => {
    row.forEach((ch, c) => {
      if (r === KANA_LAYOUT.length - 1 && c >= EXTRA_FROM && c <= EXTRA_TO) {
        if (c === EXTRA_FROM) kana.append(extra);
        return;
      }
      if (!ch) {
        kana.append(el('div'));
        return;
      }
      const mark = MARKS[ch];
      const b = btn({ cls: 'ed-kbtn', id: mark ? mark.id : `char-${ch}`, html: mark ? ICONS[mark.id] : ch, onPress: press });
      if (mark) b.setAttribute('aria-label', mark.label);
      else kbtns.push({ b, ch });
      kana.append(b);
    });
  });
  main.append(plate, kana);

  const side = el('div', 'ed-namae__side');
  const sufBtns = SUFFIXES.map((suf, i) => {
    const b = btn({ id: `suffix-${i}`, html: suf, onPress: press });
    side.append(b);
    return { b, suf };
  });
  const kata = btn({ id: 'katakana', html: 'カタカナ', onPress: press });
  const erase = btn({ id: 'erase', html: '1 もじ けす', onPress: press });
  extra.append(kata, erase);
  wrap.append(main, side);
  root.append(wrap);

  return {
    el: root,
    view: null,
    update(): void {
      const name = src.name();
      const katakana = src.katakana();
      const chars = [...name.front];
      slots.forEach((slot, i) => {
        slot.textContent = chars[i] ?? '';
        slot.classList.toggle('is-filled', i < chars.length);
      });
      suffixText.textContent = name.back;
      for (const { b, ch } of kbtns) {
        const label = katakana ? toKatakana(ch) : ch;
        if (b.firstChild?.textContent !== label) b.textContent = label;
      }
      for (const { b, suf } of sufBtns) markSel(b, name.back === suf);
      markSel(kata, katakana);
    },
  };
}
