import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig } from './gashaBig';
import { BigActor, type ActorEnv } from './gashaBigActor';
import { TUNE as T } from './gashaBigTuning';

/** #293 直し 4: とどめで lock() した 体は、怒り解除・休み明け・叩かれ・攻撃の 指示で 二度と ふだんの 動きに もどらない */
const CLIPS = { climbUp, climbDown, lookBack };
const DT = 1 / 60;

function rig(): { actor: BigActor; ply: { x: number; y: number; z: number; yawDeg: number } } {
  const ply = { x: 40, y: 1, z: 40, yawDeg: 0 };
  const env: ActorEnv = { groundY: () => -1, player: () => ply, carryPlayer: () => undefined };
  const actor = new BigActor(buildBig(), CLIPS, env, 293);
  actor.place(0, 0, 0, 0);
  return { actor, ply };
}
const run = (a: BigActor, sec: number): void => { for (let i = 0; i < Math.round(sec / DT); i++) a.update(DT); };

describe('gashaBigActor lock（とどめの あと）', () => {
  let atk = true;
  beforeAll(() => { atk = T.attack.enabled; });
  afterAll(() => { T.attack.enabled = atk; });

  it('lock() の あとで angry(false)（怒り解除）を 呼んでも 固まった まま', () => {
    const { actor } = rig();
    actor.walk(true);
    actor.hit();
    actor.lock();
    actor.angry(false);
    expect(actor.mode).toBe('frozen');
    expect(actor.held).toBe(true);
  });

  it('lock() の あと 5 分 すすめても 位置・向きが かわらず、さまよわない・追わない・攻撃しない・休み明けで 動かない', () => {
    const { actor } = rig();
    actor.walk(true);
    actor.hit();
    run(actor, 2);
    actor.lock();
    actor.angry(false);
    const p0 = actor.pos.clone(), y0 = actor.yaw;
    for (let min = 0; min < 5; min++) {
      run(actor, 60);
      expect(actor.mode).toBe('frozen');
      expect(actor.attackName).toBeNull();
    }
    expect(actor.pos.distanceTo(p0)).toBe(0);
    expect(actor.yaw).toBe(y0);
  });

  it('lock() の あとは なぐられても（hit）・攻撃や つかれを 言われても・固まりを 解こうと しても 固まった まま', () => {
    const { actor } = rig();
    actor.lock();
    actor.hit();
    expect(actor.mode).toBe('frozen');
    actor.attack('slam2');
    expect(actor.mode).toBe('frozen');
    actor.tired();
    expect(actor.mode).toBe('frozen');
    actor.unfreeze();
    expect(actor.mode).toBe('frozen');
    actor.finale();
    expect(actor.mode).toBe('frozen');
    actor.walk(true);
    actor.goTo(30, 30);
    run(actor, 30);
    expect(actor.mode).toBe('frozen');
    expect(actor.pos.x).toBe(0);
    expect(actor.pos.z).toBe(0);
  });

  it('少女への 固まり（finale）は これまで どおり angry(false) で 解ける（とどめの lock だけ 解けない）', () => {
    const { actor } = rig();
    actor.finale();
    run(actor, 60);
    actor.angry(false);
    expect(actor.mode).not.toBe('frozen');
  });
});
