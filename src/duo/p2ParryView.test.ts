import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../contracts';
import { parryGlowLevel, type ParryStateView } from '../combat/parry';
import { parryCellOf } from '../char/parryCells';
import { createParryViews, createParryZoom, parryDollOf, parryEdgeLevel } from './p2ParryView';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 作業 4d-1（docs/design/COOP-1.md 1.13 §3.6 (a)「見せ方」・§9.10・AC100）の 先行テスト（赤）。
 * パリィした 人の 半分だけの 見せ方: ① よせ（その人の カメラが 5.0 → 4.4 → 5.0）② 青い ふち（`duo-parry-edge-p1`／`-p2`）③ 人形の パリィの 絵・青白い 光。
 * ここは **描かない 部分**（数・順番）だけ。ふちの 置き場・色は UI 検査（e2e/ui-gate.spec.ts の 'duo-parry-edge'）とオーナー確認。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/tuning.ts   DUO_TUNING.parryZoom = { mul: number; inSteps: number; outSteps: number }
 *       … パリィの よせ。mul = 0.88（ふだんの きょりの 何倍まで よるか。5.0 → 4.4）・inSteps = 3（よる ステップ）・outSteps = 12（もどる ステップ）。単位つきの 日本語コメントで。
 *   src/duo/p2ParryView.ts   （新しく。1P と 2P の どちらにも 使える。2 人の ときだけ つなぐ）
 *     createParryZoom(d: { fx: { setDistance(dist: number | null): void }; base: () => number; reducedMotion?: () => boolean }): { step(slowLeft: number): void }
 *         … fx は `shared.duoCamFx(who)`（4d-0。setDistance(null) で ふだんの きょり）。base は その人の ふだんの きょり（2 人の とき 5.0）を 読むたびに 返す。
 *         … 毎ステップ step(その人の パリィの state().slowLeft)。slowLeft > 0 の あいだ base() × mul へ inSteps で より、そのまま ゆっくりが 終わる（slowLeft = 0）まで。
 *           終わったら outSteps で base() へ もどり、もどり きった ステップに setDistance(null)。「動きを へらす」の あいだは setDistance を 数で 呼ばない（null か 呼ばない）。
 *     parryEdgeLevel(glowLeft: number, reduced: boolean, S: Pick<W2Settings, 'parryGlowTicks'>): number
 *         … 青い ふちの 濃さ 0〜1。`parryGlowLevel(glowLeft, S)` と 同じ 部品〔式の コピーなし〕。「動きを へらす」は 0。glowLeft 0 は 0（= ふちは 出ない）。
 *     parryDollOf(ps: ParryStateView, S: Pick<W2Settings, 'parryGlowTicks'>): { cell: ParryCell | null; glow: number }
 *         … 2P の 人形に わたす パリィの 絵と 青白い 光。1P の step.ts と 同じ 部品: `cell = parryCellOf(ps.phase, ps.frame, ps.jingasa)`・`glow = parryGlowLevel(ps.glowLeft, S)`。
 *     createParryViews(d: { joined: () => boolean; fxFor(who: 1 | 2): { setDistance(dist: number | null): void }; baseFor(who: 1 | 2): number; stateFor(who: 1 | 2): Pick<ParryStateView, 'slowLeft' | 'glowLeft'> | null;
 *                           reducedMotion?: () => boolean; settings: Pick<W2Settings, 'parryGlowTicks'> }): { step(): void; edgeLevel(who: 1 | 2): number; edgeShown(who: 1 | 2): boolean }
 *         … **1P と 2P の 両方**に つなぐ（よせは 人ごとに `createParryZoom` を 1 つずつ）。**2 人が 参加している（joined() が true の）あいだ だけ** 動く。1 人の ときは `step()` が 何も せず
 *           `fxFor` も `setDistance` も 呼ばない・`edgeShown` は いつも false・`edgeLevel` は 0（1 人の ときの 遊びは かえない。AC113）。
 *         … `edgeShown(who)` = joined() && stateFor(who)?.glowLeft > 0 && 「動きを へらす」でない。`edgeLevel(who)` = `parryEdgeLevel`（上）。duoHud が `duo-parry-edge-p1`／`-p2` の 表示・濃さに 使う。
 *         … 毎ステップ step()（`shared.duoCamFx(who)` を fxFor に、その人の ふだんの きょりを baseFor に、`duo.parry(who)` と 同じ 物を stateFor に）。
 *   【見る 点（ui-reviewer）】1P の パリィでも 1P の 半分に 青い ふちが 出て 2P の 半分には 出ない／ふちが 半分の 中に おさまり HUD を ふさがない／1 人の ときは 出ない。
 *   配線: DuoBody に `setParry(cell)`・`setGlow(level)`・`preloadParry()`（1P の CharSprite と 同じ 口。中で sprite に わたす）。ふちの DOM は duoHud が 持つ。
 */

const S = createW2Settings();
const BASE = DUO_TUNING.cameraSplit;
const Z = DUO_TUNING.parryZoom;

function zoomRig(o: { reduced?: boolean; base?: number } = {}) {
  const calls: Array<number | null> = [];
  let cur: number | null = null;
  const z = createParryZoom({
    fx: {
      setDistance: (d) => {
        calls.push(d);
        cur = d;
      },
    },
    base: () => o.base ?? BASE,
    reducedMotion: () => o.reduced ?? false,
  });
  /** カメラが いま 使う きょり（null は ふだん） */
  const eff = (): number => cur ?? (o.base ?? BASE);
  return { z, calls, eff };
}

describe('AC100 よせ の 数（調整表 DUO_TUNING.parryZoom は 仕様 §9.10 の とおり）', () => {
  it('ふだんの きょり 5.0 → 4.4（0.88 倍）・よる 3 ステップ・もどる 12 ステップ', () => {
    expect(BASE).toBe(5.0);
    expect(Z.mul).toBeCloseTo(0.88, 6);
    expect(BASE * Z.mul).toBeCloseTo(4.4, 6);
    expect(Z.inSteps).toBe(3);
    expect(Z.outSteps).toBe(12);
  });
});

describe('AC100 パリィした 人の カメラが よって、ゆっくりが おわると もどる', () => {
  const NEAR = BASE * Z.mul;

  it('ゆっくりが 来る 前は なにも しない（きょりを かえない）', () => {
    const r = zoomRig();
    for (let i = 0; i < 5; i++) r.z.step(0);
    expect(r.calls.filter((c) => c !== null)).toEqual([]);
    expect(r.eff()).toBe(BASE);
  });

  it('slowLeft > 0 から inSteps で NEAR まで なめらかに（ふえない・BASE より 遠く ならない・NEAR より 近く ならない）。つぎの ステップから すでに よりはじめる', () => {
    const r = zoomRig();
    const seen: number[] = [];
    r.z.step(S.parrySlow.ticks);
    seen.push(r.eff());
    expect(seen[0]!, '1 ステップ目から うごく').toBeLessThan(BASE);
    for (let i = 1; i < Z.inSteps; i++) {
      r.z.step(S.parrySlow.ticks - i);
      seen.push(r.eff());
    }
    expect(r.eff(), `${Z.inSteps} ステップで NEAR`).toBeCloseTo(NEAR, 6);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeLessThanOrEqual(seen[i - 1]! + 1e-9);
    for (const d of seen) {
      expect(d).toBeLessThanOrEqual(BASE + 1e-9);
      expect(d).toBeGreaterThanOrEqual(NEAR - 1e-9);
    }
  });

  it('ゆっくりが おわる（slowLeft = 0）まで そのまま。おわると outSteps で BASE へ もどり、もどり きったら setDistance(null)', () => {
    const r = zoomRig();
    for (let left = S.parrySlow.ticks; left >= 1; left--) r.z.step(left);
    expect(r.eff()).toBeCloseTo(NEAR, 6);
    // おわり: 0 に なった ステップから もどりはじめる
    const back: number[] = [];
    for (let i = 0; i < Z.outSteps; i++) {
      r.z.step(0);
      back.push(r.eff());
    }
    for (let i = 1; i < back.length; i++) expect(back[i]!, `もどる ${i}`).toBeGreaterThanOrEqual(back[i - 1]! - 1e-9);
    expect(back[0]!, 'もどりはじめ').toBeGreaterThan(NEAR);
    expect(Math.max(...back)).toBeLessThanOrEqual(BASE + 1e-9);
    expect(back[back.length - 1]!, `${Z.outSteps} ステップで BASE`).toBeCloseTo(BASE, 6);
    r.z.step(0);
    expect(r.calls[r.calls.length - 1], 'もどりきったら ふだんに').toBeNull();
    // そのあとは 何も 呼ばない
    const n = r.calls.length;
    for (let i = 0; i < 5; i++) r.z.step(0);
    expect(r.calls.length).toBe(n);
  });

  it('よっている とちゅうで ゆっくりが おわっても、もどる とちゅうで また ゆっくりが 来ても、BASE と NEAR の あいだに おさまる', () => {
    const r = zoomRig();
    const all: number[] = [];
    const feed = (left: number, n: number) => {
      for (let i = 0; i < n; i++) {
        r.z.step(left);
        all.push(r.eff());
      }
    };
    feed(S.parrySlow.ticks, 1); // 1 ステップ だけ よって
    feed(0, 4); // もどりはじめ
    feed(S.parrySlow.ticks, Z.inSteps + 2); // また 成功
    feed(0, Z.outSteps + 2);
    for (const d of all) {
      expect(d).toBeLessThanOrEqual(BASE + 1e-9);
      expect(d).toBeGreaterThanOrEqual(NEAR - 1e-9);
    }
    expect(r.eff()).toBe(BASE);
  });

  it('ふだんの きょりが かわる（1 人 4.0・2 人 5.0）と、その 人の ふだんを もとに 同じ 割合で よる（base() を 読むたびに 使う）', () => {
    const r = zoomRig({ base: 4.0 });
    for (let i = 0; i < Z.inSteps; i++) r.z.step(S.parrySlow.ticks);
    expect(r.eff()).toBeCloseTo(4.0 * Z.mul, 6);
  });

  it('「動きを へらす」の あいだは よらない（setDistance を 数で 呼ばない）', () => {
    const r = zoomRig({ reduced: true });
    for (let i = 0; i < 10; i++) r.z.step(S.parrySlow.ticks);
    for (let i = 0; i < 20; i++) r.z.step(0);
    expect(r.calls.filter((c) => c !== null)).toEqual([]);
    expect(r.eff()).toBe(BASE);
  });
});

describe('AC100 青い ふち（duo-parry-edge-p1／-p2）の 濃さ', () => {
  it('1P の 青白い 光と 同じ 部品: parryGlowLevel と 同じ 値。glowLeft = 0 で 0（出ない）', () => {
    for (let g = 0; g <= S.parryGlowTicks; g++) expect(parryEdgeLevel(g, false, S), `glowLeft ${g}`).toBe(parryGlowLevel(g, S));
    expect(parryEdgeLevel(0, false, S)).toBe(0);
  });

  it('parryGlowTicks の はじめは 濃い 1 で、うすく なって 消える（ふえない・0〜1）。最後の 1 ステップは 0 まで うすい（出る 長さは glowLeft > 0 の parryGlowTicks ステップ）', () => {
    expect(parryEdgeLevel(S.parryGlowTicks, false, S)).toBe(1);
    let prev = Infinity;
    let shown = 0;
    for (let g = S.parryGlowTicks; g >= 1; g--) {
      const v = parryEdgeLevel(g, false, S);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      if (g >= 2) expect(v).toBeGreaterThan(0);
      prev = v;
      shown++;
    }
    expect(shown).toBe(S.parryGlowTicks);
  });

  it('「動きを へらす」なら 0（ふちは 出さない。青白い 光と 音は 別に 出る）', () => {
    for (let g = 0; g <= S.parryGlowTicks; g++) expect(parryEdgeLevel(g, true, S)).toBe(0);
  });
});

describe('AC100 2P の 人形の パリィの 絵・青白い 光（1P の step.ts と 同じ 部品）', () => {
  const view = (o: Partial<ParryStateView>): ParryStateView => ({ phase: 'idle', frame: 0, buffered: false, slowLeft: 0, timeScale: 1, glowLeft: 0, jingasa: false, ...o });

  it('idle は 絵なし・光 0。ready／guard／recover／kime は parryCellOf と 同じ コマ（陣笠の 引きのばしも）', () => {
    expect(parryDollOf(view({}), S)).toEqual({ cell: null, glow: 0 });
    for (const phase of ['ready', 'guard', 'recover', 'kime'] as const) {
      for (const jingasa of [false, true]) {
        for (const frame of [1, 2, 5, 18, 30, 45]) {
          const d = parryDollOf(view({ phase, frame, jingasa }), S);
          expect(d.cell, `${phase} F${frame} 陣笠 ${jingasa}`).toEqual(parryCellOf(phase, frame, jingasa));
        }
      }
    }
  });

  it('青白い 光は parryGlowLevel(glowLeft)。「動きを へらす」でも 光は 出る（ゆっくり・よせ・ふち だけが なくなる）', () => {
    for (let g = 0; g <= S.parryGlowTicks; g++) {
      expect(parryDollOf(view({ glowLeft: g, timeScale: 1 }), S).glow).toBe(parryGlowLevel(g, S));
    }
  });
});

describe('AC100 見せ方は 1P と 2P の 両方に つなぐ。2 人が 参加している あいだ だけ（createParryViews）', () => {
  function viewsRig(joined: boolean, o: { reduced?: boolean } = {}) {
    const state = {
      1: { slowLeft: 0, glowLeft: 0 },
      2: { slowLeft: 0, glowLeft: 0 },
    };
    const log: Record<1 | 2, Array<number | null>> = { 1: [], 2: [] };
    const cur: Record<1 | 2, number | null> = { 1: null, 2: null };
    const asked: number[] = [];
    const j = { on: joined };
    const v = createParryViews({
      joined: () => j.on,
      fxFor: (who) => {
        asked.push(who);
        return { setDistance: (d) => (log[who].push(d), (cur[who] = d)) };
      },
      baseFor: () => BASE,
      stateFor: (who) => state[who],
      reducedMotion: () => o.reduced ?? false,
      settings: S,
    });
    const eff = (who: 1 | 2): number => cur[who] ?? BASE;
    return { v, state, log, eff, asked, j };
  }

  it('1P が パリィ（ゆっくり）→ 1P の カメラだけ よる・duo-parry-edge-p1 だけ 出る（2P は ゆっくりに なる だけ）', () => {
    const r = viewsRig(true);
    r.state[1].slowLeft = S.parrySlow.ticks;
    r.state[1].glowLeft = S.parryGlowTicks;
    for (let i = 0; i < Z.inSteps; i++) r.v.step();
    expect(r.eff(1)).toBeCloseTo(BASE * Z.mul, 6);
    expect(r.eff(2)).toBe(BASE);
    expect(r.log[2].filter((d) => d !== null)).toEqual([]);
    expect(r.v.edgeShown(1)).toBe(true);
    expect(r.v.edgeShown(2)).toBe(false);
    expect(r.v.edgeLevel(1)).toBeGreaterThan(0);
    expect(r.v.edgeLevel(2)).toBe(0);
  });

  it('2P が パリィ → 2P の カメラだけ よる・duo-parry-edge-p2 だけ 出る。2 人 同時でも それぞれ 別に 数える', () => {
    const r = viewsRig(true);
    r.state[2].slowLeft = S.parrySlow.ticks;
    r.state[2].glowLeft = S.parryGlowTicks;
    for (let i = 0; i < Z.inSteps; i++) r.v.step();
    expect(r.eff(2)).toBeCloseTo(BASE * Z.mul, 6);
    expect(r.eff(1)).toBe(BASE);
    expect(r.v.edgeShown(2)).toBe(true);
    expect(r.v.edgeShown(1)).toBe(false);
    // 1P も おくれて 成功: 1P は 1P の ぶんを 数える（2P の ゆっくりが おわっても 1P は のこる）
    r.state[1].slowLeft = 3;
    r.state[1].glowLeft = S.parryGlowTicks;
    r.state[2].slowLeft = 0;
    for (let i = 0; i < Z.inSteps; i++) r.v.step();
    expect(r.eff(1)).toBeCloseTo(BASE * Z.mul, 6);
    expect(r.eff(2), '2P は もどりはじめ').toBeGreaterThan(BASE * Z.mul);
  });

  it('1 人の とき（joined が false）は ぜんぶ 出ない: fxFor も setDistance も 呼ばない・ふちは false・濃さ 0（パリィの state が あっても）', () => {
    const r = viewsRig(false);
    r.state[1].slowLeft = S.parrySlow.ticks;
    r.state[1].glowLeft = S.parryGlowTicks;
    for (let i = 0; i < 20; i++) r.v.step();
    expect(r.asked).toEqual([]);
    expect(r.v.edgeShown(1)).toBe(false);
    expect(r.v.edgeLevel(1)).toBe(0);
    expect(r.v.edgeShown(2)).toBe(false);
  });

  it('参加している あいだに やめた（joined が false に）→ 以後 出ない。「動きを へらす」は よせも ふちも なし', () => {
    const r = viewsRig(true);
    r.state[1].slowLeft = 2;
    r.state[1].glowLeft = 5;
    r.v.step();
    r.j.on = false;
    expect(r.v.edgeShown(1)).toBe(false);
    const n = r.log[1].length;
    r.v.step();
    expect(r.log[1].length).toBe(n);
    const red = viewsRig(true, { reduced: true });
    red.state[2].slowLeft = 4;
    red.state[2].glowLeft = 5;
    for (let i = 0; i < 6; i++) red.v.step();
    expect(red.log[2].filter((d) => d !== null)).toEqual([]);
    expect(red.v.edgeShown(2)).toBe(false);
    expect(red.v.edgeLevel(2)).toBe(0);
  });
});
