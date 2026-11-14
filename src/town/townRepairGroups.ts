import { TOWN } from './townTuning';

/**
 * TOWN-1 1.4 §4.5d: こわれた マスの 記録の 型・マスの 番号・「まとまり」の 分け方（同じ 日・横の ちがい 3 マス 以内で つながる 物）。
 * 計算だけ（世界を 読まない）。
 */

/** 記録の 1 マス（中の 状態つき。外へ 出す 形は `RepairCell`） */
export interface Cell {
  x: number;
  y: number;
  z: number;
  /** こわれた 日（`time.day()`） */
  day: number;
  /** 朝の 仕分けで「もどす」と きまった（まだ もどして いない） */
  due: boolean;
  /** プレイヤーが ふちを ほった 印 */
  byPlayer: boolean;
  /** プレイヤーが 置いた 物と 人 */
  placed: { item: string; p: 1 | 2 } | null;
}

/** `town.repairs().cells` の 1 マス（保存と 同じ 中身） */
export interface RepairCell {
  x: number;
  y: number;
  z: number;
  day: number;
  byPlayer?: true;
  placed?: { item: string; p: 1 | 2 };
}

/** 世界の 座標の はんい（±WORLD_LIMIT）を 非負に する ずらし。y は 512 未満 */
const SHIFT = 32768;

/** マスの 番号（x・y・z から 1 つの 数。2^41 未満なので 数として 正確） */
export const cellKey = (x: number, y: number, z: number): number => ((x + SHIFT) * 65536 + (z + SHIFT)) * 512 + y;
/** 列（x・z）の 番号 */
export const columnKey = (x: number, z: number): number => (x + SHIFT) * 65536 + (z + SHIFT);

/** 下から（y が 小さい 順）。同じ 高さは z・x の 小さい 順（決まった 順） */
export const byBottom = (a: Cell, b: Cell): number => a.y - b.y || a.z - b.z || a.x - b.x;

/**
 * まとまりに 分ける: 同じ 日の マスで、x・z の ちがいが どちらも `TOWN.repair.groupGap` 以内の もの どうしが つながる（高さは 問わない）。
 * work.n に 見た マスの 数を 足す（マスの 数に 比例。ユニットテストが 2 倍で 2.2 倍 以下を 確かめる）
 */
export function partition(cells: readonly Cell[], work: { n: number }): Cell[][] {
  const gap = TOWN.repair.groupGap;
  const byDay = new Map<number, Cell[]>();
  for (const c of cells) {
    const l = byDay.get(c.day);
    if (l === undefined) byDay.set(c.day, [c]);
    else l.push(c);
  }
  const out: Cell[][] = [];
  for (const list of byDay.values()) {
    const cols = new Map<number, Cell[]>();
    for (const c of list) {
      const k = columnKey(c.x, c.z);
      const l = cols.get(k);
      if (l === undefined) cols.set(k, [c]);
      else l.push(c);
    }
    const seen = new Set<Cell>();
    for (const start of list) {
      if (seen.has(start)) continue;
      const group: Cell[] = [];
      const stack: Cell[] = [start];
      seen.add(start);
      while (stack.length > 0) {
        const c = stack.pop()!;
        group.push(c);
        for (let dz = -gap; dz <= gap; dz++) {
          for (let dx = -gap; dx <= gap; dx++) {
            work.n++;
            const near = cols.get(columnKey(c.x + dx, c.z + dz));
            if (near === undefined) continue;
            for (const o of near) {
              if (seen.has(o)) continue;
              seen.add(o);
              stack.push(o);
            }
          }
        }
      }
      out.push(group);
    }
  }
  return out;
}

/** まとまりの 四角（マスの 座標。ふくむ） */
export function boundsOf(group: readonly Cell[]): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const c of group) {
    if (c.x < min.x) min.x = c.x;
    if (c.y < min.y) min.y = c.y;
    if (c.z < min.z) min.z = c.z;
    if (c.x > max.x) max.x = c.x;
    if (c.y > max.y) max.y = c.y;
    if (c.z > max.z) max.z = c.z;
  }
  return { min, max };
}
