import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildBig } from './gashaBig';
import { StepCrawler } from './gashaBigStep';
import { Slam2 } from './gashaBigSlam2';
import { TUNE as T } from './gashaBigTuning';

const DT = 1 / 60;
function rig(): { s: Slam2; step: StepCrawler; model: ReturnType<typeof buildBig> } {
  const model = buildBig();
  const step = new StepCrawler(model, T.crawl);
  return { s: new Slam2(step, model), step, model };
}

describe('両手たたきつけ（gashaBigSlam2.ts。絵コンテ ① 〜 ④）', () => {
  it('調整表: 持ち上げは 5 秒', () => {
    expect(T.slam2.windupSec).toBe(5);
  });

  it('順番: 予告（はじまりの コマ）→ てっぺんで 止まる → 打撃（振り下ろしの おわり）→ 手を ついたまま → おわり。持ち上げ 5 秒', () => {
    const { s } = rig();
    const K = T.slam2;
    const log: { ev: string; t: number }[] = [];
    let t = 0, guard = 0;
    s.start();
    while (!s.done && guard++ < 60 * 30) {
      const ev = s.update(DT);
      t += DT;
      if (ev.warn) log.push({ ev: 'warn', t });
      if (ev.strike) log.push({ ev: 'strike', t });
      if (s.phase === 'hold' && !log.some((l) => l.ev === 'hold')) log.push({ ev: 'hold', t });
    }
    expect(log.map((l) => l.ev)).toEqual(['warn', 'hold', 'strike']);
    const at = (n: string) => log.find((l) => l.ev === n)!.t;
    expect(at('warn')).toBeLessThan(0.05); // 持ち上げの はじまりで もう 予告
    expect(at('hold')).toBeCloseTo(K.windupSec, 1); // 5 秒で てっぺん
    expect(at('strike')).toBeCloseTo(K.windupSec + K.holdSec + K.slamSec, 1);
    expect(t).toBeCloseTo(K.windupSec + K.holdSec + K.slamSec + K.impactHoldSec + K.recoverSec, 1);
    expect(s.done).toBe(true);
  });

  it('組んだ 両手: 持ち上げの 間 手首が 近い（左右の 手首の 間 <= すきま × 2 + 少し）。てっぺんで 頭より 上', () => {
    const { s, step, model } = rig();
    s.start();
    let minGap = Infinity;
    for (let i = 0; i < Math.round((T.slam2.windupSec + 0.4) * 60); i++) s.update(DT);
    minGap = step.wrist.Left.distanceTo(step.wrist.Right);
    expect(minGap).toBeLessThan(T.slam2.clasp * 2 + 6);
    const head = model.rest.Head;
    expect(step.wrist.Left.y).toBeGreaterThan(head.y + 10);
    expect(step.wrist.Right.y).toBeGreaterThan(head.y + 10);
  });

  it('振り下ろし: 両手が 前の 地面へ（地面の 高さ・体より 前）。打撃の 中心は 両手の まんなか', () => {
    const { s, step, model } = rig();
    s.start();
    let strike = false;
    for (let i = 0; i < 60 * 12 && !strike; i++) strike = !!s.update(DT).strike;
    expect(strike).toBe(true);
    const gy = model.rest.LeftHand.y;
    expect(step.wrist.Left.y).toBeLessThan(gy + 3);
    expect(step.wrist.Left.z).toBeGreaterThan(20);
    expect(step.wrist.Right.z).toBeGreaterThan(20);
    const c = s.landing(new Vector3());
    expect(Math.abs(c.x)).toBeLessThan(3); // 左右の まんなか
    expect(c.z).toBeGreaterThan(20);
  });

  it('予告の 位置（predicted）は 実際に 手が 落ちる 所と ほぼ おなじ', () => {
    const { s } = rig();
    s.start();
    const p = s.predicted(new Vector3());
    for (let i = 0; i < 60 * 12; i++) if (s.update(DT).strike) break;
    const c = s.landing(new Vector3());
    expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeLessThan(4);
  });

  it('予告の 強さ: windup 〜 slam の 間 0〜1 で 上がり、おわれば 0', () => {
    const { s } = rig();
    s.start();
    expect(s.warnLevel()).toBeGreaterThan(0);
    const v: number[] = [];
    for (let i = 0; i < 60 * 12; i++) { s.update(DT); v.push(s.warnLevel()); if (s.phase === 'impact') break; }
    expect(Math.max(...v)).toBeLessThanOrEqual(1);
    expect(s.warnLevel()).toBe(0);
  });
});
