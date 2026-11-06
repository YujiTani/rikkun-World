import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { AchievementSystem, type StepContext } from '../achievements/AchievementSystem';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { LevelSystem } from '../level/LevelSystem';
import type { Vec3, YokaiWorld } from '../contracts';
import { bindWho, creditDefeat, sharedLevel } from './credit';
import { P2State } from './p2State';

/**
 * COOP-1 作業 3a（#416）の 先行テスト（赤）。AC45（けいけんちと レベルは 1 人ずつ）・AC45b（2P の レベルは セーブで 戻る）・AC45c（実績は 2 人で 1 つ）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2State.ts  `new P2State(opts?: { onLevelUp?: (level: number) => void })`
 *     - `levels: LevelSystem`（2P の レベルと けいけんち。`src/level/LevelSystem.ts` と 同じ 物）。levelUp したとき opts.onLevelUp(level)（配線: 2P の ハートだけ全回復 = P2Life.fill）。
 *     - `level`（今ある 口）は `levels` を 見る 口に する: 読むと { level, xp }、書くと levels.set(level, xp)。serialize / deserialize / clear も levels を 使う（セーブの 形 `P2Save.level` は 今のまま）。
 *   src/duo/credit.ts
 *     `creditDefeat(d: CreditDeps, who: 1 | 2, kind: YokaiKind, xp: number): void`
 *       CreditDeps = { level1: LevelSystem; level2: LevelSystem; feedDefeat(who: 1 | 2, kind: YokaiKind): void }
 *       さいごの 1 発を 当てた人（who）の LevelSystem にだけ onDefeat(kind, xp) する。feedDefeat は どちらの人でも 1 回 呼ぶ（実績は 世界で 1 つ）。
 *       配線: YokaiManager の onDefeat の info.who（`DefeatInfo.who: 1 | 2`）から 呼ぶ。
 *     `bindWho(y: YokaiWorld, who: 1 | 2): YokaiWorld`  … damage(id, amount, from, knock?, by?) を damage(id, amount, from, knock, by, who) に して 元の y へ わたす。
 *       ほかの 口（list・raycast・occupies・pull・drainEvents）は そのまま とおす。配線: 1P の PlayerCombat・DigSystem には bindWho(y, 1)、2P には bindWho(y, 2)。
 *   src/contracts/yokai.ts  `YokaiWorld.damage(id, amount, from, knock?, by?, who?: 1 | 2)`（省くと 1）
 *     `sharedLevel(level1: number, level2: number | null): number`  … 実績の「レベル」に 渡す 数 = 2 人の 大きい方（2P が いなければ level1）。
 *   src/yokai/ai/YokaiManager.ts  → 下の duo.test.ts（`info.who`）
 */

const ach = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
const stepCtx = (level: number): StepContext => ({
  tick: 0,
  day: 0,
  mode: 'play',
  screenSteps: 1,
  position: { x: 0, y: 10, z: 0 },
  velocityY: 0,
  onGround: true,
  inWater: false,
  dead: false,
  yokai: [],
  level,
  armor: [null, null, null, null],
  regions: null,
});

function make() {
  const heals = { p1: 0, p2: 0 };
  const level1 = new LevelSystem({ onLevelUp: () => heals.p1++ });
  const p2 = new P2State({ onLevelUp: () => heals.p2++ });
  const a = ach();
  const fed: Array<[number, string]> = [];
  const deps = {
    level1,
    level2: p2.levels,
    feedDefeat: (who: 1 | 2, kind: string) => {
      fed.push([who, kind]);
      a.feedDefeat({ kind: kind as 'karakasa', tick: 0, with: 'hand', hp: 20 });
    },
  };
  return { heals, level1, p2, a, fed, deps };
}

describe('AC45: 2P が 妖怪を たおすと けいけんちは 2P の レベルだけに 入る。2P の レベルが 上がると 2P の ハートだけ 全回復', () => {
  it('2P が たおす → 2P の けいけんちだけ ふえ、1P の レベル・けいけんちは そのまま', () => {
    const { level1, p2, deps } = make();
    const before1 = level1.get();
    const xp = 2;
    creditDefeat(deps, 2, 'karakasa', xp);
    expect(p2.levels.get().xp).toBe(xp);
    expect(level1.get()).toEqual(before1);
  });
  it('1P が たおす → 1P だけ ふえる（今までどおり）', () => {
    const { level1, p2, deps } = make();
    creditDefeat(deps, 1, 'karakasa', 2);
    expect(level1.get().xp).toBe(2);
    expect(p2.levels.get()).toMatchObject({ level: 1, xp: 0 });
  });
  it('2P の レベルが 上がると 2P の 回復だけ 1 回。1P の 回復は 起きない', () => {
    const { heals, level1, p2, deps } = make();
    creditDefeat(deps, 2, 'nurikabe', p2.levels.nextXp());
    expect(p2.levels.level()).toBe(2);
    expect(heals).toEqual({ p1: 0, p2: 1 });
    expect(level1.level()).toBe(1);
  });
  it('1P の レベルが 上がっても 2P は 回復しない', () => {
    const { heals, deps, level1 } = make();
    creditDefeat(deps, 1, 'nurikabe', level1.nextXp());
    expect(heals).toEqual({ p1: 1, p2: 0 });
  });
});

describe('AC45b: 2P の レベルは セーブして 読み直すと 戻る（p2.level）', () => {
  it('levels に けいけんちを 足して serialize → 新しい P2State に deserialize で 同じ レベル・けいけんち', () => {
    const a = new P2State();
    a.levels.addXp(12);
    const saved = JSON.parse(JSON.stringify(a.serialize()));
    expect(saved.level).toEqual({ level: a.levels.level(), xp: a.levels.xp() });
    const b = new P2State();
    b.deserialize(saved);
    expect(b.levels.get()).toEqual(a.levels.get());
    expect(b.level).toEqual({ level: a.levels.level(), xp: a.levels.xp() });
  });
  it('level の 書き口は levels に とどく（今ある 使い方 `p2.level = { … }` を 壊さない）', () => {
    const p = new P2State();
    p.level = { level: 3, xp: 4 };
    expect(p.levels.get()).toMatchObject({ level: 3, xp: 4 });
    p.clear();
    expect(p.levels.get()).toMatchObject({ level: 1, xp: 0 });
    expect(p.level).toEqual({ level: 1, xp: 0 });
  });
  it('こわれた セーブは レベル 1 から。読み直しでは 回復（onLevelUp）を 呼ばない', () => {
    let ups = 0;
    const p = new P2State({ onLevelUp: () => ups++ });
    p.deserialize({ inventory: [], level: { level: 'x', xp: 1 } });
    expect(p.levels.level()).toBe(1);
    p.deserialize({ inventory: [], level: { level: 5, xp: 3 } });
    expect(ups).toBe(0);
  });
});

describe('bindWho: ダメージに だれが 当てたかを つける', () => {
  function fake() {
    const calls: Array<{ id: number; who: unknown; by: unknown }> = [];
    const w: YokaiWorld = {
      list: () => [],
      raycast: () => null,
      damage: (id: number, _a: number, _f: Vec3, _k?: unknown, by?: unknown, who?: 1 | 2) => void calls.push({ id, who, by }),
      occupies: () => true,
      drainEvents: () => [],
    };
    return { w, calls };
  }
  it.each([1, 2] as const)('who=%i を そえて 元の damage を 呼ぶ。ほかの 口は とおす', (who) => {
    const { w, calls } = fake();
    const b = bindWho(w, who);
    b.damage(7, 3, { x: 0, y: 0, z: 0 }, undefined, 'player');
    expect(calls).toEqual([{ id: 7, who, by: 'player' }]);
    expect(b.occupies(0, 0, 0)).toBe(true);
    expect(b.list()).toEqual([]);
  });
});

describe('AC45c: 実績は 2 人で 1 つ', () => {
  it('2P が はじめて 妖怪を たおしても 実績が 取れ、1P の 側の 見え方（同じ 実績）にも 取れた 状態になる', () => {
    const { a, deps, fed } = make();
    const first = ACHIEVEMENT_DEFS.find((d) => d.stat === 'defeat:*' && d.goal === 1)!;
    expect(a.isUnlocked(first.id)).toBe(false);
    creditDefeat(deps, 2, 'karakasa', 2);
    expect(fed).toEqual([[2, 'karakasa']]);
    expect(a.isUnlocked(first.id)).toBe(true);
  });
  it('1P の たおしも 同じ 実績に 1 回', () => {
    const { deps, fed } = make();
    creditDefeat(deps, 1, 'chochin', 2);
    expect(fed).toEqual([[1, 'chochin']]);
  });
  it('レベルの 実績: 2 人の 大きい方が 届いたら 取れる（2P だけが 届いても 1P に 取れた 状態）', () => {
    const goal = ACHIEVEMENT_DEFS.find((d) => d.stat === 'level')!.goal;
    expect(sharedLevel(1, goal)).toBe(goal);
    expect(sharedLevel(goal, 1)).toBe(goal);
    expect(sharedLevel(3, null)).toBe(3);
    const a = ach();
    const lv = ACHIEVEMENT_DEFS.find((d) => d.stat === 'level')!;
    a.update(stepCtx(sharedLevel(1, 1)));
    expect(a.isUnlocked(lv.id)).toBe(false);
    a.update(stepCtx(sharedLevel(1, lv.goal)));
    expect(a.isUnlocked(lv.id)).toBe(true);
  });
});
