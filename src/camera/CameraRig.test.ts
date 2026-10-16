import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockId, PlayerState, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { CameraRig } from './CameraRig';
import { createCameraHook } from './hook';
import { aimPivot } from './pivot';

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 64, z: 64 };
  private readonly solid = new Set<string>();
  fillSolid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.solid.add(`${x},${y},${z}`);
  }
  clearSolid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.solid.delete(`${x},${y},${z}`);
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

// CHAR-1 第 5 版で 一人称をなくしたため、「はじめは一人称」「V で切り替え」のテストは消した（AC1・AC2 に置きかえ）
describe('CameraRig: 三人称だけ', () => {
  it('AC1: はじめから三人称。V（toggleView）を押しても 位置は変わらない', () => {
    const t = setup();
    const hook = createCameraHook(t.rig);
    t.step();
    expect(hook.camera.get().view).toBe('third');
    expect(t.rig.getView()).toBe('third');
    const before = { ...t.rig.getInfo().position };
    t.actions.press('toggleView');
    t.step();
    t.actions.release('toggleView');
    expect(hook.camera.get().view).toBe('third');
    const after = t.rig.getInfo().position;
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
    expect(after.z).toBeCloseTo(before.z, 3);
    expect(t.rig.crosshairVisible()).toBe(true);
    expect(hook.camera.firstPersonTip()).toBeNull();
    expect(hook.doll().heldScreen).toBeNull();
  });

  it('AC4: P = 足もと + 2.12、カメラは P の真うしろ 4.0（yaw 0・pitch 0）', () => {
    const t = setup();
    t.state.yawDeg = 0;
    t.step();
    const c = t.rig.getInfo();
    expect(c.pivot.x).toBeCloseTo(10.5, 2);
    expect(c.pivot.y).toBeCloseTo(9 + 2.12, 2);
    expect(c.pivot.z).toBeCloseTo(6.5, 2);
    expect(c.position.x).toBeCloseTo(10.5, 2);
    expect(c.position.y).toBeCloseTo(9 + 2.12, 2);
    expect(c.position.z).toBeCloseTo(6.5 + 4.0, 2);
    expect(c.distanceToPivot).toBeCloseTo(4.0, 2);
    expect(t.rig.doll.visible).toBe(true);
  });

  it('AC4: aimPivot は 平らな地面で 足もと + 2.12', () => {
    const t = setup();
    const out = aimPivot(t.world, { x: 3.5, y: 9, z: 3.5 }, { x: 0, y: 0, z: 0 });
    expect(out).toEqual({ x: 3.5, y: 9 + 2.12, z: 3.5 });
  });

  it('AC5: 天井が 足もと + 2 のトンネルで P は 足もと + 1.90、カメラは固いブロックの中にない', () => {
    const t = setup();
    t.state.yawDeg = 0;
    t.world.fillSolid(0, 11, 0, 63, 11, 63); // 足もと 9 + 2 = 11 が天井
    t.step();
    const c = t.rig.getInfo();
    expect(c.pivot.y).toBeCloseTo(9 + 1.9, 2);
    expect(t.world.isSolid(Math.floor(c.position.x), Math.floor(c.position.y), Math.floor(c.position.z))).toBe(false);
  });

  it('AC6: 後ろ（z0 + 2）に高いかべ -> P からカメラまで 1.30。かべを消すと 15 ステップで 4.00', () => {
    const t = setup();
    t.state.yawDeg = 0;
    t.state.position.z = 6.5;
    t.world.fillSolid(0, 9, 8, 63, 20, 8); // z = 8 の列（キャラ z0 = 6 の + 2）
    t.step();
    expect(t.rig.getInfo().distanceToPivot).toBeCloseTo(1.3, 1);
    expect(Math.abs(t.rig.getInfo().distanceToPivot - 1.3)).toBeLessThanOrEqual(0.03);
    t.world.clearSolid(0, 9, 8, 63, 20, 8);
    t.step(15);
    expect(t.rig.getInfo().distanceToPivot).toBeCloseTo(4.0, 2);
  });

  it('AC7: 平らな地面で pitch +80 は かくす、+45 は 見える。1.2 を境にする', () => {
    const t = setup();
    t.state.pitchDeg = 80;
    t.step();
    expect(t.rig.getInfo().distanceToBody).toBeLessThan(1.2);
    expect(t.rig.getInfo().hideChar).toBe(true);
    expect(t.rig.doll.visible).toBe(false);
    t.state.pitchDeg = 45;
    t.step(30);
    expect(t.rig.getInfo().distanceToBody).toBeGreaterThanOrEqual(1.2);
    expect(t.rig.getInfo().hideChar).toBe(false);
    expect(t.rig.doll.visible).toBe(true);
  });

  it('§4.1 の計算: pitch +65 は からだの中心まで 約 1.22（見える）、+70 は 約 1.07（かくす）', () => {
    const t = setup();
    t.state.pitchDeg = 65;
    t.step();
    expect(t.rig.getInfo().distanceToBody).toBeCloseTo(1.22, 1);
    expect(t.rig.doll.visible).toBe(true);
    t.state.pitchDeg = 70;
    t.step(30);
    expect(t.rig.getInfo().distanceToBody).toBeCloseTo(1.07, 1);
    expect(t.rig.doll.visible).toBe(false);
  });

  it('pitch -89 でカメラが P の 4.0 上、キャラは見える', () => {
    const t = setup();
    t.state.pitchDeg = -89;
    t.step();
    const c = t.rig.getInfo();
    expect(c.position.y - c.pivot.y).toBeGreaterThan(3.9);
    expect(t.rig.doll.visible).toBe(true);
  });

  it('後ろの壁 0.5 -> キャラが見えない（からだの中心から 1.2 未満）', () => {
    const t = setup({ wall: 0.5 });
    t.step();
    expect(t.rig.getInfo().distanceToBody).toBeLessThan(1.2);
    expect(t.rig.doll.visible).toBe(false);
  });

  it('壁から離れるときは 0.25 秒かけてなめらかに戻る', () => {
    const t = setup({ wall: 2 });
    t.step();
    const near = t.rig.getInfo().distanceToPivot;
    expect(near).toBeCloseTo(1.8, 1);
    t.state.position.x += 6; // 壁が遠くなる
    t.step(3);
    const mid = t.rig.getInfo().distanceToPivot;
    expect(mid).toBeGreaterThan(near);
    expect(mid).toBeLessThan(4.0);
    t.step(20);
    expect(t.rig.getInfo().distanceToPivot).toBeCloseTo(4.0, 2);
  });

  it('AC8: 向きはプレイヤーと同じ（yaw 90 で東を見る）。中心の線は P を通る', () => {
    const t = setup();
    t.step();
    const v = new THREE.Vector3(0, 0, -1).applyQuaternion(t.camera.quaternion);
    expect(v.x).toBeCloseTo(1, 3);
    expect(v.z).toBeCloseTo(0, 3);
    const c = t.rig.getInfo();
    const toP = new THREE.Vector3(c.pivot.x - c.position.x, c.pivot.y - c.position.y, c.pivot.z - c.position.z).normalize();
    expect(toP.dot(v)).toBeCloseTo(1, 3);
  });

  it('キャラが動いても カメラの向きは変わらず、位置だけついていく', () => {
    const t = setup();
    t.step();
    const q = t.camera.quaternion.clone();
    const x0 = t.rig.getInfo().position.x;
    t.state.position.x += 3;
    t.step();
    expect(t.camera.quaternion.angleTo(q)).toBeLessThan(1e-6);
    expect(t.rig.getInfo().position.x - x0).toBeCloseTo(3, 2);
  });
});

describe('人形の手足', () => {
  it('AC29: 歩くと手足が振れて 30 度以内、止めて 30 ステップで 0 に戻る', () => {
    const t = setup();
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
    t.step(30);
    expect(t.rig.doll.legAngle).toBeCloseTo(0, 5);
  });
});

describe('見下ろしカメラ', () => {
  it('位置と向きが決まりどおりで、人形は隠れ、フォグは切って戻る', () => {
    const t = setup();
    t.scene.fog = new THREE.Fog(0xffffff, 10, 50);
    const fog = t.scene.fog;
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
