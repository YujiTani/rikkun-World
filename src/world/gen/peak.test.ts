import { describe, expect, it } from 'vitest';
import { MOUNTAIN_KINDS, countryAt } from './biome';
import { findCountry } from './biomeHook';
import { peakNear } from './peak';
import { heightAt } from './terrain';

/** #291 COUNTRY-1 §5.2（visit.peak の 判定の もと。AC18 の 一部） */
describe('peakNear', () => {
  it('山の国の 点の そばで 頂上（点から 6 以内で いちばん高い列）を 返す', () => {
    const seed = 20261012;
    for (const kind of MOUNTAIN_KINDS) {
      const pt = findCountry(seed, kind, { x: 0, z: 0 });
      const p = peakNear(seed, pt.x + 2, pt.z - 1);
      expect(p, kind).not.toBeNull();
      expect(Math.hypot(p!.x - pt.x, p!.z - pt.z)).toBeLessThanOrEqual(6.5);
      expect(p!.h).toBe(heightAt(seed, p!.x, p!.z) + 1);
      for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
        if (Math.hypot(dx, dz) > 6) continue;
        expect(heightAt(seed, pt.x + dx, pt.z + dz)).toBeLessThanOrEqual(p!.h - 1);
      }
      expect(MOUNTAIN_KINDS).toContain(countryAt(seed, pt.x, pt.z).kind);
      // 頂上の 上では 頂上自身を 返す
      expect(peakNear(seed, p!.x, p!.z)).toEqual(p);
    }
  });
});
