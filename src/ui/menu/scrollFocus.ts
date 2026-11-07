// COOP-1 4c（§9.8）: 十字で えらんだ 物が 見える ように スクロールする（たんすの 中は 段ごと。ほかの 画面を 動かさない）。
import { scrollTopToShow } from '../../duo/invRules';

/** たんす（9 列）の マスの 数（たんすの 段の 数え方） */
const TANSU_COLUMNS = 9;

/**
 * 十字で えらんだ 物が 見える ように スクロールする。たんすの マスは たんすの 中だけ（`tansu-grid`）を 段ごとに 動かす
 * （§9.8。見えない 段は その 段の 上/下まで。ほかの 画面を 動かさない）。ほかの 物は ふつうの scrollIntoView
 */
export function scrollFocusIntoView(el: HTMLElement): void {
  const grid = el.dataset.tansu !== undefined ? el.closest<HTMLElement>('.tansu-grid') : null;
  if (!grid) {
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return;
  }
  const cs = getComputedStyle(grid);
  const pad = parseFloat(cs.paddingTop) || 0; // 段の 上は この すきまの 下から はじまる
  const next = scrollTopToShow(Number(el.dataset.tansu), {
    columns: TANSU_COLUMNS,
    rowHeight: el.offsetHeight,
    rowGap: parseFloat(cs.rowGap) || 0,
    viewHeight: grid.clientHeight,
    scrollTop: grid.scrollTop - pad,
  });
  grid.scrollTop = next <= 0 ? 0 : next + pad;
}
