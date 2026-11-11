import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BladeEvent, BowEvent, CombatEvent, DigEvent, WearEvent } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { createP2Feed, owned2, type P2FeedSink } from './p2Feed';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g) #18「持ち主の 決め方」、AC178 ③）のユニットテスト。実装の前に書いた赤のテスト。
 * 実績の 持ち主（owner.test.ts）は `withWho(2, …)` の 中で 取った 物が 2P。**つなぎ忘れても 緑に ならない ように**、2P の 出来事を 実績へ わたす 道が
 * ぜんぶ 2P として 包まれて いる ことを 見る。包まないと 2P が 取った 実績が 1P の 半分に 出る。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `duo/p2Feed.ts`
 *     type P2FeedSink = Pick<AchievementSystem, 'withWho' | 'feedDig' | 'feedCombat' | 'feedBlade' | 'feedArrow' | 'feedWear'>
 *     owned2<A extends unknown[]>(sink: Pick<AchievementSystem, 'withWho'>, fn: (...a: A) => void): (...a: A) => void
 *        … fn を `sink.withWho(2, () => fn(...a))` で 包んだ 関数を 返す（2P の 出来事を 実績へ わたす 関数を 包む 1 つの 道具）
 *     createP2Feed の tapDig・combat・blade・arrows・wear は どれも owned2 で 包む（feedDig などを 呼ぶ あいだ 持ち主 = 2）
 *   p2Feed を 通らない 2P の 出来事も 同じ owned2 で 包む（今 実績に つながって いる 道）:
 *     ・2P の つくる（`game/wire/duoInventory.ts` の `feedCraft:`）
 *     ・2P の ばしょ（`game/wire/save.ts` の place2 の `feedMine:`）
 *     ・宝箱（`game/wire/mine.ts` の show の feedCraft〔pickup〕・feedMine〔chestOpen〕。あけた 人 = who。`achievements.withWho(who, …)`）
 *   2P の 畑・にわとり・たんすの 出来事が これから 実績に つながる とき（今は 見つからない）も 同じ owned2 を 使う（`achievements.feed*` を 包まずに 呼ばない）。
 */

const mk = (): AchievementSystem => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
const read = (p: string): string => readFileSync(p, 'utf8');

/** 呼ばれた とき の 持ち主を 記録する にせの 受け口 */
function fakeSink() {
  let cur: 1 | 2 | 'world' = 1;
  const seen: Record<string, (1 | 2 | 'world')[]> = {};
  const rec = (name: string) => () => {
    (seen[name] ??= []).push(cur);
  };
  const sink = {
    withWho<T>(who: 1 | 2 | 'world', fn: () => T): T {
      const prev = cur;
      cur = who;
      try {
        return fn();
      } finally {
        cur = prev;
      }
    },
    feedDig: rec('feedDig'),
    feedCombat: rec('feedCombat'),
    feedBlade: rec('feedBlade'),
    feedArrow: rec('feedArrow'),
    feedWear: rec('feedWear'),
  };
  return { sink: sink as unknown as P2FeedSink, seen, now: () => cur };
}

const DIG = [{ type: 'break', tick: 1, block: { x: 0, y: 0, z: 0 }, id: 'dirt', gotItem: true, count: 1 }] as DigEvent[];
const COMBAT = [{ type: 'fallHurt', tick: 1, amount: 1 }] as CombatEvent[];
const BLADE = [{ type: 'swing', tick: 1 }] as unknown as BladeEvent[];
const BOW = [{ type: 'arrowShot' }, { type: 'arrowHit' }] as unknown as BowEvent[];
const WEAR = [{ type: 'wearLow', slot: 0 }] as unknown as WearEvent[];

describe('#18: 2P の 出来事を 実績へ わたす 道は ぜんぶ 持ち主 2', () => {
  it('owned2: 呼ぶ あいだだけ 持ち主 2・引数と 戻りは そのまま・あとで 1 に もどる', () => {
    const f = fakeSink();
    let at: unknown = null;
    const w = owned2(f.sink, (a: number, b: string) => {
      at = [f.now(), a, b];
    });
    w(3, 'x');
    expect(at).toEqual([2, 3, 'x']);
    expect(f.now()).toBe(1);
  });

  it('createP2Feed: tapDig・combat・blade・arrows・wear の feed* は 持ち主 2 の ときに 呼ばれる', () => {
    const f = fakeSink();
    const feed = createP2Feed(f.sink);
    feed.tapDig(() => DIG)();
    feed.combat(COMBAT);
    feed.blade(BLADE);
    feed.arrows(BOW);
    feed.wear(WEAR);
    expect(f.seen.feedDig).toEqual([2]);
    expect(f.seen.feedCombat).toEqual([2]);
    expect(f.seen.feedBlade).toEqual([2]);
    expect(f.seen.feedArrow).toEqual([2, 2]);
    expect(f.seen.feedWear).toEqual([2]);
    expect(f.now()).toBe(1);
  });

  it('本物の AchievementSystem: 2P の tapDig で 取った 実績の 持ち主は 2（1P の 呼び出しは 1 のまま）', () => {
    const s = mk();
    createP2Feed(s).tapDig(() => DIG)();
    expect(s.ownerOf('break.dirt.1')).toBe(2);
    const t = mk();
    t.feedDig(DIG);
    expect(t.ownerOf('break.dirt.1')).toBe(1);
  });
});

describe('配線の 見はり: p2Feed を 通らない 2P の 道も 2P として 包む（ソース）', () => {
  it('2P の つくる（duoInventory.ts の feedCraft）', () => {
    expect(read('src/game/wire/duoInventory.ts')).toMatch(/feedCraft:\s*owned2\(/);
  });
  it('2P の ばしょ（save.ts の place2 の feedMine）', () => {
    expect(read('src/game/wire/save.ts')).toMatch(/feedMine:\s*owned2\(/);
  });
  it('宝箱（mine.ts）: あけた 人（who）の 持ち主で feedCraft・feedMine を 呼ぶ', () => {
    expect(read('src/game/wire/mine.ts')).toMatch(/achievements\.withWho\(\s*who\b/);
  });
  it('2P の 配線の ファイルで achievements.feed* を 包まずに 呼ばない', () => {
    for (const f of ['src/game/wire/duoInventory.ts', 'src/game/wire/duoPlay.ts', 'src/game/wire/duoFarm.ts']) {
      const bad = read(f)
        .split('\n')
        .filter((l) => /achievements\.feed\w+\(/.test(l) && !/owned2\(|withWho\(/.test(l));
      expect(bad, f).toEqual([]);
    }
  });
});
