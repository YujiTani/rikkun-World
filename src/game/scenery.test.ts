import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SCENERY_CONFIG } from './config';
import { buildScenery } from './scenery';

describe('buildScenery', () => {
  it('空の色・かすみ（40〜90）・世界の外の海を作る', () => {
    const scene = new THREE.Scene();
    const ocean = buildScenery(scene, { x: 64, z: 64 });
    expect((scene.background as THREE.Color).getHex()).toBe(0x8fd3ff);
    const fog = scene.fog as THREE.Fog;
    expect([fog.near, fog.far, fog.color.getHex()]).toEqual([40, 90, 0x8fd3ff]);
    expect(scene.children).toContain(ocean);
  });

  it('海は世界の中（0〜64）にかぶらず、外側を囲む', () => {
    const geo = buildScenery(new THREE.Scene(), { x: 64, z: 64 }).geometry;
    const p = geo.getAttribute('position');
    const e = SCENERY_CONFIG.ocean.extent;
    let area = 0;
    for (let i = 0; i < p.count; i += 4) {
      const w = Math.abs(p.getX(i + 1) - p.getX(i));
      const d = Math.abs(p.getZ(i + 3) - p.getZ(i));
      area += w * d;
      expect(p.getY(i)).toBe(SCENERY_CONFIG.ocean.surfaceY);
    }
    expect(area).toBeCloseTo((64 + 2 * e) ** 2 - 64 ** 2, 3);
  });
});
