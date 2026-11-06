/**
 * 札の置き場所と、ボタンの四角から札までの線（計算だけ。DOM は触らない）。
 * 線は「四角から横にまっすぐ → 札の列のそばで 1 回だけ曲がって札へ」の折れ線（折れは多くても 1 回）。
 * 同じ側の線が交わらない決まり:
 *  - 四角の高さの順と、札のまとまりの順を同じにする
 *  - 曲がる位置（x）は全部の線で同じ。横の部分は曲がる位置より外がわ、斜めの部分は内がわだけにあるので、
 *    両はしの順が同じなら たがいに交わらない
 */
import type { PadSide } from './padGroups';

export interface SideGroup {
  id: string;
  /** 四角の外がわの辺の x と、その中心の y（stage 座標） */
  boxX: number;
  boxY: number;
  rows: number;
}

export interface LayoutParams {
  side: PadSide;
  /** 札の列の、図に近い側の辺の x */
  edgeX: number;
  rowH: number;
  rowGap: number;
  stackGap: number;
  /** 札の列の辺から曲がる位置までの はなれ（px） */
  run: number;
  /** この高さいっぱいに、札のまとまりを同じすきまで ならべる（左右の列の上と下をそろえる）。まとまりが 1 つだけのときは四角の高さに近づける */
  span?: number;
}

export interface PlacedGroup {
  id: string;
  top: number;
  height: number;
  /** 四角 → 曲がり角 → 札。まっすぐなときは 2 点 */
  points: [number, number][];
}

export function stackHeight(rows: number, p: Pick<LayoutParams, 'rowH' | 'rowGap'>): number {
  return rows * p.rowH + Math.max(0, rows - 1) * p.rowGap;
}

/** 片がわの全部の札の高さ（まとまりのあいだの最小のすきまこみ） */
export function sideHeight(rowsList: readonly number[], p: Pick<LayoutParams, 'rowH' | 'rowGap' | 'stackGap'>): number {
  const live = rowsList.filter((r) => r > 0);
  return live.reduce((s, r) => s + stackHeight(r, p), 0) + Math.max(0, live.length - 1) * p.stackGap;
}

export function placeSide(groups: readonly SideGroup[], p: LayoutParams): PlacedGroup[] {
  const sorted = groups.filter((g) => g.rows > 0).sort((a, b) => a.boxY - b.boxY);
  const heights = sorted.map((g) => stackHeight(g.rows, p));
  const total = heights.reduce((s, h) => s + h, 0);
  const n = sorted.length;
  const span = p.span ?? 0;
  const gap = n > 1 ? Math.max(p.stackGap, (span - total) / (n - 1)) : 0;
  const dir = p.side === 'left' ? 1 : -1;
  const elbowX = p.edgeX + dir * p.run;
  let y = 0;
  return sorted.map((g, i) => {
    const height = heights[i]!;
    let top = y;
    if (n === 1) top = Math.min(Math.max(g.boxY - height / 2, 0), Math.max(0, span - height));
    y = top + height + gap;
    const mid = Math.round(top + height / 2);
    const straight = Math.abs(mid - g.boxY) < 3;
    const points: [number, number][] = straight
      ? [[g.boxX, mid], [p.edgeX, mid]]
      : [[g.boxX, g.boxY], [elbowX, g.boxY], [p.edgeX, mid]];
    return { id: g.id, top, height, points };
  });
}
