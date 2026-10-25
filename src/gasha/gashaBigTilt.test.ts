import { describe, expect, it } from 'vitest';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { buildBig } from './gashaBig';
import { BigActor } from './gashaBigActor';

const CLIPS = { climbUp, climbDown, lookBack };
const DT = 1 / 60;

function rig() {
  const ply = { x: 0, y: 1, z: 200, yawDeg: 180 };
  const actor = new BigActor(buildBig(), CLIPS, { groundY: () => -1, player: () => ply, carryPlayer: () => {} }, 293);
  actor.place(0, 0, 0, 0);
  actor.walk(false);
  const run = (sec: number) => { for (let i = 0; i < Math.round(sec / DT); i++) actor.update(DT); };
  const span = () => {
    let lo = Infinity, hi = -Infinity, lx = Infinity, hx = -Infinity;
    for (const b of actor.boxList) {
      lo = Math.min(lo, b.c[1] - b.ext[1]); hi = Math.max(hi, b.c[1] + b.ext[1]);
      lx = Math.min(lx, b.c[0] - b.ext[0]); hx = Math.max(hx, b.c[0] + b.ext[0]);
    }
    return { lo, hi, h: hi - lo, w: hx - lx };
  };
  return { actor, run, span };
}

describe('とどめの あと: 倒れる・くずれる（actor）', () => {
  it('lock(): 攻撃の 途中でも その場で 固まる(固まった まま 動かない・攻撃しない・追わない)', () => {
    const { actor, run } = rig();
    actor.hit();
    actor.attack('sweep');
    run(2);
    expect(actor.mode).toBe('attack');
    actor.lock();
    expect(actor.mode).toBe('frozen');
    expect(actor.held).toBe(true);
    expect(actor.sweepNow).toBeNull();
    const p0 = { x: actor.pos.x, z: actor.pos.z };
    run(10);
    expect(actor.mode).toBe('frozen');
    expect(Math.hypot(actor.pos.x - p0.x, actor.pos.z - p0.z)).toBe(0);
  });

  it('setTilt: 前へ のめって しずむと 体の てっぺんが ひくくなる。0 に もどすと もとの 高さ', () => {
    const { actor, run, span } = rig();
    run(0.2);
    const up = span();
    actor.setTilt(0.35, 0, 6, 8);
    run(0.1);
    const down = span();
    expect(down.hi).toBeLessThan(up.hi - 5);
    expect(down.lo).toBeLessThan(up.lo - 5);
    actor.setTilt(0, 0, 6, 0);
    run(0.1);
    expect(Math.abs(span().hi - up.hi)).toBeLessThan(0.01);
    expect(Math.abs(span().lo - up.lo)).toBeLessThan(0.01);
  });

  it('しずむ(sink): そのぶん まっすぐ 下へ(かたむけなし)', () => {
    const { actor, run, span } = rig();
    run(0.1);
    const a = span();
    actor.setTilt(0, 0, 0, 3);
    run(0.1);
    expect(span().lo).toBeCloseTo(a.lo - 3, 3);
    expect(span().hi).toBeCloseTo(a.hi - 3, 3);
  });

  it('hideJoint: その 関節の 箱は 固くなくなる(のっている 人は 落ちる)。もどす(showAllJoints)と また 固い', () => {
    const { actor, run } = rig();
    run(0.1);
    const i = actor.boxList.findIndex((b) => b.name.startsWith('skull') && b.half[0] > 1);
    expect(i).toBeGreaterThanOrEqual(0);
    const b = actor.boxList[i]!;
    const cell = [Math.floor(b.c[0]), Math.floor(b.c[1]), Math.floor(b.c[2])] as const;
    expect(actor.solid(...cell)).toBe(true);
    actor.hideJoint('Head');
    expect(actor.solid(...cell)).toBe(false);
    actor.showAllJoints();
    expect(actor.solid(...cell)).toBe(true);
  });

  it('setCoreRed: コアの 色が 水色から 赤へ。0 で もとの 色に もどる', () => {
    const model = buildBig();
    const vis = model.group.getObjectByName('coreVis')!;
    const mats = vis.children.map((c) => (c as unknown as { material: { color: { r: number; g: number; b: number } } }).material);
    const base = mats.map((m) => ({ r: m.color.r, g: m.color.g, b: m.color.b }));
    expect(base[0]!.b).toBeGreaterThan(base[0]!.r); // もとは 水色
    model.setCoreRed(1);
    expect(mats[0]!.color.r).toBeGreaterThan(mats[0]!.color.b);
    expect(mats[0]!.color.g).toBeLessThan(0.3);
    model.setCoreRed(0.5);
    expect(mats[0]!.color.r).toBeGreaterThan(base[0]!.r * 0.5);
    model.setCoreRed(0);
    expect(mats[0]!.color.r).toBeCloseTo(base[0]!.r, 6);
    expect(mats[0]!.color.b).toBeCloseTo(base[0]!.b, 6);
  });
});
