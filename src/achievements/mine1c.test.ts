import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { findUnrubiedKanji } from '../ui/text';
import { AchievementSystem } from './AchievementSystem';
import { ACHIEVEMENT_DEFS, CATEGORY_ORDER } from './defs';

/**
 * MINE-1C（docs/design/MINE-1.md §4.10・受け入れ基準 C11）: 坑道の 実績。
 *
 *   ・こうどう の いちばん したに ついた！ … 中   〔足が いちばん 下の へやの 中に 入った とき。1 回〕
 *   ・はじめて たからばこ を あけた！ … 中       〔宝箱を はじめて あけた とき。1 回〕
 *   ・実績の id は 決まって いない ので、文〔名前〕で 探す。分けは 今の 分けの どこか〔新しい 分けは 作らない〕。件数は 数えない〔#311〕。
 *
 * 【自分で 決めた つなぎ】 developer が ちがう 形に した ときは `feedMine` の 1 か所だけ あわせる:
 *   `AchievementSystem.feedMine(events)` … { type: 'bottom' | 'chestOpen', tick, tier? }〔つなぎ込みが 足が いちばん 下の へやに 入った とき・宝箱が あいた ときに わたす。
 *   宝箱は `createMineHook({ chest: { opened(tier) } })` から。足の 判定は `mine.caveAt(x, y, z)` の 'kodo' ＋ へやの はんい〕。
 *   足が へやに 入る 判定〔つなぎ〕と 宝箱の 出来事の つなぎは E2E〔e2e/mine1c.spec.ts C12・C13〕が ゲームの 中で 見る。
 */

const BOTTOM = 'こうどう の いちばん したに ついた！';
const CHEST = 'はじめて たからばこ を あけた！';

type MineEvent = { type: 'bottom' | 'chestOpen'; tick: number; tier?: number };
const feed = (s: AchievementSystem, e: MineEvent[]): void => {
  const f = (s as unknown as { feedMine?: (events: MineEvent[]) => void }).feedMine;
  if (typeof f !== 'function') throw new Error('AchievementSystem.feedMine が まだ ない（MINE-1 §4.10）');
  f.call(s, e);
};

const mk = (): AchievementSystem => {
  const settings = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 };
  return new AchievementSystem(() => settings);
};
const defsNamed = (name: string) => ACHIEVEMENT_DEFS.filter((d) => d.name === name);

describe('C11: 実績の 行（文・大きさ・分け）', () => {
  it('§4.10 の 1C の 2 行が それぞれ 1 つずつ ある', () => {
    expect(defsNamed(BOTTOM)).toHaveLength(1);
    expect(defsNamed(CHEST)).toHaveLength(1);
  });

  it('大きさは 中〔小でない〕・分けは 今の 分けの どこか・名前に ルビなしの 漢字が ない・id が かさならない', () => {
    for (const name of [BOTTOM, CHEST]) {
      const d = defsNamed(name)[0];
      expect(d, name).toBeDefined();
      expect(Boolean(d!.small), `${name} が 小`).toBe(false);
      expect(CATEGORY_ORDER, `${name} の 分け`).toContain(d!.category);
      expect(findUnrubiedKanji(name), name).toEqual([]);
    }
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('C11: はじめての とき 1 回 出る・2 回目は 出ない', () => {
  it.each([
    [BOTTOM, 'bottom'],
    [CHEST, 'chestOpen'],
  ] as const)('%s', (name, type) => {
    const id = defsNamed(name)[0]?.id;
    expect(id, '実績の 行').toBeDefined();
    const s = mk();
    const got: string[] = [];
    s.onUnlock((d) => got.push(d.id));
    expect(s.isUnlocked(id!)).toBe(false);
    feed(s, [{ type, tick: 1, tier: 2 }]);
    expect(s.isUnlocked(id!), '1 回目で 出る').toBe(true);
    expect(got.filter((x) => x === id)).toHaveLength(1);
    feed(s, [{ type, tick: 2, tier: 4 }]);
    feed(s, [{ type, tick: 3, tier: 1 }, { type, tick: 4, tier: 1 }]);
    expect(got.filter((x) => x === id), '2 回目からは 出ない').toHaveLength(1);
  });

  it('おたがいに 出ない〔いちばん 下に ついても 宝箱の 実績は 出ない。逆も〕・段が ちがっても 宝箱の 実績は 1 回', () => {
    const bottom = defsNamed(BOTTOM)[0]!.id;
    const chest = defsNamed(CHEST)[0]!.id;
    const a = mk();
    feed(a, [{ type: 'bottom', tick: 1 }]);
    expect(a.isUnlocked(bottom)).toBe(true);
    expect(a.isUnlocked(chest)).toBe(false);
    const b = mk();
    feed(b, [{ type: 'chestOpen', tick: 1, tier: 3 }]);
    expect(b.isUnlocked(chest)).toBe(true);
    expect(b.isUnlocked(bottom)).toBe(false);
  });

  it('ほかの 出来事では 出ない〔ブロックを ほる・ひろう・つくる〕', () => {
    const ids = [defsNamed(BOTTOM)[0]!.id, defsNamed(CHEST)[0]!.id];
    const s = mk();
    s.feedDig([{ type: 'break', tick: 0, block: { x: 1, y: 2, z: 3 }, id: 'kodo_waku', gotItem: true, count: 1 }] as never);
    s.feedCraft([{ type: 'pickup', tick: 0, item: 'log', count: 1 }] as never);
    for (const id of ids) expect(s.isUnlocked(id), id).toBe(false);
  });
});
