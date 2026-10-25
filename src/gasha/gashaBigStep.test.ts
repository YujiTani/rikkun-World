import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig } from './gashaBig';
import { BigActor, type ActorEnv } from './gashaBigActor';
import { BigShock } from './gashaBigShock';
import type { StepPhase } from './gashaBigStep';
import { TUNE as T } from './gashaBigTuning';

const DT = 1 / 60;
const CLIPS = { climbUp, climbDown, lookBack };

/** 平らな 世界（立つ 面 = 0）。たたいた 所は shock へ */
function rig(ply = { x: 500, y: 0, z: 500, yawDeg: 0 }) {
  const hurts: { amount: number; from: { x: number; y: number; z: number } }[] = [];
  const pushes: { x: number; y: number; z: number }[] = [];
  const shock = new BigShock({ player: () => ply, groundY: () => -1, hurt: (amount, from) => { hurts.push({ amount, from }); return true; }, setPlayerVelocity: (v) => pushes.push(v) });
  const slams: { x: number; z: number; frame: number }[] = [];
  const taps: { x: number; z: number; frame: number }[] = [];
  let frame = 0;
  const env: ActorEnv = {
    groundY: () => -1,
    player: () => ply,
    onSlam: (x, y, z) => { slams.push({ x, z, frame }); shock.add('slam', x, y, z); },
    onTap: (x, y, z) => { taps.push({ x, z, frame }); shock.add('tap', x, y, z); },
  };
  const actor = new BigActor(buildBig(), CLIPS, env, 293);
  actor.place(0, 0, 0, 0);
  actor.walk(false);
  const tick = (): void => { frame++; actor.update(DT); shock.step(DT); };
  const run = (sec: number): void => { for (let i = 0; i < Math.round(sec / DT); i++) tick(); };
  return { actor, shock, ply, hurts, pushes, slams, taps, tick, run, frame: () => frame };
}

describe('gashaBigStep（#293 前へ 進む 1 歩 = ためる → たたきつける → 引きよせる）', () => {
  it('3 段が 順に 進む（ためる → 止まる → たたきつける → 引きよせる）。秒は 調整表どおり、左右の 腕を 交ごに', () => {
    const { actor, tick } = rig();
    actor.goTo(0, 400);
    const seen: { phase: StepPhase; side: string; sec: number }[] = [];
    let cur = actor.step.phase, side = actor.step.side, n = 0;
    for (let i = 0; i < Math.ceil(2.2 * actor.step.stepSec() * 60); i++) {
      tick();
      n++;
      if (actor.step.phase !== cur) { seen.push({ phase: cur, side, sec: n * DT }); cur = actor.step.phase; side = actor.step.side; n = 0; }
    }
    const order = seen.map((s) => s.phase);
    expect(order.slice(0, 8)).toEqual(['windup', 'hold', 'slam', 'pull', 'windup', 'hold', 'slam', 'pull']);
    expect(seen[0]!.side).toBe('Left');
    expect(seen[4]!.side).toBe('Right');
    const C = T.crawl;
    const want: Record<StepPhase, number> = { windup: C.windupSec, hold: C.holdSec, slam: C.slamSec, pull: C.pullSec };
    for (const s of seen.slice(0, 8)) expect(Math.abs(s.sec - want[s.phase])).toBeLessThanOrEqual(DT * 1.5);
    // ためるは ゆっくり、たたきつけは いっきに
    expect(C.windupSec / C.slamSec).toBeGreaterThan(6);
  });

  it('振り上げで 手は 頭の 上まで 上がる（いちばん 上で 止まる）。たたきつけで 体の 前の 遠くの 地面に 着く', () => {
    const { actor, run } = rig();
    actor.goTo(0, 400);
    const a = new Vector3();
    const s = actor.model.scale;
    run(T.crawl.windupSec + T.crawl.holdSec * 0.5);
    expect(actor.step.phase).toBe('hold');
    actor.model.joints.LeftHand.getWorldPosition(a);
    const head = actor.model.head.y * s;
    expect(a.y).toBeGreaterThan(head * 0.9); // 頭の 上の あたり
    run(T.crawl.holdSec * 0.5 + T.crawl.slamSec + DT);
    expect(actor.step.phase).toBe('pull');
    actor.model.joints.LeftHand.getWorldPosition(a);
    expect(a.y).toBeLessThan(actor.model.rest.LeftHand.y * s + 0.5); // 地面
    expect(a.z - actor.pos.z).toBeGreaterThan(10); // 体の 前の 遠く
  });

  it('たたきつけた コマで 手の まわりに 打撃ダメージ（その コマ。半径の 外は 当たらない）', () => {
    // 1 回目で 手の 着く 所を しらべて、2 回目は そこに 立つ
    const probe = rig();
    probe.actor.goTo(0, 400);
    probe.run(probe.actor.step.stepSec());
    const at = probe.slams[0]!;
    const near = rig({ x: at.x + 1, y: 0, z: at.z, yawDeg: 0 });
    near.actor.goTo(0, 400);
    let hitFrame = -1;
    for (let i = 0; i < Math.ceil(near.actor.step.stepSec() * 60); i++) { near.tick(); if (hitFrame < 0 && near.hurts.length) hitFrame = near.frame(); }
    expect(near.slams.length).toBe(1);
    expect(hitFrame).toBe(near.slams[0]!.frame); // たたきつけた コマ
    expect(near.hurts[0]!.amount).toBe(T.slam.hitDamage);
    expect(near.shock.hits[near.shock.hits.length - 1]!.kind).toBe('hit');
    // 打撃の 半径の 外（衝撃波の 内）: その コマでは 当たらない
    const far = rig({ x: at.x + T.slam.hitRadius + 3, y: 0, z: at.z, yawDeg: 0 });
    far.actor.goTo(0, 400);
    for (let i = 0; i < Math.ceil(far.actor.step.stepSec() * 60); i++) { far.tick(); if (far.slams.length && far.frame() === far.slams[0]!.frame) break; }
    expect(far.hurts.length).toBe(0);
  });

  it('衝撃波: 輪が 広がって とどくと 大ダメージ。ジャンプ中（足が 地面から はなれて いる）なら 当たらない', () => {
    const probe = rig();
    probe.actor.goTo(0, 400);
    probe.run(probe.actor.step.stepSec());
    const at = probe.slams[0]!;
    const d = T.slam.hitRadius + 8;
    for (const jump of [false, true]) {
      const ply = { x: at.x + d, y: 0, z: at.z, yawDeg: 0 };
      const r = rig(ply);
      r.actor.goTo(0, 400);
      let slamFrame = -1, hitFrame = -1;
      for (let i = 0; i < Math.ceil((r.actor.step.stepSec() + 2) * 60); i++) {
        // ジャンプ: 輪が とどく ころ 足を 1 ブロック 上げて おく
        ply.y = jump && slamFrame >= 0 ? 1 : 0;
        r.tick();
        if (slamFrame < 0 && r.slams.length) slamFrame = r.frame();
        if (hitFrame < 0 && r.hurts.length) hitFrame = r.frame();
      }
      if (jump) {
        expect(r.hurts.length).toBe(0);
      } else {
        expect(r.hurts.length).toBe(1);
        expect(r.hurts[0]!.amount).toBe(T.slam.waveDamage);
        expect(r.shock.hits[0]!.kind).toBe('wave');
        // とどく までの 時間 = 距離 ÷ 広がる 速さ
        expect((hitFrame - slamFrame) * DT).toBeCloseTo(d / T.slam.waveSpeed, 0);
      }
    }
  });

  it('引きよせで 前へ 進み、着いた 手は 地面で すべらない（世界で 止まって いる）', () => {
    const { actor, tick } = rig();
    actor.goTo(0, 400);
    const a = new Vector3();
    let start: Vector3 | null = null, z0 = 0, worst = 0, frames = 0;
    for (let i = 0; i < Math.ceil(3 * actor.step.stepSec() * 60); i++) {
      tick();
      const side = actor.step.side;
      if (actor.step.phase !== 'pull') { start = null; continue; }
      actor.model.joints[`${side}Hand`].getWorldPosition(a);
      if (!start) { start = a.clone(); z0 = actor.pos.z; continue; }
      worst = Math.max(worst, a.distanceTo(start));
      frames++;
      if (actor.step.t > actor.step.phaseSec('pull') * 0.98) expect(actor.pos.z - z0).toBeGreaterThan(actor.step.stride * actor.model.scale * 0.9);
    }
    console.log('pull: planted hand drift', worst.toFixed(4), 'frames', frames, 'stride', (actor.step.stride * actor.model.scale).toFixed(2));
    expect(frames).toBeGreaterThan(60);
    expect(worst).toBeLessThan(0.05);
    expect(actor.pos.z).toBeGreaterThan(2 * actor.step.stride * actor.model.scale);
  });

  it('引きよせの おわりに 反対の 手を つきなおす（地面を たたいて 小さい 衝撃。当たると ダメージと ひるみ）', () => {
    const probe = rig();
    probe.actor.goTo(0, 400);
    probe.run(probe.actor.step.stepSec() + DT);
    expect(probe.taps.length).toBe(1);
    expect(probe.actor.step.taps).toBe(1);
    const at = probe.taps[0]!;
    expect(probe.taps[0]!.frame).toBeGreaterThan(probe.slams[0]!.frame);
    const r = rig({ x: at.x + 1, y: 0, z: at.z, yawDeg: 0 });
    r.actor.goTo(0, 400);
    // たたきつけの 打撃・衝撃波が とどかない ように、たたきつけ までは 遠くに いて、つきなおし の 前に もどる
    const home = { x: at.x + 1, z: at.z };
    r.ply.x = 900; r.ply.z = 900;
    for (let i = 0; i < Math.ceil((r.actor.step.stepSec() + DT) * 60); i++) {
      if (r.actor.step.phase === 'pull' && r.actor.step.t > r.actor.step.phaseSec('pull') * 0.5) { r.ply.x = home.x; r.ply.z = home.z; }
      r.tick();
    }
    expect(r.hurts.length).toBe(1);
    expect(r.hurts[0]!.amount).toBe(T.slam.tapDamage);
    expect(r.shock.hits[0]!.kind).toBe('tap');
    expect(r.shock.inputBlocked()).toBe(true);
    expect(r.pushes.length).toBe(1);
  });
});
