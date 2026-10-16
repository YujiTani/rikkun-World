import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockId, PlayerState, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { CameraRig } from './CameraRig';
import { createCameraHook } from './hook';

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  private readonly solid = new Set<string>();
  fillSolid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.solid.add(`${x},${y},${z}`);
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

const DT = 1 / 60;

function setup(opts: { wall?: number } = {}) {
  const world = new FakeWorld();
  world.fillSolid(0, 0, 0, 63, 8, 63); // 床 (y=9 が表面)
  const state: PlayerState = {
    position: { x: 10.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
  };
  if (opts.wall !== undefined) {
    // yaw 90 (東向き) の真後ろ = 西 (-X)。中心から壁の面までの距離 = opts.wall
    // 壁の面は整数座標 x=20 に置き、プレイヤーを面から opts.wall の所に立たせる
    state.position.x = 20 + opts.wall;
    world.fillSolid(19, 9, 0, 19, 14, 63); // x 範囲 [19, 20)
  }
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 500);
  const scene = new THREE.Scene();
  const actions = new ActionState();
  const rig = new CameraRig(camera, scene, world, () => state, actions);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      rig.update(DT);
      actions.endFrame();
    }
  };
  return { world, state, camera, scene, actions, rig, step };
}

describe('CameraRig: 一人称・切り替え', () => {
  it('AC23/24: はじめは一人称。目の高さ 1.62、人形は見えない', () => {
    const t = setup();
    const hook = createCameraHook(t.rig);
    t.step();
    const c = hook.camera.get();
    expect(c.view).toBe('first');
    expect(c.position.y).toBeCloseTo(9 + 1.62, 2);
    expect(c.position.x).toBeCloseTo(10.5, 2);
    expect(hook.doll().visible).toBe(false);
    expect(t.rig.crosshairVisible()).toBe(true);
  });

  it('AC23: V で 1 回ずつ切り替わり、押しっぱなしでも 1 回だけ', () => {
    const t = setup();
    t.actions.press('toggleView');
    t.step();
    expect(t.rig.getView()).toBe('third');
    t.step(60);
    expect(t.rig.getView()).toBe('third');
    t.actions.release('toggleView');
    t.actions.press('toggleView');
    t.step();
    expect(t.rig.getView()).toBe('first');
  });
});

describe('CameraRig: 三人称', () => {
  it('AC25: pitch 0 で距離 4.0〜4.1、0.5 上、真後ろ 4.0。人形が見える', () => {
    const t = setup();
    t.rig.toggleView();
    t.step();
    const c = t.rig.getInfo();
    expect(c.distanceToEye).toBeGreaterThanOrEqual(4.0);
    expect(c.distanceToEye).toBeLessThanOrEqual(4.1);
    expect(c.position.y - c.eye.y).toBeCloseTo(0.5, 2);
    expect(c.eye.x - c.position.x).toBeCloseTo(4.0, 2);
    expect(c.position.z).toBeCloseTo(c.eye.z, 2);
    expect(t.rig.doll.visible).toBe(true);
  });

  it('AC26: pitch -89 でカメラが 4.4〜4.6 上', () => {
    const t = setup();
    t.state.pitchDeg = -89;
    t.rig.toggleView();
    t.step();
    const c = t.rig.getInfo();
    const up = c.position.y - c.eye.y;
    expect(up).toBeGreaterThan(4.4);
    expect(up).toBeLessThan(4.6);
    expect(t.rig.doll.visible).toBe(true);
  });

  it('AC27: 後ろの壁 2.0 -> 距離 2.0 以下、ブロックの中にない、切り替え直後から', () => {
    const t = setup({ wall: 2 });
    t.rig.toggleView();
    t.step();
    const c = t.rig.getInfo();
    expect(c.distanceToEye).toBeLessThanOrEqual(2.0);
    expect(c.distanceToEye).toBeCloseTo(1.82, 1);
    expect(
      t.world.isSolid(Math.floor(c.position.x), Math.floor(c.position.y), Math.floor(c.position.z)),
    ).toBe(false);
  });

  it('AC28: 後ろの壁 0.5 -> 人形が見えない', () => {
    const t = setup({ wall: 0.5 });
    t.rig.toggleView();
    t.step();
    expect(t.rig.getInfo().distanceToEye).toBeLessThan(1.0);
    expect(t.rig.doll.visible).toBe(false);
  });

  it('壁から離れるときは 0.25 秒かけてなめらかに戻る', () => {
    const t = setup({ wall: 2 });
    t.rig.toggleView();
    t.step();
    const near = t.rig.getInfo().distanceToEye;
    t.state.position.x += 6; // 壁が遠くなる
    t.step(3);
    const mid = t.rig.getInfo().distanceToEye;
    expect(mid).toBeGreaterThan(near);
    expect(mid).toBeLessThan(4.0);
    t.step(20);
    expect(t.rig.getInfo().distanceToEye).toBeGreaterThanOrEqual(4.0);
  });

  it('向きはプレイヤーと同じ（yaw 90 で東を見る）', () => {
    const t = setup();
    t.rig.toggleView();
    t.step();
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(t.camera.quaternion);
    expect(v.x).toBeCloseTo(1, 3);
    expect(v.z).toBeCloseTo(0, 3);
  });
});

describe('人形の手足', () => {
  it('AC29: 歩くと手足が振れて 30 度以内、止めて 30 ステップで 0 に戻る', () => {
    const t = setup();
    t.rig.toggleView();
    t.state.moving = true;
    let maxArm = 0;
    let nonZero = false;
    for (let i = 0; i < 60; i++) {
      t.step();
      const d = createCameraHook(t.rig).doll();
      maxArm = Math.max(maxArm, Math.abs(d.armAngle));
      if (Math.abs(d.armAngle) > 0.1 && Math.abs(d.legAngle) > 0.1) nonZero = true;
      expect(Math.abs(d.armAngle)).toBeLessThanOrEqual(30);
    }
    expect(nonZero).toBe(true);
    expect(maxArm).toBeGreaterThan(20);
    t.state.moving = false;
    t.step(30);
    const d = createCameraHook(t.rig).doll();
    expect(Math.abs(d.armAngle)).toBeLessThanOrEqual(2);
    expect(Math.abs(d.legAngle)).toBeLessThanOrEqual(2);
  });

  it('空中ではあしをそろえる', () => {
    const t = setup();
    t.state.moving = true;
    t.state.onGround = false;
    t.rig.toggleView();
    t.step(30);
    expect(t.rig.doll.legAngle).toBeCloseTo(0, 5);
  });
});

describe('見下ろしカメラ', () => {
  it('位置と向きが決まりどおりで、人形は隠れ、フォグは切って戻る', () => {
    const t = setup();
    t.scene.fog = new THREE.Fog(0xffffff, 10, 50);
    const fog = t.scene.fog;
    t.rig.toggleView();
    t.step();
    t.rig.overview(true);
    const c = t.rig.getInfo();
    expect(c.overview).toBe(true);
    expect(c.position).toEqual({ x: 72, y: 64.6, z: -8 });
    expect(t.scene.fog).toBeNull();
    expect(t.rig.doll.visible).toBe(false);
    expect(t.rig.crosshairVisible()).toBe(false);
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(t.camera.quaternion);
    expect(v.y).toBeCloseTo(-Math.SQRT1_2, 2);
    t.rig.overview(false);
    expect(t.scene.fog).toBe(fog);
    expect(t.rig.getInfo().overview).toBe(false);
    t.step();
    expect(t.rig.doll.visible).toBe(true);
  });
});
