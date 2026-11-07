import { mouseHtml } from './craftPanel.art';
import { ruby } from './text';
import { createChip } from './theme';

/**
 * もちもの画面の 下の「ここで できる 操作」の ひとこと（チップ）。たんすの ときは 文を かえる。
 * 2 人用（duo）は 半分の はばに 入る ように いちばん だいじな 物だけ（「ぜんぶ すてる」「いっきに うつす」は 出さない）
 */
export function buildHintChips(o: { tansu: boolean; duo: boolean }): HTMLElement[] {
  const { tansu, duo } = o;
  const K = (k: string) => `<span class="inv-key">${k}</span>`;
  const rows: [string, string][] = [
    [K('Q'), '1こ すてる'],
    ...(duo ? [] : ([[`${K('Shift')}＋${K('Q')}`, 'ぜんぶ すてる']] as [string, string][])),
    [`${mouseHtml('left')}${ruby('枠', 'わく')}の そとへ ひっぱる`, 'すてる'],
    ...(tansu ? ([[`${K('Ctrl')}（${K('⌘')}）＋${mouseHtml('left')}クリック`, 'えらぶ（✓）']] as [string, string][]) : []),
    ...(duo ? [] : ([[`${K('Shift')}＋${mouseHtml('left')}クリック`, tansu ? 'たんす へ うつす' : 'いっきに うつす']] as [string, string][])),
    [`${mouseHtml('left')}ダブルクリック`, `${ruby('防具', 'ぼうぐ')}を ${ruby('着', 'き')}る・ぬぐ`],
    [K('E'), 'とじる'],
  ];
  return rows.map(([a, b]) => {
    const c = createChip({ text: '' });
    c.classList.add('inv-hint');
    const t = c.querySelector('.rk-chip__text')!;
    t.innerHTML = `${a}<span class="inv-hint-sep">:</span> ${b}`;
    return c;
  });
}
