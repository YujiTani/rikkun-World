import { describe, expect, it } from 'vitest';
import { createParry } from '../combat/parry';
import { createW2Settings, type ScreenMode } from '../contracts';
import { duoTimeScale } from './rules';
import { parryTimeScale, worldTimeScale } from './worldTime';

/**
 * COOP-1 4d-0（docs/design/COOP-1.md 1.13 §3.6 (a)「かけ合わせ」「2 人 同時」・§8 の つなぎ目・§9.10・§10・AC96・AC113）の 先行テスト（赤）。
 * 時間の 倍率の まとめ方。2 人の ときは 世界ぜんたいが ゆっくり（相手の 2P も）。1 人の ときは 今の まま。
 *
 * ---- 実装への 約束（新しい ファイル src/duo/worldTime.ts。純粋な 関数だけ。three・DOM を 使わない）----
 *   parryTimeScale(scales: readonly number[]): number
 *     その時 いる 人の パリィの `timeScale`（1 人の ときは 1P の 1 つ、2 人の ときは 1P と 2P。4d-1 までは 1P だけ）の「小さい 方」。かけ算 しない。空なら 1。
 *     配線: `shared.parryScales(): number[]`（§8。毎ステップ 新しい 配列を 作らない 入れものを 使い回す）→ この 関数。
 *   worldTimeScale(i: { mode: ScreenMode; screenScale: number; joined: boolean; parryScales: readonly number[] }): number
 *     Game.setTimeScale に 渡す 倍率（`src/game/wire/save.ts` の `gameTimeScale`。この 式の 置きかえ。`shared.gameTimeScale` と `duo.timeScale()` も 同じ 物）。
 *     mode = `screen.mode()`、screenScale = `screen.timeScale()`（案内中 0・もちもの画面 `inventoryTimeScale`・遊び 1）、joined = 2P が いる。
 *     画面の 倍率 = mode が 'inventory' なら `duoTimeScale(screenScale, joined)`、ほかは screenScale。
 *     パリィの 倍率 = `parryTimeScale(parryScales)`。かける のは「2 人の ときは いつも」「1 人の ときは mode が 'play' の ときだけ」（今の 決まり）。
 *     答え = 画面の 倍率 × （かける とき）パリィの 倍率。
 *   「動きを へらす」は パリィ側が `timeScale` を 1 で 返す（`createParry` の まま）ので ここでは 何も しない。
 *   数（0.25・6 ステップ）は `createW2Settings().parrySlow`（`w2Settings.ts`）から 読む。ここに 直書き しない。
 */

const W2 = createW2Settings();
const SLOW = W2.parrySlow.scale;
const SLOW_TICKS = W2.parrySlow.ticks;
/** screen.timeScale() の もちもの画面の 値（ScreenSettings.inventoryTimeScale の 既定。入力として 渡すだけ） */
const INV_BASE = 0.25;

const MODES: ScreenMode[] = ['play', 'inventory', 'guide', 'celebrate']; // ScreenMode の 4 つぜんぶ

describe('AC96: parryTimeScale（その時 いる 人の パリィの 倍率の 小さい 方。かけ算 しない）', () => {
  it('空・1 つ', () => {
    expect(parryTimeScale([])).toBe(1);
    expect(parryTimeScale([1])).toBe(1);
    expect(parryTimeScale([SLOW])).toBe(SLOW);
  });
  it('2 人: どちらか 片方でも ゆっくりなら それ。順番に よらない', () => {
    expect(parryTimeScale([SLOW, 1])).toBe(SLOW);
    expect(parryTimeScale([1, SLOW])).toBe(SLOW);
  });
  it('2 人 同時に ゆっくり でも 0.25 のまま（0.0625 に ならない）', () => {
    expect(parryTimeScale([SLOW, SLOW])).toBe(SLOW);
    expect(parryTimeScale([SLOW, SLOW])).not.toBeCloseTo(SLOW * SLOW, 6);
  });
  it('受けとった 配列を こわさない（毎ステップ 使い回す 入れもの）', () => {
    const a = [SLOW, 1];
    parryTimeScale(a);
    expect(a).toEqual([SLOW, 1]);
  });
});

describe('AC96: worldTimeScale（2 人の とき）', () => {
  const two = (mode: ScreenMode, screenScale: number, parryScales: number[]) => worldTimeScale({ mode, screenScale, joined: true, parryScales });

  it('遊んでいる とき: パリィの ゆっくりが かかる（1P でも 2P でも どちらかの パリィで）', () => {
    expect(two('play', 1, [SLOW, 1])).toBe(SLOW);
    expect(two('play', 1, [1, SLOW])).toBe(SLOW);
    expect(two('play', 1, [1, 1])).toBe(1);
  });
  it('1P が 2 人用の もちもの画面を 開いていても パリィの ゆっくりが かかる（2P の パリィで）。画面の 倍率は 1', () => {
    expect(two('inventory', INV_BASE, [1, SLOW])).toBe(SLOW);
    expect(two('inventory', INV_BASE, [SLOW, 1])).toBe(SLOW);
  });
  it('1P が もちもの画面を 開いていて パリィも ない: 1（世界は ゆっくりに ならない。AC11・AC75 の まま）', () => {
    expect(two('inventory', INV_BASE, [1, 1])).toBe(duoTimeScale(INV_BASE, true));
    expect(two('inventory', INV_BASE, [1, 1])).toBe(1);
  });
  it('案内画面（画面の 倍率 0）は 0 のまま。パリィが あっても 0（本・建築士さんの 0 も 同じ 形）', () => {
    expect(two('guide', 0, [1, 1])).toBe(0);
    expect(two('guide', 0, [SLOW, SLOW])).toBe(0);
    expect(two('play', 0, [SLOW, 1])).toBe(0);
  });
  it('2 人の ゆっくりが 重なっても 0.25（かけ算 しない）', () => {
    expect(two('play', 1, [SLOW, SLOW])).toBe(SLOW);
    expect(two('inventory', INV_BASE, [SLOW, SLOW])).toBe(SLOW);
  });
  it('「動きを へらす」: パリィが 1 を 返す ので 1（ゆっくりに ならない）', () => {
    expect(two('play', 1, [1, 1])).toBe(1);
  });
});

describe('AC113: 1 人の とき（今の 式と 同じ。期待を かえない）', () => {
  /** 今の `save.ts` の gameTimeScale（2P が いない ときの 式。screen.mode() === 'play' の ときだけ パリィを かける） */
  const legacy = (mode: ScreenMode, screenScale: number, parryScale: number): number => (mode === 'inventory' ? duoTimeScale(screenScale, false) : screenScale) * (mode === 'play' ? parryScale : 1);

  it('どの 画面 × どの 倍率 でも 今の 式と 同じ', () => {
    for (const mode of MODES) {
      for (const screenScale of [0, INV_BASE, 1]) {
        for (const p of [1, SLOW]) {
          expect(worldTimeScale({ mode, screenScale, joined: false, parryScales: [p] }), `${mode} ${screenScale} パリィ ${p}`).toBe(legacy(mode, screenScale, p));
        }
      }
    }
  });
  it('1 人: 遊びの ときだけ パリィが かかる。もちもの画面は 0.25 の まま（パリィは かからない）', () => {
    expect(worldTimeScale({ mode: 'play', screenScale: 1, joined: false, parryScales: [SLOW] })).toBe(SLOW);
    expect(worldTimeScale({ mode: 'inventory', screenScale: INV_BASE, joined: false, parryScales: [SLOW] })).toBe(INV_BASE);
    expect(worldTimeScale({ mode: 'guide', screenScale: 0, joined: false, parryScales: [SLOW] })).toBe(0);
  });
});

/** 実物の パリィ（1P も 2P も 同じ 部品）を 成功まで 動かす。tick は その パリィの 中の 数え */
function parryRig() {
  const p = createParry(W2);
  let tick = 0;
  const step = (pressed = false) => {
    tick++;
    p.update({ tick, item: 'katana', run: true, pressed, held: true, active: true });
    return p.state();
  };
  const hitOk = () => p.hit({ dirDeg: 0, yawDeg: 0, by: 'attack', yokaiId: 1, amount: 2 });
  return { p, step, hitOk };
}

describe('AC96: 2 人の パリィの ゆっくりが ずれて 重なる（本物の createParry を 2 つ）', () => {
  it('世界の 倍率は ゆっくりの あいだ ずっと 0.25。1 に もどるのは おそい 方の のこりが 0 に なった ステップ', () => {
    const DELAY = 3; // 2 人目が きめる のは 1 人目より 3 ステップ あと
    const A = parryRig();
    const B = parryRig();
    const SUCCESS_F = 10; // かまえ〜受けの 中（成功する F）
    const seen: number[] = [];
    // 世界の 1 ステップ = A.step・B.step を 1 回ずつ。A は 1 ステップ目に 押し、B は DELAY あとに 押す
    for (let w = 1; w <= SUCCESS_F + DELAY + SLOW_TICKS + 4; w++) {
      const a = A.step(w === 1);
      const b = w > DELAY ? B.step(w === DELAY + 1) : B.p.state();
      if (w === SUCCESS_F) A.hitOk();
      if (w === SUCCESS_F + DELAY) B.hitOk();
      seen.push(worldTimeScale({ mode: 'play', screenScale: 1, joined: true, parryScales: [a.timeScale, b.timeScale] }));
    }
    // 成功した 次の ステップから A は SLOW_TICKS ステップ、B は DELAY あとから SLOW_TICKS ステップ ゆっくり
    const first = SUCCESS_F + 1;
    const last = SUCCESS_F + DELAY + SLOW_TICKS; // B の ゆっくりの 最後の ステップ
    for (let w = 1; w <= seen.length; w++) {
      const want = w >= first && w <= last ? SLOW : 1;
      expect(seen[w - 1], `世界の ${w} ステップ目`).toBe(want);
    }
  });

  it('2 人が 同じ ステップに きめても 0.25（かけ算 しない）。同じ ステップ数で 終わる', () => {
    const A = parryRig();
    const B = parryRig();
    const SUCCESS_F = 10;
    const seen: number[] = [];
    for (let w = 1; w <= SUCCESS_F + SLOW_TICKS + 3; w++) {
      const a = A.step(w === 1);
      const b = B.step(w === 1);
      if (w === SUCCESS_F) {
        A.hitOk();
        B.hitOk();
      }
      seen.push(worldTimeScale({ mode: 'play', screenScale: 1, joined: true, parryScales: [a.timeScale, b.timeScale] }));
    }
    const slowSteps = seen.filter((s) => s === SLOW).length;
    expect(slowSteps).toBe(SLOW_TICKS);
    expect(Math.min(...seen)).toBe(SLOW);
  });

  it('「動きを へらす」の パリィは ゆっくりの あいだも 1（slowLeft は へるが 倍率は かわらない）', () => {
    const p = createParry(W2, { reducedMotion: () => true });
    let tick = 0;
    const step = (pressed = false) => {
      tick++;
      p.update({ tick, item: 'katana', run: true, pressed, held: true, active: true });
      return p.state();
    };
    step(true);
    for (let f = 2; f <= 10; f++) step();
    p.hit({ dirDeg: 0, yawDeg: 0, by: 'attack', yokaiId: 1, amount: 2 });
    for (let k = 1; k <= SLOW_TICKS; k++) {
      const s = step();
      expect(s.slowLeft).toBeGreaterThan(0);
      expect(worldTimeScale({ mode: 'play', screenScale: 1, joined: true, parryScales: [s.timeScale, 1] }), `${k} ステップ目`).toBe(1);
    }
  });
});
