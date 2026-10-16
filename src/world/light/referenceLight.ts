import type { ArrayVoxelWorld } from '../VoxelWorld';
import { LIGHT_CONFIG as C } from './config';
import { EMISSION, OPACITY } from './opacity';

/**
 * 光の「ものさし」（テスト専用）。VOX-C より前の WorldLight と同じ計算を、世界ぜんぶ 1 枚の配列でやる。
 * セクションごとの WorldLight が これと同じ値を出すことを確かめる（src/world/light/sectionLight.test.ts）。
 * ゲームの中では使わない。
 */
export function referenceLight(world: ArrayVoxelWorld): { sx: number; sy: number; sz: number; sky: Uint8Array; block: Uint8Array } {
  const eb = world.loadedBounds();
  const sx = eb.x1;
  const sy = world.size.y;
  const sz = eb.z1;
  const n = sx * sy * sz;
  const sky = new Uint8Array(n);
  const block = new Uint8Array(n);
  const idx = (x: number, y: number, z: number): number => (y * sz + z) * sx + x;
  const skyQ: number[] = [];
  const blockQ: number[] = [];
  for (let z = 0; z < sz; z++) {
    for (let x = 0; x < sx; x++) {
      let s: number = C.maxLevel;
      for (let y = sy - 1; y >= 0; y--) {
        const i = idx(x, y, z);
        const t = world.getIndex(x, y, z);
        s = Math.max(0, s - (t < 0 ? 15 : OPACITY[t]));
        sky[i] = s;
        const e = t < 0 ? 0 : EMISSION[t];
        block[i] = e;
        if (s > 1) skyQ.push(i);
        if (e > 1) blockQ.push(i);
      }
    }
  }
  const layer = sx * sz;
  const spread = (arr: Uint8Array, q: number[]): void => {
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      const v = arr[i];
      if (v <= 1) continue;
      const x = i % sx;
      const z = Math.floor(i / sx) % sz;
      const y = Math.floor(i / layer);
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        if (nx < 0 || nx >= sx || ny < 0 || ny >= sy || nz < 0 || nz >= sz) continue;
        const t = world.getIndex(nx, ny, nz);
        const op = t < 0 ? 15 : OPACITY[t];
        if (op >= 15) continue;
        const nv = v - Math.max(1, op);
        const j = i + (nx - x) + (ny - y) * layer + (nz - z) * sx;
        if (nv > arr[j]) {
          arr[j] = nv;
          q.push(j);
        }
      }
    }
    q.length = 0;
  };
  spread(sky, skyQ);
  spread(block, blockQ);
  return { sx, sy, sz, sky, block };
}
