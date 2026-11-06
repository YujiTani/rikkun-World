import { describe, expect, expectTypeOf, it } from 'vitest';
import { DUO_TUNING as T } from './tuning';
import type { DuoState, DuoView } from './types';
import { DuoViewMachine, type DuoViewResult } from './view';

/**
 * COOP-1 作業 3e（#422。docs/design/COOP-1.md 1.8 §2.3・§2.4・§9.2）の 先行テスト（赤）。AC21・AC32（切りかえの 長さ）。AC69（「しゅっ」）は 3c の テスト（createSplitSound の onJoined／onLeft。wip-3c-tests）に まかせる。
 * 1.7 の AC22・AC23（ゆれ止め・ルーペ）・AC20（色の 段）の テストは 消した。
 *
 * ---- 実装への 約束 ----
 *   src/duo/types.ts
 *     `DuoView = 'one' | 'split'`（'loupe' を なくす）。`DuoTier` を なくす。
 *     `DuoState` から `tier`・`loupe` を なくす（のこる: joined・view・distance・meter・rings・columns・light・padLost）。
 *   src/duo/view.ts   `DuoViewMachine`（距離も 2P の 位置も 見ない。2P が いるか だけ）
 *     new DuoViewMachine({ reducedMotion })      最初は 'one'。step() を 固定ステップ（1/60 秒）ごとに 1 回 呼ぶ。
 *     step({ joined }): DuoViewResult            joined = 2P が 参加している。
 *        { view: DuoView; switched: boolean }
 *        joined が true に なった その ステップに view = 'split'・switched = true。false に なった その ステップに 'one'・switched = true。
 *        「参加して 分かれた」ステップは switched && view === 'split' で 分かる（`splitSound` は ない。しゅっ は 3c）。
 *     view                                       今の ようす。
 *     transition(): { active: boolean; progress: number }
 *        切りかえの 見せ方の 進み（0〜1）。かわった ステップから active。ふつう 24 ステップ（DUO_TUNING.transitionSteps.split ± 4）、
 *        動きを 減らす 設定は 9 ステップ（transitionSteps.reduced）以内に おわる。参加でも やめるでも 同じ 長さ。
 *   `duo.state().view` は 2P が いれば いつも 'split'、いなければ 'one'。（配線は developer）
 *   配線の 約束: view machine と light gate（DuoLightGate）は 2P が 参加して いなくても 毎ステップ step({ joined: false }) を 呼ぶ。やめた ときに reset() で 作りなおさない
 *   （今の src/game/wire/duoView.ts の reset() は 直す）。輪（rings）と 2P の 区画は やめた 瞬間に 1 人の ものに もどし、
 *   軽くする 工夫（影・かすみ・画素・細かい 形）は 120 ステップ あとに まとめて もどす（light.test.ts・e2e/duo2.spec.ts の AC30）。
 */

const run = (m: DuoViewMachine, n: number, joined: boolean): DuoViewResult => {
  let r!: DuoViewResult;
  for (let i = 0; i < n; i++) r = m.step({ joined });
  return r;
};

describe('1.8: 型（tsc で 見る）', () => {
  it('DuoView は one | split だけ。DuoState に tier・loupe は ない', () => {
    expectTypeOf<DuoView>().toEqualTypeOf<'one' | 'split'>();
    expectTypeOf<DuoState>().not.toHaveProperty('tier');
    expectTypeOf<DuoState>().not.toHaveProperty('loupe');
    expectTypeOf<DuoState>().toHaveProperty('view');
  });
});

describe('AC21: 2P が いる あいだは いつも 左右に 分かれる', () => {
  it('2P が いなければ 1 人の 全面（何ステップ 進めても）', () => {
    const m = new DuoViewMachine();
    const r = run(m, 200, false);
    expect(r.view).toBe('one');
    expect(r.switched).toBe(false);
    expect(m.view).toBe('one');
  });
  it('参加した その ステップに split（switched）。そのあと 何ステップ 進めても split の まま・switched は 出ない', () => {
    const m = new DuoViewMachine();
    run(m, 10, false);
    const join = m.step({ joined: true });
    expect(join.view).toBe('split');
    expect(join.switched).toBe(true);
    let switchedAgain = 0;
    for (let i = 0; i < 1000; i++) {
      const r = m.step({ joined: true });
      expect(r.view).toBe('split');
      if (r.switched) switchedAgain++;
    }
    expect(switchedAgain).toBe(0);
  });
  it('やめた その ステップに one（switched）。参加しなおすと また split', () => {
    const m = new DuoViewMachine();
    run(m, 5, true);
    const leave = m.step({ joined: false });
    expect(leave.view).toBe('one');
    expect(leave.switched).toBe(true);
    expect(run(m, 100, false).view).toBe('one');
    const again = m.step({ joined: true });
    expect(again.view).toBe('split');
    expect(again.switched).toBe(true);
  });
  it("'loupe' には ならない（参加・やめるを くりかえしても）", () => {
    const m = new DuoViewMachine();
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(m.step({ joined: i % 37 < 20 }).view);
    expect([...seen].sort()).toEqual(['one', 'split']);
  });
  it('切りかえの 途中で やめても すぐ one（待たない）', () => {
    const m = new DuoViewMachine();
    m.step({ joined: true });
    run(m, 3, true);
    expect(m.transition().active).toBe(true);
    expect(m.step({ joined: false }).view).toBe('one');
  });
});

describe('AC32: 切りかえの 長さ（参加でも やめるでも）', () => {
  /** かわった ステップから 数えて transition が おわるまでの ステップ数 */
  const length = (reduced: boolean, to: 'split' | 'one'): number => {
    const m = new DuoViewMachine({ reducedMotion: reduced });
    if (to === 'one') run(m, 100, true);
    const r = m.step({ joined: to === 'split' });
    expect(r.switched).toBe(true);
    expect(m.transition().active).toBe(true);
    let steps = 0;
    while (m.transition().active && steps < 200) {
      m.step({ joined: to === 'split' });
      steps++;
    }
    return steps;
  };
  it.each(['split', 'one'] as const)('%s へ: 動きを 減らすと 9 ステップ以内、ふつうは 約 24 ステップ（20〜28）', (to) => {
    expect(length(true, to)).toBeLessThanOrEqual(T.transitionSteps.reduced);
    const normal = length(false, to);
    expect(normal).toBeGreaterThanOrEqual(T.transitionSteps.split - 4);
    expect(normal).toBeLessThanOrEqual(T.transitionSteps.split + 4);
  });
  it('切りかえの 直後は 進行中・progress は 0 以上 1 未満。おわると active false・progress 1', () => {
    const m = new DuoViewMachine();
    m.step({ joined: true });
    const t = m.transition();
    expect(t.active).toBe(true);
    expect(t.progress).toBeGreaterThanOrEqual(0);
    expect(t.progress).toBeLessThan(1);
    run(m, 60, true);
    expect(m.transition()).toMatchObject({ active: false, progress: 1 });
  });
  it('progress は 進むほど ふえる（もどらない）', () => {
    const m = new DuoViewMachine();
    m.step({ joined: true });
    let prev = m.transition().progress;
    for (let i = 0; i < 24; i++) {
      m.step({ joined: true });
      const p = m.transition().progress;
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p;
    }
  });
});
