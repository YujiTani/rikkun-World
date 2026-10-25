import { describe, expect, it } from 'vitest';
import { createW2Settings, type BladeShapeInfo, type BladeTech, type ItemId, type Vec3 } from '../contracts';
import { makeHitSources, type WireRefs } from './gashaBigHitWire';

const S = createW2Settings();
const shape: BladeShapeInfo = { kind: 'capsule', from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 1 }, radius: 0.5 };

function refs(over: Partial<WireRefs> = {}): WireRefs {
  return {
    blade: { shape: () => shape, state: () => ({ item: 'katana' as ItemId, tech: 'kesa' as BladeTech, frame: 3, combo: { step: 2 } }) },
    waves: () => [],
    legend: { peekEvents: () => [], dome: () => null },
    held: () => ({ item: 'raijin_ken' as ItemId, power: null }),
    settings: S,
    weaponDamage: () => 4,
    yokai: () => null,
    ...over,
  };
}

describe('gashaBigHitWire（#293 本物の 武器の しくみに つなぐ）', () => {
  it('刀: ダメージ = 武器の 強さ × わざの 倍率（BladeSystem と おなじ 式）。当たりの コマ以外は null', () => {
    const src = makeHitSources(refs());
    const b = src.blade!()!;
    expect(b.damage).toBe(Math.round(4 * S.bladeDamageMul.kesa * 100) / 100);
    expect(b.swing).toBe('kesa:2');
    expect(b.frame).toBe(3);
    expect(makeHitSources(refs({ blade: { shape: () => null, state: () => ({ item: null, tech: null, frame: 0 }) } })).blade!()).toBeNull();
    expect(makeHitSources(refs({ blade: { shape: () => shape, state: () => ({ item: 'katana' as ItemId, tech: null, frame: 1 }) } })).blade!()).toBeNull();
  });

  it('波: 飛んで いる 波の 半径・ダメージを そのまま 渡す', () => {
    const w = { id: 3, position: { x: 1, y: 2, z: 3 }, radius: 0.5, damage: 1.8, kind: 'wave' };
    const out = makeHitSources(refs({ waves: () => [w] })).waves!();
    expect(out).toEqual([{ id: 3, position: { x: 1, y: 2, z: 3 }, radius: 0.5, damage: 1.8 }]);
  });

  it('雷: はじめに ある 古い 出来事は 読みとばし、そのあとの 新しい lightningStrike だけ 1 回ずつ 渡す', () => {
    const evs: { type: string; tick: number; S?: Vec3 }[] = [{ type: 'lightningStrike', tick: 5, S: { x: 9, y: 9, z: 9 } }];
    const src = makeHitSources(refs({ legend: { peekEvents: () => evs, dome: () => null } }));
    expect(src.strikes!()).toEqual([]); // 古い
    expect(src.strikes!()).toEqual([]);
    evs.push({ type: 'lightningStrike', tick: 9, S: { x: 1, y: 2, z: 3 } });
    const got = src.strikes!();
    expect(got).toHaveLength(1);
    expect(got[0]!.center).toEqual({ x: 1, y: 2, z: 3 });
    const L = S.legendary.find((d) => d.item === 'raijin_ken')!.charge!;
    expect(L.kind).toBe('lightning');
    if (L.kind === 'lightning') {
      expect(got[0]!.radius).toBe(L.radius);
      expect(got[0]!.damage).toBe(Math.round(8 * L.damageMul * 100) / 100); // 強さ 8 × 倍率
    }
    expect(src.strikes!()).toEqual([]); // 2 回目は 空
  });

  it('ドーム: 虹を 持って いて 球が ある ときだけ。間かくは ためわざの 数', () => {
    const d = { x: 1, y: 2, z: 3, r: 7 };
    const none = makeHitSources(refs({ legend: { peekEvents: () => [], dome: () => d } }));
    expect(none.dome!()).toBeNull(); // 雷神剣を 持って いる ので ドームは なし
    const src = makeHitSources(refs({ held: () => ({ item: 'niji' as ItemId, power: 6 }), legend: { peekEvents: () => [], dome: () => d } }));
    const got = src.dome!()!;
    expect(got.center).toEqual({ x: 1, y: 2, z: 3 });
    expect(got.radius).toBe(7);
    expect(got.everySteps).toBe(60);
    expect(got.damage).toBe(15); // 強さ 6 × 2.5
    expect(makeHitSources(refs({ held: () => ({ item: 'niji' as ItemId, power: 6 }) })).dome!()).toBeNull(); // 球が ない
  });
});
