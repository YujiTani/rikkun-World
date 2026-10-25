import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../contracts';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { parryCellOf } from '../char/parryCells';
import { bladeMidInto } from '../fx/parryFx';
import { createParry, parryShownFrame } from './parry';

/**
 * SAMURAI-1（#300）AC4〜AC6: 明珍陣笠の パリィ（受けの 成功が 18 → 30 コマ = 0.5 秒）。実装の 前の テスト（赤）。
 * 窓口 の 形:
 *   parry.ts      `ParryInput.jingasa?: boolean`（そのステップに 陣笠を 着て いるか）。パリィを 始めた ステップの 値を そのパリィの 間 ずっと つかう
 *                 （受けの 長さ = 調整表 NINJA_TUNING.jingasaGuardTicks。ready 2・recover 20・parryEarlyTicks 12 は かえない）
 *                 `parryShownFrame(frame, jingasa)` = 見せる F（F ≤ 20 → F、21〜32 → 20、33 以上 → F − 12。陣笠 なしは F の まま）
 *   parryCells.ts `parryCellOf(phase, frame, jingasa?)`（キャラの コマ。きめは そのまま）
 *   parryFx.ts    `bladeMidInto(out, p, facingDeg, tick, jingasa?)`（刀の 道。tick = F。同じ 引きもどしを つかう）
 * 既存の parry.test.ts は 期待を かえず に 通る（陣笠 なしは 今の まま）。
 */
const S = createW2Settings();
const HIT = { dirDeg: 0, yawDeg: 0, by: 'attack' as const, yokaiId: 1, amount: 4 };

/** 刀で 走りながら 押した（Shift ＋ 左クリック）。tick は 1 から */
function rig(...args: [(boolean | ((tick: number) => boolean) | undefined)?]) {
  // 引数なし = 陣笠あり。undefined を 明示して わたしたら 「着ていない」
  const jingasa = args.length === 0 ? true : args[0];
  const p = createParry(S);
  let tick = 0;
  const wear = (t: number) => (typeof jingasa === 'function' ? jingasa(t) : jingasa === true);
  const step = (pressed = false) => {
    tick++;
    p.update({ tick, item: 'katana', run: true, pressed, held: true, active: true, jingasa: wear(tick) });
    return p.state();
  };
  /** F1 まで 進める（押す） */
  const start = () => step(true);
  /** F まで 進める（F ≥ 1。押した ステップが F1） */
  const goTo = (F: number) => {
    start();
    for (let f = 2; f <= F; f++) step();
    return p.state();
  };
  return { p, step, start, goTo, tick: () => tick };
}

describe('AC4 陣笠の パリィ（着て 始めた パリィ）', () => {
  it('F の 区切り: 1・2 おしい、3・32 成功、33・44 おしい、45 失敗', () => {
    const want: [number, string][] = [[1, 'early'], [2, 'early'], [3, 'success'], [20, 'success'], [21, 'success'], [32, 'success'], [33, 'early'], [44, 'early'], [45, 'fail'], [52, 'fail']];
    for (const [F, result] of want) {
      const r = rig();
      const st = r.goTo(F);
      expect(st.frame, `F${F}`).toBe(F);
      expect(r.p.hit(HIT).result, `F${F}`).toBe(result);
    }
  });
  it('受け（成功）は ちょうど 30 コマ: 成功 の F は 3〜32 の 30 こ', () => {
    let n = 0;
    for (let F = 1; F <= 52; F++) {
      const r = rig();
      r.goTo(F);
      if (r.p.hit(HIT).result === 'success') n++;
    }
    expect(n).toBe(30);
  });
  it('長さ: 何も 来ない パリィは F1〜52、parryEnd は 53 ステップ目、そのステップに 次を 出せる', () => {
    const r = rig();
    expect(r.start().frame).toBe(1);
    for (let f = 2; f <= 52; f++) expect(r.step().frame, `F${f}`).toBe(f);
    expect(r.p.events().filter((e) => e.type === 'parryEnd')).toHaveLength(0);
    expect(r.step().phase).toBe('idle');
    expect(r.p.events().filter((e) => e.type === 'parryEnd')).toMatchObject([{ tick: 53, success: false }]);
    const q = rig();
    q.start();
    for (let f = 2; f <= 52; f++) q.step();
    expect(q.step(true).frame).toBe(1);
    expect(q.p.events().filter((e) => e.type === 'parryStart').map((e) => e.tick)).toEqual([1, 53]);
  });
  it('先行入力は F45 から（F44 までに 押しても 53 ステップ目に 出ない）。F45 に 押すと 53 ステップ目に 出る', () => {
    for (const F of [33, 40, 44]) {
      const r = rig();
      r.start();
      for (let f = 2; f < F; f++) r.step();
      expect(r.p.acceptsBuffer(), `F${F}`).toBe(false);
      r.step(true);
      for (let f = F + 1; f <= 52; f++) r.step();
      expect(r.step().phase, `F${F} で 押した → 53 ステップ目は idle`).toBe('idle');
      expect(r.p.events().filter((e) => e.type === 'parryStart')).toHaveLength(1);
    }
    for (const F of [45, 48, 52]) {
      const r = rig();
      r.start();
      for (let f = 2; f < F; f++) r.step();
      expect(r.p.acceptsBuffer(), `F${F}`).toBe(true);
      r.step(true);
      for (let f = F + 1; f <= 52; f++) r.step();
      expect(r.step().frame, `F${F} で 押した → 53 ステップ目`).toBe(1);
      expect(r.p.events().filter((e) => e.type === 'parryStart').map((e) => e.tick)).toEqual([1, 53]);
    }
  });
  it('着て いない（jingasa なし・false）→ 今の まま: F20 成功・F21 おしい・F32 おしい・F33 失敗・全体 40', () => {
    for (const j of [false, undefined as unknown as boolean]) {
      const want: [number, string][] = [[2, 'early'], [3, 'success'], [20, 'success'], [21, 'early'], [32, 'early'], [33, 'fail'], [40, 'fail']];
      for (const [F, result] of want) {
        const r = rig(j);
        r.goTo(F);
        expect(r.p.hit(HIT).result, `${String(j)} F${F}`).toBe(result);
      }
      const r = rig(j);
      r.goTo(40);
      expect(r.p.state().phase).toBe('recover');
      expect(r.step().phase).toBe('idle');
    }
  });
});

describe('AC5 陣笠の 切りかえ・成功したあと・数の 上書き', () => {
  it('着ない で 始めて F5 で 着る → その パリィは 今の まま（F20 成功・F21 おしい）', () => {
    const wearFromF5 = (t: number) => t >= 5;
    const a = rig(wearFromF5);
    a.goTo(21);
    expect(a.p.hit(HIT).result, 'F21').toBe('early');
    const b = rig(wearFromF5);
    b.goTo(20);
    expect(b.p.hit(HIT).result, 'F20').toBe('success');
    const c = rig(wearFromF5);
    c.goTo(40);
    expect(c.step().phase, '全体は 40').toBe('idle');
  });
  it('着て 始めて F5 で ぬぐ → その パリィは 30 の まま（F30 成功・F33 おしい）', () => {
    const takeOffAtF5 = (t: number) => t < 5;
    const a = rig(takeOffAtF5);
    a.goTo(30);
    expect(a.p.hit(HIT).result, 'F30').toBe('success');
    const b = rig(takeOffAtF5);
    b.goTo(33);
    expect(b.p.hit(HIT).result, 'F33').toBe('early');
  });
  it('F32 で 成功 → F33〜40 が きめ（8 ステップ）、F41 で 次の わざが 出る（成功すると 長くは ならない）', () => {
    const r = rig();
    r.goTo(32);
    expect(r.p.hit(HIT).result).toBe('success');
    for (let k = 1; k <= 8; k++) {
      const st = r.step();
      expect(st.phase, `F${32 + k}`).toBe('kime');
      expect(st.frame).toBe(k);
    }
    expect(r.step(true).frame, 'F41 に 押すと その ステップに 次の パリィ').toBe(1);
    expect(r.p.events().filter((e) => e.type === 'parryStart').map((e) => e.tick)).toEqual([1, 41]);
  });
  it('jingasaGuardTicks を 24 に する → F26 成功・F27 おしい（調整表の 数を そのまま つかう）', () => {
    const saved = NINJA_TUNING.jingasaGuardTicks;
    try {
      NINJA_TUNING.jingasaGuardTicks = 24;
      const a = rig();
      a.goTo(26);
      expect(a.p.hit(HIT).result, 'F26').toBe('success');
      const b = rig();
      b.goTo(27);
      expect(b.p.hit(HIT).result, 'F27').toBe('early');
    } finally {
      NINJA_TUNING.jingasaGuardTicks = saved;
    }
    expect(NINJA_TUNING.jingasaGuardTicks).toBe(30);
  });
});

describe('AC6 陣笠の 絵（見せる F）', () => {
  it('parryShownFrame: 20 → 20・21 → 20・32 → 20・33 → 21・52 → 40。F ≤ 20 は F の まま', () => {
    expect(parryShownFrame(20, true)).toBe(20);
    expect(parryShownFrame(21, true)).toBe(20);
    expect(parryShownFrame(32, true)).toBe(20);
    expect(parryShownFrame(33, true)).toBe(21);
    expect(parryShownFrame(52, true)).toBe(40);
    for (let F = 1; F <= 20; F++) expect(parryShownFrame(F, true), `F${F}`).toBe(F);
  });
  it('陣笠 なしは F の まま（1〜40）', () => {
    for (let F = 1; F <= 40; F++) expect(parryShownFrame(F, false), `F${F}`).toBe(F);
  });
  it('キャラの コマ: 陣笠の F21〜32 は F20 と 同じ コマ、F33 は F21、F52 は F40 と 同じ。きめは かわらない', () => {
    const same = (a: ReturnType<typeof parryCellOf>, b: ReturnType<typeof parryCellOf>) => expect(a).toEqual(b);
    same(parryCellOf('guard', 21, true), parryCellOf('guard', 20));
    same(parryCellOf('guard', 32, true), parryCellOf('guard', 20));
    same(parryCellOf('recover', 33, true), parryCellOf('recover', 21));
    same(parryCellOf('recover', 52, true), parryCellOf('recover', 40));
    for (let k = 1; k <= 8; k++) same(parryCellOf('kime', k, true), parryCellOf('kime', k));
    // 陣笠 なし・省略は 今の まま
    for (let F = 1; F <= 40; F++) same(parryCellOf(F <= 2 ? 'ready' : F <= 20 ? 'guard' : 'recover', F, false), parryCellOf(F <= 2 ? 'ready' : F <= 20 ? 'guard' : 'recover', F));
  });
  it('刀の 道（bladeMidInto）も 同じ 引きもどし: (32, 陣笠) = (20, なし)・(33, 陣笠) = (21, なし)・(52, 陣笠) = (40, なし)', () => {
    const P = { x: 1, y: 2, z: 3 };
    const at = (tick: number, jingasa: boolean) => bladeMidInto({ x: 0, y: 0, z: 0 }, P, 30, tick, jingasa);
    expect(at(32, true)).toEqual(at(20, false));
    expect(at(21, true)).toEqual(at(20, false));
    expect(at(33, true)).toEqual(at(21, false));
    expect(at(52, true)).toEqual(at(40, false));
  });
});
