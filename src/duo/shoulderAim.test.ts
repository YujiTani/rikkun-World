import { describe, expect, it } from 'vitest';
import { SHOULDER_DROP, SHOULDER_OFFSET } from '../camera/config';
import { shoulderAimDeg } from './shoulderAim';

const DEG = Math.PI / 180;

/** 向き（度）から 肩の 点 S を 求めて、S から まとの 中心へ 向かう 向き（度）を 返す（CameraRig.placeShoulder と 同じ 式） */
function lineFromShoulder(pivot: { x: number; y: number; z: number }, yawDeg: number, pitchDeg: number, cell: { x: number; y: number; z: number }) {
  const off = SHOULDER_OFFSET * Math.cos(pitchDeg * DEG);
  const s = { x: pivot.x + Math.cos(yawDeg * DEG) * off, y: pivot.y - SHOULDER_DROP, z: pivot.z + Math.sin(yawDeg * DEG) * off };
  const dx = cell.x + 0.5 - s.x;
  const dy = cell.y + 0.5 - s.y;
  const dz = cell.z + 0.5 - s.z;
  return { yaw: Math.atan2(dx, -dz) / DEG, pitch: Math.atan2(dy, Math.hypot(dx, dz)) / DEG };
}

describe('shoulderAimDeg（1P の ねらいの 線は 目では なく 肩の 点 S から 出る）', () => {
  const pivot = { x: 100.5, y: 152.12, z: 100.5 };

  it('求めた 向きで S から 線を 引くと、まとの 中心を 通る（不動点）', () => {
    const cell = { x: 102, y: 152, z: 100 };
    const a = shoulderAimDeg(pivot, cell);
    const back = lineFromShoulder(pivot, a.yawDeg, a.pitchDeg, cell);
    expect(back.yaw).toBeCloseTo(a.yawDeg, 3);
    expect(back.pitch).toBeCloseTo(a.pitchDeg, 3);
  });

  it('目からの 向きとは ちがう（肩が 右に ずれて いる ぶん、まとの 中心へ 向けるには 左へ 少し 回す）', () => {
    const cell = { x: 102, y: 152, z: 100 };
    const eye = Math.atan2(cell.x + 0.5 - pivot.x, -(cell.z + 0.5 - pivot.z)) / DEG;
    const a = shoulderAimDeg(pivot, cell);
    expect(Math.abs(a.yawDeg - eye)).toBeGreaterThan(1);
  });

  it('まとが 真上でも 有限の 数を 返す', () => {
    const a = shoulderAimDeg(pivot, { x: 100, y: 160, z: 100 });
    expect(Number.isFinite(a.yawDeg) && Number.isFinite(a.pitchDeg)).toBe(true);
  });
});
