/**
 * 1 コマの仕事の量（メッシュ作り・光の計算）を 何で決めるか（#179。docs/tickets/E2E-179.md）。
 * - 'time'（既定。遊ぶとき・dev・perf・公開）: 本当の時間（ms）。機械の速さで 1 コマの仕事が変わる。
 * - 'count'（E2E のサーバー）: 数。同じコマ数なら どの機械でも同じ結果になる。
 */
export type FrameClock = 'time' | 'count';

/** count: 1 コマに作るメッシュ（箱・小ブロック）の数の上限 */
export const COUNT_MESH_MAX = 8;
/** count: 1 コマに作る小ブロックの数の上限（作ったらそのコマはおしまい） */
export const COUNT_MICRO_MAX = 1;
/** count: メッシュを作らない（全部空気・見えない）ものもふくめて 1 コマに片づける数の上限（止まらないように） */
export const COUNT_MESH_TOTAL_MAX = 256;
/** count: 光で ただで片づけるものもふくめて 1 コマに見る数の上限 */
export const COUNT_LIGHT_TOTAL_MAX = 64;

/** 決める順: URL の ?clock=time|count > 環境変数 VITE_FRAME_CLOCK が count なら 'count' > 'time'。ほかの値・空は無いのと同じ */
export function decideFrameClock(search: string, envDefault: string | undefined): FrameClock {
  const raw = new URLSearchParams(search).get('clock');
  if (raw === 'time' || raw === 'count') return raw;
  return envDefault === 'count' ? 'count' : 'time';
}
