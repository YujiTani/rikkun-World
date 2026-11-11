import { describe, expect, it } from 'vitest';
import type { AnimalEvent } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { AnimalFx } from '../fx/animalFx';
import { setupDuo, type Who } from './duoKit';

/**
 * COOP-1 5c（仕様 1.16 AC160「音・実績」【ユニット】）の 先行テスト。
 *
 * ---- 約束 ----
 *   `AnimalEvent` の 省ける `by?: 2`（2P の 口を 通した 出来事だけ。1P の 物には `by` の キーが ない）。
 *   音（`AnimalFx.onEvents`）と 実績（`AchievementSystem.feedAnimals`）は `by` を 見ない:
 *     - 出来事 1 つに つき 音は 1 回。by: 2 でも 1P と 同じ 名前・同じ 大きさ（`played`・`fx()` の 数が 同じ）。
 *     - 2P の あみ・だっこ・えさ・なでる・こたつ・小屋・あつめる・いただきます は 1P と 同じ 実績に 同じ だけ。
 *     - けいけんちは 出ない（今の まま。`AchievementSystem` に けいけんちの 口は ない）。
 *   つなぎ込み（game/wire/creatures.ts の deliverAnimalEvents）は 世界に 1 つの 出来事の 列を 1 回だけ 流す
 *   （2P の 出来事を 2 回 流さない。`events()` は 取り出したら 空になる）。
 *   `by` の 付いた 出来事を `AnimalFx`・`AchievementSystem` は そのまま 受けて よい（型は `by?: 2` を 足した 契約）。
 */

const by2 = (e: AnimalEvent): AnimalEvent => ({ ...e, by: 2 }) as unknown as AnimalEvent;
const fresh = () => new AnimalFx({ sound: { playTones: () => {} }, motion: () => 1 });
const ach = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));

/** 2P の 口を 通ると by: 2 が 付く、音や 実績に かかわる 出来事の 見本（種類ごとに 1 つ） */
const SAMPLES: AnimalEvent[] = [
  { type: 'swing', x: 3, y: 10, z: 0, caught: true, reason: 'chance' },
  { type: 'swing', x: 3, y: 10, z: 0, caught: false, reason: 'miss' },
  { type: 'bugCatch', toInventory: true },
  { type: 'carry', id: 1 },
  { type: 'putDown', id: 1, x: 2, y: 9, z: 2 },
  { type: 'toss', id: 1, to: { x: 6, y: 9, z: 2 } },
  { type: 'bonk', id: 1, x: 5, y: 10, z: 2 },
  { type: 'feed', id: 1, item: 'tomato', hearts: 1, friend: false },
  { type: 'friend', id: 1, first: true, count: 1 },
  { type: 'pet', id: 1, friend: true },
  { type: 'egg', id: 1, x: 1, y: 9, z: 1, gold: true },
  { type: 'hatchStart', x: 4, y: 9, z: 4 },
  { type: 'hatch', id: 1, breed: 'normal' as never, gold: false },
  { type: 'home', id: 1, coop: 1 },
  { type: 'coopCollect', egg: 3, gold: 1 },
  { type: 'coopLocked', coop: 1 },
  { type: 'meatStart', id: 1, coop: 1 },
  { type: 'meatDoor', coop: 1, closed: true },
  { type: 'meatSay', id: 1, coop: 1 },
  { type: 'meat', id: 1, coop: 1, count: 2, dropped: 0 },
  { type: 'harapanFeed', id: 1 },
  { type: 'hint', hint: 'feedHint' },
];

/** 実績の 記録の 名前（applyAnimalEvents が 数える 物）。人に よらず 同じ 名前に 数える */
const STATS = [
  'feed:*', 'feed:chicken', 'friend:*', 'friend:chicken', 'petAnimal:*', 'petAnimal:chicken', 'egg:*', 'egg:chicken', 'goldenEgg:*', 'goldenEgg:chicken',
  'bug:*', 'carry:*', 'carry:chicken', 'hatch:*', 'hatch:chicken', 'home:*', 'home:chicken', 'grow:*', 'meat:*', 'meat:chicken', 'machoKO:*',
];
const statsOf = (a: AchievementSystem): Record<string, number> => Object.fromEntries(STATS.map((k) => [k, a.stat(k)]));

describe('AC160 音: 2P の 出来事 1 つに 音は 1 回・1P と 同じ 名前と 大きさ', () => {
  for (const e of SAMPLES) {
    it(`${e.type}${'caught' in e ? `(caught ${e.caught})` : ''}: by: 2 でも 音の 名前・つぶの 数が by なしと 同じ`, () => {
      const a = fresh();
      const b = fresh();
      a.onEvents([e]);
      b.onEvents([by2(e)]);
      expect(b.played).toEqual(a.played);
      expect(b.fx()).toEqual(a.fx());
    });
  }

  it('音の 出る 出来事は 1 つに つき ちょうど 1 回（2 回 ならない）。1P と 2P が 同じ 種類を 1 つずつ 出せば 2 回', () => {
    for (const e of [{ type: 'carry', id: 1 }, { type: 'bugCatch', toInventory: true }, { type: 'coopCollect', egg: 1, gold: 0 }] as AnimalEvent[]) {
      const one = fresh();
      one.onEvents([by2(e)]);
      const base = fresh();
      base.onEvents([e]);
      expect(one.played.length).toBe(base.played.length);
      const both = fresh();
      both.onEvents([e, by2(e)]);
      expect(both.played).toEqual([...base.played, ...base.played]);
    }
  });

  it('by の 有る 無しで 音の 数は かわらない（SAMPLES ぜんぶを 1 度に 流しても 同じ 列）', () => {
    const a = fresh();
    const b = fresh();
    a.onEvents(SAMPLES);
    b.onEvents(SAMPLES.map(by2));
    expect(b.played).toEqual(a.played);
    expect(a.played.length).toBeGreaterThan(0);
  });
});

describe('AC160 実績: 2P の にわとりの 出来事が 1P と 同じ 実績に 同じ だけ', () => {
  it('SAMPLES ぜんぶ by: 2 でも 記録の 数は by なしと 同じ（feed・friend・petAnimal・egg・bug・carry・hatch・home・meat ほか）', () => {
    const a = ach();
    const b = ach();
    a.feedAnimals(SAMPLES);
    b.feedAnimals(SAMPLES.map(by2));
    expect(statsOf(b)).toEqual(statsOf(a));
    expect(a.stat('carry:*')).toBe(1);
    expect(a.stat('feed:*')).toBe(1);
    expect(a.stat('petAnimal:*')).toBe(1);
    expect(a.stat('meat:*')).toBe(1);
  });

  it('1P と 2P の 出来事を 混ぜて 流すと 足し算（世界で 1 つの 記録。人ごとには わけない）', () => {
    const s = ach();
    s.feedAnimals([{ type: 'carry', id: 1 }, by2({ type: 'carry', id: 2 }), { type: 'bugCatch', toInventory: false }, by2({ type: 'bugCatch', toInventory: true })]);
    expect(s.stat('carry:*')).toBe(2);
    expect(s.stat('bug:*')).toBe(2);
  });

  it('えさ・なでる・いただきます・あつめる・小屋: by: 2 の 1 つ ずつが 1 つ ずつ 数えられる', () => {
    const s = ach();
    s.feedAnimals([
      by2({ type: 'feed', id: 1, item: 'tomato', hearts: 1, friend: true }),
      by2({ type: 'pet', id: 1, friend: true }),
      by2({ type: 'pet', id: 2, friend: false }), // やせいは 数えない（1P と 同じ）
      by2({ type: 'home', id: 1, coop: 1 }),
      by2({ type: 'meat', id: 1, coop: 1, count: 2, dropped: 0 }),
      by2({ type: 'egg', id: 1, x: 0, y: 0, z: 0, coop: 1 }),
    ]);
    expect(s.stat('feed:*')).toBe(1);
    expect(s.stat('petAnimal:*')).toBe(1);
    expect(s.stat('home:*')).toBe(1);
    expect(s.stat('meat:*')).toBe(1);
    expect(s.stat('egg:*')).toBe(1);
  });
});

describe('AC160 つなぎ込み: 2P の 出来事も 世界の 列に 1 回だけ（音も 実績も 1P と 同じ だけ）', () => {
  /** だっこ → なげて 着地まで。音と 実績を 流す（deliverAnimalEvents と 同じ: events() を 1 回 取って 両方へ） */
  function scene(w: Who) {
    const s = setupDuo();
    const id = s.friend(w, 1, 0);
    s.m.events(); // 置いた ときの 出来事（友だちが 1P へ 戻る warp など）は この 場面の 外
    expect(s.m.carryHold(id, s.hold, w)).toBeDefined();
    s.step(1);
    const p = s.who(w).position;
    s.m.startThrow(s.aimEast(w, { x: Math.floor(p.x) + 3, y: 9, z: Math.floor(p.z) } as never), w);
    s.step(80);
    const events = s.m.events();
    const fx = fresh();
    const a = ach();
    fx.onEvents(events);
    a.feedAnimals(events);
    // 取り出したら 空（二重に 流せない）
    expect(s.m.events()).toEqual([]);
    return { events, played: fx.played, stats: statsOf(a) };
  }

  it('同じ 場面を 1P と 2P で 動かすと 音の 名前の 列・実績の 数が 同じ。2P の 物は ぜんぶ by: 2、1P の 物に by は ない', () => {
    const one = scene(1);
    const two = scene(2);
    expect(one.played.length).toBeGreaterThan(0);
    expect(two.played).toEqual(one.played);
    expect(two.stats).toEqual(one.stats);
    expect(one.stats['carry:*']).toBe(1);
    for (const e of one.events) expect('by' in e).toBe(false);
    const carries = two.events.filter((e) => e.type === 'carry');
    expect(carries.length).toBe(1);
    for (const e of two.events.filter((e) => e.type === 'carry' || e.type === 'toss' || e.type === 'putDown')) expect((e as { by?: number }).by).toBe(2);
  });
});
