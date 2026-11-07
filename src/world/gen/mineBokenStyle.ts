import { STYLE_TABLE, type Depth, type Level } from './mineBokenConfig';
import { hash01, subSeed } from './random';

/** 坑道の 性格（MINE-1E §4.1）。`Shaft.style` と 同じ 形 */
export interface BokenStyle {
  depth: Depth;
  floors: number;
  size: 64 | 96 | 128;
  level: Level;
  camp: boolean;
  maze: boolean;
}

/** 表の 行から わりあいで 1 つ えらぶ（r は 0 以上 1 未満） */
function pick<T extends { chance: number }>(rows: readonly T[], r: number): T {
  let acc = 0;
  for (const row of rows) {
    acc += row.chance;
    if (r < acc) return row;
  }
  return rows[rows.length - 1]!;
}

/** 区画 (rx, rz) の 坑道の 性格。世界の シードと 区画だけで きまる（1C の 坑道の くじとは べつの 乱数。同じ 区画は いつも 同じ） */
export function styleOf(seed: number, rx: number, rz: number): BokenStyle {
  const s = subSeed(seed, 1501);
  const draw = (tag: number): number => hash01(s, rx, rz, tag);
  const depth = pick(STYLE_TABLE.depth, draw(1));
  const level = pick(STYLE_TABLE.level, draw(3));
  const [lo, hi] = depth.floors;
  return {
    depth: depth.id,
    floors: lo + Math.min(hi - lo, Math.floor(draw(2) * (hi - lo + 1))),
    size: pick(STYLE_TABLE.size, draw(4)).size,
    level: level.id,
    camp: draw(5) < STYLE_TABLE.camp,
    maze: level.mazeGrid !== null && draw(6) < level.maze,
  };
}

/**
 * 計画が 入らない ときの ゆるめた 性格（MINE-1E §5「区画が せまくて 入らない」）。広さ・ふかさ・ふくざつさは そのままで、
 * 階の 数を その ふかさの 下限まで → 迷路 なし → キャンプ なし の じゅんに へらす。最初の 要素は 性格 そのもの
 */
export function styleLadder(style: BokenStyle): BokenStyle[] {
  const out: BokenStyle[] = [style];
  const floorsMin = STYLE_TABLE.depth.find((d) => d.id === style.depth)!.floors[0];
  let cur = style;
  const push = (next: BokenStyle): void => {
    out.push(next);
    cur = next;
  };
  if (cur.floors > floorsMin) push({ ...cur, floors: floorsMin });
  if (cur.maze) push({ ...cur, maze: false });
  if (cur.camp) push({ ...cur, camp: false });
  return out;
}
