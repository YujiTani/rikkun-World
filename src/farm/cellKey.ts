/**
 * マス (x, y, z) の番号（1 つの数）。x, z は ±32,768 まで、y は -16〜1007 まで 重ならない。
 * VOX-D: 世界は ±30,000 まで続くので、むかしの「128×352×128 の平らな番号」は使わない。
 */
const XZ = 65536;
const XZ_OFF = 32768;
const Y_OFF = 16;
const Y_W = 1024;

export function cellKey(x: number, y: number, z: number): number {
  return ((x + XZ_OFF) * XZ + (z + XZ_OFF)) * Y_W + (y + Y_OFF);
}

export function cellFromKey(k: number): { x: number; y: number; z: number } {
  const y = (k % Y_W) - Y_OFF;
  const r = Math.floor(k / Y_W);
  const z = (r % XZ) - XZ_OFF;
  const x = Math.floor(r / XZ) - XZ_OFF;
  return { x, y, z };
}
