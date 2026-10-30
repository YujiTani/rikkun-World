import { describe, expect, it } from 'vitest';
import type { CraftEvent, DigEvent } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { findUnrubiedKanji } from '../ui/text';
import { AchievementSystem } from './AchievementSystem';
import { ACHIEVEMENT_DEFS, BAKE_RECIPE_NAMES, CATEGORY_ORDER, CRAFT_RECIPE_NAMES } from './defs';

/**
 * MINE-1B（docs/design/MINE-1.md §4.10・受け入れ基準 B8・B15 の 実績）: 新しい 鉱物の 実績。
 *
 *   「はじめての とき 1 回 出る・2 回目は 出ない」。件数は 数えない〔#311〕。実績の id は 決まって いない ので、文（名前）で 探す。
 *   ・はじめて せっかいせき／ほたるいし／きんの いし を ほった！ … 小   〔ほった ＝ ブロックを こわした 出来事〕
 *   ・はじめて ダイヤ を てにいれた！ … 中   〔今の「はじめて 〇〇 を てにいれた！」の 表に 足す。ひろった 出来事。宝箱から でも〕
 *   ・はじめて チョーク／しっくい を つくった！ … 小   〔バケツ・むしとりあみ と 同じく「つくれる もの を ぜんぶ つくった！」の 数には 入れない〕
 *   ・はじめて いしばい を やいた！ … 小   〔今の「はじめて 〇〇 を やいた！」の 表に 足す〕
 *   ・いしばい で はじめて やさい が みのった！ … 小   〔いしばいを まく 出来事から。通しは src/dig/ishibai.test.ts〕
 *   ・実績の 分けは 今の 分けの どこか（新しい 分けは 作らない）
 */

interface Row {
  name: string;
  small: boolean;
  /** 起こす 出来事。null ＝ 農業の 出来事〔src/dig/ishibai.test.ts の 通しで 起こす〕 */
  feed: ((s: AchievementSystem) => void) | null;
}

const dig = (s: AchievementSystem, id: string): void => s.feedDig([{ type: 'break', tick: 0, block: { x: 1, y: 2, z: 3 }, id, gotItem: true, count: 1 }] as unknown as DigEvent[]);
const pickup = (s: AchievementSystem, item: string, count = 1): void => s.feedCraft([{ type: 'pickup', tick: 0, item, count }] as unknown as CraftEvent[]);
const craft = (s: AchievementSystem, recipe: string, count: number): void => s.feedCraft([{ type: 'craft', tick: 0, recipe, item: recipe, count }] as unknown as CraftEvent[]);
const bake = (s: AchievementSystem, recipe: string, count: number): void =>
  s.feedCraft([{ type: 'bakeDone', tick: 0, recipe, item: recipe, count, position: { x: 1, y: 2, z: 3 } }] as unknown as CraftEvent[]);

/** §4.10 の 1B の 行（文は 仕様の とおり） */
const ROWS: readonly Row[] = [
  { name: 'はじめて せっかいせき を ほった！', small: true, feed: (s) => dig(s, 'sekkaiseki') },
  { name: 'はじめて ほたるいし を ほった！', small: true, feed: (s) => dig(s, 'hotaruishi') },
  { name: 'はじめて きんの いし を ほった！', small: true, feed: (s) => dig(s, 'kin_ore') },
  { name: 'はじめて ダイヤ を てにいれた！', small: false, feed: (s) => pickup(s, 'diamond') },
  { name: 'はじめて チョーク を つくった！', small: true, feed: (s) => craft(s, 'chalk', 4) },
  { name: 'はじめて しっくい を つくった！', small: true, feed: (s) => craft(s, 'shikkui', 2) },
  { name: 'はじめて いしばい を やいた！', small: true, feed: (s) => bake(s, 'ishibai', 2) },
  { name: 'いしばい で はじめて やさい が みのった！', small: true, feed: null },
];

const mk = (): AchievementSystem => {
  const settings = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 };
  return new AchievementSystem(() => settings);
};
const defsNamed = (name: string) => ACHIEVEMENT_DEFS.filter((d) => d.name === name);

describe('B8: 実績の 行（文・大きさ・分け）', () => {
  it('§4.10 の 1B の 行が それぞれ 1 つずつ ある（文は 仕様の とおり）', () => {
    for (const r of ROWS) expect(defsNamed(r.name), r.name).toHaveLength(1);
  });

  it('大きさ: ダイヤだけ 中〔小でない〕・ほかは 小。分けは 今の 分けの どこか', () => {
    for (const r of ROWS) {
      const d = defsNamed(r.name)[0];
      expect(d, r.name).toBeDefined();
      expect(Boolean(d!.small), `${r.name} が 小`).toBe(r.small);
      expect(CATEGORY_ORDER, `${r.name} の 分け`).toContain(d!.category);
    }
  });

  it('名前に ルビなしの 漢字が ない', () => {
    for (const r of ROWS) expect(findUnrubiedKanji(r.name), r.name).toEqual([]);
  });

  it('同じ 文の 実績が 2 つ ない（id が かさならない）', () => {
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('B8: はじめての とき 1 回 出る・2 回目は 出ない', () => {
  for (const r of ROWS.filter((x) => x.feed !== null)) {
    it(`${r.name}`, () => {
      const id = defsNamed(r.name)[0]?.id;
      expect(id, '実績の 行').toBeDefined();
      const s = mk();
      const got: string[] = [];
      s.onUnlock((d) => got.push(d.id));
      expect(s.isUnlocked(id!)).toBe(false);
      r.feed!(s);
      expect(s.isUnlocked(id!), '1 回目で 出る').toBe(true);
      expect(got.filter((x) => x === id)).toHaveLength(1);
      r.feed!(s);
      r.feed!(s);
      expect(got.filter((x) => x === id), '2 回目からは 出ない').toHaveLength(1);
    });
  }

  it('ほかの 物では 出ない（せっかいせきを ほっても ほたるいし・きんの いしは 出ない。せきたん・てつを ほっても 出ない）', () => {
    const names = ROWS.filter((x) => x.feed !== null).map((x) => x.name);
    const ids = names.map((n) => defsNamed(n)[0]!.id);
    const s = mk();
    dig(s, 'sekkaiseki');
    expect(s.isUnlocked(ids[0]!)).toBe(true);
    for (const id of ids.slice(1)) expect(s.isUnlocked(id), id).toBe(false);
    const t = mk();
    dig(t, 'coal_ore');
    dig(t, 'iron_ore');
    dig(t, 'stone');
    pickup(t, 'iron_ingot');
    pickup(t, 'crystal');
    craft(t, 'torch', 4);
    bake(t, 'kawara', 2);
    for (const id of ids) expect(t.isUnlocked(id), id).toBe(false);
  });

  it('ダイヤは「ひろった」で 出る〔宝箱から でも ほって でも 同じ〕。ダイヤの いし〔ブロック〕を ほるだけでは 出ない', () => {
    const id = defsNamed('はじめて ダイヤ を てにいれた！')[0]!.id;
    const a = mk();
    dig(a, 'diamond_ore');
    expect(a.isUnlocked(id)).toBe(false);
    pickup(a, 'diamond');
    expect(a.isUnlocked(id)).toBe(true);
  });
});

describe('B8: 「つくれる もの を ぜんぶ つくった！」の 数には 入れない', () => {
  it('チョーク・しっくいは その 表〔CRAFT_RECIPE_NAMES〕に 入らず、数え上げも ふやさない', () => {
    const names = CRAFT_RECIPE_NAMES.map(([id]) => id);
    expect(names).not.toContain('chalk');
    expect(names).not.toContain('shikkui');
    const everything = ACHIEVEMENT_DEFS.find((d) => d.series === 'craft.everything');
    expect(everything?.goal).toBe(CRAFT_RECIPE_NAMES.length);
    const s = mk();
    craft(s, 'chalk', 4);
    craft(s, 'shikkui', 2);
    expect(s.stat('craft:everything')).toBe(0);
  });

  it('いしばいは「やいた」の 表〔BAKE_RECIPE_NAMES〕に 足す', () => {
    expect(BAKE_RECIPE_NAMES.map(([id]) => id)).toContain('ishibai');
    expect(BAKE_RECIPE_NAMES.find(([id]) => id === 'ishibai')?.[1]).toBe('いしばい');
  });
});
