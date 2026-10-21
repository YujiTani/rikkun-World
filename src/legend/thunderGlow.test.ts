import { describe, expect, it } from 'vitest';
import { GLOW, ThunderTimeline, glowAdded, glowAmount, glowReach } from './thunderModel';

/**
 * ART-PIPE-1 AC10・AC12・AC15（docs/design/ART-PIPE-1.md 1.1）: まわりを 明るく（量・とどき・足す）・空が 見えない 落雷・うごきを へらす。
 * 要る 名前（developer が `src/legend/thunderModel.ts` に 作る）:
 *   GLOW（color 0xFFF8DC・up 1.75・full 5・zero 8）
 *   glowAmount(F, { reduced?, sky? })  … その F の 量（うごきを へらすは 0.5 倍・sky=false は 全部 0）
 *   glowReach(dist)                     … 中心からの きょりの とどき（5 まで 1・8 で 0・まっすぐ）
 *   glowAdded(amount, reach)            … 面に 足される 光の 量 = amount × reach（今の 光の 量を 引数に 取らない）
 *   new ThunderTimeline(seed) … start({ S, variant, skyVisible }) で F = 1、step() で F + 1、view(reduced) で その F の ようす
 *     view → { active, F, bolt: { visible, frame, variant, flipped }, ring: { scale, alpha, image } | null, sparks: { alive }, amount }
 *     F89 から active は false（板・輪・つぶ・量 ぜんぶ なし）。start を 途中で もう一度 呼ぶと 始めから（前の 分は 消す）
 */

const near = (a: number, b: number, e = 0.01) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(e);

const S = { x: 20.5, y: 9, z: 12.5 };
const run = (tl: ThunderTimeline, to: number) => {
  while (tl.view().F < to) tl.step();
};

describe('AC10: まわりを 明るく（数）', () => {
  it('量: F1〜5 = 0、F6〜7 = 0.10、F8〜9 = 0.35、F10〜15 = 0.25、F16〜21 = 0.12、F22 から 0', () => {
    for (let F = 1; F <= 5; F++) near(glowAmount(F), 0);
    for (const F of [6, 7]) near(glowAmount(F), 0.1);
    for (const F of [8, 9]) near(glowAmount(F), 0.35);
    for (let F = 10; F <= 15; F++) near(glowAmount(F), 0.25);
    for (let F = 16; F <= 21; F++) near(glowAmount(F), 0.12);
    for (let F = 22; F <= 100; F++) near(glowAmount(F), 0);
  });
  it('うごきを へらす では ちょうど 0.5 倍（0.05・0.175・0.125・0.06）', () => {
    near(glowAmount(6, { reduced: true }), 0.05);
    near(glowAmount(8, { reduced: true }), 0.175);
    near(glowAmount(12, { reduced: true }), 0.125);
    near(glowAmount(18, { reduced: true }), 0.06);
    for (let F = 1; F <= 40; F++) near(glowAmount(F, { reduced: true }), glowAmount(F) * 0.5, 1e-9);
  });
  it('1 回の 落雷で 量が 上がる 区間は 1 つ（F6〜8）。そのあと 3 段で さがる', () => {
    const ups: number[] = [];
    for (let F = 2; F <= 60; F++) if (glowAmount(F) > glowAmount(F - 1) + 1e-9) ups.push(F);
    expect(ups).toEqual([6, 8]); // F5→6 と F7→8 の 2 ステップ（つづいた 1 つの 上がり）
    const downs: number[] = [];
    for (let F = 2; F <= 60; F++) if (glowAmount(F) < glowAmount(F - 1) - 1e-9) downs.push(F);
    expect(downs).toEqual([10, 16, 22]);
  });
  it('色 #FFF8DC・まん中 = S + 上へ 1.75・とどき: 5 まで 1、6.5 で 0.5、8 から 外は 0（まっすぐ）', () => {
    expect(GLOW.color).toBe(0xfff8dc);
    near(GLOW.up, 1.75);
    near(GLOW.full, 5);
    near(GLOW.zero, 8);
    near(glowReach(0), 1);
    near(glowReach(5), 1);
    near(glowReach(6.5), 0.5);
    near(glowReach(8), 0);
    near(glowReach(12), 0);
    near(glowReach(5.5), 1 - 0.5 / 3);
    let last = 1;
    for (let d = 5; d <= 8; d += 0.25) {
      const r = glowReach(d);
      expect(r).toBeLessThanOrEqual(last + 1e-9);
      last = r;
    }
  });
  it('効き方は 足す: 今の 光の 量が 0.3 でも 1.0 でも 足される 分は 同じ', () => {
    expect(glowAdded(0.35, 1)).toBeCloseTo(0.35, 9);
    expect(glowAdded(0.35, 0.5)).toBeCloseTo(0.175, 9);
    expect(glowAdded(0, 1)).toBe(0);
    expect(glowAdded(0.35, 0)).toBe(0);
    // 光の 量に よらない: 引数に 今の 光を 取らない（2 引数）
    expect(glowAdded.length).toBe(2);
  });
});

describe('AC10: 落雷が 続いた とき・入れ口', () => {
  it('F20 で 次の 落雷を 始めると 量は 新しい 落雷の 表（F1 = 0）。0.35 を こえない。前の つぶ・輪は 消える', () => {
    const tl = new ThunderTimeline(7);
    tl.start({ S, variant: 1, skyVisible: true });
    run(tl, 20);
    near(tl.view().amount, 0.12);
    expect(tl.view().sparks.alive).toBeGreaterThan(0);
    tl.start({ S: { ...S, x: S.x + 3 }, variant: 2, skyVisible: true });
    const v = tl.view();
    expect(v.F).toBe(1);
    near(v.amount, 0);
    expect(v.sparks.alive).toBe(0);
    expect(v.ring).toBeNull();
    let max = 0;
    for (let i = 0; i < 90; i++) {
      max = Math.max(max, tl.view().amount);
      tl.step();
    }
    expect(max).toBeLessThanOrEqual(0.35 + 0.01);
  });
});

describe('AC2・AC12・AC15: 時間どおりに 出る・きえる', () => {
  it('ふつう: F8 に 着地・輪・つぶ、F12 に 玉、F33 に 板なし、F89 に ぜんぶ なし', () => {
    const tl = new ThunderTimeline(7);
    expect(tl.view().active).toBe(false);
    tl.start({ S, variant: 3, skyVisible: true });
    const seen: Record<number, ReturnType<ThunderTimeline['view']>> = {};
    for (let F = 1; F <= 90; F++) {
      seen[tl.view().F] = tl.view();
      tl.step();
    }
    expect(seen[1]!.bolt.visible).toBe(false);
    expect(seen[8]!.bolt.frame).toBe(2);
    expect(seen[8]!.ring).not.toBeNull();
    expect(seen[8]!.sparks.alive).toBe(32);
    expect(seen[7]!.sparks.alive).toBe(0);
    expect(seen[12]!.bolt.frame).toBe(3);
    expect(seen[12]!.bolt.variant).toBe(3);
    expect(seen[12]!.bolt.flipped).toBe(true);
    expect(seen[33]!.bolt.visible).toBe(false);
    expect(seen[33]!.sparks.alive).toBeGreaterThan(0);
    for (let F = 8; F <= 88; F++) expect(seen[F]!.active, `F${F}`).toBe(true);
    const v = seen[89]!;
    expect(v.bolt.visible).toBe(false);
    expect(v.ring).toBeNull();
    expect(v.sparks.alive).toBe(0);
    near(v.amount, 0);
  });
  it('つぶの 生きて いる 数は 少しずつ へる だけ（ふえない）', () => {
    const tl = new ThunderTimeline(7);
    tl.start({ S, variant: 0, skyVisible: true });
    let last = 0;
    for (let F = 1; F <= 89; F++) {
      const n = tl.view().sparks.alive;
      if (F >= 8) expect(n).toBeLessThanOrEqual(last);
      last = n;
      tl.step();
    }
  });
  it('AC15 うごきを へらす: つぶは F1〜F89 ずっと 0、量は 0.5 倍、板の コマ・形・輪は ふつうと 同じ', () => {
    const a = new ThunderTimeline(7);
    const b = new ThunderTimeline(7);
    a.start({ S, variant: 2, skyVisible: true });
    b.start({ S, variant: 2, skyVisible: true });
    for (let F = 1; F <= 89; F++) {
      const n = a.view(false);
      const r = b.view(true);
      expect(r.sparks.alive, `F${F}`).toBe(0);
      near(r.amount, n.amount * 0.5, 1e-9);
      expect(r.bolt).toEqual(n.bolt);
      expect(r.ring).toEqual(n.ring);
      a.step();
      b.step();
    }
  });
  it('AC12 空が 見えない（skyVisible = false）: 量は F1〜F89 ずっと 0。板・輪・つぶは 同じ 時間に 出る', () => {
    const a = new ThunderTimeline(7);
    const b = new ThunderTimeline(7);
    a.start({ S, variant: 0, skyVisible: true });
    b.start({ S, variant: 0, skyVisible: false });
    for (let F = 1; F <= 89; F++) {
      const n = a.view();
      const r = b.view();
      near(r.amount, 0, 1e-9);
      expect(r.bolt).toEqual(n.bolt);
      expect(r.ring).toEqual(n.ring);
      expect(r.sparks.alive).toBe(n.sparks.alive);
      a.step();
      b.step();
    }
    expect(glowAmount(8, { sky: false })).toBe(0);
  });
  it('AC12 落ちる 列が ない（lightningMiss）: start を 呼ばない → 板・輪・つぶ・明るさ どれも なし', () => {
    const tl = new ThunderTimeline(7);
    for (let i = 0; i < 100; i++) {
      const v = tl.view();
      expect(v.active).toBe(false);
      expect(v.bolt.visible).toBe(false);
      expect(v.ring).toBeNull();
      expect(v.sparks.alive).toBe(0);
      expect(v.amount).toBe(0);
      tl.step();
    }
  });
});
