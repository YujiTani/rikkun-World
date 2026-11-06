import { describe, expect, it } from 'vitest';
import { p2CameraPose, type P2Pose } from './p2Pose';

const out = (): P2Pose => ({ x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0 });

describe('p2CameraPose（分割の 2P の カメラ）', () => {
  it('なにも なければ 向きの うしろ 距離ぶん（yaw 90 = 前が +x なので カメラは -x がわ）', () => {
    const p = p2CameraPose({ x: 10, y: 5, z: 10 }, 90, 0, 5, () => false, out());
    expect(p.x).toBeCloseTo(5, 0);
    expect(p.y).toBeGreaterThan(5);
    expect(Math.abs(p.z - 10)).toBeLessThan(1);
  });
  it('うしろが 壁なら 手前に 寄る', () => {
    const free = p2CameraPose({ x: 10, y: 5, z: 10 }, 90, 0, 5, () => false, out());
    const wall = p2CameraPose({ x: 10, y: 5, z: 10 }, 90, 0, 5, (x) => x <= 7, out());
    expect(wall.x).toBeGreaterThan(free.x + 1);
  });
  it('分割の 瞬間の 向き: yawDeg は そのまま 返す', () => {
    expect(p2CameraPose({ x: 0, y: 0, z: 0 }, 123, 10, 5, () => false, out()).yawDeg).toBe(123);
  });
});
