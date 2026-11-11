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

/** 地面の 振りで こわす マス: ねらった ブロック c の 面（向き face）に 垂直な 平面の 中心 ＋ まわり breakHalf マス（3 × 3 ＝ 9 マス） */
export function faceCells(c: Cell, face: { x: number; y: number; z: number }): Cell[] {
  const h = T.breakHalf;
  const out: Cell[] = [];
  const ax = Math.abs(face.x);
  const ay = Math.abs(face.y);
  for (let a = -h; a <= h; a++) {
    for (let b = -h; b <= h; b++) {
      if (ay > 0) out.push({ x: c.x + a, y: c.y, z: c.z + b }); // 地面・天じょう: よこ × 奥
      else if (ax > 0) out.push({ x: c.x, y: c.y + a, z: c.z + b }); // 東西の かべ: たて × 奥
      else out.push({ x: c.x + a, y: c.y + b, z: c.z }); // 南北の かべ: よこ × たて
    }
  }
  return out;
}

/** 急降下の 着地で こわす マス: 足の 下の 段の 3 × 3 ＋ プレイヤーと 同じ 段の まわり 8（体の マスは こわさない）＝ 17 マス */
export function diveCells(foot: Cell): Cell[] {
  const h = T.breakHalf;
  const out: Cell[] = [];
  for (let dx = -h; dx <= h; dx++) {
    for (let dz = -h; dz <= h; dz++) {
      out.push({ x: foot.x + dx, y: foot.y - 1, z: foot.z + dz });
      if (dx !== 0 || dz !== 0) out.push({ x: foot.x + dx, y: foot.y, z: foot.z + dz });
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

export function isBreakable(id: string): boolean {
  return BREAKABLE.has(id);
}
