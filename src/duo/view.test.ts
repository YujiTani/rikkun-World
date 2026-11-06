import { describe, expect, it } from 'vitest';
import { DUO_TUNING as T } from './tuning';
import { DuoViewMachine, type DuoViewInput, type DuoViewResult } from './view';

/**
 * COOP-1 作業 2（#399）の 先行テスト（赤）。AC21・AC22・AC23・AC32、AC20 のうち 分割中の 色の 段。
 * つなぎ目の 約束: src/duo/view.ts の `DuoViewMachine`（宣言と 約束は view.ts の 先頭）。
 * 数（24・17・60・18・0.9・0.8・9）は src/duo/tuning.ts の DUO_TUNING（仕様 §2.4・§9.2 の 値）から 読む。
 */

const UP = T.splitUpAt; // 24
const DOWN = T.splitDownAt; // 17
const BACK = T.splitBackSteps; // 60
const WAIT = T.viewWaitSteps; // 60
const HOLD = T.loupeHoldSteps; // 18
const IN: DuoViewInput['p2Ndc'] = { x: 0, y: 0 };
const OUT: DuoViewInput['p2Ndc'] = { x: T.loupeOutRatio + 0.05, y: 0 };
const MID: DuoViewInput['p2Ndc'] = { x: (T.loupeOutRatio + T.loupeInRatio) / 2, y: 0 }; // 外の 線の 中・内の 線の 外
const INNER: DuoViewInput['p2Ndc'] = { x: T.loupeInRatio - 0.1, y: T.loupeInRatio - 0.1 };

/** n ステップ 同じ 入力を 与え、最後の 結果と、かわった ステップ（呼び出しの 通し番号）を 返す */
function drive() {
  const m = new DuoViewMachine();
  let n = 0;
  const switches: number[] = [];
  let last: DuoViewResult | null = null;
  const run = (count: number, distance: number, p2Ndc: DuoViewInput['p2Ndc'] = IN): DuoViewResult => {
    for (let i = 0; i < count; i++) {
      n++;
      last = m.step({ distance, p2Ndc });
      if (last.switched) switches.push(n);
    }
    return last!;
  };
  return { m, run, switches, count: () => n };
}

describe('AC21: 分割の ようす（24 で 分かれ、17 以下が 60 ステップで 戻る）', () => {
  it('23 では 1 画面、24 で その ステップに 分割', () => {
    const { run } = drive();
    expect(run(5, UP - 1).view).toBe('one');
    expect(run(1, UP).view).toBe('split');
  });
  it('24 から 18 に 近づいても 分割の まま', () => {
    const { run } = drive();
    run(1, UP);
    expect(run(100, DOWN + 1).view).toBe('split');
  });
  it('17 以下が 59 ステップでは 分割の まま、60 ステップ目に 1 画面', () => {
    const { run } = drive();
    run(1, UP + 6);
    run(WAIT + 20, DOWN + 3); // 待ちの 60 ステップを すぎる
    expect(run(BACK - 1, DOWN).view).toBe('split');
    expect(run(1, DOWN).view).toBe('one');
  });
  it('とちゅうで 18 に なれば 数えなおし', () => {
    const { run } = drive();
    run(1, UP + 6);
    run(WAIT + 20, DOWN + 3);
    run(BACK - 1, DOWN);
    run(1, DOWN + 1);
    expect(run(BACK - 1, DOWN).view).toBe('split');
    expect(run(1, DOWN).view).toBe('one');
  });
  it('戻る先: 2P が 画面の 外なら ルーペ・中なら 1 画面', () => {
    const a = drive();
    a.run(1, UP + 6, OUT);
    a.run(WAIT + 20, DOWN + 3, OUT);
    expect(a.run(BACK, 10, OUT).view).toBe('loupe');
    const b = drive();
    b.run(1, UP + 6, IN);
    b.run(WAIT + 20, DOWN + 3, IN);
    expect(b.run(BACK, 10, IN).view).toBe('one');
  });
  it('ルーペからも 24 で 分割', () => {
    const { run } = drive();
    run(HOLD, 10, OUT);
    expect(run(1, 10, OUT).view).toBe('loupe');
    run(WAIT + 10, 20, OUT); // 待ちを すぎる
    expect(run(1, UP, OUT).view).toBe('split');
  });
});

describe('AC22: 24 の 前後を ゆれても ようすの 切りかえは 1 秒に 1 回まで', () => {
  it('UP - 0.1 と UP + 0.1 を 毎ステップ 300 ステップ: 切りかえの 間は 60 ステップ以上・色の 段は 2 段目の まま', () => {
    const { m, run, switches } = drive();
    const tiers: number[] = [];
    for (let i = 0; i < 300; i++) {
      const r = run(1, i % 2 === 0 ? UP - 0.1 : UP + 0.1);
      tiers.push(r.tier);
    }
    for (let i = 1; i < switches.length; i++) expect(switches[i]! - switches[i - 1]!).toBeGreaterThanOrEqual(WAIT);
    expect(switches.length).toBeLessThanOrEqual(1);
    expect(m.view).toBe('split');
    expect(new Set(tiers)).toEqual(new Set([2]));
  });
  it('1 画面に 戻った 直後に 遠くなっても、60 ステップは 次の 切りかえを しない', () => {
    const { run, switches } = drive();
    run(1, UP + 6);
    run(WAIT + 20, DOWN + 3);
    run(BACK, 10); // → 1 画面
    const back = switches[switches.length - 1]!;
    run(100, UP + 6); // すぐ また 遠く
    const again = switches[switches.length - 1]!;
    expect(again - back).toBeGreaterThanOrEqual(WAIT);
  });
  it('1 画面 → ルーペの 直後に 24 以上でも、分割は 60 ステップ あと', () => {
    const { run, m } = drive();
    run(HOLD, 10, OUT);
    expect(m.view).toBe('loupe');
    run(WAIT / 2, UP + 6, OUT);
    expect(m.view).toBe('loupe');
    run(WAIT / 2 + 10, UP + 6, OUT);
    expect(m.view).toBe('split');
  });
  it('17 前後を ゆれても（DOWN - 0.1 と DOWN + 0.1）分割から 戻らない', () => {
    const { run } = drive();
    run(1, UP + 6);
    run(WAIT + 20, DOWN + 3);
    for (let i = 0; i < 300; i++) run(1, i % 2 === 0 ? DOWN - 0.1 : DOWN + 0.1);
    expect(run(1, DOWN + 0.1).view).toBe('split');
  });
});

describe('AC20（分割の あいだの 色の 段）: 2 段目の まま。1 画面に 戻る ときに 同時に 1 段目', () => {
  it('分割中に 距離 15 に なっても 60 ステップまでは 2 段目', () => {
    const { run } = drive();
    run(1, UP + 6);
    run(WAIT + 20, DOWN + 3);
    const mid = run(BACK - 1, DOWN - 2);
    expect(mid.view).toBe('split');
    expect(mid.tier).toBe(2);
    const back = run(1, DOWN - 2);
    expect(back.view).toBe('one');
    expect(back.tier).toBe(1);
    expect(back.switched).toBe(true);
  });
});

describe('AC23: ルーペが 出る・消える（内側 90% の 外に 18 ステップ / 80% の 中に 18 ステップ）', () => {
  it('90% の 外に 17 ステップでは 1 画面、18 ステップ目に ルーペ', () => {
    const { run } = drive();
    expect(run(HOLD - 1, 10, OUT).view).toBe('one');
    expect(run(1, 10, OUT).view).toBe('loupe');
  });
  it('とちゅうで 90% の 中に 入れば 数えなおし', () => {
    const { run } = drive();
    run(HOLD - 1, 10, OUT);
    run(1, 10, IN);
    expect(run(HOLD - 1, 10, OUT).view).toBe('one');
    expect(run(1, 10, OUT).view).toBe('loupe');
  });
  it('2P の 位置が 見つからない（null）ときは 外と 同じ', () => {
    const { run } = drive();
    run(HOLD - 1, 10, null);
    expect(run(1, 10, null).view).toBe('loupe');
  });
  it('たてに 外へ 出ても（y = 0.95）ルーペ', () => {
    const { run } = drive();
    expect(run(HOLD, 10, { x: 0, y: -(T.loupeOutRatio + 0.05) }).view).toBe('loupe');
  });
  it('ルーペは 80% の 中に 17 ステップでは 消えず、18 ステップ目に 消える', () => {
    const { run } = drive();
    run(HOLD, 10, OUT);
    run(WAIT + 10, 10, OUT); // 待ちを すぎる
    expect(run(HOLD - 1, 10, INNER).view).toBe('loupe');
    expect(run(1, 10, INNER).view).toBe('one');
  });
  it('80%〜90% の あいだは ルーペの まま（ゆれ止め）', () => {
    const { run } = drive();
    run(HOLD, 10, OUT);
    run(WAIT + 10, 10, OUT);
    expect(run(200, 10, MID).view).toBe('loupe');
  });
  it('1 画面で 80%〜90% の あいだに いても ルーペは 出ない', () => {
    const { run } = drive();
    expect(run(200, 10, MID).view).toBe('one');
  });
  it('消える数えは とちゅうで 80% の 外に 出れば 数えなおし', () => {
    const { run } = drive();
    run(HOLD, 10, OUT);
    run(WAIT + 10, 10, OUT);
    run(HOLD - 1, 10, IN);
    run(1, 10, MID);
    expect(run(HOLD - 1, 10, IN).view).toBe('loupe');
    expect(run(1, 10, IN).view).toBe('one');
  });
});

describe('AC32: 動きを 減らす 設定のとき 切りかえは 9 ステップ（0.15 秒）以内', () => {
  const finish = (reduced: boolean, kind: 'split' | 'loupe'): number => {
    const m = new DuoViewMachine({ reducedMotion: reduced });
    const input: DuoViewInput = kind === 'split' ? { distance: UP + 6, p2Ndc: IN } : { distance: 10, p2Ndc: OUT };
    let r = m.step(input);
    for (let i = 0; i < 40 && !r.switched; i++) r = m.step(input);
    expect(r.switched).toBe(true);
    let steps = 0;
    while (m.transition().active && steps < 100) {
      m.step(input);
      steps++;
    }
    return steps;
  };
  it('分割へ: 動きを 減らすと 9 ステップ以内、ふつうは 約 24 ステップ(20〜28)', () => {
    expect(finish(true, 'split')).toBeLessThanOrEqual(T.transitionSteps.reduced);
    const normal = finish(false, 'split');
    expect(normal).toBeGreaterThanOrEqual(T.transitionSteps.split - 4);
    expect(normal).toBeLessThanOrEqual(T.transitionSteps.split + 4);
  });
  it('ルーペへ: 動きを 減らすと 9 ステップ以内、ふつうは 約 12 ステップ(10〜14)', () => {
    expect(finish(true, 'loupe')).toBeLessThanOrEqual(T.transitionSteps.reduced);
    const normal = finish(false, 'loupe');
    expect(normal).toBeGreaterThanOrEqual(T.transitionSteps.loupe - 2);
    expect(normal).toBeLessThanOrEqual(T.transitionSteps.loupe + 2);
  });
  it('切りかえの 直後は 進行中・progress は 0〜1', () => {
    const m = new DuoViewMachine();
    let r = m.step({ distance: UP + 6, p2Ndc: IN });
    expect(r.switched).toBe(true);
    const t = m.transition();
    expect(t.active).toBe(true);
    expect(t.progress).toBeGreaterThanOrEqual(0);
    expect(t.progress).toBeLessThan(1);
    for (let i = 0; i < 40; i++) r = m.step({ distance: UP + 6, p2Ndc: IN });
    expect(m.transition().active).toBe(false);
  });
});
