import { mouseHtml } from './craftPanel.art';
import { badgeHtml } from './settings/padBadge';
import { ruby } from './text';
import { createChip } from './theme';
import './settings/padScreen.css'; // .pad-badge（ボタンの 印）

/** ヘルプ帯の 場面: もちもの（マス）・つくる・やく（2 人用の ページ） */
export type HintKind = 'items' | 'craft' | 'bake';

export interface HintOptions {
  tansu: boolean;
  duo: boolean;
  /** 最後に さわったのが パッドか（GamepadReader.lastInput === 'gamepad'。2P は いつも true） */
  pad?: boolean;
  /** どの ページか（ふだんは 'items'） */
  kind?: HintKind;
  /** パッドで すてられるか（ふだんは true。false の ときは すてる ボタンを 出さない） */
  drop?: boolean;
}

const DPAD = badgeHtml(['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight']);
const BTN = (f: 'faceBottom' | 'faceTop' | 'faceLeft' | 'faceRight' | 'r3') => badgeHtml([f]);

/** パッド用の ひとこと（印, ことば）。2 人用は 半分の はばに 入る ように 短い ことばだけ */
function padRows(o: HintOptions): [string, string][] {
  const close = `${BTN('faceLeft')}${BTN('faceRight')}`;
  if (o.kind === 'craft' || o.kind === 'bake') {
    return [[DPAD, 'えらぶ'], [BTN('faceBottom'), o.kind === 'bake' ? 'やく' : 'つくる'], [close, 'とじる']];
  }
  return [
    [DPAD, 'えらぶ'],
    [BTN('faceBottom'), 'つかむ・おく'],
    ...(o.drop === false ? [] : ([[BTN('faceTop'), '1こ すてる']] as [string, string][])),
    ...(o.drop === false ? [] : ([[BTN('r3'), 'ぜんぶ すてる']] as [string, string][])),
    [close, 'とじる'],
  ];
}

/**
 * もちもの画面の 下の「ここで できる 操作」の ひとこと（チップ）。たんすの ときは 文を かえる。
 * 2 人用（duo）は 半分の はばに 入る ように いちばん だいじな 物だけ（「ぜんぶ すてる」「いっきに うつす」は 出さない）
 * pad が true の ときは コントローラーの 印（十字・A/B/X/Y）に きりかえる
 */
export function hintRows(o: HintOptions): [string, string][] {
  const { tansu, duo } = o;
  const K = (k: string) => `<span class="inv-key">${k}</span>`;
  const keyRows: [string, string][] =
    o.kind === 'craft' || o.kind === 'bake'
      ? [[`${mouseHtml('left')}クリック`, o.kind === 'bake' ? 'やく' : 'つくる'], [K('E'), 'とじる']]
      : [
          [K('Q'), '1こ すてる'],
          ...(duo ? [] : ([[`${K('Shift')}＋${K('Q')}`, 'ぜんぶ すてる']] as [string, string][])),
          [`${mouseHtml('left')}${ruby('枠', 'わく')}の そとへ ひっぱる`, 'すてる'],
          ...(tansu ? ([[`${K('Ctrl')}（${K('⌘')}）＋${mouseHtml('left')}クリック`, 'えらぶ（✓）']] as [string, string][]) : []),
          ...(duo ? [] : ([[`${K('Shift')}＋${mouseHtml('left')}クリック`, tansu ? 'たんす へ うつす' : 'いっきに うつす']] as [string, string][])),
          [`${mouseHtml('left')}ダブルクリック`, `${ruby('防具', 'ぼうぐ')}を ${ruby('着', 'き')}る・ぬぐ`],
          [K('E'), 'とじる'],
        ];
  return o.pad ? padRows(o) : keyRows;
}

export function buildHintChips(o: HintOptions): HTMLElement[] {
  return hintRows(o).map(([a, b]) => {
    const c = createChip({ text: '' });
    c.classList.add('inv-hint');
    if (o.pad) c.dataset.pad = '';
    const t = c.querySelector('.rk-chip__text')!;
    t.innerHTML = `${a}<span class="inv-hint-sep">:</span> ${b}`;
    return c;
  });
}
