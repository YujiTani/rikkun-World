import { describe, expect, it } from 'vitest';
import { generateIsland } from '../gen/generateIsland';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { referenceLight } from './referenceLight';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/** 高さ H の世界: 今の島を 上へ H-48 ずらして、その下は 石でうめる（地下は ほとんど「見えない」セクション） */
function tall(H: number): ArrayVoxelWorld {
  const src = new ArrayVoxelWorld();
  generateIsland(12345, src);
  const w = new ArrayVoxelWorld({ x: 128, z: 128, y: H });
  const off = H - 48;
  if (off > 0) w.fill(0, 0, 0, 127, off - 1, 127, 'stone');
  for (let y = 0; y < 48; y++) for (let z = 0; z < 128; z++) for (let x = 0; x < 128; x++) {
    const b = src.getIndex(x, y, z);
    if (b > 0 || off > 0) w.setBlock(x, y + off, z, src.getBlock(x, y, z) as never);
  }
  w.takeDirtyChunks();
  w.takeChangeBoxes();
  w.takeColumnEvents();
  return w;
}

describe('光の初期化の時間とメモリ（VOX-C AC4。数を出す）', () => {
  for (const H of [48, 352]) {
    it(`高さ ${H}`, () => {
      const w = tall(H);
      const t0 = performance.now();
      const ref = referenceLight(w);
      const refMs = performance.now() - t0;
      const refBytes = ref.sky.length * 4; // 前は 空・明かり・oldSky・oldBlock の 4 枚
      const light = new WorldLight(w, new SkyDarkness());
      const newMs = light.initMs;
      const newBytes = light.memoryBytes();
      // 1 個ほる → 計算し直し
      const gy = (() => {
        for (let y = H - 1; y >= 0; y--) if (w.getIndex(64, y, 64) > 0) return y;
        return 0;
      })();
      const t1 = performance.now();
      w.setBlock(64, gy, 64, 'air');
      light.update();
      light.flush();
      const digMs = performance.now() - t1;
      // eslint-disable-next-line no-console
      console.log(`LIGHT-PERF H=${H} before: init ${refMs.toFixed(0)} ms, ${(refBytes / 1e6).toFixed(1)} MB / after: init ${newMs.toFixed(0)} ms, ${(newBytes / 1e6).toFixed(2)} MB, dig+flush ${digMs.toFixed(1)} ms`);
      expect(newBytes).toBeLessThan(refBytes);
    }, 60000);
  }
});
