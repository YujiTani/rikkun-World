import { describe, expect, it } from 'vitest';
import { FUTON_FOOT, FUTON_HEAD, futonDirFromYaw, futonInfo, futonPartner, isFutonId } from './futon';

describe('ふとん 2 マス', () => {
  it('yaw から 向き（東 = 0・南 = 1・西 = 2・北 = 3）', () => {
    expect(futonDirFromYaw(90)).toBe(0);
    expect(futonDirFromYaw(180)).toBe(1);
    expect(futonDirFromYaw(270)).toBe(2);
    expect(futonDirFromYaw(0)).toBe(3);
    expect(futonDirFromYaw(-90)).toBe(2);
    expect(futonDirFromYaw(350)).toBe(3);
  });
  it('頭と 足は おたがいが 相手', () => {
    for (let d = 0; d < 4; d++) {
      const head = FUTON_HEAD[d]!;
      const foot = FUTON_FOOT[d]!;
      const f = futonPartner(head, 10, 10)!;
      expect(f.id).toBe(foot);
      const back = futonPartner(foot, f.x, f.z)!;
      expect(back).toEqual({ x: 10, z: 10, id: head });
      expect(Math.abs(f.x - 10) + Math.abs(f.z - 10)).toBe(1);
    }
    expect(isFutonId('stone')).toBe(false);
    expect(futonInfo('futon')).toEqual({ role: 'head', dir: 0 });
    expect(futonPartner('stone', 0, 0)).toBeNull();
  });
});
