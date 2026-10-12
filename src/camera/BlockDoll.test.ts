import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ItemId, PlayerState } from '../contracts';
import { ActionState } from '../input/actions';
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
    moving: false,
  };
  const cam = new THREE.PerspectiveCamera(75, aspect, 0.1, 500);
  const rig = new CameraRig(cam, new THREE.Scene(), world, () => state, new ActionState());
  let held: ItemId | null = 'dirt';
  rig.setHeldProvider(() => held);
  rig.update(1 / 60);
  return { rig, state, hook: createCameraHook(rig), setHeld: (h: ItemId | null) => (held = h) };
}

const armR = (rig: CameraRig) => (rig.doll as unknown as { armR: THREE.Group }).armR;

describe('一人称の手足と持ったブロック（AC27）', () => {
  it('頭とからだは消え、手足は見える', () => {
    const t = setup();
    const d = t.hook.doll();
    expect(d.parts).toEqual({ head: false, body: false, arms: true, legs: true });
    expect(d.visible).toBe(false);
  });
  it('一人称は ひじから先・ひざから先だけ。三人称は全部', () => {
    const t = setup();
    const up = (rig: CameraRig) => (rig.doll as unknown as { upperParts: THREE.Mesh[] }).upperParts;
    expect(up(t.rig).length).toBeGreaterThan(0);
    expect(up(t.rig).every((m) => !m.visible)).toBe(true);
    t.rig.doll.setMode('third');
    expect(up(t.rig).every((m) => m.visible)).toBe(true);
  });
  it('持ったブロックは画面の右下', () => {
    for (const aspect of [16 / 9, 1, 4 / 3]) {
      const t = setup(0, aspect);
      const d = t.hook.doll();
      expect(d.heldItem).toBe('dirt');
      expect(d.heldScreen!.x).toBeGreaterThan(0.55);
      expect(d.heldScreen!.x).toBeLessThan(0.95);
      expect(d.heldScreen!.y).toBeGreaterThan(0.55);
      expect(d.heldScreen!.y).toBeLessThan(0.95);
    }
  });
  it('空のマスなら null', () => {
    const t = setup();
    t.setHeld(null);
    expect(t.hook.doll().heldItem).toBeNull();
    expect(t.hook.doll().heldScreen).toBeNull();
  });
  it('下を向いても手が画面に入る', () => {
    const t = setup(-80);
    const s = t.hook.doll().heldScreen!;
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(1);
  });
  it('三人称は全部見えて、同じものを持つ', () => {
    const t = setup();
    t.rig.toggleView();
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
    expect(armR(t.rig).rotation.x).toBeLessThan(before);
    for (let i = 0; i < 20; i++) t.rig.update(1 / 60);
    expect(armR(t.rig).rotation.x).toBeCloseTo(before, 5);
  });
});
