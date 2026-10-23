import { describe, expect, it } from 'vitest';
import type { GoldBird } from '../contracts';
import { createLiveSettings } from '../contracts';
import { createRng } from '../world/gen/random';
import { goldChance, rollGold } from './gold';

/** GOLD-1 §4.5（AC11・AC12）: 金 の たまご の 確率 は なつき度 71 以上 の ときだけ。マッチョ は 上限 の あと に 2 倍 */
const bird = (o: Partial<GoldBird> = {}): GoldBird => ({ raised: false, bugs: 0, goldMiss: 0, natsuki: 71, breed: 'normal', ...o });

describe('AC11 金の たまごの 確率', () => {
  const s = createLiveSettings();
  it('natsuki 70 以下 → 0（goldMiss 30 でも 0）', () => {
    expect(goldChance(bird({ natsuki: 70 }), s)).toBe(0);
    expect(goldChance(bird({ natsuki: 0 }), s)).toBe(0);
    expect(goldChance(bird({ natsuki: 70, goldMiss: 30 }), s)).toBe(0);
    expect(goldChance(bird({ natsuki: 70, goldMiss: 99, raised: true, bugs: 200, breed: 'macho' }), s)).toBe(0);
  });
  it('野原の子: natsuki 71・bugs 0 → 1%・40 → 3%・200 → 5%', () => {
    expect(goldChance(bird(), s)).toBeCloseTo(0.01, 10);
    expect(goldChance(bird({ bugs: 40 }), s)).toBeCloseTo(0.03, 10);
    expect(goldChance(bird({ bugs: 200 }), s)).toBeCloseTo(0.05, 10);
  });
  it('そだてた ふつう: むし 0 → 0.04、むし 80 → 0.08、むし 200 → 0.08（goldCap）', () => {
    expect(goldChance(bird({ raised: true }), s)).toBeCloseTo(0.04, 10);
    expect(goldChance(bird({ raised: true, bugs: 80 }), s)).toBeCloseTo(0.08, 10);
    expect(goldChance(bird({ raised: true, bugs: 200 }), s)).toBeCloseTo(0.08, 10);
  });
  it('マッチョ そだてた: むし 0 → 0.08、むし 80 → 0.16、むし 200 → 0.16（上限 0.08 の あと に 2 倍）', () => {
    expect(goldChance(bird({ raised: true, breed: 'macho' }), s)).toBeCloseTo(0.08, 10);
    expect(goldChance(bird({ raised: true, breed: 'macho', bugs: 80 }), s)).toBeCloseTo(0.16, 10);
    expect(goldChance(bird({ raised: true, breed: 'macho', bugs: 200 }), s)).toBeCloseTo(0.16, 10);
  });
  it('natsuki 71・goldMiss 30 → 1（ふつう・マッチョ とも。マッチョ も 30 の まま）', () => {
    expect(goldChance(bird({ goldMiss: 29 }), s)).toBeLessThan(1);
    expect(goldChance(bird({ goldMiss: 30 }), s)).toBe(1);
    expect(goldChance(bird({ goldMiss: 30, breed: 'macho', raised: true }), s)).toBe(1);
    expect(goldChance(bird({ goldMiss: 15, breed: 'macho', raised: true }), s)).toBeLessThan(1);
  });
  it('goldBaseWild 1 と goldCap 1 なら 1（natsuki 71）。goldMachoMul を 1 に すれば マッチョ も ふつう と 同じ', () => {
    const t = createLiveSettings();
    t.goldBaseWild = 1;
    t.goldCap = 1;
    expect(goldChance(bird(), t)).toBe(1);
    const u = createLiveSettings();
    u.goldMachoMul = 1;
    expect(goldChance(bird({ raised: true, breed: 'macho', bugs: 80 }), u)).toBeCloseTo(0.08, 10);
  });
  it('設定: goldMachoMul 2・natsukiGoldMin 70・goldBaseGold は 無い', () => {
    expect(s.goldMachoMul).toBe(2);
    expect(s.natsukiGoldMin).toBe(70);
    expect('goldBaseGold' in s).toBe(false);
  });
});

describe('AC12 rollGold', () => {
  const s = createLiveSettings();
  it('natsuki 70 以下 で 金 で ない たまご → goldMiss は かわらない（12 → 12）。どの とき も 乱数 を ちょうど 1 つ つかう', () => {
    let n = 0;
    const rng = () => {
      n++;
      return 0.5;
    };
    expect(rollGold(rng, bird({ natsuki: 70, goldMiss: 12 }), s)).toEqual({ gold: false, goldMiss: 12 });
    expect(n).toBe(1);
    expect(rollGold(rng, bird({ natsuki: 70, goldMiss: 30 }), s)).toEqual({ gold: false, goldMiss: 30 });
    expect(n).toBe(2);
  });
  it('71 以上 で 金 で ない → +1、金 → 0。乱数 は 1 つ', () => {
    let n = 0;
    const lo = () => {
      n++;
      return 0.999;
    };
    const hi = () => {
      n++;
      return 0;
    };
    expect(rollGold(lo, bird({ goldMiss: 5 }), s)).toEqual({ gold: false, goldMiss: 6 });
    expect(rollGold(hi, bird({ goldMiss: 5 }), s)).toEqual({ gold: true, goldMiss: 0 });
    expect(rollGold(lo, bird({ goldMiss: 30 }), s)).toEqual({ gold: true, goldMiss: 0 });
    expect(n).toBe(3);
  });
  it('同じ シードで 同じ 流れ・金 で ない たまご が 30 こ つづいたら 次は 金（71 以上 の とき だけ 数える）', () => {
    const run = (seed: number) => {
      const rng = createRng(seed);
      let miss = 0;
      const out: boolean[] = [];
      for (let i = 0; i < 400; i++) {
        const r = rollGold(rng, bird({ goldMiss: miss }), s);
        miss = r.goldMiss;
        out.push(r.gold);
      }
      return out;
    };
    expect(run(5)).toEqual(run(5));
    expect(run(5)).not.toEqual(run(6));
    for (const seed of [1, 2, 3, 4]) {
      const rng = createRng(seed);
      let miss = 0;
      let gap = 0;
      for (let i = 0; i < 2000; i++) {
        const r = rollGold(rng, bird({ goldMiss: miss }), s);
        miss = r.goldMiss;
        if (r.gold) {
          expect(gap).toBeLessThanOrEqual(30);
          gap = 0;
        } else gap++;
      }
    }
  });
});
