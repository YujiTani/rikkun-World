// HOUSE-1B エディターの ボタン（窓口 `menu().buttons` と 画面の ボタンの 元）。DOM・three なし。
// 画面は ここで 決めた 一覧に ある id の ボタンだけを 見せ、enabled が false の ものは 押せなくする（窓口と 画面が くい違わない ように 1 か所）。
// id は DOM の data-testid ＝ "house-btn-" ＋ id（テストの 約束 e2e/helpers/house.ts の 先頭）。
import type { EditorController } from './controller';
import { FURN_ORDER } from './furniture';
import { KANA_CHARS, canAddChar } from './model';
import { ROOF_KINDS, SIZES, SUFFIXES, WINDOW_KINDS } from './tuning';

export interface EditorButton {
  id: string;
  enabled: boolean;
}

const b = (id: string, enabled = true): EditorButton => ({ id, enabled });

/** どの すすみにも ある 上と 下の 帯の ボタン */
function bars(c: EditorController): EditorButton[] {
  const step = c.s.step;
  const out = [b('undo', c.canUndo()), b('redo', c.canRedo()), b('close'), b('new'), b('need')];
  if (step !== 'soto') out.push(b('prev'));
  if (step !== 'namae') out.push(b('next'));
  out.push(b('done'));
  return out;
}

function soto(c: EditorController): EditorButton[] {
  const s = c.s;
  return [
    ...SIZES.map((n) => b(`width-${n}`)),
    ...SIZES.map((n) => b(`depth-${n}`)),
    b('windowsDown', s.windows > 0),
    b('windowsUp', s.windows < c.windowMax()),
    ...WINDOW_KINDS.map((k) => b(`windowKind-${k}`)),
    ...ROOF_KINDS.map((k) => b(`roof-${k}`)),
  ];
}

function naka(c: EditorController): EditorButton[] {
  const out = [...FURN_ORDER.map((k) => b(`furniture-${k}`)), b('light')];
  if (c.sel.placed !== null) out.push(b('take'), b('turnRight'), b('turnLeft'));
  return out;
}

function namae(c: EditorController): EditorButton[] {
  const room = canAddChar(c.s.name.front);
  return [
    ...KANA_CHARS.map((ch) => b(`char-${ch}`, room)),
    b('dakuten', c.canMark('dakuten')),
    b('handakuten', c.canMark('handakuten')),
    b('katakana'),
    b('erase', c.s.name.front.length > 0),
    ...SUFFIXES.map((_, i) => b(`suffix-${i}`)),
  ];
}

/** エディター本体の ボタン ぜんぶ（ポップアップは 数えない。画面は これで 見える・押せるを 決める） */
export function baseButtons(c: EditorController): EditorButton[] {
  const step = c.s.step;
  return [...bars(c), ...(step === 'soto' ? soto(c) : step === 'naka' ? naka(c) : namae(c))];
}

/** いま 画面に 見えて いる ボタン ぜんぶ（確かめの まどが 出て いる 間は yes・no だけ、ひつような ものが 出て いる 間は needClose だけ） */
export function editorButtons(c: EditorController): EditorButton[] {
  if (c.confirm) return [b('yes'), b('no')];
  if (c.needOpen) return [b('needClose')];
  return baseButtons(c);
}
