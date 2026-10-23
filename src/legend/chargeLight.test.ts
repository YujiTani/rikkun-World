import { describe, expect, it } from 'vitest';
import { createChargeLight, GATHER_COUNT, HAND_CORES, HAND_CORES_CALM, HAND_STEP, HAND_STEP_CALM, type ChargeLightView } from './chargeLight';

/** WEAPON-9 PR-1（§5.8・AC40）: ための 光。3 本 共通（色の しゅるいだけ ちがう）。
 * オーナー 2026-10-23: 完了後も ためのアニメ（集まる つぶ）は つづく・手の 光は ドットアニメで ピカピカ またたく（動きを 減らす では おだやかに・消さない） */
const run = (kind: 'spiral' | 'lightning' | 'shining', ticks: number, reduced = false, full?: number) => {
  const c = createChargeLight();
  const out: ChargeLightView[] = [];
  for (let t = 1; t <= ticks; t++) out.push({ ...c.step({ ticks: t, kind, reduced, full }) });
  return { c, out };
};

describe.each([
  ['spiral', 'fujin', 60],
  ['lightning', 'raijin', 60],
  ['shining', 'niji', 150],
] as const)('区間（%s）', (kind, palette, full) => {
  const { out } = run(kind, full + 140, false, full);
  const at = (F: number) => out[F - 1]!;
  it('phase: full の 前は gather・full から full。palette・alpha', () => {
    for (let F = 1; F <= full + 140; F++) {
      expect(at(F).phase).toBe(F < full ? 'gather' : 'full');
      expect(at(F).palette).toBe(palette);
      expect(at(F).alpha).toBe(1);
    }
  });
  it('集まる つぶは ため中も 完了後も ずっと 同じ 数（ふえない・へらない）', () => {
    for (let F = 1; F <= full + 140; F++) expect(at(F).particles).toBe(GATHER_COUNT);
  });
  it('手の 光: full の 前は 0。full の 1 ステップ目は 2（芯 5・輪 7）。そのあとは 1 で またたく', () => {
    for (let F = 1; F < full; F++) expect([at(F).hand, at(F).handCore, at(F).handRing]).toEqual([0, 0, -1]);
    expect([at(full).hand, at(full).handCore, at(full).handRing]).toEqual([2, 5, 7]);
    for (let F = full + 1; F <= full + 140; F++) {
      expect(at(F).hand).toBe(1);
      expect(at(F).handCore).toBeGreaterThanOrEqual(2);
      expect(at(F).handCore).toBeLessThanOrEqual(5);
    }
  });
  it('手の 光は 止まらない: 絵（芯）が 3 ステップごとに 切りかわり、6 コマで 1 周', () => {
    const cores = [] as number[];
    for (let F = full + 1; F <= full + 6 * HAND_STEP; F++) cores.push(at(F).handCore);
    for (let k = 0; k < 6; k++) for (let j = 0; j < HAND_STEP; j++) expect(cores[k * HAND_STEP + j]).toBe(HAND_CORES[k]);
    const seen = new Set(cores);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < 6; k++) expect(HAND_CORES[k]).not.toBe(HAND_CORES[k - 1]);
    // 1 周 あと も おなじ くりかえし（静止画に ならない）
    for (let F = full + 1; F <= full + 6 * HAND_STEP; F++) expect(at(F + 6 * HAND_STEP).handCore).toBe(at(F).handCore);
    // どの 3 ステップ ぶんの 間にも 絵が かわる
    for (let F = full + 1; F + 6 <= full + 140; F++) expect(new Set([at(F), at(F + 3), at(F + 6)].map((v) => `${v.handCore}/${v.handRing}`)).size).toBeGreaterThan(1);
  });
});

describe('「動きを減らす」', () => {
  const full = 60;
  const a = run('lightning', 200, false, full).out;
  const b = run('lightning', 200, true, full).out;
  it('phase・hand は ふつうと 同じ。つぶ・輪は 0', () => {
    for (let F = 1; F <= 200; F++) {
      expect(b[F - 1]!.phase).toBe(a[F - 1]!.phase);
      expect(b[F - 1]!.hand).toBe(a[F - 1]!.hand);
      expect(b[F - 1]!.particles).toBe(0);
      if (F > full) expect(b[F - 1]!.handRing).toBe(-1);
    }
  });
  it('手の 光は 消えない・止まらない。ゆっくり（15 ステップごと）・となりの 明るさへ 少しずつ', () => {
    const seq: number[] = [];
    for (let F = full + 1; F <= full + 4 * HAND_STEP_CALM; F++) seq.push(b[F - 1]!.handCore);
    for (let k = 0; k < 4; k++) for (let j = 0; j < HAND_STEP_CALM; j++) expect(seq[k * HAND_STEP_CALM + j]).toBe(HAND_CORES_CALM[k]);
    for (let k = 1; k < 4; k++) expect(Math.abs(HAND_CORES_CALM[k]! - HAND_CORES_CALM[k - 1]!)).toBeLessThanOrEqual(2);
    expect(new Set(seq).size).toBeGreaterThanOrEqual(3);
    for (let F = full + 1; F <= 200; F++) expect(b[F - 1]!.handCore).toBeGreaterThanOrEqual(3);
  });
});

describe('消え方・やりなおし', () => {
  it.each([30, 60, 100])('ためF %i で はなす → その ステップに すぐ off（うすくならない）', (n) => {
    const { c } = run('spiral', n);
    const v = c.step({ ticks: null, kind: 'spiral', reduced: false });
    expect(v).toMatchObject({ phase: 'off', palette: null, alpha: 0, particles: 0, hand: 0, handCore: 0, handRing: -1, F: 0 });
  });
  it('ためて いない とき off', () => {
    const v = createChargeLight().step({ ticks: null, kind: null, reduced: false });
    expect(v.phase).toBe('off');
    expect(v.palette).toBeNull();
  });
  it('また ためると はじめから（gather・手の 光なし）', () => {
    const { c } = run('spiral', 80);
    c.step({ ticks: null, kind: 'spiral', reduced: false });
    const v = c.step({ ticks: 1, kind: 'spiral', reduced: false });
    expect(v.phase).toBe('gather');
    expect(v.hand).toBe(0);
    expect(v.particles).toBe(GATHER_COUNT);
  });
  it('虹 full 150: 149 までは gather・手の 光なし、150 から full', () => {
    const c = createChargeLight();
    expect(c.step({ ticks: 149, kind: 'shining', reduced: false, full: 150 }).phase).toBe('gather');
    expect(c.view().palette).toBe('niji');
    const v = c.step({ ticks: 150, kind: 'shining', reduced: false, full: 150 });
    expect(v.phase).toBe('full');
    expect(v.hand).toBe(2);
  });
});
