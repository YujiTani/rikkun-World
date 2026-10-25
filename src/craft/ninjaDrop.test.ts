import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { createRng, type Rng } from '../world/gen/random';
import { RELEASE } from '../gasha/releaseTuning';
import { rewardRng, rollReward } from '../gasha/reward';
import { NINJA_GEAR } from './config';
import { NinjaBook } from './NinjaBook';
import { NINJA_TUNING } from './ninjaTuning';
import { ninjaChestHit, pickNinjaGear, rollNinjaChest } from './ninjaDrop';

/**
 * NINJA-1（#299）AC14〜AC17: 手に 入れ方（がしゃどくろ・宝箱）と 忍者帳。実装の 前の テスト（赤）。
 * 窓口 の 形:
 *   ninjaDrop.ts   pickNinjaGear(rng, book, have) → ItemId | null / ninjaChestHit(rng, chance?) → boolean（乱数 ちょうど 1 つ）/ rollNinjaChest(rng, book, have, chance?) → ItemId | null
 *   NinjaBook.ts   忍者帳（LegendBook と 同じ 形）add(item) → { first, kinds } | null / got() / serialize() / deserialize(data, held?)
 *   reward.ts      rollReward(rng, tune?, ninja?: { book, have }) — 忍者装備 1 つ ＋ レア素材
 *   book = 帳（手に 入れた ことの ある 物）、have = いま 持って いる 物（もちもの・防具の マス・手に もった 物）
 */
const ALL = Object.values(NINJA_GEAR) as ItemId[];
const isNinja = (i: ItemId) => ALL.includes(i);
const ninjaIn = (stacks: { item: ItemId; count: number }[]) => stacks.filter((s) => isNinja(s.item));

describe('AC14 手に 入れ方（がしゃどくろ）', () => {
  it('調整表の ごほうび（guaranteed）には 忍者装備の 行を 置かない（くじに おきかえた）', () => {
    for (const g of RELEASE.reward.guaranteed) expect(isNinja(g.item), g.item).toBe(false);
  });
  it('帳が 空 → 4 つの どれか 1 つ（1 個）。シードが かわると ばらける', () => {
    const seen = new Set<ItemId>();
    for (let i = 0; i < 200; i++) {
      const n = ninjaIn(rollReward(createRng(i), RELEASE.reward, { book: [], have: [] }));
      expect(n).toHaveLength(1);
      expect(n[0]!.count).toBe(1);
      seen.add(n[0]!.item);
    }
    expect([...seen].sort()).toEqual([...ALL].sort());
  });
  it('毎回 帳に 足して 4 回 → 4 つが 1 こずつ（同じ 物 なし）', () => {
    for (let s = 0; s < 30; s++) {
      const book: ItemId[] = [];
      const rng = createRng(1000 + s);
      for (let k = 0; k < 4; k++) {
        const n = ninjaIn(rollReward(rng, RELEASE.reward, { book: [...book], have: [] }));
        expect(n, `${s}-${k}`).toHaveLength(1);
        expect(book, `${s}-${k}`).not.toContain(n[0]!.item);
        book.push(n[0]!.item);
      }
      expect([...book].sort()).toEqual([...ALL].sort());
    }
  });
  it('帳に 3 つ → のこりの 1 つ', () => {
    for (const rest of ALL) {
      const book = ALL.filter((x) => x !== rest);
      for (let i = 0; i < 10; i++) expect(ninjaIn(rollReward(createRng(i), RELEASE.reward, { book, have: [] })).map((x) => x.item)).toEqual([rest]);
    }
  });
  it('同じ シード → 同じ 結果。いつも 同じ 順には ならない（シードで かわる）', () => {
    expect(rollReward(rewardRng(9, 3), RELEASE.reward, { book: [], have: [] })).toEqual(rollReward(rewardRng(9, 3), RELEASE.reward, { book: [], have: [] }));
    const firsts = new Set<ItemId>();
    for (let i = 0; i < 50; i++) firsts.add(pickNinjaGear(createRng(i), [], [])!);
    expect(firsts.size).toBeGreaterThan(1);
  });
  it('レア素材の 行は 今のまま（表の 行ごとに 最小〜最大）', () => {
    for (let i = 0; i < 100; i++) {
      const stacks = rollReward(createRng(i), RELEASE.reward, { book: [], have: [] });
      for (const row of RELEASE.reward.rare) {
        const s = stacks.find((x) => x.item === row.item)!;
        expect(s.count).toBeGreaterThanOrEqual(row.min);
        expect(s.count).toBeLessThanOrEqual(row.max);
      }
    }
  });
  it('ctx を 省いた rollReward は 帳が 空として 1 つ 出す', () => {
    expect(ninjaIn(rollReward(createRng(5)))).toHaveLength(1);
  });
});

describe('AC15 5 回目から（持って いない 物を とりもどせる）', () => {
  it('帳 4 つ で もちもの に 3 つ（手甲が 無い）→ 手甲', () => {
    const have = ALL.filter((x) => x !== 'ninja_tekko');
    for (let i = 0; i < 20; i++) expect(ninjaIn(rollReward(createRng(i), RELEASE.reward, { book: ALL, have })).map((x) => x.item)).toEqual(['ninja_tekko']);
  });
  it('4 つとも もちもの・防具の マスに ある → 忍者装備 なし（レア素材 だけ）', () => {
    for (let i = 0; i < 20; i++) {
      const stacks = rollReward(createRng(i), RELEASE.reward, { book: ALL, have: ALL });
      expect(ninjaIn(stacks)).toEqual([]);
      for (const row of RELEASE.reward.rare) expect(stacks.some((s) => s.item === row.item)).toBe(true);
    }
  });
  it('持って いない 物が 2 つ以上 → その 中から 1 つ', () => {
    const have: ItemId[] = ['ninja_zukin', 'ninja_shozoku'];
    const seen = new Set<ItemId>();
    for (let i = 0; i < 50; i++) seen.add(pickNinjaGear(createRng(i), ALL, have)!);
    expect([...seen].sort()).toEqual(['ninja_tabi', 'ninja_tekko']);
  });
});

describe('AC16 宝箱の くじ', () => {
  it('ninjaChestChance は 0.003 で 調整表に ある', () => {
    expect(NINJA_TUNING.ninjaChestChance).toBe(0.003);
  });
  it('くじは 乱数を ちょうど 1 つ 使う（はずれ）', () => {
    let n = 0;
    const rng: Rng = () => (n++, 0.5);
    expect(ninjaChestHit(rng)).toBe(false);
    expect(n).toBe(1);
    n = 0;
    expect(rollNinjaChest(rng, [], [], 0)).toBeNull();
    expect(n).toBe(1);
  });
  it('当たりの 境目は chance（0.0029 → 当たり、0.003 → はずれ）', () => {
    expect(ninjaChestHit(() => 0.0029)).toBe(true);
    expect(ninjaChestHit(() => 0.003)).toBe(false);
  });
  it('chance 1 → まだの 物から 1 つ、0 → 出ない', () => {
    for (let i = 0; i < 20; i++) {
      const got = rollNinjaChest(createRng(i), ['ninja_zukin', 'ninja_tabi'], [], 1);
      expect(['ninja_shozoku', 'ninja_tekko']).toContain(got);
      expect(rollNinjaChest(createRng(i), [], [], 0)).toBeNull();
    }
  });
  it('4 つ 手に 入れた あとは 持って いない 物から（ぜんぶ 持って いれば 出ない）', () => {
    expect(rollNinjaChest(createRng(1), ALL, ALL, 1)).toBeNull();
    expect(rollNinjaChest(createRng(1), ALL, ALL.filter((x) => x !== 'ninja_tabi'), 1)).toBe('ninja_tabi');
  });
});

describe('AC17 忍者帳の 保存', () => {
  it('2 つ 入れて セーブ → 読むと 同じ。入れ方: 初めての 物か・しゅるいの 数', () => {
    const b = new NinjaBook();
    expect(b.add('katana' as ItemId)).toBeNull();
    expect(b.add('ninja_tekko')).toEqual({ first: true, kinds: 1 });
    expect(b.add('ninja_tekko')).toEqual({ first: false, kinds: 1 });
    expect(b.add('ninja_zukin')).toEqual({ first: true, kinds: 2 });
    const c = new NinjaBook();
    c.deserialize(JSON.parse(JSON.stringify(b.serialize())));
    expect(c.got().sort()).toEqual(['ninja_tekko', 'ninja_zukin']);
  });
  it('前の 保存（帳なし・こわれた）→ 空', () => {
    for (const bad of [undefined, null, 5, 'x', {}, { got: 3 }, { got: [1, null] }]) {
      const d = new NinjaBook();
      d.add('ninja_zukin');
      d.deserialize(bad);
      expect(d.got(), String(bad)).toEqual([]);
    }
  });
  it('こわれても 消えない（remove は ない）・got() は コピー', () => {
    const b = new NinjaBook();
    b.add('ninja_tabi');
    b.got().push('ninja_zukin');
    expect(b.got()).toEqual(['ninja_tabi']);
  });
  it('帳なしの 保存で 防具の マスに ninja_tabi → 読んだ あと 帳に ninja_tabi、つぎの がしゃどくろで 足袋は 出ない', () => {
    const b = new NinjaBook();
    b.deserialize(undefined, ['ninja_tabi']);
    expect(b.got()).toEqual(['ninja_tabi']);
    for (let i = 0; i < 60; i++) {
      const n = ninjaIn(rollReward(createRng(i), RELEASE.reward, { book: b.got(), have: ['ninja_tabi'] }));
      expect(n).toHaveLength(1);
      expect(n[0]!.item).not.toBe('ninja_tabi');
    }
  });
  it('読みこんだ とき もちもの・防具の マスに ある 忍者装備は 帳に 入る（忍者装備でない 物は 入らない）', () => {
    const b = new NinjaBook();
    b.deserialize({ got: ['ninja_zukin'] }, ['ninja_tabi', 'katana' as ItemId]);
    expect(b.got().sort()).toEqual(['ninja_tabi', 'ninja_zukin']);
  });
});
