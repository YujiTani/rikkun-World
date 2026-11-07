import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { findUnrubiedKanji } from '../ui/text';
import { AchievementSystem } from './AchievementSystem';
import { ACHIEVEMENT_DEFS, CATEGORY_ORDER } from './defs';

/**
 * MINE-1E（docs/design/MINE-1E.md §4.12・受け入れ基準 E17）: 坑道の 冒険の 実績 5 つ。
 *
 *   ・はじめて かくしべや を みつけた！ … 中   ・はじめて むかし の こうどう を みつけた！ … 小   ・はじめて めいろ の いちばん おく に ついた！ … 小
 *   ・はじめて ぼうけんしゃ の キャンプ を みつけた！ … 小   ・はじめて かびた パン を たべた！ … 小
 *   それぞれ はじめての とき 1 回・2 回目は 出ない。実績の id は 決まって いない ので、文〔名前〕で 探す。分けは 今の 分けの どこか〔新しい 分けは 作らない〕。件数は 数えない〔#311〕。
 *
 * 【自分で 決めた つなぎ】 developer が ちがう 形に した ときは 下の `feedArea`・`feedEat` の 1 か所だけ あわせる:
 *   ・足が 4 つの 場所に 入った: `AchievementSystem.feedMine(events)` に `{ type: 'area', tick, kind }`〔kind ＝ 'kakushi'〔かくしべや〕・'mukashi'〔むかしの えだ道〕・
 *     'meiro'〔迷路の いちばん おくの 行きどまり〔へやが あれば へや〕〕・'camp'〔キャンプあとの へや〕。つなぎ込みが 足の 場所を 窓口 `caveAt` などで 見て わたす〕
 *   ・かびた パンを たべた: 今の `feedFarm` の `{ type: 'eat', item: 'kabita_pan', heal }`〔たべた 出来事。体力が いっぱいで たべない ときは 出ない〕
 *   足が 場所に 入る 判定〔つなぎ〕は E2E〔e2e/mine1e.spec.ts E18〕が ゲームの 中で 見る。
 */

type Area = 'kakushi' | 'mukashi' | 'meiro' | 'camp';
const AREAS: readonly { kind: Area; name: string; small: boolean }[] = [
  { kind: 'kakushi', name: 'はじめて かくしべや を みつけた！', small: false },
  { kind: 'mukashi', name: 'はじめて むかし の こうどう を みつけた！', small: true },
  { kind: 'meiro', name: 'はじめて めいろ の いちばん おく に ついた！', small: true },
  { kind: 'camp', name: 'はじめて ぼうけんしゃ の キャンプ を みつけた！', small: true },
];
const PAN = { name: 'はじめて かびた パン を たべた！', small: true };
const ALL = [...AREAS.map((a) => ({ name: a.name, small: a.small })), PAN];

type MineEvent = { type: 'area'; tick: number; kind: Area } | { type: 'bottom' | 'chestOpen'; tick: number; tier?: number } | { type: 'cave'; tick: number; kind: string };
const feedArea = (s: AchievementSystem, e: MineEvent[]): void => {
  const f = (s as unknown as { feedMine?: (events: MineEvent[]) => void }).feedMine;
  if (typeof f !== 'function') throw new Error('AchievementSystem.feedMine が まだ ない');
  f.call(s, e);
};
const feedEat = (s: AchievementSystem, item: string, tick: number, heal = 2): void =>
  s.feedFarm([{ type: 'eat', tick, x: 1, y: 2, z: 3, item, heal }] as never);

const mk = (): AchievementSystem => {
  const settings = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 };
  return new AchievementSystem(() => settings);
};
const defsNamed = (name: string) => ACHIEVEMENT_DEFS.filter((d) => d.name === name);

describe('E17: 実績の 行（文・大きさ・分け）', () => {
  it.each(ALL)('$name が 1 つ ある', (row) => {
    expect(defsNamed(row.name)).toHaveLength(1);
  });

  it('大きさ〔かくしべやは 中・ほかは 小〕・分けは 今の 分けの どこか・名前に ルビなしの 漢字が ない・id が かさならない', () => {
    for (const row of ALL) {
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

describe('E17: 足が はじめて その 場所に 入ると 1 回', () => {
  it.each(AREAS)('$name', (row) => {
    const id = defsNamed(row.name)[0]?.id;
    expect(id, '実績の 行').toBeDefined();
    const s = mk();
    const got: string[] = [];
    s.onUnlock((d) => got.push(d.id));
    expect(s.isUnlocked(id!)).toBe(false);
    feedArea(s, [{ type: 'area', tick: 1, kind: row.kind }]);
    expect(s.isUnlocked(id!), '1 回目で 出る').toBe(true);
    expect(got.filter((x) => x === id)).toHaveLength(1);
    feedArea(s, [{ type: 'area', tick: 2, kind: row.kind }]);
    feedArea(s, [{ type: 'area', tick: 3, kind: row.kind }, { type: 'area', tick: 4, kind: row.kind }]);
    expect(got.filter((x) => x === id), '2 回目からは 出ない').toHaveLength(1);
  });

  it('おたがいに 出ない: ある 場所に 入っても ほかの 実績は 出ない〔かびた パンも〕', () => {
    for (const row of AREAS) {
      const s = mk();
      feedArea(s, [{ type: 'area', tick: 1, kind: row.kind }]);
      for (const other of ALL) {
        if (other.name === row.name) continue;
        expect(s.isUnlocked(defsNamed(other.name)[0]!.id), `${row.kind} に 入って ${other.name}`).toBe(false);
      }
    }
  });

  it('4 つ ぜんぶ 入ると 4 つ とも 出る', () => {
    const s = mk();
    feedArea(s, AREAS.map((r, i) => ({ type: 'area' as const, tick: i + 1, kind: r.kind })));
    for (const row of AREAS) expect(s.isUnlocked(defsNamed(row.name)[0]!.id), row.name).toBe(true);
  });

  it('1C・1D の 出来事〔bottom・chestOpen・cave〕では 出ない', () => {
    const s = mk();
    feedArea(s, [{ type: 'bottom', tick: 1 }, { type: 'chestOpen', tick: 2, tier: 3 }, { type: 'cave', tick: 3, kind: 'hiroi' }]);
    for (const row of ALL) expect(s.isUnlocked(defsNamed(row.name)[0]!.id), row.name).toBe(false);
  });
});

describe('E17: かびた パンを たべた', () => {
  const id = (): string => defsNamed(PAN.name)[0]!.id;

  it('はじめて たべた とき 1 回・2 回目は 出ない', () => {
    const s = mk();
    const got: string[] = [];
    s.onUnlock((d) => got.push(d.id));
    feedEat(s, 'kabita_pan', 1);
    expect(s.isUnlocked(id())).toBe(true);
    feedEat(s, 'kabita_pan', 2);
    feedEat(s, 'kabita_pan', 3);
    expect(got.filter((x) => x === id())).toHaveLength(1);
  });

  it('ほかの たべもの〔たまご・トマト〕では 出ない・場所の 実績も 出ない', () => {
    const s = mk();
    feedEat(s, 'egg', 1);
    feedEat(s, 'tomato', 2);
    expect(s.isUnlocked(id())).toBe(false);
    feedEat(s, 'kabita_pan', 3);
    for (const a of AREAS) expect(s.isUnlocked(defsNamed(a.name)[0]!.id), a.name).toBe(false);
  });
});
