import { describe, expect, it } from 'vitest';
import climbUp from './gashaBigClips/climbUp.json';
import climbDown from './gashaBigClips/climbDown.json';
import lookBack from './gashaBigClips/lookBack.json';
import { Color, Vector3 } from 'three';
import { buildBig } from './gashaBig';
import { BigActor } from './gashaBigActor';
import { TUNE as T } from './gashaBigTuning';

const CLIPS = { climbUp, climbDown, lookBack };
const DT = 1 / 60;
/** 目の 色の つくり方（actor の applyEyes と おなじ setRGB）で 16 進を 色の 値に した もの */
const asEye = (h: number): number => new Color().setRGB(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255).getHex();

/** 攻撃の 表を いっとき slam2 だけに する（回数を 数える テスト用） */
const onlySlam2 = <R>(f: () => R): R => {
  const saved = T.attack.table.slice();
  T.attack.table.length = 0; T.attack.table.push({ name: 'slam2', weight: 1 });
  try { return f(); } finally { T.attack.table.length = 0; T.attack.table.push(...saved); }
};

function rig() {
  const ply = { x: 0, y: 1, z: 40, yawDeg: 180 };
  const slams: { x: number; z: number; fx: number; fz: number; t: number }[] = [];
  let t = 0;
  const actor = new BigActor(buildBig(), CLIPS, {
    groundY: () => -1, player: () => ply, carryPlayer: () => {},
    onSlam2: (x, _y, z, fx, fz) => slams.push({ x, z, fx, fz, t }),
  }, 293);
  actor.place(0, 0, 0, 0); // +z を 向く（プレイヤーの 方）
  actor.walk(false);
  const run = (sec: number, each?: () => void) => { for (let i = 0; i < Math.round(sec / DT); i++) { t += DT; actor.update(DT); each?.(); } };
  return { actor, slams, run, now: () => t };
}

describe('怒りの 攻撃サイクル（actor）', () => {
  it('怒る → 攻撃 3〜5 回（両手たたきつけ）→ つかれて 30〜40 秒 → また 攻撃', () => onlySlam2(() => {
    const { actor, slams, run } = rig();
    actor.hit();
    const modes: string[] = [];
    let tiredStart = -1, tiredSec = 0, lastMode = '';
    let t = 0, slamsAtTired = -1;
    run(260, () => {
      t += DT;
      if (actor.mode !== lastMode) {
        modes.push(actor.mode); lastMode = actor.mode;
        if (actor.mode === 'tired' && tiredStart < 0) { tiredStart = t; slamsAtTired = slams.length; }
        if (tiredStart >= 0 && tiredSec === 0 && actor.mode !== 'tired') tiredSec = t - tiredStart;
      }
    });
    expect(slamsAtTired).toBeGreaterThanOrEqual(T.attack.minCount);
    expect(slamsAtTired).toBeLessThanOrEqual(T.attack.maxCount);
    expect(tiredSec).toBeGreaterThanOrEqual(T.tired.restSec[0] - 0.1);
    expect(tiredSec).toBeLessThanOrEqual(T.tired.restSec[1] + 0.1);
    // 休みの あと また 攻撃（2 周目）
    expect(slams.length).toBeGreaterThan(slamsAtTired);
    expect(modes.slice(0, 3)).toEqual(['angry', 'attack', 'angry']);
  }));

  it('攻撃は 前（体の 向き）の 地面を たたく。予告の 半円は たたく 前だけ 出て、同じ 場所', () => {
    const { actor, slams, run } = rig();
    actor.attack('slam2');
    expect(actor.mode).toBe('attack');
    expect(actor.warn).not.toBeNull();
    const w = { ...actor.warn! };
    expect(w.radius).toBe(T.slam2.warnRadius);
    expect(w.fz).toBeCloseTo(1, 5);
    run(1, () => expect(actor.warn).not.toBeNull());
    const total = T.slam2.windupSec + T.slam2.holdSec + T.slam2.slamSec;
    run(total - 1 + 0.1);
    expect(slams.length).toBe(1);
    expect(actor.warn).toBeNull();
    const s = slams[0]!;
    expect(s.t).toBeCloseTo(total, 1);
    expect(Math.hypot(s.x - w.x, s.z - w.z)).toBeLessThan(4);
    expect(s.z).toBeGreaterThan(10);
  });

  it('攻撃中に 殴られても 動きは 中断されない（怒りの 時間だけ のびる）', () => {
    const { actor, slams, run } = rig();
    actor.attack('slam2');
    run(2);
    actor.hit();
    expect(actor.mode).toBe('attack');
    run(T.slam2.windupSec + 1);
    expect(slams.length).toBe(1);
  });

  it('tired(): くるくる目（渦巻き）に なって 肩で 息を して 休む。おわると 目は 赤に もどる', () => {
    const { actor, run } = rig();
    actor.hit();
    run(0.1);
    const sw = actor.model.swirl;
    expect(sw.root.visible).toBe(false);
    expect(actor.model.eyes.visible).toBe(true);
    actor.tired(35);
    expect(actor.mode).toBe('tired');
    run(2);
    expect(sw.root.visible).toBe(true); // くるくる目
    expect(actor.model.eyes.visible).toBe(false); // 赤い 目は かくれる
    expect(actor.model.eyeHalo.visible).toBe(false);
    // 渦が ゆっくり 回る
    const r0 = sw.eyes[0]!.rotation.z;
    run(1);
    expect(Math.abs(sw.eyes[0]!.rotation.z - r0)).toBeGreaterThan(0.5 * T.tired.swirlDegPerSec * Math.PI / 180);
    expect(Math.abs(sw.eyes[0]!.rotation.z - r0)).toBeLessThan(1.5 * T.tired.swirlDegPerSec * Math.PI / 180);
    // 肩で 息: 胸が ゆっくり 上下（1 回の 長さ breathSec）。手は 地面に ついた まま
    const ys: number[] = [], hy: number[] = [];
    run(T.tired.breathSec * 1.2, () => { actor.model.group.updateMatrixWorld(true); ys.push(actor.model.joints.LeftArm.getWorldPosition(new Vector3()).y); hy.push(actor.step.wrist.Left.y); });
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.15); // 肩が 上下
    expect(Math.max(...hy) - Math.min(...hy)).toBeLessThan(0.5); // 手は うごかない
    // 休みが おわると 赤い 目に もどる
    run(35 - 3 - T.tired.breathSec * 1.2 + 0.5);
    expect(actor.mode).toBe('angry');
    expect(sw.root.visible).toBe(false);
    expect(actor.model.eyes.visible).toBe(true);
    expect(actor.model.eyeHalo.visible).toBe(true);
    expect(actor.cycle.phase).toBe('gap');
  });

  it('休みの 長さ: tired() を 省くと 30〜40 秒の くじ。怒りが 解けても 目は もどる', () => {
    const { actor, run } = rig();
    actor.hit();
    actor.tired();
    expect(actor.cycle.left).toBeGreaterThanOrEqual(30);
    expect(actor.cycle.left).toBeLessThanOrEqual(40);
    run(2);
    expect(actor.model.swirl.root.visible).toBe(true);
    actor.angry(false);
    run(0.1);
    expect(actor.model.swirl.root.visible).toBe(false);
    expect(actor.model.eyes.visible).toBe(true);
  });

  it('怒りが 解けたら サイクルは 止まり、ふだんに もどる', () => {
    const { actor, run } = rig();
    actor.attack('slam2');
    run(3);
    actor.angry(false);
    expect(actor.mode).toBe('idle');
    expect(actor.cycle.phase).toBe('off');
    expect(actor.warn).toBeNull();
    run(30);
    expect(actor.mode === 'idle' || actor.mode === 'crawl' || actor.mode === 'look').toBe(true);
  });

  it('攻撃の 表に slam2・sweep・beam: サイクルで ランダムに どれも 出る。おわると 怒りに もどる', () => {
    const { actor, slams, run } = rig();
    actor.hit();
    const names = new Set<string>();
    run(3000, () => { if (actor.attackName) names.add(actor.attackName); });
    expect([...names].sort()).toEqual(['beam', 'eruption', 'slam2', 'sweep']);
    expect(slams.length).toBeGreaterThan(0);
    expect(actor.sweepCount).toBeGreaterThan(0);
    expect(actor.beamCount).toBeGreaterThan(0);
  });

  it('attack(beam): 予兆（目が 光る）→ 光線 → 終わり → もどる。光は この 攻撃の 間だけ。目は ねらいの 点を 見る', () => {
    const { actor, run } = rig();
    actor.attack('beam');
    expect(actor.mode).toBe('attack');
    expect(actor.attackName).toBe('beam');
    expect(actor.beamCount).toBe(1);
    const K = T.beam;
    const phases: string[] = []; let maxGlow = 0;
    run(K.chargeSec + K.fireSec + K.finaleSec + K.recoverSec + 0.4, () => {
      const p = actor.beam.phase;
      if (!phases.length || phases[phases.length - 1] !== p) phases.push(p);
      maxGlow = Math.max(maxGlow, actor.beam.glow);
    });
    expect(phases).toEqual(['charge', 'fire', 'finale', 'recover', 'done']);
    expect(maxGlow).toBe(1);
    expect(actor.mode).toBe('angry');
    expect(actor.beam.glow).toBe(0);
    // 目の 色: おわったら ふつうの 怒りの 赤に もどる
    expect(actor.model.eyes.color.getHex()).toBe(asEye(T.eyes.angryColor));
    expect(actor.model.eyeHalo.opacity).toBeCloseTo(0.3, 5);
  });

  it('attack(eruption): ゆっくり 上を 向き → 噴火 → 首が もどって 怒りに もどる。口の 位置は 上を 向くと 高くなる', () => {
    const { actor, run } = rig();
    actor.attack('eruption');
    expect(actor.mode).toBe('attack');
    expect(actor.attackName).toBe('eruption');
    expect(actor.eruptionCount).toBe(1);
    const m0 = actor.mouthPosition(new Vector3()).clone();
    const K = T.eruption;
    run(K.inhaleSec + K.eruptSec * 0.5);
    const m1 = actor.mouthPosition(new Vector3());
    expect(actor.eruption.pitch).toBe(1);
    expect(m1.y).toBeGreaterThan(m0.y + 1); // 上を 向く と 口が 上がる
    expect(m1.z).toBeLessThan(m0.z); // 口が 前から 引っこむ
    run(K.eruptSec * 0.5 + K.rainSec + 1.5);
    expect(actor.mode === 'angry' || actor.mode === 'attack').toBe(true);
    expect(actor.eruption.done || actor.attackName !== 'eruption').toBe(true);
    expect(actor.mouthPosition(new Vector3()).y).toBeLessThan(m1.y - 1);
  });

  it('光っている 間は 目の 色が 赤黒い 色から 強い 赤へ、光の 輪が 濃くなる', () => {
    const { actor, run } = rig();
    actor.attack('beam');
    run(0.1);
    const early = actor.model.eyes.color.getHex();
    const haloEarly = actor.model.eyeHalo.opacity;
    run(T.beam.chargeSec + 0.5);
    expect(actor.model.eyes.color.getHex()).toBe(asEye(T.beam.eyeColorHot));
    expect(actor.model.eyeHalo.opacity).toBeGreaterThan(haloEarly);
    expect(early).not.toBe(asEye(T.beam.eyeColorHot));
  });

  it('attack(sweep): 振りかぶり → 左右 2 回 払う → もどる。払っている 間 手が 世界の 座標で 動く', () => {
    const { actor, run } = rig();
    actor.attack('sweep');
    expect(actor.mode).toBe('attack');
    expect(actor.attackName).toBe('sweep');
    expect(actor.sweepCount).toBe(1);
    const sides: string[] = []; let moved = 0, last: { x: number; z: number } | null = null;
    const K = T.sweep;
    run(K.windupSec + K.holdSec + 2 * K.sweepSec + K.linkSec + K.recoverSec + 0.3, () => {
      const n = actor.sweepNow;
      if (n) { if (!sides.length || sides[sides.length - 1] !== n.side) sides.push(n.side); if (last) moved += Math.hypot(n.x - last.x, n.z - last.z); last = { x: n.x, z: n.z }; } else last = null;
    });
    expect(sides).toEqual(['Left', 'Right']);
    expect(moved).toBeGreaterThan(60); // 手が 大きく 動いた（ブロック）
    expect(actor.mode).toBe('angry');
    expect(actor.sweepNow).toBeNull();
  });

  it('おなじ シードなら おなじ 回数・おなじ 時刻', () => {
    const a = rig(), b = rig();
    a.actor.hit(); b.actor.hit();
    a.run(100); b.run(100);
    expect(a.slams.map((s) => s.t.toFixed(3))).toEqual(b.slams.map((s) => s.t.toFixed(3)));
  });
});
