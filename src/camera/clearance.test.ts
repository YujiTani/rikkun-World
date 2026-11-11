import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BlockId, PlayerState, VoxelWorld } from '../contracts';
import { p2CameraPose, type P2Pose } from '../duo/p2Pose';
import { ActionState } from '../input/actions';
import { CameraRig } from './CameraRig';
import { buildClearanceScene, CLEARANCE_PITCHES, CLEARANCE_YAWS, nearestSolidDistance } from './clearanceScene';
import * as config from './config';

/**
 * SIGHT-1（#446）AC1・AC2・AC3・AC9（カメラ）。先に書いた テスト（実装の前は 赤）。
 * 新しい 内部の 関数は 見ない。CameraRig と p2CameraPose の 外から 見える カメラの 点だけで たしかめる。
 */
const NEED = 0.25; // マス: カメラの 点から いちばん近い 固いマスまで

function fakeWorld(isSolid: (x: number, y: number, z: number) => boolean): VoxelWorld {
  return {
    size: { y: 64 },
    isLoaded: () => true,
    loadedBounds: () => ({ x0: 0, z0: 0, x1: 64, z1: 64 }),
    getBlock: (x, y, z): BlockId | 'outside' => (isSolid(x, y, z) ? 'stone' : 'air'),
    setBlock: () => false,
    isSolid,
  };
}

function rigAt(world: VoxelWorld, p: { x: number; y: number; z: number }) {
  const state: PlayerState = {
    position: { ...p },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 0,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 500);
  const rig = new CameraRig(camera, new THREE.Scene(), world, () => state, new ActionState());
  return { state, rig };
}

describe('AC1 坑道・小部屋で 1P のカメラは 固いマスから 0.25 以上', () => {
  it('場所 × 向き 12 × 上下 5 の どれでも', () => {
    const scene = buildClearanceScene();
    const world = fakeWorld(scene.isSolid);
    const bad: string[] = [];
    for (const f of scene.feet) {
      const { state, rig } = rigAt(world, f);
      for (const yaw of CLEARANCE_YAWS)
        for (const pitch of CLEARANCE_PITCHES) {
          state.yawDeg = yaw;
          state.pitchDeg = pitch;
          for (let i = 0; i < 3; i++) rig.update(1 / 60);
          const c = rig.getInfo().position;
          const d = nearestSolidDistance(scene.isSolid, c.x, c.y, c.z);
          if (d < NEED) bad.push(`${f.x.toFixed(2)},${f.z.toFixed(2)} yaw${yaw} pitch${pitch}: ${d.toFixed(3)}`);
        }
    }
    expect(bad.length, bad.slice(0, 5).join(' / ')).toBe(0);
  });
});

describe('AC2 2P のカメラ（p2CameraPose）も 同じ場面で 0.25 以上', () => {
  it('場所 × 向き 12 × 上下 5 の どれでも', () => {
    const scene = buildClearanceScene();
    const out: P2Pose = { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0 };
    const bad: string[] = [];
    for (const f of scene.feet)
      for (const yaw of CLEARANCE_YAWS)
        for (const pitch of CLEARANCE_PITCHES) {
          const p = p2CameraPose(f, yaw, pitch, 4.0, scene.isSolid, out);
          const d = nearestSolidDistance(scene.isSolid, p.x, p.y, p.z);
          if (d < NEED) bad.push(`${f.x.toFixed(2)},${f.z.toFixed(2)} yaw${yaw} pitch${pitch}: ${d.toFixed(3)}`);
        }
    expect(bad.length, bad.slice(0, 5).join(' / ')).toBe(0);
  });
});

describe('AC3 ひらけた場所では 距離は 今と同じ（4.0）', () => {
  it('1P: 肩の点 S から カメラまで 4.0', () => {
    const world = fakeWorld(() => false);
    const { state, rig } = rigAt(world, { x: 30.5, y: 30, z: 30.5 });
    for (const yaw of CLEARANCE_YAWS)
      for (const pitch of CLEARANCE_PITCHES) {
        state.yawDeg = yaw;
        state.pitchDeg = pitch;
        for (let i = 0; i < 30; i++) rig.update(1 / 60);
        const info = rig.getInfo();
        const d = Math.hypot(
          info.position.x - info.shoulder.x,
          info.position.y - info.shoulder.y,
          info.position.z - info.shoulder.z,
        );
        expect(d, `yaw${yaw} pitch${pitch}`).toBeCloseTo(4.0, 2);
      }
  });
  it('2P: 肩の点から カメラまで 4.0（上へ むいて 床に ぶつからない 向き）', () => {
    const out: P2Pose = { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0 };
    const feet = { x: 30.5, y: 30, z: 30.5 };
    const p = p2CameraPose(feet, 0, 0, 4.0, () => false, out);
    // yaw 0（前 = -Z）・pitch 0: カメラは まっすぐ うしろ（+Z）へ 4.0。右へのずらしは そのまま
    expect(p.z - feet.z).toBeCloseTo(4.0, 2);
  });
});

describe('AC9 新しい数は camera/config.ts', () => {
  it('CAMERA_CLEARANCE = 0.3、SHOULDER_WALL_MARGIN = 0.3', () => {
    expect((config as Record<string, unknown>).CAMERA_CLEARANCE).toBe(0.3);
    expect(config.SHOULDER_WALL_MARGIN).toBe(0.3);
  });
});
