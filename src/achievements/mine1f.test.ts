import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { findUnrubiedKanji } from '../ui/text';
import { AchievementSystem } from './AchievementSystem';
import { ACHIEVEMENT_DEFS, CATEGORY_ORDER } from './defs';

/**
 * MINE-1F（docs/design/MINE-1F.md §4.8・受け入れ基準 F13）: 実績 2 つ。
 *   ・はじめて ようかいの やかた を みつけた！ … 小〔足が 大広間に 入った〕   ・ようかいの やかた を かちぬいた！ … 大〔紙ふぶき ＋ 花火。小では ない〕〔はじめて かった〕
 *   それぞれ はじめての とき 1 回・2 回目は 出ない。件数は 書かない〔#311〕。「はじめて たからばこ を あけた！」が 挑戦の はじまりで 出ない ことは mineYakataRun.test.ts。
 * 【自分で 決めた つなぎ】`AchievementSystem.feedMine(events)` に `{ type: 'yakata', tick, kind: 'found' | 'won' }`〔下の `feedY` の 1 か所だけ あわせる〕。
 */

const ROWS = [
  { kind: 'found', name: 'はじめて ようかいの やかた を みつけた！', small: true },
  { kind: 'won', name: 'ようかいの やかた を かちぬいた！', small: false },
] as const;
type Ev = { type: 'yakata'; tick: number; kind: 'found' | 'won' };
const feedY = (s: AchievementSystem, e: Ev[]): void => {
  const f = (s as unknown as { feedMine?: (events: Ev[]) => void }).feedMine;
  if (typeof f !== 'function') throw new Error('AchievementSystem.feedMine が まだ ない');
  f.call(s, e);
};
const mk = (): AchievementSystem => {
  const settings = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 };
  return new AchievementSystem(() => settings);
};
const defsNamed = (name: string) => ACHIEVEMENT_DEFS.filter((d) => d.name === name);

describe('F13: 実績の 行', () => {
  it.each(ROWS)('$name が 1 つ ある・大きさ・分け・ルビ', (row) => {
    const d = defsNamed(row.name);
    expect(d).toHaveLength(1);
    expect(Boolean(d[0]!.small), '小か').toBe(row.small);
    expect(CATEGORY_ORDER).toContain(d[0]!.category);
    expect(findUnrubiedKanji(row.name)).toEqual([]);
    const ids = ACHIEVEMENT_DEFS.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('F13: はじめての とき 1 回・2 回目は 出ない・おたがいに 出ない', () => {
  it.each(ROWS)('$name', (row) => {
    const id = defsNamed(row.name)[0]?.id;
    expect(id, '実績の 行').toBeDefined();
    const s = mk();
    const got: string[] = [];
    s.onUnlock((d) => got.push(d.id));
    feedY(s, [{ type: 'yakata', tick: 1, kind: row.kind }]);
    expect(s.isUnlocked(id!), '1 回目で 出る').toBe(true);
    feedY(s, [{ type: 'yakata', tick: 2, kind: row.kind }]);
    feedY(s, [{ type: 'yakata', tick: 3, kind: row.kind }, { type: 'yakata', tick: 4, kind: row.kind }]);
    expect(got.filter((x) => x === id), '2 回目からは 出ない').toHaveLength(1);
    const other = ROWS.find((r) => r.kind !== row.kind)!;
    expect(s.isUnlocked(defsNamed(other.name)[0]!.id), 'ほかの 実績は 出ない').toBe(false);
  });
});
