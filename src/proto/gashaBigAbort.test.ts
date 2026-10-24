import { describe, expect, it } from 'vitest';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig } from './gashaBig';
import { BigActor } from './gashaBigActor';

const CLIPS = { climbUp, climbDown, lookBack };
const DT = 1 / 60;

function rig() {
  const ply = { x: 0, y: 1, z: 25, yawDeg: 180 };
  const actor = new BigActor(buildBig(), CLIPS, { groundY: () => -1, player: () => ply, carryPlayer: () => {} }, 293);
  actor.place(0, 0, 0, 0);
  actor.walk(false);
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) actor.update(DT); };
  return { actor, run };
}

/** 攻撃の 途中の 状態が ぜんぶ 片づいて いる（怒りは のこる） */
function expectClean(a: BigActor): void {
  expect(a.warn).toBeNull();
  expect(a.attackName).toBeNull();
  expect(a.sweepNow).toBeNull();
  expect(a.beamLook).toBeNull();
  expect(a.beam.phase).toBe('idle');
  expect(a.beam.glow).toBe(0);
  expect(a.eruption.phase).toBe('idle');
  expect(a.eruption.pitch).toBe(0);
  expect(a.eruption.column).toBe(0);
  expect(a.thunder.phase).toBe('idle');
  expect(a.thunder.cloud).toBe(0);
  expect(a.thunder.elec).toBe(0);
  expect(a.thunder.raise).toBe(0);
  expect(a.sweep.phase).toBe('idle');
  expect(a.slam2.phase).toBe('idle');
  expect(a.angryLeft).toBeGreaterThan(0);
}

describe('攻撃の 途中で つかれ・切りかえ → 攻撃の 状態を ぜんぶ 片づける（FIX-BRIEF-2 §3-2）', () => {
  const mid: [string, number][] = [['sweep', 5], ['thunder', 7], ['eruption', 4], ['beam', 3], ['slam2', 3]];
  for (const [name, sec] of mid) {
    it(`${name} の 途中で tired() → 攻撃の 状態が 残らない`, () => {
      const { actor, run } = rig();
      actor.hit();
      actor.attack(name);
      run(sec);
      expect(actor.mode).toBe('attack');
      actor.tired(5);
      expect(actor.mode).toBe('tired');
      expectClean(actor);
      run(1);
      expectClean(actor);
    });
    it(`${name} の 途中で abortAttack() → 怒りに もどる。攻撃の 状態が 残らない`, () => {
      const { actor, run } = rig();
      actor.hit();
      actor.attack(name);
      run(sec);
      actor.abortAttack();
      expect(actor.mode).toBe('angry');
      expectClean(actor);
      run(3);
      expect(actor.mode === 'angry' || actor.mode === 'attack').toBe(true);
    });
  }

  it('つかれが おわって 怒りに もどっても 払い・雷の 当たりは 出ない', () => {
    const { actor, run } = rig();
    actor.hit();
    actor.attack('sweep');
    run(9);
    actor.tired(2);
    run(5);
    expect(actor.sweepNow).toBeNull();
    expect(actor.thunder.elec).toBe(0);
  });
});
