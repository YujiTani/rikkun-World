import { describe, expect, it } from 'vitest';
import { createLiveSettings } from '../contracts';
import { createRng } from '../world/gen/random';
import { goldChance, rollGold } from './gold';

describe('AC15 金の たまごの 確率', () => {
  const s = createLiveSettings();
  it('野原の子: bugs 0 → 1%・40 → 3%・200 → 5%（むしの 上乗せは 4% まで）', () => {
    expect(goldChance({ raised: false, bugs: 0, goldMiss: 0 }, s)).toBeCloseTo(0.01, 10);
    expect(goldChance({ raised: false, bugs: 40, goldMiss: 0 }, s)).toBeCloseTo(0.03, 10);
    expect(goldChance({ raised: false, bugs: 200, goldMiss: 0 }, s)).toBeCloseTo(0.05, 10);
  });
  it('そだてた子: bugs 80 → 8%・200 → 8%（goldCap）', () => {
    expect(goldChance({ raised: true, bugs: 0, goldMiss: 0 }, s)).toBeCloseTo(0.04, 10);
    expect(goldChance({ raised: true, bugs: 80, goldMiss: 0 }, s)).toBeCloseTo(0.08, 10);
    expect(goldChance({ raised: true, bugs: 200, goldMiss: 0 }, s)).toBeCloseTo(0.08, 10);
  });
  it('マッチョでも 同じ 値（引数に breed は 要らない）', () => {
    const b = { raised: true, bugs: 80, goldMiss: 0, breed: 'macho' } as { raised: boolean; bugs: number; goldMiss: number };
    expect(goldChance(b, s)).toBeCloseTo(0.08, 10);
  });
  it('goldMiss 30 → 次は かならず（29 は まだ）', () => {
    expect(goldChance({ raised: false, bugs: 0, goldMiss: 29 }, s)).toBeLessThan(1);
    expect(goldChance({ raised: false, bugs: 0, goldMiss: 30 }, s)).toBe(1);
    expect(goldChance({ raised: false, bugs: 0, goldMiss: 99 }, s)).toBe(1);
  });
  it('goldBaseWild 1 と goldCap 1 なら 1', () => {
    const t = createLiveSettings();
    t.goldBaseWild = 1;
    t.goldCap = 1;
    expect(goldChance({ raised: false, bugs: 0, goldMiss: 0 }, t)).toBe(1);
  });
  it('設定に goldBaseGold が 無い', () => {
    expect('goldBaseGold' in s).toBe(false);
  });
  it('同じ シードで 同じ 流れ', () => {
    const run = (seed: number) => {
      const rng = createRng(seed);
      let miss = 0;
      const out: boolean[] = [];
      for (let i = 0; i < 400; i++) {
        const r = rollGold(rng, { raised: false, bugs: 0, goldMiss: miss }, s);
        miss = r.goldMiss;
        out.push(r.gold);
      }
      return out;
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
  });
  it('金で ない たまごが 30 こ つづいたら 次は 金（間は 30 以下）', () => {
    for (const seed of [1, 2, 3, 4]) {
      const rng = createRng(seed);
      let miss = 0;
      let gap = 0;
      for (let i = 0; i < 2000; i++) {
        const r = rollGold(rng, { raised: false, bugs: 0, goldMiss: miss }, s);
        miss = r.goldMiss;
        if (r.gold) {
          expect(gap).toBeLessThanOrEqual(30);
          gap = 0;
        } else gap++;
      }
    }
  });
  it('金が 出たら goldMiss は 0 に もどる。出なければ +1', () => {
    const rng = createRng(1);
    expect(rollGold(rng, { raised: false, bugs: 0, goldMiss: 30 }, s)).toEqual({ gold: true, goldMiss: 0 });
    const t = createLiveSettings();
    t.goldBaseWild = 0;
    t.goldPerBug = 0;
    expect(rollGold(rng, { raised: false, bugs: 0, goldMiss: 3 }, t)).toEqual({ gold: false, goldMiss: 4 });
  });
});
