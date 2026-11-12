import { describe, expect, it } from 'vitest';
import { createW2Settings, type ItemId } from '../contracts';
import { jumpHeightWith } from '../content/items/gadgetTuning';
import { legendMoveMulOf } from '../legend/defs';
import { createPlayerSettings } from '../player/config';
import { createBuffModel, buffsOf, buffsOfHeld } from './buffIconsModel';

/** WEAPON-8 AC11・AC21: 速さバフの アイコンの 出る・消える（ぽん・うすく なる・「動きを減らす」） */
const FUJIN = 'fujin_ken' as ItemId;
const on = [{ id: 'speed' as const, item: FUJIN, mul: 1.2 }];

describe('AC11: 出る・消える', () => {
  it('えらんだ ステップから shown true・mul 1.2。ほかを えらぶと 次の ステップで shown false・8 ステップ 後に 0', () => {
    const m = createBuffModel();
    const r = m.step(on, false);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'speed', item: FUJIN, mul: 1.2, shown: true });
    for (let i = 0; i < 20; i++) expect(m.step(on, false)[0]!.shown).toBe(true);
    const seen: number[] = [];
    for (let i = 0; i <= 9; i++) seen.push(m.step([], false).length);
    expect(m.step([], false)).toHaveLength(0);
    expect(seen[0]).toBe(1);
    expect(m.list()).toHaveLength(0);
    expect(seen.indexOf(0)).toBeLessThanOrEqual(8);
  });
  it('消え始めの ステップから shown false', () => {
    const m = createBuffModel();
    m.step(on, false);
    expect(m.step([], false)[0]!.shown).toBe(false);
  });
  it('0 ステップ目は 手に 持つ 物が mul 1 以下 なら 出ない', () => {
    expect(createBuffModel().step([], false)).toHaveLength(0);
  });
});

describe('AC21: 出かた', () => {
  it('ふつうは 出た ステップ scale 0.6 → 12 ステップ目で 1.0・その間 へらない', () => {
    const m = createBuffModel();
    const s: number[] = [];
    for (let i = 0; i < 20; i++) s.push(m.step(on, false)[0]!.scale);
    expect(s[0]).toBeCloseTo(0.6, 2);
    expect(s[12]).toBeCloseTo(1.0, 5);
    for (let i = 1; i < s.length; i++) expect(s[i]!).toBeGreaterThanOrEqual(s[i - 1]!);
    expect(s[19]).toBe(1);
  });
  it('消える ときは opacity が 1 → 0 へ 8 ステップで（へる だけ）', () => {
    const m = createBuffModel();
    for (let i = 0; i < 15; i++) m.step(on, false);
    const o: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = m.step([], false);
      if (r.length) o.push(r[0]!.opacity);
    }
    expect(o[0]).toBe(1);
    for (let i = 1; i < o.length; i++) expect(o[i]!).toBeLessThan(o[i - 1]!);
    expect(o[o.length - 1]!).toBeGreaterThanOrEqual(0);
    expect(m.step([], false)).toHaveLength(0);
  });
  it('「動きを減らす」: 出た ステップから scale 1.0・消える ステップの 次に 0', () => {
    const m = createBuffModel();
    expect(m.step(on, true)[0]).toMatchObject({ scale: 1, opacity: 1 });
    expect(m.step([], true)[0]!.shown).toBe(false);
    expect(m.step([], true)).toHaveLength(0);
  });
  it('消えかけで また 持つと もう一度 ぽんと 出る', () => {
    const m = createBuffModel();
    for (let i = 0; i < 15; i++) m.step(on, false);
    m.step([], false);
    const r = m.step(on, false)[0]!;
    expect(r.shown).toBe(true);
    expect(r.scale).toBeCloseTo(0.6, 2);
    expect(r.opacity).toBe(1);
  });
});

describe('buffsOfHeld: passive の moveMul > 1 の 間だけ', () => {
  const mul = (item: string | null) => (item === 'fujin_ken' ? 1.2 : 1);
  it('風神剣だけ', () => {
    expect(buffsOfHeld(FUJIN, mul)).toEqual(on);
    expect(buffsOfHeld('katana' as ItemId, mul)).toEqual([]);
    expect(buffsOfHeld(null, mul)).toEqual([]);
  });
});

/** LEGEND-4 K8（§3.4・§4.3-6）: ジャンプ力アップ（jumpUp）。黒龍 = speed・jumpUp の 順。わらじ = jumpUp 1.2。黒龍 ＋ わらじ = jumpUp 1 つ（2.0） */
describe('K8: buffsOf（手に 持つ 物 ＋ 足の そうび）', () => {
  const S = createW2Settings();
  const base = createPlayerSettings().jumpHeight;
  const src = { moveMul: (i: ItemId | null) => legendMoveMulOf(S, i), jumpMul: (h: ItemId | null, l: ItemId | null) => jumpHeightWith(l, base, h) / base };
  it('黒龍を えらぶと speed（1.2）と jumpUp（2.0）の 2 つ、この 順', () => {
    const rows = buffsOf('kokuryu', null, src);
    expect(rows.map((r) => r.id)).toEqual(['speed', 'jumpUp']);
    expect(rows[0]!.mul).toBeCloseTo(1.2, 9);
    expect(rows[1]!.mul).toBeCloseTo(2.0, 9);
  });
  it('わらじだけ はく → jumpUp（1.5 ÷ 1.25 = 1.2）1 つ', () => {
    const rows = buffsOf(null, 'waraji' as ItemId, src);
    expect(rows.map((r) => r.id)).toEqual(['jumpUp']);
    expect(rows[0]!.mul).toBeCloseTo(1.2, 9);
  });
  it('黒龍 ＋ わらじ → jumpUp は 1 つ（大きい ほう 2.0）', () => {
    const rows = buffsOf('kokuryu', 'waraji' as ItemId, src);
    expect(rows.map((r) => r.id)).toEqual(['speed', 'jumpUp']);
    expect(rows[1]!.mul).toBeCloseTo(2.0, 9);
  });
  it('ほかの 物・何も なし → 空。風神剣は speed だけ', () => {
    expect(buffsOf('katana' as ItemId, null, src)).toEqual([]);
    expect(buffsOf(null, null, src)).toEqual([]);
    expect(buffsOf(FUJIN, null, src).map((r) => r.id)).toEqual(['speed']);
  });
  it('出る・消える 動きは id ごと（AC21 と 同じ）。黒龍を 外すと speed だけ 消え始め、わらじの jumpUp は のこる', () => {
    const m = createBuffModel();
    for (let i = 0; i < 15; i++) m.step(buffsOf('kokuryu', 'waraji' as ItemId, src), false);
    const r = m.step(buffsOf(null, 'waraji' as ItemId, src), false);
    expect(r.find((x) => x.id === 'speed')!.shown).toBe(false);
    expect(r.find((x) => x.id === 'jumpUp')!.shown).toBe(true);
    expect(r.find((x) => x.id === 'jumpUp')!.mul).toBeCloseTo(1.2, 9);
    for (let i = 0; i < 9; i++) m.step(buffsOf(null, 'waraji' as ItemId, src), false);
    expect(m.list().map((x) => x.id)).toEqual(['jumpUp']);
  });
});
