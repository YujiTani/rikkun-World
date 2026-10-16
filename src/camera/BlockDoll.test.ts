import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemId, PlayerState } from '../contracts';
import { ActionState } from '../input/actions';
import { BlockDoll } from './BlockDoll';
import { CameraRig } from './CameraRig';
import { createCameraHook } from './hook';

const world = {
  size: { x: 64, y: 32, z: 64 },
  getBlock: () => 'air' as const,
  setBlock: () => false,
  isSolid: () => false,
};

function setup(pitch = 0, aspect = 16 / 9) {
  const state: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: pitch,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const cam = new THREE.PerspectiveCamera(75, aspect, 0.1, 500);
  const rig = new CameraRig(cam, new THREE.Scene(), world, () => state, new ActionState());
  let held: ItemId | null = 'dirt';
  rig.setHeldProvider(() => held);
  rig.update(1 / 60);
  return { rig, state, hook: createCameraHook(rig), setHeld: (h: ItemId | null) => (held = h) };
}

const armR = (rig: CameraRig) => (rig.doll as unknown as { armR: THREE.Group }).armR;

// CHAR-1 第 5 版で 一人称をなくしたため、一人称の手足・持ったブロックのテスト 5 つ（AC27）は消した
describe('箱人形（三人称）', () => {
  it('三人称は全部見えて、同じものを持つ', () => {
    const t = setup();
    t.rig.update(1 / 60);
    const d = t.hook.doll();
    expect(d.parts).toEqual({ head: true, body: true, arms: true, legs: true });
    expect(d.heldItem).toBe('dirt');
  });
  it('うでを振る', () => {
    const t = setup();
    const before = armR(t.rig).rotation.x;
    t.rig.doll.swing();
    for (let i = 0; i < 7; i++) t.rig.update(1 / 60);
    expect(Math.abs(armR(t.rig).rotation.x - before)).toBeGreaterThan(0.1); // 三人称では 振ると角度が変わる
    for (let i = 0; i < 20; i++) t.rig.update(1 / 60);
    expect(armR(t.rig).rotation.x).toBeCloseTo(before, 5);
  });
});

describe('WEAPON-2 刀と弓の人形', () => {
  it('刀を持つと両うでが中段の形になる', async () => {
    const doll = new BlockDoll();
    doll.setHeld('katana');
    doll.setMode('third');
    doll.setWeapon({ item: 'katana', stance: 'chudan', tech: null, phase: 'idle', frame: 0, buffered: null, switchFrom: null }, { stage: 0, pull: 0, bendDeg: 0 });
    doll.update(1 / 60, { x: 0, y: 0, z: 0 }, 0, 0, false, true);
    expect(doll.dollPose.rx).toBe(50);
    doll.dispose();
  });
  it('弓をひくとしなる', () => {
    const doll = new BlockDoll();
    doll.setHeld('yumi');
    doll.setMode('third');
    doll.setWeapon(null, { stage: 3, pull: 1, bendDeg: 32 });
    doll.update(1 / 60, { x: 0, y: 0, z: 0 }, 0, 0, false, true);
    expect(doll.dollPose.rz).toBe(35);
    doll.dispose();
  });
});
