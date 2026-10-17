import { describe, expect, it } from 'vitest';
import { populateWorld } from '../gen/populate';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { referenceLight } from './referenceLight';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/** 本番の世界（高さ 352。VOX-B の生成で 8×8 列を読みこんだもの） */
function tall(_H: number): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 0, z: 0 });
  populateWorld(w, 12345);
  w.takeDirtyChunks();
  w.takeChangeBoxes();
  w.takeColumnEvents();
  return w;
}

describe('光の初期化の時間とメモリ（VOX-C AC4。数を出す）', () => {
  for (const H of [352]) {
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
