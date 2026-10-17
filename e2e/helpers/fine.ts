/**
 * 細かいメッシュ（小ブロック 9×9×9。microR=32）のまま回す spec のための道具（#180、docs/tickets/E2E-180.md）。
 *
 * E2E の開発サーバーは `VITE_MICRO_DEFAULT=off` で起動する（playwright.config.ts。影の `VITE_SHADOW_DEFAULT=off` と同じ考え）。
 * そのため URL に `?microR` を付けないと、小ブロックを作らない（近くも箱の段だけ。起動が 8〜12 秒はやい）。
 * 次のどれかに当たる spec・テストは、URL に `microR=32` を足して、ふつうに遊ぶときと同じメッシュで回す:
 *   (a) 地形の画素・色・すけ・AO を読む / (b) メッシュの段・セクション数・三角形・描画回数・バイトを確かめる /
 *   (c) 影を見る / (d) オーナーや ui-reviewer が地形の見た目を判断するスクショを撮る
 * どのテストに付けたかは docs/tickets/E2E-180.md の表に書く。迷ったら付ける。
 */

/** ふつうに遊ぶときの小ブロックの半径（src/world/render/voxel/tier.ts の DEFAULT_MICRO_R と同じ） */
export const FINE_MICRO_R = 32;

/**
 * URL の query（'?nosave=1' など。空でもよい）に `microR=32` を足す。もう `microR=` があれば そのまま返す。
 *   fine('?nosave=1') → '?nosave=1&microR=32' / fine('') → '?microR=32'
 */
export function fine(query = ''): string {
  if (/[?&]microR=/.test(query)) return query;
  const q = query.replace(/^\?/, '');
  return q ? `?${q}&microR=${FINE_MICRO_R}` : `?microR=${FINE_MICRO_R}`;
}
