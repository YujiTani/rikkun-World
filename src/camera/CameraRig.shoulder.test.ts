import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockId, PlayerState, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { START_PITCH_DEG } from '../player/config';
import { CameraRig } from './CameraRig';

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  private readonly solid = new Set<string>();
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, on = true) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) on ? this.solid.add(`${x},${y},${z}`) : this.solid.delete(`${x},${y},${z}`);
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.isSolid(x, y, z) ? 'stone' : 'air';
  }
  setBlock(): boolean {
    return false;
  }
  isSolid(x: number, y: number, z: number): boolean {
    return this.solid.has(`${x},${y},${z}`);
  }
}

function setup() {
  const world = new FakeWorld();
  world.fill(0, 0, 0, 63, 8, 63);
  const state: PlayerState = {
    position: { x: 10.5, y: 9, z: 6.5 }, // x0 = 10, z0 = 6
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 0,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const camera = new THREE.PerspectiveCamera(75, 1.6, 0.1, 500);
  const rig = new CameraRig(camera, new THREE.Scene(), world, () => state, new ActionState());
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) rig.update(1 / 60);
  };
  return { world, state, camera, rig, step };
}

describe('肩ごしのずらし s と壁ぎわ（AC44）', () => {
  it('右（x0 + 1 の列）に壁 -> s = 0.30、S は固くない。壁を消すと 15 ステップ以内に 0.70', () => {
    const t = setup();
    t.step();
    expect(t.rig.getInfo().shoulderOffset).toBeCloseTo(0.7, 2);
    t.world.fill(11, 9, 0, 11, 12, 63);
    t.step();
    const c = t.rig.getInfo();
    expect(c.shoulderOffset).toBeCloseTo(0.3, 2);
    expect(t.world.isSolid(Math.floor(c.shoulder.x), Math.floor(c.shoulder.y), Math.floor(c.shoulder.z))).toBe(false);
    t.world.fill(11, 9, 0, 11, 12, 63, false);
    t.step(15);
    expect(t.rig.getInfo().shoulderOffset).toBeCloseTo(0.7, 2);
  });
  it('左（x0 - 1 の列）の壁では 0.70 のまま', () => {
    const t = setup();
    t.world.fill(9, 9, 0, 9, 12, 63);
    t.step(3);
    expect(t.rig.getInfo().shoulderOffset).toBeCloseTo(0.7, 2);
  });
  it('aimOrigin は 今の S を返す', () => {
    const t = setup();
    t.step();
    const o = t.rig.aimOrigin({ x: 0, y: 0, z: 0 });
    expect(o).toEqual(t.rig.getInfo().shoulder);
  });
});

describe('画面の配置（AC48 の うつした数）', () => {
  it('はじめの pitch -25: 箱の右はしは ＋ より 20 ピクセル以上 左。地平線は 画面の中', () => {
    expect(START_PITCH_DEG).toBe(-25);
    const t = setup();
    t.state.pitchDeg = START_PITCH_DEG;
    t.step(2);
    t.camera.updateMatrixWorld(true);
    t.camera.updateProjectionMatrix();
    for (const [w, h] of [[1280, 800], [1440, 900], [1024, 700]]) {
      t.camera.aspect = w / h;
      t.camera.updateProjectionMatrix();
      let maxX = -Infinity;
      for (const dx of [-0.35, 0.35])
        for (const dz of [-0.35, 0.35])
          for (const y of [9, 10.8]) {
            const v = new THREE.Vector3(10.5 + dx, y, 6.5 + dz).project(t.camera);
            maxX = Math.max(maxX, ((v.x + 1) / 2) * w);
          }
      expect(maxX).toBeLessThanOrEqual(w / 2 - 20);
      const hz = new THREE.Vector3(10.5 + 0.7, 10.4, -900).project(t.camera);
      const horizonY = ((1 - hz.y) / 2) * h;
      expect(horizonY).toBeGreaterThan(0);
      expect(horizonY).toBeLessThan(h / 2);
      if (w === 1280) {
        expect(maxX).toBeCloseTo(640 - 30, -1);
        expect(horizonY).toBeCloseTo(157, -1);
      }
    }
  });
});
