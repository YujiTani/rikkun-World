import { describe, expect, it } from 'vitest';
import type { ItemId, Rarity } from '../../contracts';
import { ITEM_DEFS, itemDef } from '../../content/items/registry';
import { RARITY_ORDER, rarityTier } from '../../drops/rarityTable';
import { hook1c, type ChestRoll, type ChestTable, type Tier } from './mineShaftKit';

/**
 * MINE-1C（docs/design/MINE-1.md §4.6「中身」「くじの 箱」・受け入れ基準 C16）: 宝箱の くじ。
 *
 *   【PO 案】の 数〔段の わりあい 60／25／12／3%・わくの 数 3／4／4／5・段ごとの めずらしさ〕は テストに 写さず、窓口 `mine.chestTable('kodo')` から 読んで くらべる〔#311〕。
 *   オーナー確認①で 数を 直しても テストは かわらない。表の 形だけ 確かめる。
 *   窓口〔仕様 §6.1〕: `chestTable(name)`・`chestPool()`・`rollChest(table, seed, tier?)`。のぞく 表は `chestExcluded()`〔名前は tester の 案: { item, reason }[]〕。
 *   `rollChest` の table は 名前〔'kodo'〕か 表そのもの〔テスト用に legendary を 1 に した 表〕。
 */

const H = hook1c(20261012);
// 窓口が まだ 無い 間も 1 本ずつ 赤く なる ように、読むのは テストの 中で〔ファイルの 頭では よばない〕
let tableMemo: ChestTable | null = null;
let poolMemo: Record<Rarity, ItemId[]> | null = null;
const table = (): ChestTable => (tableMemo ??= H.chestTable('kodo'));
const pool = (): Record<Rarity, ItemId[]> => (poolMemo ??= H.chestPool());
const TIERS: readonly Tier[] = [1, 2, 3, 4];
const idx = (r: Rarity): number => RARITY_ORDER.indexOf(r);
const rarityOf = (item: ItemId): Rarity => itemDef(item)!.rarity;
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** 表の めずらしさの わりあいに、その めずらしさの 物が ない ときの「1 つ 下に 足す」を かけた 期待 */
function expected(rarity: Partial<Record<Rarity, number>>, pool: Record<Rarity, ItemId[]>): Partial<Record<Rarity, number>> {
  const out: Partial<Record<Rarity, number>> = {};
  for (const [r, p] of Object.entries(rarity) as [Rarity, number][]) {
    let k = idx(r);
    while (k > 0 && (pool[RARITY_ORDER[k]!]?.length ?? 0) === 0) k--;
    const to = RARITY_ORDER[k]!;
    out[to] = (out[to] ?? 0) + p;
  }
  return out;
}

describe('C16: 表の 形（数は 決め打ちしない）', () => {
  it('段が 4 つ〔1〜4〕・段の chance の 合計 1・段ごとに rarity の 合計 1・slots は 1 以上の 整数', () => {
    expect(table().tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4]);
    expect(sum(table().tiers.map((t) => t.chance))).toBeCloseTo(1, 9);
    for (const t of table().tiers) {
      expect(sum(Object.values(t.rarity) as number[]), `段 ${t.tier} の めずらしさの 合計`).toBeCloseTo(1, 9);
      expect(Number.isInteger(t.slots) && t.slots >= 1, `段 ${t.tier} の わく`).toBe(true);
      for (const r of Object.keys(t.rarity)) expect(RARITY_ORDER, `段 ${t.tier} の ${r}`).toContain(r);
    }
  });

  it('段が 上がるほど わくの 数は へらない・かくていの わく〔sure〕が あるのは 4 段目だけで ミラクル・ほかの 段は ミラクルを 出さない', () => {
    const slots = table().tiers.map((t) => t.slots);
    for (let i = 1; i < slots.length; i++) expect(slots[i]!).toBeGreaterThanOrEqual(slots[i - 1]!);
    expect(table().tiers.map((t) => t.sure)).toEqual([null, null, null, 'mythic']);
    for (const t of table().tiers) expect(t.rarity.mythic ?? 0, `段 ${t.tier} は ミラクルを くじで 出さない〔4 段目は かくていの わくだけ〕`).toBe(0);
    expect(table().tiers[3]!.slots, '4 段目は かくていの わくを ふくむ').toBeGreaterThanOrEqual(2);
  });

  it('レジェンダリー〔legendary〕は わくごとに 0.00001〔0.001%〕・placeChance は 0〜1・坑道の 表 kodo の「ほかの くじ」〔lots〕は 空', () => {
    expect(table().legendary).toBeCloseTo(0.00001, 9);
    expect(table().placeChance).toBeGreaterThan(0);
    expect(table().placeChance).toBeLessThan(1);
    expect(table().lots).toEqual([]);
  });
});

describe('C16: くじの 箱', () => {
  
  it('chestPool と のぞく 表を あわせると 登録表の アイテム ぜんぶ〔どの アイテムも どちらか 一方〕。のぞく 物は 登録表に あり、理由が 空でない', () => {
    const excluded = H.chestExcluded();
    const pooled = new Set(Object.values(pool()).flat());
    const all = Object.keys(ITEM_DEFS).sort();
    const ex = excluded.map((e) => e.item);
    expect(new Set(ex).size, 'のぞく 表に 同じ 物が 2 つ').toBe(ex.length);
    for (const e of excluded) {
      expect(ITEM_DEFS[e.item as keyof typeof ITEM_DEFS], `のぞく ${e.item} は 登録表に ある`).toBeDefined();
      expect(e.reason.trim().length, `のぞく ${e.item} の 理由`).toBeGreaterThan(0);
      expect(pooled.has(e.item), `のぞく ${e.item} が くじの 箱にも ある`).toBe(false);
    }
    const flat = Object.values(pool()).flat();
    expect(new Set(flat).size, 'くじの 箱に 同じ 物が 2 つ').toBe(flat.length);
    expect([...flat, ...ex].sort()).toEqual(all);
  });

  it('のぞくのは ようかいだま〔yokai_orb〕・やぶれた おまもり〔omamori_torn〕を ふくむ。アイテムに ならない ブロック〔こうどうの わく・たからばこ・チョークの しるし〕は 登録表に 無いので 入らない', () => {
    const excluded = H.chestExcluded();
    const pooled = new Set(Object.values(pool()).flat());
    const ex = excluded.map((e) => e.item as string);
    expect(ex).toContain('yokai_orb');
    expect(ex).toContain('omamori_torn');
    for (const id of ['kodo_waku', 'takarabako_1', 'takarabako_1_open', 'chalk_mark_up_n']) expect(pooled.has(id as ItemId), id).toBe(false);
  });

  it('めずらしさごとの 箱: 箱の 物は その めずらしさ〔登録表の rarity〕・7 段 ぜんぶの 箱が ある〔空の 段が あっても よい〕・ミラクルと レジェンダリーに 物が ある', () => {
    expect(Object.keys(pool()).sort()).toEqual([...RARITY_ORDER].sort());
    for (const r of RARITY_ORDER) for (const item of pool()[r]) expect(rarityOf(item), `${item} の 箱`).toBe(r);
    expect(pool().mythic.length, 'ミラクルの 箱〔ダイヤ・こんごうの そうび〕').toBeGreaterThan(0);
    expect(pool().legendary.length, 'レジェンダリーの 箱').toBeGreaterThan(0);
  });
});

describe('C16: くじを 引く', () => {
  it('段の わりあい: rollChest("kodo", seed) を 20,000 回 → 表の chance から ±0.015', () => {
    const n = 20000;
    const c = new Map<Tier, number>();
    for (let seed = 0; seed < n; seed++) {
      const t = H.rollChest('kodo', seed).tier;
      c.set(t, (c.get(t) ?? 0) + 1);
    }
    for (const t of table().tiers) expect(Math.abs((c.get(t.tier) ?? 0) / n - t.chance), `段 ${t.tier}（表 ${t.chance}）`).toBeLessThanOrEqual(0.015);
  }, 60_000);

  it.each(TIERS)('段 %i: 5,000 回 → わくの 数が slots・わくごとの めずらしさの わりあいが 表の rarity から ±0.03〔物が 無い めずらしさは 1 つ 下に 足して くらべる〕・sure の 段は どの 回も その めずらしさが 1 つ 以上', (tier) => {
    const row = table().tiers.find((t) => t.tier === tier)!;
    const plain = expected(row.rarity, pool());
    const sureAt = row.sure ? expected({ [row.sure]: 1 }, pool()) : null;
    const sureRarity = sureAt ? (Object.keys(sureAt)[0] as Rarity) : null;
    const n = 5000;
    const got: Partial<Record<Rarity, number>> = {};
    let slots = 0;
    for (let seed = 0; seed < n; seed++) {
      const r = H.rollChest('kodo', seed, tier);
      expect(r.tier).toBe(tier);
      expect(r.items, `seed ${seed} の わく`).toHaveLength(row.slots);
      const rs = r.items.map((i) => rarityOf(i.item));
      let rest = rs;
      if (sureRarity) {
        const at = rs.findIndex((x) => x === sureRarity);
        expect(at, `seed ${seed}: ${sureRarity} が 1 つ 以上`).toBeGreaterThanOrEqual(0);
        rest = rs.filter((_, k) => k !== at);
      }
      for (const x of rest) {
        got[x] = (got[x] ?? 0) + 1;
        slots++;
      }
    }
    // レジェンダリーの くじ〔0.001%〕は 数に ほぼ 影響しない
    const bad: string[] = [];
    for (const r of RARITY_ORDER) {
      if (r === 'legendary') continue;
      const want = plain[r] ?? 0;
      const have = (got[r] ?? 0) / slots;
      if (Math.abs(have - want) > 0.03) bad.push(`${r}: ${have.toFixed(3)}（表 ${want.toFixed(3)}）`);
    }
    expect(bad, `段 ${tier}`).toEqual([]);
  }, 60_000);

  it('中身は くじの 箱の 物だけ・数は 重ねられる 物は 1〜その めずらしさの dropMax・重ねられない 物〔道具・そうび〕は 1。同じ 物が 2 つの わくに 出ても よい', () => {
    const pooled = new Set(Object.values(pool()).flat());
    for (let seed = 0; seed < 3000; seed++) {
      const r = H.rollChest('kodo', seed);
      for (const it of r.items) {
        expect(pooled.has(it.item), `${it.item} は くじの 箱の 物`).toBe(true);
        const def = itemDef(it.item)!;
        const cap = def.maxStack > 1 ? rarityTier(def.rarity).dropMax : 1;
        expect(it.count, `${it.item} の 数`).toBeGreaterThanOrEqual(1);
        expect(it.count, `${it.item}（${def.rarity}）の 数`).toBeLessThanOrEqual(cap);
        if (def.maxStack === 1) expect(it.count).toBe(1);
      }
    }
  }, 60_000);

  it('同じ (表, seed, 段) は いつも 同じ 中身・べつの seed で 中身が かわる', () => {
    const a = H.rollChest('kodo', 12345, 3);
    const b = hook1c(20261012).rollChest('kodo', 12345, 3);
    expect(b).toEqual(a);
    expect(H.rollChest('kodo', 12345)).toEqual(H.rollChest('kodo', 12345));
    const distinct = new Set<string>();
    for (let s = 0; s < 50; s++) distinct.add(JSON.stringify(H.rollChest('kodo', s, 2)));
    expect(distinct.size).toBeGreaterThan(30);
  });

  it('テスト用に legendary を 1 に した 表では、sure いがいの わくが ぜんぶ レジェンダリー〔sure の わくは ミラクルの まま〕', () => {
    const test: ChestTable = { ...table(), legendary: 1 };
    for (const tier of TIERS) {
      const row = table().tiers.find((t) => t.tier === tier)!;
      for (let seed = 0; seed < 40; seed++) {
        const r: ChestRoll = H.rollChest(test, seed, tier);
        const rs = r.items.map((i) => rarityOf(i.item));
        expect(rs, `段 ${tier} seed ${seed}`).toHaveLength(row.slots);
        const legendary = rs.filter((x) => x === 'legendary').length;
        expect(legendary, `段 ${tier} seed ${seed} の レジェンダリー`).toBe(row.sure ? row.slots - 1 : row.slots);
        if (row.sure) expect(rs.filter((x) => idx(x) === idx('mythic')).length, `段 ${tier}: ミラクル 1 つ`).toBe(1);
      }
    }
  });

  it('レジェンダリー 0 の 表では レジェンダリーは 出ない', () => {
    const test: ChestTable = { ...table(), legendary: 0 };
    for (let seed = 0; seed < 600; seed++) for (const it of H.rollChest(test, seed).items) expect(rarityOf(it.item)).not.toBe('legendary');
  });
});
