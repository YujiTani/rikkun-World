import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SCENERY_CONFIG } from './config';
import { buildScenery, followScenery } from './scenery';

describe('buildScenery', () => {
  it('空の色・かすみ（40〜80）・世界の外の海を作る', () => {
    const scene = new THREE.Scene();
    const ocean = buildScenery(scene);
    expect((scene.background as THREE.Color).getHex()).toBe(0x8fd3ff);
    const fog = scene.fog as THREE.Fog;
    expect([fog.near, fog.far, fog.color.getHex()]).toEqual([40, 80, 0x8fd3ff]);
    expect(scene.children).toContain(ocean);
  });

  it('海は プレイヤーのまわり（はば hole）にかぶらず、外側を囲む', () => {
    const geo = buildScenery(new THREE.Scene()).geometry;
    const p = geo.getAttribute('position');
    const e = SCENERY_CONFIG.ocean.extent;
    let area = 0;
    for (let i = 0; i < p.count; i += 4) {
      const w = Math.abs(p.getX(i + 1) - p.getX(i));
      const d = Math.abs(p.getZ(i + 3) - p.getZ(i));
      area += w * d;
      expect(p.getY(i)).toBe(SCENERY_CONFIG.ocean.surfaceY);
    }
    const h = SCENERY_CONFIG.ocean.hole;
    expect(area).toBeCloseTo((2 * h + 2 * e) ** 2 - (2 * h) ** 2, 3);
  });

  it('followScenery: プレイヤーの いる列に 板が ついてくる', () => {
    const scene = new THREE.Scene();
    const ocean = buildScenery(scene);
    followScenery(scene, 1234.5, -77.2);
    expect([ocean.position.x, ocean.position.z]).toEqual([1232, -80]);
  });
});
