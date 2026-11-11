import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';

/** 大地のハンマー（LEGEND-4 §8）の 純粋な 決まり。数は LEGEND4_TUNING.daichi の 1 か所 */
const T = LEGEND4_TUNING.daichi;
const BREAKABLE: ReadonlySet<string> = new Set(T.breakable);

export interface Cell {
  x: number;
  y: number;
  z: number;
}

/** 前の 向きを 東西南北に まるめる（|x 成分| ≧ |z 成分| なら x の 向き）。fx・fz = 水平の 前の 向き */
export function facingDir4(fx: number, fz: number): { dx: number; dz: number } {
  if (Math.abs(fx) >= Math.abs(fz)) return { dx: fx >= 0 ? 1 : -1, dz: 0 };
  return { dx: 0, dz: fz >= 0 ? 1 : -1 };
}

/** カメラの yaw（度。北 = 0・東 = 90）から 前の 向き 4 つ */
export function facingDir4OfYaw(yawDeg: number): { dx: number; dz: number } {
  const r = (yawDeg * Math.PI) / 180;
  return facingDir4(Math.sin(r), -Math.cos(r));
}

/** こわす マス: 足の マスの 前 1〜depth 列、よこ 3 マス、足の 段と 頭の 段（足もとの 段は 入らない） */
export function breakCells(foot: Cell, dir: { dx: number; dz: number }, depth: number): Cell[] {
  const out: Cell[] = [];
  const half = (T.breakWidth - 1) / 2;
  for (let k = 1; k <= depth; k++) {
    const cx = foot.x + dir.dx * k;
    const cz = foot.z + dir.dz * k;
    for (let s = -half; s <= half; s++) {
      for (let h = 0; h < T.breakHeight; h++) out.push({ x: cx + dir.dz * s, y: foot.y + h, z: cz + dir.dx * s });
    }
  }
  return out;
}

/** 急降下の ダメージ: 20 ×（1 ＋ 0.1 × min(⌊h⌋, 10)）。0.01 の 位に まるめる */
export function diveDamage(h: number): number {
  const cap = Math.round((T.diveMulMax - 1) / T.divePerBlock);
  const mul = Math.min(1 + T.divePerBlock * Math.min(Math.floor(h + T.diveHeightSlack), cap), T.diveMulMax);
  return Math.round(T.damage * mul * 100) / 100;
}

/** 急降下の 奥行き（4 マス 以上で 2、上限 breakDepthMax） */
export function diveDepth(h: number): number {
  return Math.min(T.breakDepth + (h + T.diveHeightSlack >= T.diveDeepFrom ? 1 : 0), T.breakDepthMax);
}

export function isBreakable(id: string): boolean {
  return BREAKABLE.has(id);
}
