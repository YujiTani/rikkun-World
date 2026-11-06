import { describe, expect, it } from 'vitest';
import { DUO_TUNING as T } from './tuning';
import { createSplitSound } from './splitSound';
import { DuoViewMachine, type DuoViewInput } from './view';

/**
 * COOP-1 作業 3c（#417）の 先行テスト（赤）。AC69 のうち「いつ 鳴らすか」（仕様 §2.4・§3.4・§9.7）。音そのものの 表は src/fx/duoSplitSound.test.ts。
 * 数（24・17・60・0.9・0.8）は src/duo/tuning.ts の DUO_TUNING から 読む。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/splitSound.ts   createSplitSound(sound: Pick<SoundFx, 'play'>): (r: DuoViewResult) => boolean
 *     DuoViewMachine.step() の 結果を 毎ステップ わたすと、「ようすが 分割に かわった ステップ」（r.switched かつ r.view === 'split'）の ときだけ
 *     `sound.play('duoSplit')` を 1 回 呼び、true を 返す。ほかは 何も 鳴らさず false。
 *     - 分割 → 1 画面・分割 → ルーペ・1 画面 ⇄ ルーペ・色の 段（tier）の 変わり目・参加／やめる では 鳴らさない（`switched` が 分割に かわった ときだけ）。
 *     - 動きを 減らす 設定（reducedMotion）でも 鳴らす。
 *     - 1 秒の 待ち（viewWaitSteps）は DuoViewMachine の もの。ここで 別の 待ちを 作らない（machine が 切りかえなければ 鳴らない）。
 *   `SoundName` に 'duoSplit' が 入る（SOUNDS に 表を 足す。表は duoSplitSound.test.ts）。
 *   配線（テストの 外）: wire/duoView.ts の DuoViews.update で machine.step の 結果を わたす。
 *
 * 画面ごとの 動きの 見せ方（0.4 秒の 線・ふくらみ）は このテストの 対象外（UI 検査）。
 */

const UP = T.splitUpAt;
const DOWN = T.splitDownAt;
const BACK = T.splitBackSteps;
const WAIT = T.viewWaitSteps;
const HOLD = T.loupeHoldSteps;
const IN: DuoViewInput['p2Ndc'] = { x: 0, y: 0 };
const OUT: DuoViewInput['p2Ndc'] = { x: T.loupeOutRatio + 0.05, y: 0 };

function rig(reduced = false) {
  const names: string[] = [];
  /** 音が 鳴った ステップの 通し番号 */
  const at: number[] = [];
  /** 分割に かわった 回数（machine の 結果から 数える） */
  let splits = 0;
  let n = 0;
  const m = new DuoViewMachine({ reducedMotion: reduced });
  const feed = createSplitSound({ play: (name: string) => void names.push(name) });
  const run = (count: number, distance: number, p2Ndc: DuoViewInput['p2Ndc'] = IN) => {
    for (let i = 0; i < count; i++) {
      n++;
      const r = m.step({ distance, p2Ndc });
      if (r.switched && r.view === 'split') splits++;
      const before = names.length;
      const played = feed(r);
      expect(played, `step ${n}`).toBe(names.length > before);
      if (names.length > before) at.push(n);
    }
  };
  return { m, run, names, at, splits: () => splits };
}

describe('AC69: 分割に なる 2 つで 1 つずつ', () => {
  it('1 画面 → 分割: 24 に なった その ステップに duoSplit が 1 つ', () => {
    const t = rig();
    t.run(5, UP - 1);
    expect(t.names).toEqual([]);
    t.run(1, UP);
    expect(t.m.view).toBe('split');
    expect(t.names).toEqual(['duoSplit']);
    t.run(30, UP + 3); // 分割の あいだは くり返さない
    expect(t.names).toEqual(['duoSplit']);
  });

  it('ルーペ → 分割: 1 つ（ルーペが 出る ときは 鳴らさない）', () => {
    const t = rig();
    t.run(HOLD + WAIT + 5, 10, OUT);
    expect(t.m.view).toBe('loupe');
    expect(t.names).toEqual([]);
    t.run(1, UP, OUT);
    expect(t.m.view).toBe('split');
    expect(t.names).toEqual(['duoSplit']);
  });
});

describe('AC69: 鳴らさない 切りかえ', () => {
  it('1 画面 ⇄ ルーペは 鳴らさない', () => {
    const t = rig();
    t.run(HOLD + WAIT + 5, 10, OUT); // → ルーペ
    expect(t.m.view).toBe('loupe');
    t.run(HOLD + WAIT + 5, 10, IN); // → 1 画面
    expect(t.m.view).toBe('one');
    expect(t.names).toEqual([]);
  });

  it('色の 段が かわる（分割の 手前まで）では 鳴らさない', () => {
    const t = rig();
    t.run(10, T.tierUpAt[0] + 0.5);
    expect(t.m.tier).toBe(1);
    t.run(10, T.tierUpAt[1] + 0.5);
    expect(t.m.tier).toBe(2);
    t.run(10, T.tierDownAt[1] - 0.5);
    t.run(10, T.tierDownAt[0] - 0.5);
    expect(t.m.view).toBe('one');
    expect(t.names).toEqual([]);
  });

  it('分割 → 1 画面（2P が 画面の 中）では 鳴らさない（分割の 1 つだけ）', () => {
    const t = rig();
    t.run(1, UP);
    t.run(WAIT + 20, DOWN + 3);
    t.run(BACK, DOWN, IN);
    expect(t.m.view).toBe('one');
    expect(t.names).toEqual(['duoSplit']);
  });

  it('分割 → ルーペ（2P が 画面の 外）でも 鳴らさない', () => {
    const t = rig();
    t.run(1, UP, OUT);
    t.run(WAIT + 20, DOWN + 3, OUT);
    t.run(BACK, DOWN, OUT);
    expect(t.m.view).toBe('loupe');
    expect(t.names).toEqual(['duoSplit']);
  });
});

describe('AC69: 1 秒に 1 回より 多く ならない（AC22 の 待ち）', () => {
  it('24 の 前後（23.9 と 24.1）を 毎ステップ 行き来しても 1 秒（60 ステップ）に 1 つより 多く ならない', () => {
    const t = rig();
    for (let i = 0; i < 600; i++) t.run(1, i % 2 === 0 ? UP - 0.1 : UP + 0.1);
    expect(t.names.length).toBeGreaterThan(0);
    for (let i = 1; i < t.at.length; i++) expect(t.at[i]! - t.at[i - 1]!, `${i}`).toBeGreaterThanOrEqual(WAIT);
    // 60 ステップの どの 窓にも 1 つまで
    for (let s = 1; s <= 600 - WAIT + 1; s++) expect(t.at.filter((x) => x >= s && x < s + WAIT).length).toBeLessThanOrEqual(1);
  });

  it('分割 → 戻る → 分割 を 何度 くり返しても、鳴る 数 = 分割に かわった 回数、間は 待ちより 長い', () => {
    const t = rig();
    for (let k = 0; k < 8; k++) {
      t.run(WAIT + 1, UP + 0.1);
      t.run(BACK + 1, DOWN - 1);
    }
    expect(t.splits()).toBeGreaterThanOrEqual(3);
    expect(t.names.length).toBe(t.splits());
    expect(t.names.every((x) => x === 'duoSplit')).toBe(true);
    for (let i = 1; i < t.at.length; i++) expect(t.at[i]! - t.at[i - 1]!).toBeGreaterThanOrEqual(WAIT);
  });
});

describe('AC69: 動きを 減らす 設定でも 鳴る', () => {
  it('reducedMotion: 1 画面 → 分割 で 1 つ。ルーペ → 分割 でも 1 つ', () => {
    const a = rig(true);
    a.run(1, UP);
    expect(a.names).toEqual(['duoSplit']);
    const b = rig(true);
    b.run(HOLD + WAIT + 5, 10, OUT);
    expect(b.m.view).toBe('loupe');
    b.run(1, UP, OUT);
    expect(b.names).toEqual(['duoSplit']);
  });
});
