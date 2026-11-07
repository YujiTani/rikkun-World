import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createGirlAim } from './gashaGirlAim';
import type { GashaGirlDeps } from './gashaGirlTypes';
import type { GashaTarget } from './gashaTargets';

/** COOP-1 4d-3（§3.6 (c)）: 少女の ねらい。1 人の ときは 今の 口、2 人の ときは わざの はじめに 決めた 人 */
function person(who: 1 | 2, pos: { x: number; y: number; z: number }, log: string[], extra: Partial<GashaTarget> = {}): GashaTarget {
  return { who, pos, yawDeg: who * 10, down: false, hurt: () => { log.push(`hurt${who}`); return true; }, hearts: () => ({ hp: who, maxHp: 5 }), ...extra };
}
const base = (over: Partial<GashaGirlDeps>): GashaGirlDeps => ({
  camera: new PerspectiveCamera(),
  player: () => ({ x: 9, y: 0, z: 9, yawDeg: 0, vx: 0, vz: 0 }),
  hurt: () => true, hp: () => 7, maxHp: () => 8,
  parry: (h: { amount: number }) => ({ result: 'fail' as const, amount: h.amount }),
  ...over,
} as unknown as GashaGirlDeps);

describe('少女の ねらい', () => {
  it('targets が なければ 今の 口を そのまま 使う（1 人）', () => {
    const a = createGirlAim(base({}), () => ({ x: 0, y: 0, z: 0 }));
    expect(a.player().x).toBe(9);
    expect(a.who()).toBe(1);
    expect(a.hearts()).toEqual({ hp: 7, maxHp: 8 });
    expect(a.parry({ dirDeg: null, by: 'attack', amount: 2 }).result).toBe('fail');
  });

  it('あらわれる ステップで 近い 方を 決め、とちゅうで 相手が 近づいても かえない。倒れた 人は のぞく', () => {
    const log: string[] = [];
    const p1 = { x: 10, y: 0, z: 0 }, p2 = { x: 30, y: 0, z: 0 };
    const t1 = person(1, p1, log), t2 = person(2, p2, log);
    const a = createGirlAim(base({ targets: () => [t1, t2] }), () => ({ x: 0, y: 0, z: 0 }));
    a.begin();
    expect(a.who()).toBe(1);
    p2.x = 2; // 2P が ぐっと 近づく
    expect(a.who()).toBe(1);
    expect(a.player().yawDeg).toBe(10);
    expect(a.hurt(1, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(log).toEqual(['hurt1']);
    expect(a.hearts()).toEqual({ hp: 1, maxHp: 5 });
    a.begin(); // 次の わざ
    expect(a.who()).toBe(2);
    (t1 as { down: boolean }).down = true;
    p1.x = 1;
    a.begin();
    expect(a.who()).toBe(2);
  });

  it('パリィの 口が ない 人は そのままの ダメージ（none）。2P の パリィは 4d-1 の あと', () => {
    const t2 = person(2, { x: 1, y: 0, z: 0 }, []);
    const a = createGirlAim(base({ targets: () => [t2] }), () => ({ x: 0, y: 0, z: 0 }));
    a.begin();
    expect(a.parry({ dirDeg: 0, by: 'fireball', amount: 3 })).toEqual({ result: 'none', amount: 3 });
  });
});
