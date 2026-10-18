import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../contracts';
import type { ItemId } from '../contracts';
import { createStepClock } from '../game/stepClock';
import {
  bearingOf,
  createParry,
  judgeParry,
  parryEarlyDamage,
  parryGlowLevel,
  routeAttackInput,
  type ParryPhase,
} from './parry';

/**
 * WEAPON-5 のユニットテスト（docs/design/WEAPON-5.md §6 の 【ユニット】 AC2・AC2b・AC3・AC5〜AC9）。
 * 仕様書は 窓口の名前（`parry.state()` など §4.8）までしか 決めていないので、純粋な 関数・部品の 形は ここで 決めた。
 * 名前だけ 実装に あわせて 直すときは、このファイルの import と `rig()` の 1 か所だけ 直す（期待の 数は 変えない）。
 *
 *   src/combat/parry.ts
 *     judgeParry(state, fromDeg, yawDeg, settings) → { result: 'success'|'early'|'fail'|'none', behind }
 *       state = { phase, frame }（frame: かまえ〜すきは F 1〜40、きめは 1〜8）、fromDeg = 来た向き（0 = 北、90 = 東。null = 真上・真下）
 *     bearingOf(from, to) → 水平の向き（度。水平の きょり 0.01 未満は null）
 *     parryEarlyDamage(amount, mul, armorCut) → 半分（切り上げ）のあと 防具（最低 1）
 *     routeAttackInput({ item, run, pressed, held }) → 'parry' | 'normal'（今のまま: わざ・ほる…）| 'none'
 *     createParry(settings, { reducedMotion? }) → { update(input), hit(hit), state(), events(), sounds(), acceptsBuffer() }
 *       update 1 回 = 1 ステップ。入力 → 妖怪の当たり（hit）の 順に 呼ぶ
 *     parryGlowLevel(ticksLeft, settings) → 明るさ 0〜1
 *   src/game/stepClock.ts
 *     createStepClock() → { advance(elapsedSec, scale): 進める ステップ数 }
 */

const S = createW2Settings() as ReturnType<typeof createW2Settings> & Record<string, any>;

/** F → { phase, frame }（設定の 区切りから） */
function at(F: number): { phase: ParryPhase; frame: number } {
  const t = S.parryTicks as { ready: number; guard: number; recover: number };
  if (F <= t.ready) return { phase: 'ready', frame: F };
  if (F <= t.ready + t.guard) return { phase: 'guard', frame: F };
  return { phase: 'recover', frame: F };
}

describe('AC2: 判定（前から）', () => {
  const judge = (st: { phase: ParryPhase; frame: number }, from: number | null = 0, yaw = 0) => judgeParry(st, from, yaw, S);
  it('F の 区切り: 1・2 半分、3・20 成功、21・32 半分、33・40 失敗', () => {
    for (const [F, want] of [[1, 'early'], [2, 'early'], [3, 'success'], [20, 'success'], [21, 'early'], [32, 'early'], [33, 'fail'], [40, 'fail']] as const) {
      expect(judge(at(F)).result, `F${F}`).toBe(want);
    }
  });
  it('きめ 1・8 は 成功、idle は パリィなし', () => {
    expect(judge({ phase: 'kime', frame: 1 }).result).toBe('success');
    expect(judge({ phase: 'kime', frame: 8 }).result).toBe('success');
    expect(judge({ phase: 'idle', frame: 0 }).result).toBe('none');
  });
  it('区切りは 設定から 決まる（parryTicks を 変えると 動く）', () => {
    const s2 = { ...S, parryTicks: { ready: 4, guard: 10, recover: 20 } };
    expect(judgeParry({ phase: 'ready', frame: 4 }, 0, 0, s2).result).toBe('early');
    expect(judgeParry({ phase: 'guard', frame: 5 }, 0, 0, s2).result).toBe('success');
    expect(judgeParry({ phase: 'recover', frame: 15 }, 0, 0, s2).result).toBe('early');
  });
  it('押した ステップに 当たったら F1（半分）: 押す → 当たりの 順', () => {
    const p = createParry(S);
    p.update({ tick: 1, item: 'katana', run: true, pressed: true, held: true, active: true });
    expect(p.state().frame).toBe(1);
    const r = p.hit({ dirDeg: 0, yawDeg: 0, by: 'attack', yokaiId: 1, amount: 3 });
    expect(r.result).toBe('early');
    expect(p.events().find((e: any) => e.type === 'parryEarly')).toMatchObject({ frame: 1, by: 'attack', yokaiId: 1, amount: 2 });
  });
});

describe('AC2b: 向き（前 ±90°）', () => {
  const guard10 = at(10);
  it('0°・89°・90°・−90° は 成功', () => {
    for (const d of [0, 89, 90, -90, 270]) expect(judgeParry(guard10, d, 0, S), `${d}°`).toEqual({ result: 'success', behind: false });
  });
  it('91°・135°・180° は 失敗（behind）', () => {
    for (const d of [91, 135, 180, -91]) expect(judgeParry(guard10, d, 0, S), `${d}°`).toEqual({ result: 'fail', behind: true });
  });
  it('プレイヤーの 向き（yaw）を 基準に する', () => {
    expect(judgeParry(guard10, 180, 180, S).result).toBe('success');
    expect(judgeParry(guard10, 0, 180, S)).toEqual({ result: 'fail', behind: true });
    expect(judgeParry(guard10, 100, 30, S).result).toBe('success'); // 70° ずれ
  });
  it('後ろ 180° は F1・F25・きめ でも 失敗（半分に ならない）', () => {
    for (const st of [at(1), at(25), { phase: 'kime' as const, frame: 3 }]) {
      expect(judgeParry(st, 180, 0, S), `${st.phase}${st.frame}`).toEqual({ result: 'fail', behind: true });
    }
  });
  it('真上・真下（水平 0.01 未満）は 前と みなして 成功', () => {
    expect(bearingOf({ x: 5, y: 1, z: 5 }, { x: 5.005, y: 4, z: 5 })).toBeNull();
    expect(judgeParry(guard10, null, 0, S).result).toBe('success');
    expect(judgeParry(guard10, null, 123, S).result).toBe('success');
  });
  it('来た向き: 足もとから 相手の 足もとへ（0 = 北 −z、90 = 東 +x）', () => {
    const p = { x: 10, y: 9, z: 10 };
    expect(bearingOf(p, { x: 10, y: 9, z: 8 })).toBeCloseTo(0, 6);
    expect(bearingOf(p, { x: 12, y: 9, z: 10 })).toBeCloseTo(90, 6);
    expect(bearingOf(p, { x: 10, y: 9, z: 12 })).toBeCloseTo(180, 6);
    expect(Math.abs(bearingOf(p, { x: 8, y: 20, z: 10 })!)).toBeCloseTo(90, 6); // −90 か 270
  });
  it('火の玉も 位置で 同じ 判定（hit の by: fireball）', () => {
    const p = createParry(S);
    const run = (dirDeg: number) => {
      const q = createParry(S);
      q.update({ tick: 1, item: 'katana', run: true, pressed: true, held: true, active: true });
      for (let i = 0; i < 9; i++) q.update({ tick: 2 + i, item: 'katana', run: true, pressed: false, held: true, active: true });
      return q.hit({ dirDeg, yawDeg: 0, by: 'fireball', yokaiId: 7, amount: 2 });
    };
    expect(run(40)).toMatchObject({ result: 'success', behind: false });
    expect(run(170)).toMatchObject({ result: 'fail', behind: true });
    void p;
  });
});

describe('AC3: 半分（切り上げ）と 防具', () => {
  it('元 1→1、2→1、3→2、16→8', () => {
    for (const [a, w] of [[1, 1], [2, 1], [3, 2], [16, 8]] as const) expect(parryEarlyDamage(a, 0.5, 0), `${a}`).toBe(w);
  });
  it('防具の カットは 半分の あと。カット 1 で 2 → 1 → 最低 1 で 1', () => {
    expect(parryEarlyDamage(2, 0.5, 1)).toBe(1);
    expect(parryEarlyDamage(16, 0.5, 3)).toBe(5);
    expect(parryEarlyDamage(3, 0.5, 5)).toBe(1);
  });
  it('倍率は 設定（parryEarlyMul）', () => {
    expect(parryEarlyDamage(10, S.parryEarlyMul, 0)).toBe(5);
  });
});

describe('AC5: 入力（Shift＋攻撃）', () => {
  const route = (item: ItemId | null, run: boolean, pressed: boolean, held: boolean) => routeAttackInput({ item, run, pressed, held });
  it('刀 ＋ Shift ＋ 押した → パリィ（ブロックを ねらっていても）', () => {
    for (const it of ['bokuto', 'katana', 'crystal_katana'] as const) expect(route(it, true, true, true), it).toBe('parry');
  });
  it('刀 ＋ Shift ＋ 押しつづけ（前から押している）→ 何も出さない', () => {
    expect(route('katana', true, false, true)).toBe('none');
  });
  it('刀 ＋ Shift なし → 今のまま（わざ・ほる）', () => {
    expect(route('katana', false, true, true)).toBe('normal');
    expect(route('katana', false, false, true)).toBe('normal');
  });
  it('おしつづけの 途中で Shift を 押した → わざは 出ない（Shift を はなすと また 出る）', () => {
    expect(route('katana', true, false, true)).toBe('none');
    expect(route('katana', false, false, true)).toBe('normal');
  });
  it('刀でない 物 → Shift が あっても 今のまま', () => {
    for (const it of ['iron_pickaxe', 'wood_axe', 'naginata', 'yumi', null] as const) {
      expect(route(it as ItemId | null, true, true, true), String(it)).toBe('normal');
      expect(route(it as ItemId | null, true, false, true), String(it)).toBe('normal');
    }
  });
  it('刀 ＋ Shift ＋ 押しつづけ 60 ステップ → パリィ 1 回', () => {
    const p = createParry(S);
    for (let i = 0; i < 60; i++) p.update({ tick: i + 1, item: 'katana', run: true, pressed: i === 0, held: true, active: true });
    expect(p.events().filter((e: any) => e.type === 'parryStart')).toHaveLength(1);
  });
  it('刀でない 物では パリィ 0 回', () => {
    const p = createParry(S);
    for (let i = 0; i < 10; i++) p.update({ tick: i + 1, item: 'iron_pickaxe', run: true, pressed: true, held: true, active: true });
    expect(p.events().filter((e: any) => e.type === 'parryStart')).toHaveLength(0);
    expect(p.state().phase).toBe('idle');
  });
  it('出せない とき（もちもの画面・やられている間: active false）は 出ない', () => {
    const p = createParry(S);
    p.update({ tick: 1, item: 'katana', run: true, pressed: true, held: true, active: false });
    expect(p.state().phase).toBe('idle');
  });
});

/** パリィを 始めてから、毎ステップ 呼ぶ 道具 */
function rig(o: { reducedMotion?: boolean } = {}) {
  const p = createParry(S, o);
  let tick = 0;
  const step = (pressed = false) => {
    tick++;
    p.update({ tick, item: 'katana', run: true, pressed, held: true, active: true });
    return p.state();
  };
  return { p, step, tick: () => tick };
}

describe('AC6: 長さ', () => {
  it('何も 来ない パリィは F1〜40、parryEnd は 41 ステップ目、そのステップに 次を 出せる', () => {
    const { p, step } = rig();
    expect(step(true).frame).toBe(1);
    for (let f = 2; f <= 40; f++) expect(step().frame, `F${f}`).toBe(f);
    expect(p.events().filter((e: any) => e.type === 'parryEnd')).toHaveLength(0);
    const s41 = step();
    expect(s41.phase).toBe('idle');
    const end = p.events().filter((e: any) => e.type === 'parryEnd');
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ tick: 41, success: false });
    // 41 ステップ目に 押せば その ステップに 次の パリィ
    const q = rig();
    q.step(true);
    for (let f = 2; f <= 40; f++) q.step();
    expect(q.step(true).frame).toBe(1);
    expect(q.p.events().filter((e: any) => e.type === 'parryStart').map((e: any) => e.tick)).toEqual([1, 41]);
  });
  it('F1〜32 に 押した Shift＋攻撃は 先行入力に ならない（F41 に 出ない）', () => {
    const { p, step } = rig();
    step(true);
    for (let f = 2; f <= 32; f++) {
      expect(p.acceptsBuffer(), `F${f}`).toBe(false);
      step(f % 3 === 0);
    }
    for (let f = 33; f <= 40; f++) step();
    expect(step().phase).toBe('idle');
    expect(p.events().filter((e: any) => e.type === 'parryStart')).toHaveLength(1);
  });
  it('F33〜40 に 押すと F41 に 出る（先行入力）', () => {
    for (const F of [33, 36, 40]) {
      const { p, step } = rig();
      step(true);
      for (let f = 2; f < F; f++) step();
      expect(p.acceptsBuffer(), `F${F}`).toBe(true);
      step(true); // F
      for (let f = F + 1; f <= 40; f++) step();
      expect(step().frame, `F${F} で 押した → 41 ステップ目`).toBe(1);
      expect(p.events().filter((e: any) => e.type === 'parryStart').map((e: any) => e.tick)).toEqual([1, 41]);
    }
  });
  it('パリィの 間に parryTicks を 変えても 始めたときの 数のまま', () => {
    const s = createW2Settings() as any;
    const p = createParry(s);
    p.update({ tick: 1, item: 'katana', run: true, pressed: true, held: true, active: true });
    s.parryTicks = { ready: 1, guard: 5, recover: 5 };
    for (let i = 2; i <= 40; i++) p.update({ tick: i, item: 'katana', run: true, pressed: false, held: true, active: true });
    expect(p.state().frame).toBe(40);
    p.update({ tick: 41, item: 'katana', run: true, pressed: false, held: true, active: true });
    expect(p.state().phase).toBe('idle');
  });
});

describe('AC7: 成功と きめ', () => {
  function toSuccess(F = 10) {
    const r = rig();
    r.step(true);
    for (let f = 2; f <= F; f++) r.step();
    const res = r.p.hit({ dirDeg: 0, yawDeg: 0, by: 'attack', yokaiId: 1, amount: 2 });
    return { ...r, res };
  }
  it('F10 で 成功 → 次の 8 ステップが きめ（frame 1〜8）、その次で idle', () => {
    const { p, step, res } = toSuccess();
    expect(res.result).toBe('success');
    for (let k = 1; k <= 8; k++) {
      const s = step();
      expect(s, `きめ ${k}`).toMatchObject({ phase: 'kime', frame: k });
    }
    expect(step().phase).toBe('idle');
    const end = p.events().filter((e: any) => e.type === 'parryEnd');
    expect(end).toHaveLength(1);
    expect(end[0]).toMatchObject({ success: true });
  });
  it('きめの 間は 先行入力を 受ける。押した パリィは きめ明けに 出る', () => {
    const { p, step } = toSuccess();
    step();
    expect(p.acceptsBuffer()).toBe(true);
    step(true);
    for (let k = 3; k <= 8; k++) step();
    expect(step().phase).toBe('ready'); // きめ明けの ステップに 次のパリィの F1
    expect(p.state().frame).toBe(1);
  });
  it('いちばん 早く 次が 出るのは F3 で成功 → F12、おそいのは F20 で成功 → F29', () => {
    for (const [F, next] of [[3, 12], [20, 29]] as const) {
      const { step, tick } = toSuccess(F);
      const tickAtSuccess = tick();
      expect(tickAtSuccess).toBe(F);
      let n = 0;
      let s = step();
      while (s.phase === 'kime') {
        s = step();
        n++;
      }
      expect(n, `F${F}`).toBe(8);
      expect(tick(), `F${F}: 次が 出せる ステップ（パリィ 始めから 数えて）`).toBe(next);
    }
  });
  it('きめ中に 当たった 2 体目も 成功。parry の 音・スロー・光は 1 回だけ', () => {
    const { p, step } = toSuccess();
    step(); // S+1
    const slow0 = p.state().slowLeft;
    const glow0 = p.state().glowLeft;
    step();
    const r2 = p.hit({ dirDeg: 20, yawDeg: 0, by: 'attack', yokaiId: 2, amount: 2 });
    expect(r2.result).toBe('success');
    const ok = p.events().filter((e: any) => e.type === 'parrySuccess');
    expect(ok.map((e: any) => e.yokaiId)).toEqual([1, 2]);
    expect(p.sounds().filter((n: string) => n === 'parry')).toHaveLength(1);
    expect(p.state().slowLeft).toBeLessThan(slow0); // のばさない・やり直さない
    expect(p.state().glowLeft).toBeLessThan(glow0);
    // きめは のばさない: S+1 から 8 ステップで おわる
    for (let k = 3; k <= 8; k++) step();
    expect(step().phase).toBe('idle');
  });
  it('同じ ステップに 2 体（前に 2 体）も ぜんぶ 成功', () => {
    const { p } = toSuccess();
    // toSuccess は 1 体目を すでに 当てた。同じ ステップの 2 体目
    expect(p.hit({ dirDeg: 80, yawDeg: 0, by: 'attack', yokaiId: 3, amount: 2 }).result).toBe('success');
    expect(p.events().filter((e: any) => e.type === 'parrySuccess')).toHaveLength(2);
    expect(p.sounds().filter((n: string) => n === 'parry')).toHaveLength(1);
  });
  it('音: 始めに parrySwing、おしいは parryEarly', () => {
    const { p, step } = rig();
    step(true);
    expect(p.sounds()).toContain('parrySwing');
    p.hit({ dirDeg: 0, yawDeg: 0, by: 'attack', yokaiId: 1, amount: 2 });
    expect(p.sounds()).toContain('parryEarly');
    expect(p.sounds()).not.toContain('parry');
  });
});

describe('AC8: スロー', () => {
  function afterSuccess(o: { reducedMotion?: boolean } = {}) {
    const r = rig(o);
    r.step(true);
    for (let f = 2; f <= 10; f++) r.step();
    r.p.hit({ dirDeg: 0, yawDeg: 0, by: 'attack', yokaiId: 1, amount: 2 });
    return r;
  }
  it('成功の 次のステップから 6 ステップ timeScale 0.25、7 ステップ目は 1', () => {
    const { step } = afterSuccess();
    const seen: number[] = [];
    for (let k = 1; k <= 8; k++) seen.push(step().timeScale);
    expect(seen).toEqual([0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 1, 1]);
  });
  it('「動きを減らす」では timeScale 1。slowLeft は 同じく 6 から へる', () => {
    const { step } = afterSuccess({ reducedMotion: true });
    const left: number[] = [];
    for (let k = 1; k <= 8; k++) {
      const s = step();
      expect(s.timeScale).toBe(1);
      left.push(s.slowLeft);
    }
    expect(left).toEqual([6, 5, 4, 3, 2, 1, 0, 0]);
  });
  it('ゲームの時間: 1/60 秒の フレームを 24 回 わたすと ちょうど 6 ステップ', () => {
    const clock = createStepClock();
    let steps = 0;
    for (let i = 0; i < 23; i++) steps += clock.advance(1 / 60, 0.25);
    expect(steps).toBe(5);
    steps += clock.advance(1 / 60, 0.25);
    expect(steps).toBe(6);
    // ふつうの 速さ
    const c2 = createStepClock();
    let n = 0;
    for (let i = 0; i < 60; i++) n += c2.advance(1 / 60, 1);
    expect(n).toBe(60);
  });
});

describe('AC9: 青白い光', () => {
  it('成功の 次のステップから glowLeft 20 → 1、21 ステップ目に 消える', () => {
    const r = rig();
    r.step(true);
    for (let f = 2; f <= 10; f++) r.step();
    r.p.hit({ dirDeg: 0, yawDeg: 0, by: 'attack', yokaiId: 1, amount: 2 });
    const left: number[] = [];
    for (let k = 1; k <= 22; k++) left.push(r.step().glowLeft);
    expect(left.slice(0, 20)).toEqual(Array.from({ length: 20 }, (_, i) => 20 - i));
    expect(left[20]).toBe(0);
    expect(left[21]).toBe(0);
  });
  it('点滅しない: 20 ステップの 間 明るさの 山は 1 つ（0〜1）', () => {
    const levels = Array.from({ length: 20 }, (_, i) => parryGlowLevel(20 - i, S));
    for (const v of levels) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    let peaks = 0;
    for (let i = 1; i < levels.length - 1; i++) if (levels[i]! > levels[i - 1]! && levels[i]! >= levels[i + 1]!) peaks++;
    if (levels[0]! >= levels[1]!) peaks++;
    expect(Math.max(...levels)).toBeGreaterThan(0.5);
    expect(peaks).toBe(1);
    expect(parryGlowLevel(0, S)).toBe(0);
  });
});
