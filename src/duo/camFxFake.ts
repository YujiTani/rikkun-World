import { SHAKE, shakeAngles } from '../fx/impact';
import type { P1CamPort, P1RigPort } from './camFx';

/**
 * テスト用（本番から import しない）: three なしの 小さい 1P の カメラの にせもの。camFx.test.ts・impactRoute.test.ts が 使う。
 * 本物の CameraRig と 同じ 考え方: update(dt) で 体に ついていき（ねらいも ここで 更新）、ゆれを 足して 向きを きめる。
 * ゆれは CameraRig と 同じ 式（SHAKE・shakeAngles。時間 +dt → trauma を へらす → 角度）。
 */
export interface FakeRig extends P1RigPort {
  camera: P1CamPort;
  /** 体（カメラが ついていく 先。テストが 動かす） */
  body: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** update が 呼ばれた 回数（肩の 点・ねらいの 更新の かわり） */
  updates: number;
}

export function fakeRig(): FakeRig {
  const sh = { yaw: 0, pitch: 0, roll: 0 };
  let trauma = 0;
  let t = 0;
  const r: FakeRig = {
    camera: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    body: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
    updates: 0,
    distanceOverride: null,
    update(dt: number) {
      r.updates++;
      t += dt;
      trauma = Math.max(0, trauma - SHAKE.decayPerSecond * dt);
      shakeAngles(trauma, t, sh);
      const b = r.body;
      r.camera.position.x = b.x;
      r.camera.position.y = b.y;
      r.camera.position.z = b.z;
      r.camera.rotation.x = b.pitch + sh.pitch;
      r.camera.rotation.y = b.yaw + sh.yaw;
      r.camera.rotation.z = sh.roll;
    },
    addTrauma(a: number) {
      trauma = Math.min(1, trauma + a);
    },
    traumaNow: () => trauma,
    shakeNow: () => sh,
  };
  return r;
}
