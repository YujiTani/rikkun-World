import { describe, expect, it } from 'vitest';
import { extendPerson, peopleList, type P2GashaPort } from './gashaPeople';
import type { GashaTarget } from '../../gasha/gashaTargets';

/** COOP-1 4d-3: 人の 一覧（使いまわし・2P は 参加ごとに 1 回 作る） */
const p1 = extendPerson({ who: 1, pos: { x: 0, y: 0, z: 0 }, yawDeg: 0, down: false }, { down: () => dead });
let dead = false;

function port(): P2GashaPort {
  const st = { position: { x: 5, y: 1, z: 2 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 350, onGround: true };
  return {
    ctl: { state: st, set: () => {} },
    life: { hp: 3, maxHp: 5, down: false, damage: (a: number) => ({ applied: a, knock: true }) },
    armor: { equipped: () => null }, blade: { shape: () => null, state: () => ({}) },
    held: () => null, weaponDamage: () => 1, setNoFall: () => {}, blockInput: () => {}, onBigHit: () => {},
  } as unknown as P2GashaPort;
}

describe('peopleList', () => {
  it('2P が いなければ 1P だけ。いる あいだは 同じ 2P の 口を 使いまわす', () => {
    let cur: P2GashaPort | null = null;
    let made = 0;
    const list = peopleList(p1, () => cur, () => { made++; return null; });
    expect(list().map((t) => t.who)).toEqual([1]);
    cur = port();
    const a = list(), b = list();
    expect(a.map((t) => t.who)).toEqual([1, 2]);
    expect(a[1]).toBe(b[1]);
    expect(made).toBe(1);
    cur = port(); // やめて また 参加
    list();
    expect(made).toBe(2);
    cur = null;
    expect(list().length).toBe(1);
  });

  it('1P の 倒れ・2P の 口（運ぶ・押す・ダメージ）', () => {
    expect(p1.down).toBe(false);
    dead = true;
    expect(p1.down).toBe(true);
    const pt = port();
    const t: GashaTarget = peopleList(p1, () => pt, () => null)()[1]!;
    expect(t.hurt?.(2, { x: 0, y: 0, z: 0 })).toBe(true);
    t.carry?.(1, 2, 3, 20);
    expect(pt.ctl.state.position).toEqual({ x: 6, y: 3, z: 5 });
    expect(pt.ctl.state.yawDeg).toBe(10);
    t.nudge?.(1, 1);
    expect(t.pos.x).toBe(7);
    expect(t.hearts?.()).toEqual({ hp: 3, maxHp: 5 });
  });
});
