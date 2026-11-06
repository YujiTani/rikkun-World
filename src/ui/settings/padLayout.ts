/**
 * 札の置き場所と、ボタンの四角から札までの線（計算だけ。DOM は触らない）。
 * 札は、まとまりごとに そのまとまりの高さの近くに置く（かたまり）。かたまりどうしが重なるときだけ、
 * ずれが小さくなるように 上下にずらす。
 * 左右の線は「四角から横にまっすぐ → 札のそばで 1 回だけ曲がって札へ」。
 * 同じ側の線が交わらない決まり:
 *  - 四角の高さの順と、札のかたまりの順を同じにする
 *  - 曲がる位置（x）は全部の線で同じ。横の部分は曲がる位置より外がわ、斜めの部分は内がわだけにあるので、
 *    両はしの順が同じなら たがいに交わらない
 * 上の札（− ＋）は、四角のまうえに まっすぐ立てる線。
 */

export interface SideGroup {
  id: string;
  /** 四角の外がわの辺の x と、その中心の y（stage 座標） */
  boxX: number;
  boxY: number;
  rows: number;
}

export interface LayoutParams {
  side: 'left' | 'right';
  /** 札の列の、図に近い側の辺の x */
  edgeX: number;
  rowH: number;
  rowGap: number;
  /** かたまりどうしの すきま（最小） */
  stackGap: number;
  /** 札の列の辺から曲がる位置までの はなれ（px） */
  run: number;
  /** かたまりの上はしの いちばん上（0 以上） */
  minTop?: number;
}

interface PlacedGroup {
  id: string;
  top: number;
  height: number;
  /** 四角 → 曲がり角 → 札。まっすぐなときは 2 点 */
  points: [number, number][];
}

export function stackHeight(rows: number, p: Pick<LayoutParams, 'rowH' | 'rowGap'>): number {
  return rows * p.rowH + Math.max(0, rows - 1) * p.rowGap;
}

/** 順序つきの なるべく近い置き方（ならんだ順を保ち、たがいに重ならず、ずれの 2 乗和が最小）。PAV 法 */
function isotonic(values: readonly number[]): number[] {
  const blocks: { sum: number; n: number }[] = [];
  for (const v of values) {
    blocks.push({ sum: v, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!;
      const a = blocks[blocks.length - 2]!;
      if (a.sum / a.n <= b.sum / b.n) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, n: a.n + b.n });
    }
  }
  return blocks.flatMap((b) => Array.from({ length: b.n }, () => b.sum / b.n));
}

export function placeSide(groups: readonly SideGroup[], p: LayoutParams): PlacedGroup[] {
  const sorted = groups.filter((g) => g.rows > 0).sort((a, b) => a.boxY - b.boxY);
  const heights = sorted.map((g) => stackHeight(g.rows, p));
  const offsets: number[] = [];
  let acc = 0;
  heights.forEach((h) => {
    offsets.push(acc);
    acc += h + p.stackGap;
  });
  const fitted = isotonic(sorted.map((g, i) => g.boxY - heights[i]! / 2 - offsets[i]!));
  const minTop = p.minTop ?? 0;
  const dir = p.side === 'left' ? 1 : -1;
  const elbowX = p.edgeX + dir * p.run;
  return sorted.map((g, i) => {
    const height = heights[i]!;
    const top = Math.max(fitted[i]! + offsets[i]!, minTop + offsets[i]!);
    const mid = Math.round(top + height / 2);
    const straight = Math.abs(mid - g.boxY) < 3;
    const points: [number, number][] = straight
      ? [[g.boxX, mid], [p.edgeX, mid]]
      : [[g.boxX, g.boxY], [elbowX, g.boxY], [p.edgeX, mid]];
    return { id: g.id, top, height, points };
  });
}

interface TopGroup {
  id: string;
  /** 四角の上の辺の中心 x・y */
  boxX: number;
  boxY: number;
  /** 'topLeft' は 札が まんなかの線の左がわ、'topRight' は右がわ */
  half: 'topLeft' | 'topRight';
}

interface PlacedTop {
  id: string;
  left: number;
  top: number;
  width: number;
  points: [number, number][];
}

/** 上の札: 四角のまうえ。札の下の辺から四角の上の辺まで、まっすぐ立てる 1 本の線 */
export function placeTop(
  groups: readonly TopGroup[],
  p: { centerX: number; width: number; gap: number; bottomY: number; rowH: number },
): PlacedTop[] {
  return groups.map((g) => {
    const left = g.half === 'topLeft' ? p.centerX - p.gap - p.width : p.centerX + p.gap;
    const top = p.bottomY - p.rowH;
    // 線は札のはばの中に入るように
    const x = Math.min(Math.max(g.boxX, left + 8), left + p.width - 8);
    return { id: g.id, left, top, width: p.width, points: [[x, p.bottomY], [x, g.boxY]] };
  });
}
