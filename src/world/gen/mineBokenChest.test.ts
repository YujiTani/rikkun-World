import { describe, expect, it } from 'vitest';
import { hook1c, type ChestTable, type MineHook1C, type Tier } from './mineShaftKit';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.10・受け入れ基準 E14）: 宝箱の 表 2 つ〔`kodo_eda`・`kodo_kakushi`〕。
 *
 *   ・C16 と 同じ 形〔段 4 つ・段の chance の 合計 1・`placeChance` 1〕。段 4 の 0% の 行も 表に ある。数は 表から 読む〔#311〕
 *   ・段ごとの わく・めずらしさ・レジェンダリー・ほかの くじは `kodo` の 表と 同じ〔写さない #304〕
 *   ・`rollChest(名前, seed)` の 段の わりあいが 表から ±0.015〔20,000 回〕
 * 窓口は 1C の `chestTable(name)`・`rollChest(table, seed, tier?)` のまま〔名前を 足すだけ〕。赤の 確かめ: 1E の 前は 表の 名前が 無くて 落ちる。
 */

const H: MineHook1C = hook1c(20261012);
const NAMES = ['kodo_eda', 'kodo_kakushi'] as const;
const TIERS: readonly Tier[] = [1, 2, 3, 4];
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** 表を 読む〔名前が 無い うちは「表が ない」で 落ちる〕 */
function tableOf(name: string): ChestTable {
  let t: ChestTable | undefined;
  try {
    t = H.chestTable(name);
  } catch (e) {
    throw new Error(`宝箱の 表 ${name} が まだ ない〔${(e as Error).message}〕`);
  }
  if (!t) throw new Error(`宝箱の 表 ${name} が まだ ない`);
  return t;
}

describe.each(NAMES)('E14: 宝箱の 表 %s', (name) => {
  it('段が 4 つ〔1〜4〕・段の chance の 合計 1・placeChance 1〔くじで 大当たりに なった ときは かならず 置く〕', () => {
    const t = tableOf(name);
    expect(t.tiers.map((x) => x.tier)).toEqual([1, 2, 3, 4]);
    expect(sum(t.tiers.map((x) => x.chance))).toBeCloseTo(1, 9);
    expect(t.placeChance).toBe(1);
    for (const row of t.tiers) {
      expect(row.chance, `段 ${row.tier} の chance`).toBeGreaterThanOrEqual(0);
      expect(row.chance, `段 ${row.tier} の chance`).toBeLessThanOrEqual(1);
    }
  });

  it('段ごとの わく・めずらしさ・sure と レジェンダリー・ほかの くじは `kodo` の 表と 同じ〔写さない〕', () => {
    const t = tableOf(name);
    const k = tableOf('kodo');
    expect(t.legendary).toBe(k.legendary);
    expect(t.lots).toEqual(k.lots);
    for (const row of t.tiers) {
      const base = k.tiers.find((x) => x.tier === row.tier)!;
      expect(row.slots, `段 ${row.tier} の わく`).toBe(base.slots);
      expect(row.rarity, `段 ${row.tier} の めずらしさ`).toEqual(base.rarity);
      expect(row.sure, `段 ${row.tier} の sure`).toEqual(base.sure);
    }
  });

  it('`rollChest(名前, seed)` の 段の わりあいが 表の chance から ±0.015〔20,000 回〕', () => {
    const t = tableOf(name);
    const n = 20000;
    const c = new Map<Tier, number>();
    for (let seed = 0; seed < n; seed++) {
      const r = H.rollChest(name, seed);
      c.set(r.tier, (c.get(r.tier) ?? 0) + 1);
    }
    for (const row of t.tiers) expect(Math.abs((c.get(row.tier) ?? 0) / n - row.chance), `段 ${row.tier}〔表 ${row.chance}〕`).toBeLessThanOrEqual(0.015);
  }, 180_000);

  it('中身は 段の わく〔slots〕の 数・同じ〔表, seed, 段〕は 同じ 中身', () => {
    const t = tableOf(name);
    for (const tier of TIERS) {
      const a = H.rollChest(name, 777, tier);
      expect(a.items, `段 ${tier}`).toHaveLength(t.tiers.find((x) => x.tier === tier)!.slots);
      expect(hook1c(20261012).rollChest(name, 777, tier)).toEqual(a);
    }
  });
});

describe('E14: 2 つの 表の ちがい', () => {
  it('えだ道の 表は 段 4 が 0%・かくしべやの 表は 段 4 が ある〔かくしべやの ほうが ゆたか〕', () => {
    const eda = tableOf('kodo_eda');
    const kakushi = tableOf('kodo_kakushi');
    expect(eda.tiers.find((x) => x.tier === 4)!.chance, 'えだ道の 段 4').toBe(0);
    expect(kakushi.tiers.find((x) => x.tier === 4)!.chance, 'かくしべやの 段 4').toBeGreaterThan(0);
    const hi = (t: ChestTable): number => sum(t.tiers.filter((x) => x.tier >= 3).map((x) => x.chance));
    expect(hi(kakushi), '段 3・4 の わりあい').toBeGreaterThan(hi(eda));
  });

  it('`kodo` の 表は かわらない〔いちばん 下の へや。placeChance は 1 未満〕', () => {
    const k = tableOf('kodo');
    expect(k.placeChance).toBeLessThan(1);
    expect(k.tiers.map((x) => x.tier)).toEqual([1, 2, 3, 4]);
  });
});
