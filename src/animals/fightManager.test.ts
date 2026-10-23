import { describe, expect, it } from 'vitest';
import type { AnimalEvent, AnimalFightPort, AnimalView, DayPhase, FightYokai, ItemId, Vec3 } from '../contracts';
import { createLiveSettings, W2_SETTING_DEFAULTS } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';

/**
 * LIVE-4 A（docs/design/LIVE-4.md 版 2.1 §2.2〜§2.4・§5・AC2・AC4〜AC6・AC8・AC11・AC12）: ねらう・はしる・パンチ・きりあげ・やめる。
 * 妖怪 は にせ の 窓口（`deps.fight`）。数え方: `punch` の 最初 の ステップ = 0、当たる のは 5 ステップ目（刀 の 突き 4・2・35）。
 */
const SIZE = 60;
interface Fake {
  x: number;
  y: number;
  z: number;
  hp: number;
  state: FightYokai['state'];
}

function setup() {
  const world = new ArrayVoxelWorld({ x: SIZE, y: 40, z: SIZE });
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) world.setBlock(x, 8, z, 'grass');
  const player = { position: { x: 30.5, y: 9, z: 36.5 } as Vec3 };
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  const ys = new Map<number, Fake>();
  const calls: { step: number; id: number; amount: number; knock: { dist: number; up: number }; from: Vec3 }[] = [];
  let now = 0;
  const blade = { ...W2_SETTING_DEFAULTS.bladeTech, kiriageMul: W2_SETTING_DEFAULTS.bladeDamageMul.kiriage };
  const flags = { dead: false };
  const port: AnimalFightPort = {
    playerDead: () => flags.dead,
    yokai: (id) => {
      const y = ys.get(id);
      return y ? { x: y.x, y: y.y, z: y.z, radius: 0.6, height: 1.6, state: y.state } : null;
    },
    hit: (id, amount, from, knock) => {
      const y = ys.get(id);
      if (!y || y.state !== 'alive') return 0;
      calls.push({ step: now, id, amount, knock: { ...knock }, from: { ...from } });
      y.hp = Math.round((y.hp - amount) * 100) / 100;
      if (y.hp <= 0) y.state = 'dying';
      return amount;
    },
    blade: () => ({ thrust: { ...blade.thrust }, kiriageMul: blade.kiriageMul, kiriageKnock: W2_SETTING_DEFAULTS.bladeKnock.kiriage }),
  };
  const m = new AnimalManager({
    world,
    getPlayer: () => player,
    deps: {
      seed: 7,
      settings,
      dropEgg: () => {},
      addItem: (_it: ItemId) => true,
      day: () => 0,
      phase: () => 'day' as DayPhase,
      countryAt: () => ({ kind: 'harappa' }),
      fight: port,
    },
  });
  const evs: AnimalEvent[] = [];
  const states: string[] = [];
  const views: AnimalView[] = [];
  const step = (n: number, watch?: number) => {
    for (let i = 0; i < n; i++) {
      now++;
      m.update();
      evs.push(...m.events());
      if (watch !== undefined) {
        states.push(m.list().find((a) => a.id === watch)?.state ?? 'none');
        m.forEachVisible((v) => {
          if (v.id === watch) views.push({ ...v });
        });
      }
    }
  };
  const macho = (dx: number, dz = -2, o: Record<string, unknown> = {}) => m.spawn(30.5 + dx, 9, 36.5 + dz, { friend: true, follow: 18000, stage: 'adult', breed: 'macho', ...o } as never)!;
  const yokai = (id: number, x: number, z: number, hp = 99) => ys.set(id, { x, y: 9, z, hp, state: 'alive' });
  const one = (id: number) => m.list().find((a) => a.id === id)!;
  const of = <T extends AnimalEvent['type']>(t: T) => evs.filter((e): e is Extract<AnimalEvent, { type: T }> => e.type === t);
  return { m, settings, step, macho, yokai, one, of, evs, ys, calls, player, states, views, blade, flags, now: () => now };
}

describe('AC2 きっかけ 1/2 → ねらう', () => {
  it('たたいた: その ステップ に target・machoTarget(playerHit) 1 つ。同じ 妖怪 を もう 1 回 → 出来事 は ふえない', () => {
    const s = setup();
    const a = s.macho(0);
    s.yokai(77, 30.5, 29.5);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    expect(s.one(a).target).toBe(77);
    s.step(1);
    expect(s.of('machoTarget')).toEqual([{ type: 'machoTarget', id: a, yokai: 77, cause: 'playerHit' }]);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(1);
    expect(s.of('machoTarget')).toHaveLength(1);
  });
  it('たたかれた: cause playerHurt。同じ ステップ に 両方 → たたいた 方', () => {
    const s = setup();
    const a = s.macho(0);
    s.yokai(5, 30.5, 29.5);
    s.yokai(9, 33.5, 29.5);
    s.step(35);
    s.m.fightCue!({ hit: [9], hurt: [5] });
    s.step(1);
    expect(s.one(a).target).toBe(9);
    expect(s.of('machoTarget')[0]).toMatchObject({ yokai: 9, cause: 'playerHit' });
    s.m.fightCue!({ hit: [], hurt: [5] });
    s.step(1);
    expect(s.one(a).target).toBe(5);
    expect(s.of('machoTarget')[1]).toMatchObject({ yokai: 5, cause: 'playerHurt' });
  });
  it('12 マス の 外 は ねらわない（13 は null、11 は ねらう）', () => {
    const s = setup();
    const a = s.macho(0);
    s.yokai(1, 30.5, 36.5 - 13);
    s.yokai(2, 30.5, 36.5 - 11);
    s.step(35);
    s.m.fightCue!({ hit: [1], hurt: [] });
    expect(s.one(a).target).toBeNull();
    s.m.fightCue!({ hit: [2], hurt: [] });
    expect(s.one(a).target).toBe(2);
  });
  it('いない 妖怪・たおれかけ の 妖怪 は ねらわない', () => {
    const s = setup();
    const a = s.macho(0);
    s.yokai(3, 30.5, 30.5);
    s.ys.get(3)!.state = 'dying';
    s.step(35);
    s.m.fightCue!({ hit: [3, 99], hurt: [] });
    expect(s.one(a).target).toBeNull();
  });
  it('machoFighters 0 / たたかえる 子 が いない → 何も おきない', () => {
    const s = setup();
    const a = s.macho(0);
    s.yokai(3, 30.5, 30.5);
    s.step(35);
    s.settings.machoFighters = 0;
    s.m.fightCue!({ hit: [3], hurt: [] });
    expect(s.one(a).target).toBeNull();
    expect(s.of('machoTarget')).toHaveLength(0);
  });
});

describe('AC12 1 わ だけ', () => {
  it('3 わ の うち いちばん 早い 子 だけ ねらう。ほか は ふつう に ついてくる', () => {
    const s = setup();
    const ids = [s.macho(-1), s.macho(0), s.macho(1)];
    s.yokai(3, 30.5, 30.5);
    s.step(35);
    s.m.fightCue!({ hit: [3], hurt: [] });
    s.step(60);
    expect(ids.map((i) => s.one(i).target)).toEqual([3, null, null]);
    expect(s.one(ids[1]!).state).not.toBe('run');
    expect(s.of('machoTarget')).toHaveLength(1);
  });
});

describe('AC4・AC5 パンチ と きりあげ', () => {
  function fight() {
    const s = setup();
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    return { s, a };
  }
  it('はしって とどく と state punch。5 ステップ目 に −2、46 ステップ目 に 2 回目（41 ごと）。machoPunch 出来事', () => {
    const { s, a } = fight();
    s.step(200, a);
    const i0 = s.states.indexOf('punch');
    expect(i0).toBeGreaterThan(0);
    const t0 = s.now() - s.states.length + i0 + 1; // punch の 最初 の ステップ の 通し番号
    expect(s.states[i0 - 1]).toBe('run');
    expect(s.calls.slice(0, 3).map((c) => c.step - t0)).toEqual([5, 46, 87]);
    expect(s.calls[0]).toMatchObject({ id: 77, amount: 2, knock: { dist: 0, up: 0 } });
    expect(s.calls[1]).toMatchObject({ amount: 2, knock: { dist: 0, up: 0 } });
  });
  it('3 回目 は きりあげ: −2.3・押す 1.0 ＋ うく 7・state upper。4・5 回目 は ふつう、6 回目 が また きりあげ', () => {
    const { s, a } = fight();
    s.step(420, a);
    const amounts = s.calls.map((c) => c.amount);
    expect(amounts.slice(0, 6)).toEqual([2, 2, 2.3, 2, 2, 2.3]);
    expect(s.calls[2]!.knock).toEqual({ dist: 1.0, up: 7 });
    expect(s.calls[3]!.knock).toEqual({ dist: 0, up: 0 });
    expect(s.calls[5]!.knock).toEqual({ dist: 1.0, up: 7 });
    const ups = s.of('machoPunch').map((e) => e.upper);
    expect(ups.slice(0, 6)).toEqual([false, false, true, false, false, true]);
    expect(s.states).toContain('upper');
    expect(s.one(a).hits).toBeGreaterThanOrEqual(6);
  });
  it('パンチ の 時間 は 刀 の 突き を 読む（6・2・40 → 7 ステップ目・48 ごと）', () => {
    const s = setup();
    s.blade.thrust.startup = 6;
    s.blade.thrust.recovery = 40;
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(120, a);
    const i0 = s.states.indexOf('punch');
    const t0 = s.now() - s.states.length + i0 + 1;
    expect(s.calls.slice(0, 2).map((c) => c.step - t0)).toEqual([7, 55]);
  });
  it('とどいて いない コマ は からぶり（へらない・数えない）', () => {
    const { s, a } = fight();
    for (let i = 0; i < 200 && s.one(a).state !== 'punch'; i++) s.step(1, a);
    expect(s.one(a).state).toBe('punch');
    s.ys.get(77)!.z = 20.5; // 当たる コマ の 前 に とおくへ
    s.step(10, a);
    expect(s.calls).toHaveLength(0);
    expect(s.of('machoPunch')).toHaveLength(0);
    expect(s.one(a).hits).toBe(0);
  });
  it('のりかえ: ねらい が かわる と 数え直し（のりかえた 妖怪 の 3 回目 が きりあげ）', () => {
    const { s, a } = fight();
    s.yokai(88, 33.5, 28.5);
    for (let i = 0; i < 400 && (s.one(a).hits ?? 0) < 2; i++) s.step(1, a);
    expect(s.one(a).hits).toBe(2);
    s.m.fightCue!({ hit: [88], hurt: [] });
    expect(s.one(a).target).toBe(88);
    expect(s.one(a).hits).toBe(0);
    s.calls.length = 0;
    s.step(400, a);
    expect(s.calls.map((c) => c.id).every((i) => i === 88)).toBe(true);
    expect(s.calls.slice(0, 3).map((c) => c.amount)).toEqual([2, 2, 2.3]);
  });
});

describe('AC8 やめる', () => {
  it('600 ステップ きっかけ なし → forget（599 では まだ）。きっかけ で 600 に もどる', () => {
    const s = setup();
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5, 99999);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(299);
    s.m.fightCue!({ hit: [], hurt: [77] });
    s.step(599);
    expect(s.one(a).target).toBe(77);
    s.step(1);
    expect(s.one(a).target).toBeNull();
    expect(s.of('machoGiveUp')).toEqual([{ type: 'machoGiveUp', id: a, reason: 'forget' }]);
  });
  it('妖怪 が 17 マス はなれた → far、消えた → gone', () => {
    const s = setup();
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5, 99999);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(5);
    s.ys.get(77)!.z = 36.5 - 17;
    s.step(1);
    expect(s.one(a).target).toBeNull();
    expect(s.of('machoGiveUp').map((e) => e.reason)).toEqual(['far']);
    s.ys.get(77)!.z = 30.5;
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.ys.delete(77);
    s.step(1);
    expect(s.of('machoGiveUp').map((e) => e.reason)).toEqual(['far', 'gone']);
  });
  it('りっくん が たおれた ら その ステップ に stop（おいかけ ない）・fighters は 空', () => {
    const s = setup();
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5, 99999);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(20);
    expect(s.one(a).target).toBe(77);
    s.flags.dead = true;
    s.step(1);
    expect(s.one(a).target).toBeNull();
    expect(s.m.fighters!()).toEqual([]);
    expect(s.of('machoGiveUp').map((e) => e.reason)).toEqual(['stop']);
    s.m.fightCue!({ hit: [77], hurt: [] });
    expect(s.one(a).target).toBeNull();
  });
  it('follow が 0 に なった ステップ に stop', () => {
    const s = setup();
    const a = s.macho(0, -2, { follow: 90 });
    s.yokai(77, 30.5, 28.5, 99999);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(54);
    expect(s.one(a).target).toBe(77);
    s.step(1);
    expect(s.one(a).follow).toBe(0);
    expect(s.one(a).target).toBeNull();
    expect(s.of('machoGiveUp').map((e) => e.reason)).toEqual(['stop']);
  });
});

describe('AC7 たおす', () => {
  it('マッチョ の パンチ で たおれる → machoKO・machoFlex・giveUp defeat・flex 30 ステップ の あと ついてくる', () => {
    const s = setup();
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5, 6);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(200, a);
    expect(s.of('machoKO')).toEqual([{ type: 'machoKO', id: a, yokai: 77 }]);
    expect(s.of('machoFlex')).toHaveLength(1);
    expect(s.of('machoGiveUp').map((e) => e.reason)).toEqual(['defeat']);
    expect(s.of('machoPunch').filter((e) => e.hit).map((e) => e.upper)).toEqual([false, false, true]);
    expect(s.states.filter((x) => x === 'flex')).toHaveLength(30);
    expect(s.one(a).target).toBeNull();
    expect(s.states[s.states.length - 1]).not.toBe('flex');
  });
  it('りっくん が たおした とき も かちポーズ（machoKO は なし）', () => {
    const s = setup();
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5, 99999);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(30);
    s.ys.get(77)!.state = 'dying';
    s.step(40, a);
    expect(s.of('machoKO')).toHaveLength(0);
    expect(s.of('machoFlex')).toHaveLength(1);
    expect(s.of('machoGiveUp').map((e) => e.reason)).toEqual(['defeat']);
    expect(s.states.filter((x) => x === 'flex')).toHaveLength(30);
  });
});

describe('AC11 とどかない → おうえん', () => {
  it('はしり はじめて 180 ステップ とどかない → プレイヤー の そば で cheer・target は のこる', () => {
    const s = setup();
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5, 99999);
    s.ys.get(77)!.y = 14; // 高さ 5 マス: とどかない
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(300, a);
    const r0 = s.states.indexOf('run');
    expect(r0).toBeGreaterThanOrEqual(0);
    const cheer = s.states.indexOf('cheer', r0);
    expect(cheer - r0).toBe(180);
    const mm = s.one(a);
    expect(Math.hypot(mm.x - s.player.position.x, mm.z - s.player.position.z)).toBeLessThanOrEqual(4);
    expect(mm.target).toBe(77);
  });
});

describe('AC13 見た目 の 窓口', () => {
  it('「！」 は 20 ステップ・ねらい の 妖怪 の id が view に のる・ねらい が おわる と 消える', () => {
    const s = setup();
    const a = s.macho(0, -2);
    s.yokai(77, 30.5, 28.5, 99999);
    s.step(35);
    s.m.fightCue!({ hit: [77], hurt: [] });
    s.step(40, a);
    const bang = s.views.map((v) => v.bang === true);
    expect(bang.filter(Boolean).length, '手がかり の ステップ を のぞいて 19（その ステップ を ふくめて 20）').toBe(19);
    expect(s.views.every((v) => v.target === 77 && v.fight === true)).toBe(true);
    s.ys.delete(77);
    s.step(1, a);
    expect(s.views[s.views.length - 1]!.target).toBeUndefined();
  });
});
