// HOUSE-1B 試作: ③ なまえ の 画面（見本は 出さない）。左 ＝ 今の 名前（前 8 字＋後ろ）と 50 音（11 列 × 6 行。6 行めに カタカナ・1 もじ けす）、右 ＝ 後ろの 文字 5 つ。
// 仕様 §2.6・§3.2 の ③ なまえ。字は 50 音ボタンだけ（キーボードの 字は 受けない。Backspace ＝ 1 もじ けす）。
import { btn, el, markSel, setOff } from './dom';
import type { EditorController } from './editor';
import { ICONS } from './icons';
import { KANA_EXTRA, KANA_ROWS, toKatakana } from './model';
import { NAME_FRONT_MAX, SUFFIXES } from './tuning';
import type { StepPanel } from './uiSoto';

/** 6 行めの 3〜10 列めを まとめて うめる ボタンの 入れ物の しるし（カタカナ・1 もじ けす） */
const EXTRA = '#extra';

/** 50 音表の 11 列 × 6 行: 10 列は あ〜わ（5 行）、11 列めは ゛ ゜ っ ゃ ゅ ょ。6 行めは ー・1 マス あき・ボタンの 入れ物（3〜10 列め）・ょ */
function kanaLayout(): string[][] {
  const rows: string[][] = [];
  for (let r = 0; r < 5; r++) {
    const row: string[] = [];
    for (let c = 0; c < 10; c++) row.push([...KANA_ROWS[r]!][c]!.trim());
    row.push(KANA_EXTRA[r]!);
    rows.push(row);
  }
  rows.push(['ー', '', EXTRA, KANA_EXTRA[5]!]);
  return rows;
}

export function buildNamae(ctl: EditorController): StepPanel {
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
  kana.dataset.testid = 'editor-kana';
  const kbtns: Array<{ b: HTMLButtonElement; ch: string }> = [];
  /** 6 行めの ー の 右に 1 マス あけて ならべる ボタン（カタカナ・1 もじ けす。下で 作って 6 行めに 入れる） */
  const extra = el('div', 'ed-kana__extra');
  for (const row of kanaLayout()) {
    for (const ch of row) {
      if (ch === EXTRA) {
        kana.append(extra);
        continue;
      }
      if (!ch) {
        kana.append(el('div'));
        continue;
      }
      const mark = ch === '゛' ? 'dakuten' : ch === '゜' ? 'handakuten' : null;
      const b = btn({
        cls: 'ed-kbtn',
        html: mark ? ICONS[mark] : ch,
        testid: `editor-kana-${ch}`,
        onClick: () => {
          if (ch === '゛') ctl.mark('dakuten');
          else if (ch === '゜') ctl.mark('handakuten');
          else ctl.char(ctl.katakana ? toKatakana(ch) : ch);
        },
      });
      if (mark) b.setAttribute('aria-label', mark === 'dakuten' ? 'てんてん' : 'まる');
      kbtns.push({ b, ch });
      kana.append(b);
    }
  }
  main.append(plate, kana);

  const side = el('div', 'ed-namae__side');
  const sufBtns = SUFFIXES.map((suf) => {
    const b = btn({ html: suf, testid: `editor-suffix-${suf}`, onClick: () => void ctl.suffix(suf) });
    side.append(b);
    return { b, suf };
  });
  const kata = btn({ html: 'カタカナ', testid: 'editor-katakana', onClick: () => ctl.setKatakana(!ctl.katakana) });
  const erase = btn({ html: '1 もじ けす', testid: 'editor-erase', onClick: () => void ctl.erase() });
  extra.append(kata, erase);
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
      const full = chars.length >= NAME_FRONT_MAX;
      for (const { b, ch } of kbtns) {
        if (ch === '゛') setOff(b, !ctl.canMark('dakuten'), true);
        else if (ch === '゜') setOff(b, !ctl.canMark('handakuten'), true);
        else {
          const label = ctl.katakana ? toKatakana(ch) : ch;
          if (b.firstChild?.textContent !== label) b.textContent = label;
          setOff(b, full, true);
        }
      }
      for (const { b, suf } of sufBtns) markSel(b, ctl.s.name.back === suf);
      markSel(kata, ctl.katakana);
      setOff(erase, chars.length === 0, true);
    },
  };
}
