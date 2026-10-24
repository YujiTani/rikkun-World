import { describe, expect, it } from 'vitest';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig } from './gashaBig';
import { BigActor } from './gashaBigActor';
import { TUNE as T } from './gashaBigTuning';

const CLIPS = { climbUp, climbDown, lookBack };
const DT = 1 / 60;

function rig(player = { x: 0, y: 1, z: 60 }) {
  const ply = { ...player, yawDeg: 180 };
  const actor = new BigActor(buildBig(), CLIPS, { groundY: () => -1, player: () => ply, carryPlayer: () => {} }, 293);
  actor.place(0, 0, 0, 0);
  actor.walk(false);
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) actor.update(DT); };
  return { actor, run, ply };
}

describe('少女への 切りかえの 固まり（FIX-BRIEF-2 §4-1・2）', () => {
  it('調整表 freeze: 噴火のあと 上を向いた まま 固まる(白目)。数は 表で かえられる', () => {
    expect(T.freeze.enabled).toBe(true);
    expect(T.freeze.eyesWhite).toBe(true);
    expect(T.eruption.headUpDeg).toBeGreaterThan(0);
  });

  it('finale(): 攻撃の 途中でも 片づけて、必ず 噴火攻撃を する。そのあと 上を 向いた まま 固まり、frozen', () => {
    const { actor, run } = rig();
    actor.hit();
    actor.attack('sweep');
    run(3);
    expect(actor.attackName).toBe('sweep');
    const started: string[] = [];
    (actor.env as { onAttackStart?: (n: string) => void }).onAttackStart = (n) => started.push(n);
    actor.finale();
    expect(actor.sweepNow).toBeNull();
    expect(actor.sweep.phase).toBe('idle');
    expect(actor.mode).toBe('attack');
    expect(actor.attackName).toBe('eruption');
    expect(started).toEqual(['eruption']);
    expect(actor.held).toBe(false);
    run(T.eruption.inhaleSec + T.eruption.eruptSec + 1);
    expect(actor.held).toBe(true);
    expect(actor.mode).toBe('frozen');
    expect(actor.eruption.pitch).toBe(1); // 上を 向いた まま
  });

  it('固まって いる 間: 動かない・攻撃しない・追わない・怒り直さない。目は 白目。体を なぐられても かわらない', () => {
    const { actor, run, ply } = rig({ x: 0, y: 1, z: 200 });
    actor.hit();
    actor.finale();
    run(T.eruption.inhaleSec + T.eruption.eruptSec + 1);
    const p = actor.pos.clone(), yaw = actor.yaw;
    actor.hit(); // なぐられた
    ply.x = 150; // プレイヤーが 動いても 向きを かえない
    run(60);
    expect(actor.mode).toBe('frozen');
    expect(actor.pos.distanceTo(p)).toBe(0);
    expect(actor.yaw).toBe(yaw);
    expect(actor.cycle.phase).not.toBe('attack');
    expect(actor.eyeMix).toBe(0); // 白目
    expect(actor.attackName).toBeNull();
    expect(actor.eruption.pitch).toBe(1);
    expect(actor.chasing).toBe(false);
    // 攻撃の 番が 来る はずの 時間が たっても 攻撃は 出ない
    run(300);
    expect(actor.mode).toBe('frozen');
    expect(actor.beamCount + actor.sweepCount + actor.slam2Count + actor.thunderCount).toBe(0);
    expect(actor.eruptionCount).toBe(1);
  });

  it('unfreeze(): 固まりを 解く(怒りの ならしに もどる)。体に 登る・当たりは 固まって いても そのまま', () => {
    const { actor, run } = rig();
    actor.hit();
    actor.finale();
    run(T.eruption.inhaleSec + T.eruption.eruptSec + 1);
    actor.unfreeze();
    expect(actor.mode).toBe('angry');
    expect(actor.held).toBe(false);
  });
});
