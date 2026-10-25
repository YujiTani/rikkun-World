import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import type { ArmorSlot, CombatEvent, DayPhase, Inventory, ItemId, PlayerCombat, TimeOfDay, Vec3 } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { YokaiManager } from '../yokai/ai/YokaiManager';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { BigHit, damageOf, type BoxLike } from '../proto/gashaBigHit';
import { Kodachi } from './Kodachi';

/**
 * NINJA-1（#299）AC10〜AC13: 忍びの手甲の 追い打ち（小太刀）。実装の 前の テスト（赤）。
 * 窓口 の 形（src/combat/Kodachi.ts）:
 *   new Kodachi({ armor: { equipped(slot) }, yokai: YokaiWorld 風（list・damage）, playerPos(): Vec3, big?: { damage(part, amount, at, source) } })
 *   .onCombatEvent(e)   … パンチ `punchHit`・刀 `techHit` を 聞く（ほかの 出来事は 無視）
 *   .onBigHit(part)     … がしゃどくろの 箱（部位）に 刀・パンチが 当たった
 *   .step()             … 1 ステップ（当てた 時を 0 として 12 回目の step で 追い打ちが 出る）
 *   .drainEvents()      … `{ type: 'kodachiHit', tick, yokaiId, damage }` の 列（読むと 空に なる）
 *   .pending()          … 待って いる 追い打ちの 数
 * 追い打ちの ダメージは YokaiManager.damage(id, 5, from, { dist: 0, up: 0 }, 'kodachi') で わたす（押さない・よろけの 2 倍を 使わない・音や 経験値の 「たたいた」きっかけに しない）。
 */
const time: TimeOfDay = {
  dayTick: () => 0, day: () => 0, phase: (): DayPhase => 'day', skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1,
  set: () => {}, update: () => {}, onPhaseChange: () => () => {},
};
const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };

const FROM: Vec3 = { x: 2.5, y: 9, z: 6.5 };

function rig(worn: ItemId | null = 'ninja_tekko') {
  const world = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
  for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
  const added: { item: ItemId; count: number }[] = [];
  const inventory = { add: (item: ItemId, count: number) => (added.push({ item, count }), 0) } as unknown as Inventory;
  const player = { position: { ...FROM } };
  const m = new YokaiManager({ world, time, getPlayer: () => player, combat, inventory, seed: 1 });
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  let arms: ItemId | null = worn;
  const k = new Kodachi({
    armor: { equipped: (slot: ArmorSlot) => (slot === 'arms' ? arms : null) },
    yokai: m,
    playerPos: () => ({ ...FROM }),
  });
  const tick = { n: 0 };
  /** 妖怪 1 体 を 体力 hp で 出す（うごかない） */
  const add = (x: number, z: number, hp = 20) => {
    const id = m.spawn('karakasa', x, 9, z, { ai: false });
    m.setHp(id, hp);
    return id;
  };
  const hpOf = (id: number) => m.list().find((y) => y.id === id)!.hp;
  const posOf = (id: number) => ({ ...m.list().find((y) => y.id === id)!.position });
  /** パンチが 当たった（ダメージ → 出来事） */
  const punch = (id: number, dmg = 1) => {
    m.damage(id, dmg, FROM);
    k.onCombatEvent({ type: 'punchHit', tick: tick.n, yokaiId: id } as CombatEvent);
  };
  /** 刀 の わざが 当たった */
  const slash = (id: number, dmg = 3) => {
    m.damage(id, dmg, FROM);
    k.onCombatEvent({ type: 'techHit', tick: tick.n, tech: 'slash', yokaiId: id, damage: dmg, knock: 1, up: 0, position: { ...FROM } } as never);
  };
  const step = (n = 1) => { for (let i = 0; i < n; i++) { tick.n++; k.step(); m.update(1 / 60); } };
  const hits = () => k.drainEvents().filter((e) => e.type === 'kodachiHit') as { type: 'kodachiHit'; yokaiId: number; damage: number }[];
  return { m, k, add, hpOf, posOf, punch, slash, step, hits, added, wear: (i: ItemId | null) => { arms = i; } };
}

describe('AC10 追い打ち（パンチ・刀）', () => {
  it('手甲 + パンチ: そのステップに 1 へり、11 ステップ後は まだ 同じ、12 ステップ目に さらに 5 へる・kodachiHit（damage 5）1 回', () => {
    const r = rig();
    const id = r.add(4.5, 6.5);
    r.punch(id);
    expect(r.hpOf(id)).toBe(19);
    r.step(11);
    expect(r.hpOf(id), '11 ステップ後').toBe(19);
    expect(r.hits()).toEqual([]);
    r.step(1);
    expect(r.hpOf(id), '12 ステップ目').toBe(14);
    expect(r.hits()).toMatchObject([{ type: 'kodachiHit', yokaiId: id, damage: 5 }]);
    r.step(60);
    expect(r.hits(), 'もう 出ない').toEqual([]);
    expect(r.hpOf(id)).toBe(14);
  });
  it('手甲なし → kodachiHit なし・体力は パンチの ぶんだけ', () => {
    for (const worn of [null, 'ninja_zukin' as ItemId, 'kote' as ItemId]) {
      const r = rig(worn);
      const id = r.add(4.5, 6.5);
      r.punch(id);
      r.step(30);
      expect(r.hits(), String(worn)).toEqual([]);
      expect(r.hpOf(id)).toBe(19);
    }
  });
  it('刀（techHit）でも 同じ: 12 ステップ目に 5', () => {
    const r = rig();
    const id = r.add(4.5, 6.5);
    r.slash(id, 3);
    expect(r.hpOf(id)).toBe(17);
    r.step(11);
    expect(r.hpOf(id)).toBe(17);
    r.step(1);
    expect(r.hpOf(id)).toBe(12);
    expect(r.hits()).toMatchObject([{ yokaiId: id, damage: 5 }]);
  });
  it('追い打ちで 押されない（位置が かわらない）。パンチの 押しが おわった あと から 追い打ちを 見る', () => {
    const r = rig();
    const id = r.add(4.5, 6.5);
    r.punch(id);
    r.step(11);
    const before = r.posOf(id);
    r.step(30);
    const after = r.posOf(id);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.z).toBeCloseTo(before.z, 6);
    expect(r.hpOf(id)).toBe(14);
  });
  it('武器の 強さに かかわらず 5（強い 刀でも 5）', () => {
    const r = rig();
    const id = r.add(4.5, 6.5, 100);
    r.slash(id, 40);
    r.step(12);
    expect(r.hpOf(id)).toBe(100 - 40 - 5);
  });
});

describe('AC11 対象外', () => {
  it('弓（arrowHit）・うち ミス・ためわざの はじまり など では 出ない', () => {
    const r = rig();
    const id = r.add(4.5, 6.5);
    r.m.damage(id, 2, FROM);
    r.k.onCombatEvent({ type: 'arrowHit', tick: 1, yokaiId: id, damage: 2, position: { ...FROM } } as never);
    r.k.onCombatEvent({ type: 'punchMiss', tick: 1 } as CombatEvent);
    r.k.onCombatEvent({ type: 'techStart', tick: 1, tech: 'slash' } as never);
    r.k.onCombatEvent({ type: 'techMiss', tick: 1, tech: 'slash' } as never);
    r.k.onCombatEvent({ type: 'playerHit', tick: 1, by: 'karakasa', amount: 1 } as CombatEvent);
    expect(r.k.pending()).toBe(0);
    r.step(40);
    expect(r.hits()).toEqual([]);
    expect(r.hpOf(id)).toBe(18);
  });
  it('1 回の パンチで 追い打ちは 1 回だけ（追い打ちが 追い打ちを 出さない）', () => {
    const r = rig();
    const id = r.add(4.5, 6.5, 100);
    r.punch(id);
    r.step(12);
    expect(r.k.pending()).toBe(0);
    r.step(60);
    expect(r.hits()).toHaveLength(1);
    expect(r.hpOf(id)).toBe(100 - 1 - 5);
  });
  it('YokaiManager: by = kodachi の ダメージは 「たたいた」きっかけ（cues・音）に ならず、押さない', () => {
    const r = rig();
    const id = r.add(4.5, 6.5);
    r.m.drainEvents();
    r.m.damage(id, 5, FROM, { dist: 0, up: 0 }, 'kodachi' as never);
    r.step(20);
    expect(r.hpOf(id)).toBe(15);
    expect(r.posOf(id).x).toBeCloseTo(4.5, 6);
    const hurt = r.m.drainEvents().filter((e) => e.type === 'hurt') as { by?: string }[];
    expect(hurt.every((h) => h.by !== 'player'), 'りっくんが たたいた ことに しない').toBe(true);
  });
});

describe('AC12 手甲の 例外', () => {
  it('本の 当たりで たおれた → 追い打ちなし', () => {
    const r = rig();
    const id = r.add(4.5, 6.5, 1);
    r.punch(id, 1);
    expect(r.m.list().find((y) => y.id === id)!.state).toBe('dying');
    r.step(40);
    expect(r.hits()).toEqual([]);
    expect(r.m.drainEvents().filter((e) => e.type === 'defeat')).toHaveLength(1);
  });
  it('待って いる あいだに 妖怪が 消えた → 何もしない（エラーも 出ない）', () => {
    const r = rig();
    const id = r.add(4.5, 6.5, 20);
    r.punch(id);
    r.m.damage(id, 100, FROM); // 別の 手で たおれる
    r.step(40);
    expect(r.hits()).toEqual([]);
    expect(r.m.drainEvents().filter((e) => e.type === 'defeat')).toHaveLength(1);
  });
  it('追い打ちで たおれる → ふつうの defeat（1 回）。kodachiHit は 5', () => {
    const r = rig();
    const id = r.add(4.5, 6.5, 6);
    r.punch(id);
    expect(r.hpOf(id)).toBe(5);
    r.step(12);
    expect(r.m.list().find((y) => y.id === id)!.state).toBe('dying');
    const defeats = r.m.drainEvents().filter((e) => e.type === 'defeat');
    expect(defeats).toHaveLength(1);
    expect(defeats[0]).toMatchObject({ id, kind: 'karakasa' });
    expect(r.hits()).toMatchObject([{ yokaiId: id, damage: 5 }]);
  });
  it('けさぎり で 2 体 → 2 回', () => {
    const r = rig();
    const a = r.add(4.5, 6.5);
    const b = r.add(6.5, 6.5);
    r.slash(a, 3);
    r.slash(b, 3);
    expect(r.k.pending()).toBe(2);
    r.step(12);
    expect(r.hits().map((h) => h.yokaiId).sort()).toEqual([a, b].sort());
    expect(r.hpOf(a)).toBe(12);
    expect(r.hpOf(b)).toBe(12);
  });
  it('よろけ中の 子: 追い打ちは 5 の まま、よろけの 2 倍は つぎの 本の 当たりに のこる', () => {
    const r = rig();
    const id = r.add(4.5, 6.5, 40);
    r.punch(id, 1);
    r.step(5);
    expect(r.m.applyStagger(id, 'parry')).toBe(true);
    expect(r.m.stagger(id)?.double).toBe(true);
    r.step(7); // 12 ステップ目
    expect(r.hpOf(id), '追い打ちは 5 の まま').toBe(40 - 1 - 5);
    expect(r.m.stagger(id)?.double, '2 倍は のこる').toBe(true);
    r.m.damage(id, 1, FROM);
    expect(r.hpOf(id), 'つぎの 本の 当たりで 2 倍').toBe(40 - 1 - 5 - 2);
  });
  it('よろけ中の 子に 本が 当たる: 本は 2 倍、追い打ちは 5', () => {
    const r = rig();
    const id = r.add(4.5, 6.5, 40);
    r.m.applyStagger(id, 'parry');
    r.punch(id, 1);
    expect(r.hpOf(id)).toBe(38);
    r.step(12);
    expect(r.hpOf(id)).toBe(33);
  });
  it('待って いる あいだに 手甲を ぬいでも、もう 出た 追い打ちは 出る', () => {
    const r = rig();
    const id = r.add(4.5, 6.5);
    r.punch(id);
    r.step(3);
    r.wear(null);
    r.step(9);
    expect(r.hpOf(id)).toBe(14);
    expect(r.hits()).toHaveLength(1);
  });
  it('tekkoDelayTicks 30・tekkoDamage 2 に すると 30 ステップ目に 2', () => {
    const saved = { d: NINJA_TUNING.tekkoDelayTicks, a: NINJA_TUNING.tekkoDamage };
    try {
      NINJA_TUNING.tekkoDelayTicks = 30;
      NINJA_TUNING.tekkoDamage = 2;
      const r = rig();
      const id = r.add(4.5, 6.5);
      r.punch(id);
      r.step(29);
      expect(r.hpOf(id)).toBe(19);
      r.step(1);
      expect(r.hpOf(id)).toBe(17);
      expect(r.hits()).toMatchObject([{ damage: 2 }]);
    } finally {
      NINJA_TUNING.tekkoDelayTicks = saved.d;
      NINJA_TUNING.tekkoDamage = saved.a;
    }
  });
  it('待ちは 最大 16 本（それより 多い ときは 古い 物から 出さない）。1 ステップに 見るのは 待ちの 数だけ', () => {
    const r = rig();
    const ids: number[] = [];
    for (let i = 0; i < 20; i++) ids.push(r.add(4.5 + (i % 10), 6.5 + Math.floor(i / 10) * 2, 100));
    for (const id of ids) r.slash(id, 1);
    expect(r.k.pending()).toBe(16);
    r.step(12);
    const fired = r.hits().map((h) => h.yokaiId);
    expect(fired).toHaveLength(16);
    expect(fired).not.toContain(ids[0]);
    expect(fired).not.toContain(ids[3]);
    expect(fired).toContain(ids[19]);
    expect(r.hpOf(ids[0]!)).toBe(99);
  });
});

describe('AC13 手甲 × がしゃどくろ', () => {
  const box = (name: string): BoxLike => ({ name, c: [0, 5, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [1, 1, 1] });
  function bigRig() {
    const bh = new BigHit({ scene: new Scene(), angry: () => undefined });
    bh.bind([box('handL'), box('rampL3')], null);
    const k = new Kodachi({
      armor: { equipped: (slot: ArmorSlot) => (slot === 'arms' ? ('ninja_tekko' as ItemId) : null) },
      yokai: { list: () => [], damage: () => 0 } as never,
      playerPos: () => ({ ...FROM }),
      big: bh,
    });
    return { bh, k };
  }
  it('刀・パンチが 部位に 当たる → 12 ステップ後に その 部位で damageOf(部位, 5) だけ 体力が へる', () => {
    const { bh, k } = bigRig();
    const before = bh.hp;
    k.onBigHit('hand');
    for (let i = 0; i < 11; i++) k.step();
    expect(bh.hp).toBe(before);
    k.step();
    expect(damageOf('hand', 5)).toBeGreaterThan(0);
    expect(bh.hp).toBeCloseTo(before - damageOf('hand', 5), 5);
    expect(bh.last?.source).toBe('kodachi');
  });
  it('倍率 0 の 部位（雲）→ へらない', () => {
    const { bh, k } = bigRig();
    const before = bh.hp;
    k.onBigHit('cloud');
    for (let i = 0; i < 20; i++) k.step();
    expect(bh.hp).toBe(before);
  });
  it('手甲を 着て いなければ 何も 起きない', () => {
    const bh = new BigHit({ scene: new Scene(), angry: () => undefined });
    bh.bind([box('handL')], null);
    const k = new Kodachi({ armor: { equipped: () => null }, yokai: { list: () => [], damage: () => 0 } as never, playerPos: () => ({ ...FROM }), big: bh });
    const before = bh.hp;
    k.onBigHit('hand');
    for (let i = 0; i < 20; i++) k.step();
    expect(bh.hp).toBe(before);
  });
  it('BigHit の 出来事 onStrike: 刀（blade）・パンチ（ray）の 当たりだけ 知らせる。波・雷・ドーム・追い打ち自身（kodachi）は 知らせない', () => {
    const got: { part: string; source: string }[] = [];
    const bh = new BigHit({ scene: new Scene(), angry: () => undefined, onStrike: (i: { part: string; source: string }) => got.push(i) } as never);
    bh.bind([box('handL')], null);
    for (const source of ['blade', 'ray', 'wave', 'strike', 'dome', 'kodachi']) bh.damage('hand', 10, null, source);
    expect(got.map((g) => g.source)).toEqual(['blade', 'ray']);
    expect(got.every((g) => g.part === 'hand')).toBe(true);
  });
});
