import type { Cell } from './townRepairGroups';

/**
 * TOWN-1 1.4 §4.6: こわれた 街の マスの 保存。1 マス ＝ x・y・z・day の 4 つの 数だけ（＋ プレイヤーの 印・置いた 物と 人）。
 * 設計の 中身・だいくさん・足場・まつ か どうかは 持たない。
 */

/** 保存の 形の 版 */
const VERSION = 1;

interface Saved {
  v: number;
  /** x, y, z, day を マスの 数 だけ ならべた 列 */
  cells: number[];
  /** プレイヤーが ふちを ほった マスの 番号（cells の 何こ目か） */
  byPlayer: number[];
  /** プレイヤーが 置いた 物: [番号, もの, 人（1 | 2）] */
  placed: [number, string, number][];
}

export function serializeRepairs(list: Iterable<Cell>): Saved {
  const out: Saved = { v: VERSION, cells: [], byPlayer: [], placed: [] };
  let i = 0;
  for (const c of list) {
    out.cells.push(c.x, c.y, c.z, c.day);
    if (c.byPlayer) out.byPlayer.push(i);
    if (c.placed !== null) out.placed.push([i, c.placed.item, c.placed.p]);
    i++;
  }
  return out;
}

/** 読む。形が ちがう・古い セーブ（記録 なし）は 空 */
export function deserializeRepairs(data: unknown): Cell[] {
  if (typeof data !== 'object' || data === null) return [];
  const d = data as Partial<Saved>;
  if (d.v !== VERSION || !Array.isArray(d.cells) || d.cells.length % 4 !== 0 || !d.cells.every((n) => Number.isInteger(n))) return [];
  const out: Cell[] = [];
  for (let i = 0; i < d.cells.length; i += 4) out.push({ x: d.cells[i]!, y: d.cells[i + 1]!, z: d.cells[i + 2]!, day: d.cells[i + 3]!, due: false, byPlayer: false, placed: null });
  for (const i of Array.isArray(d.byPlayer) ? d.byPlayer : []) if (out[i] !== undefined) out[i]!.byPlayer = true;
  for (const p of Array.isArray(d.placed) ? d.placed : []) {
    const c = Array.isArray(p) ? out[p[0] as number] : undefined;
    if (c !== undefined && typeof p[1] === 'string' && (p[2] === 1 || p[2] === 2)) c.placed = { item: p[1], p: p[2] };
  }
  return out;
}
