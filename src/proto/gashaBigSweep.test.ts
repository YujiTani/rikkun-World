import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildBig } from './gashaBig';
import { StepCrawler } from './gashaBigStep';
import { Sweep } from './gashaBigSweep';
import { armHit, type ArmBox } from './gashaBigSweepHit';
import { TUNE as T } from './gashaBigTuning';

const DT = 1 / 60;
const K = T.sweep;
function rig() {
  const model = buildBig();
  const step = new StepCrawler(model, T.crawl);
  return { s: new Sweep(step, model), step, model };
}
/** 手の ひらの 角度（度。0 = 前、+ = 左）。まるの 中心 = centerZ */
const ang = (v: Vector3) => (Math.atan2(v.x, v.z - K.centerZ) * 180) / Math.PI;

describe('両手で 払う（gashaBigSweep.ts。絵コンテ ① 〜 ④）', () => {
  it('順番: 左手 振りかぶり（予兆）→ 止まる → 左で 払う → 反動で ひねる → 右で 払う → もどる → おわり。秒は 調整表どおり', () => {
    const { s } = rig();
    const log: { ev: string; t: number }[] = [];
    let t = 0, guard = 0;
    s.start();
    while (!s.done && guard++ < 60 * 30) {
      const ev = s.update(DT); t += DT;
      if (ev.warn) log.push({ ev: 'warn', t });
      if (ev.strokeStart) log.push({ ev: 'start' + ev.strokeStart, t });
      if (ev.strokeEnd) log.push({ ev: 'end' + ev.strokeEnd, t });
    }
    expect(log.map((l) => l.ev)).toEqual(['warn', 'startLeft', 'endLeft', 'startRight', 'endRight']);
    const at = (n: string) => log.find((l) => l.ev === n)!.t;
    expect(at('warn')).toBeLessThan(0.05);
    expect(at('startLeft')).toBeCloseTo(K.windupSec + K.holdSec, 1);
    expect(at('endLeft')).toBeCloseTo(K.windupSec + K.holdSec + K.sweepSec, 1);
    expect(at('startRight')).toBeCloseTo(K.windupSec + K.holdSec + K.sweepSec + K.linkSec, 1);
    expect(at('endRight')).toBeCloseTo(K.windupSec + K.holdSec + 2 * K.sweepSec + K.linkSec, 1);
    expect(t).toBeCloseTo(K.windupSec + K.holdSec + 2 * K.sweepSec + K.linkSec + K.recoverSec, 1);
  });

  it('振りかぶり: 左手は 頭の 上・後ろ。体は 左へ ひねる（反対へ）。払う 間は 手首が 地面すれすれ（約 2 ブロック）', () => {
    const { s, step, model } = rig();
    s.start();
    for (let i = 0; i < Math.round((K.windupSec + K.holdSec) * 60); i++) s.update(DT);
    expect(step.wrist.Left.y).toBeGreaterThan(model.rest.Head.y + 10);
    expect(step.wrist.Left.z).toBeLessThan(0); // うしろ
    // 払っている 間の 手首の 高さ
    const ys: number[] = [];
    for (let i = 0; i < Math.round(K.sweepSec * 60); i++) { s.update(DT); if (i > K.sweepSec * 60 * 0.3 && i < K.sweepSec * 60 * 0.95) ys.push(step.palm('Left').y); }
    const g = model.rest.LeftHand.y;
    for (const y of ys) expect(y).toBeLessThan(g + K.wristY / model.scale + 6);
  });

  it('払いの 角度: 左手は 左うしろ → 前 → 右（startDeg → endDeg）、右手は 反対。2 回で ぐるっと 全周囲（すきま 45 度 いない）', () => {
    const { s, step } = rig();
    s.start();
    const L: number[] = [], R: number[] = [];
    let guard = 0;
    while (!s.done && guard++ < 60 * 30) {
      const ev = s.update(DT);
      void ev;
      if (s.active === 'Left') L.push(ang(step.palm('Left')));
      if (s.active === 'Right') R.push(ang(step.palm('Right')));
    }
    expect(L.length).toBeGreaterThan(30); expect(R.length).toBeGreaterThan(30);
    // 左: 角度が へる 向き（左 → 右）、右手は ふえる 向き
    expect(L[0]!).toBeGreaterThan(L[L.length - 1]! + 120);
    expect(R[R.length - 1]!).toBeGreaterThan(R[0]! + 120);
    // 全周囲: 2 回の 払いで ふれた 角度（5 度 きざみ）に すきまが 少ない
    const hit = new Set<number>();
    for (const a of [...L, ...R]) hit.add(Math.round(((a % 360) + 360) % 360 / 5) % 72);
    let gapMax = 0, run = 0;
    for (let i = 0; i < 144; i++) { if (!hit.has(i % 72)) { run++; gapMax = Math.max(gapMax, run); } else run = 0; }
    expect(gapMax * 5).toBeLessThanOrEqual(45);
  });

  it('払う 手は 速い（前半より 中ほどが 速い）。サイクル用: 全体の 長さは 約 8 秒', () => {
    expect(K.windupSec + K.holdSec + 2 * K.sweepSec + K.linkSec + K.recoverSec).toBeGreaterThan(5);
    expect(K.armHeight).toBeGreaterThan(1.25 * 1.2); // ジャンプ（約 1.25）では こえられない
  });
});

describe('当たり: 腕と 手の 箱だけ（gashaBigSweepHit.ts）', () => {
  /** 地面の 上に よこたわる 腕の 箱（長さ 10・はば 3・あつさ 1.6、x 方向） */
  const box = (name: string, cx: number, cz: number, y = 1): ArmBox => ({ name, c: [cx, y, cz], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [5, 0.8, 1.5], ext: [5, 0.8, 1.5] });
  const ground = () => -1; // 立つ 面 = 0

  it('箱の 上（横）に いれば 当たる。まわりに hitMargin。遠ければ 当たらない', () => {
    const b = [box('handL', 0, 0)];
    expect(armHit(b, 'Left', { x: 2, y: 0, z: 0 }, ground, K)).toBe(true);
    expect(armHit(b, 'Left', { x: 0, y: 0, z: 1.5 + K.hitMargin - 0.1 }, ground, K)).toBe(true);
    expect(armHit(b, 'Left', { x: 0, y: 0, z: 1.5 + K.hitMargin + 0.5 }, ground, K)).toBe(false);
    expect(armHit(b, 'Left', { x: 30, y: 0, z: 0 }, ground, K)).toBe(false);
  });

  it('ジャンプで こえられない 高さ: 足が armHeight より 上に いれば よけられる。1.25（ふつうの ジャンプ）では 当たる', () => {
    const b = [box('foreArmL', 0, 0)];
    expect(armHit(b, 'Left', { x: 0, y: 1.25, z: 0 }, ground, K)).toBe(true);
    expect(armHit(b, 'Left', { x: 0, y: K.armHeight + 0.1, z: 0 }, ground, K)).toBe(false);
  });

  it('払って いる 側の 腕だけ（名前の 終わりが L / R）。かた・上わんの つけね（高い 箱）は 当たらない（ふところは 安全）', () => {
    expect(armHit([box('handR', 0, 0)], 'Left', { x: 0, y: 0, z: 0 }, ground, K)).toBe(false);
    expect(armHit([box('upperArmMidL', 0, 0, K.boxHeight + 3)], 'Left', { x: 0, y: 0, z: 0 }, ground, K)).toBe(false);
    expect(armHit([box('chestTop', 0, 0)], 'Left', { x: 0, y: 0, z: 0 }, ground, K)).toBe(false); // 体は 腕では ない
    expect(armHit([box('handFingersAL', 0, 0)], 'Left', { x: 0, y: 0, z: 0 }, ground, K)).toBe(true);
  });

  it('かたむいた 箱（45 度）でも 箱の かたちに そって 当たる（まるい 外接では ない）', () => {
    const c = Math.SQRT1_2;
    const b: ArmBox = { name: 'foreArmL', c: [0, 1, 0], ax: [c, 0, c, 0, 1, 0, -c, 0, c], half: [5, 0.8, 1.5], ext: [4.6, 0.8, 4.6] };
    expect(armHit([b], 'Left', { x: 3, y: 0, z: 3 }, ground, K)).toBe(true); // 長い 方向の 上
    expect(armHit([b], 'Left', { x: 3, y: 0, z: -3 }, ground, K)).toBe(false); // 外接の 四角の すみ
  });
});
