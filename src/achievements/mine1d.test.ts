import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { findUnrubiedKanji } from '../ui/text';
import { AchievementSystem } from './AchievementSystem';
import { ACHIEVEMENT_DEFS, CATEGORY_ORDER } from './defs';

/**
 * MINE-1D（docs/design/MINE-1.md §4.10・受け入れ基準 D10）: ほらあなの 種類の 実績。
 *
 *   ・はじめて ひろい ほらあな を みつけた！ … 小   ・はじめて しょうにゅうどう を みつけた！ … 小   ・はじめて ちていこ を みつけた！ … 小
 *   ・はじめて ほたるの ほらあな を みつけた！ … 小  ・はじめて すいしょうの ほらあな を みつけた！ … 中
 *   「みつけた」＝ 足が その 部屋の 中に 入った〔坑道の へやも 同じ。§4.7.5〕。部屋ごとでなく 種類ごとに 1 回。
 *   ・実績の id は 決まって いない ので、文〔名前〕で 探す。分けは 今の 分けの どこか〔新しい 分けは 作らない〕。件数は 数えない〔#311〕。
 *
 * 【自分で 決めた つなぎ】 developer が ちがう 形に した ときは `feedMine` の 1 か所だけ あわせる:
 *   `AchievementSystem.feedMine(events)` に 出来事 `{ type: 'cave', tick, kind }`〔kind ＝ 部屋の 種類。つなぎ込みが 足が 部屋に 入った とき〔`mine.caveAt` が 種類を 答える マスに 入った〕に わたす〕。
 *   足が 部屋に 入る 判定〔つなぎ〕は E2E〔e2e/mine1d.spec.ts D11〕が ゲームの 中で 見る。
 */

type Kind = 'hiroi' | 'shonyudo' | 'chiteiko' | 'hotaru' | 'suisho';
const ROWS: readonly { kind: Kind; name: string; small: boolean }[] = [
  { kind: 'hiroi', name: 'はじめて ひろい ほらあな を みつけた！', small: true },
  { kind: 'shonyudo', name: 'はじめて しょうにゅうどう を みつけた！', small: true },
  { kind: 'chiteiko', name: 'はじめて ちていこ を みつけた！', small: true },
  { kind: 'hotaru', name: 'はじめて ほたるの ほらあな を みつけた！', small: true },
  { kind: 'suisho', name: 'はじめて すいしょうの ほらあな を みつけた！', small: false },
];

type MineEvent = { type: 'cave'; tick: number; kind: Kind } | { type: 'bottom' | 'chestOpen'; tick: number; tier?: number };
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

describe('D10: 実績の 行（文・大きさ・分け）', () => {
  it.each(ROWS)('$name が 1 つ ある', (row) => {
    expect(defsNamed(row.name)).toHaveLength(1);
  });

  it('大きさ〔すいしょうは 中・ほかは 小〕・分けは 今の 分けの どこか・名前に ルビなしの 漢字が ない・id が かさならない', () => {
    for (const row of ROWS) {
      const d = defsNamed(row.name)[0];
      expect(d, row.name).toBeDefined();
      expect(Boolean(d!.small), `${row.name} が 小`).toBe(row.small);
      expect(CATEGORY_ORDER, `${row.name} の 分け`).toContain(d!.category);
      expect(findUnrubiedKanji(row.name), row.name).toEqual([]);
    }
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('D10: 足が はじめて 部屋に 入ると その 種類の 実績が 1 回', () => {
  it.each(ROWS)('$name', (row) => {
    const id = defsNamed(row.name)[0]?.id;
    expect(id, '実績の 行').toBeDefined();
    const s = mk();
    const got: string[] = [];
    s.onUnlock((d) => got.push(d.id));
    expect(s.isUnlocked(id!)).toBe(false);
    feed(s, [{ type: 'cave', tick: 1, kind: row.kind }]);
    expect(s.isUnlocked(id!), '1 回目で 出る').toBe(true);
    expect(got.filter((x) => x === id)).toHaveLength(1);
    feed(s, [{ type: 'cave', tick: 2, kind: row.kind }]);
    feed(s, [{ type: 'cave', tick: 3, kind: row.kind }, { type: 'cave', tick: 4, kind: row.kind }]);
    expect(got.filter((x) => x === id), '2 回目からは 出ない〔べつの 部屋でも 同じ 種類は 1 回〕').toHaveLength(1);
  });

  it('おたがいに 出ない: ある 種類に 入っても ほかの 種類の 実績は 出ない', () => {
    for (const row of ROWS) {
      const s = mk();
      feed(s, [{ type: 'cave', tick: 1, kind: row.kind }]);
      for (const other of ROWS) {
        if (other.kind === row.kind) continue;
        expect(s.isUnlocked(defsNamed(other.name)[0]!.id), `${row.kind} に 入って ${other.kind}`).toBe(false);
      }
    }
  });

  it('5 種類 ぜんぶ 入ると 5 つ とも 出る・1C の 坑道の 実績〔いちばん したに ついた・たからばこ〕は 出ない', () => {
    const s = mk();
    feed(s, ROWS.map((r, i) => ({ type: 'cave' as const, tick: i + 1, kind: r.kind })));
    for (const row of ROWS) expect(s.isUnlocked(defsNamed(row.name)[0]!.id), row.name).toBe(true);
    for (const name of ['こうどう の いちばん したに ついた！', 'はじめて たからばこ を あけた！']) {
      const d = defsNamed(name)[0];
      if (d) expect(s.isUnlocked(d.id), name).toBe(false);
    }
  });

  it('1C の 出来事〔bottom・chestOpen〕では 出ない・ほかの 出来事〔ほる・ひろう〕でも 出ない', () => {
    const s = mk();
    feed(s, [{ type: 'bottom', tick: 1 }, { type: 'chestOpen', tick: 2, tier: 3 }]);
    s.feedDig([{ type: 'break', tick: 0, block: { x: 1, y: 2, z: 3 }, id: 'tsurara', gotItem: true, count: 1 }] as never);
    s.feedCraft([{ type: 'pickup', tick: 0, item: 'log', count: 1 }] as never);
    for (const row of ROWS) expect(s.isUnlocked(defsNamed(row.name)[0]!.id), row.name).toBe(false);
  });
});
