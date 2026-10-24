import { describe, expect, it } from 'vitest';
import type { ArmorSlot, DayPhase, Inventory, ItemId, PlayerCombat, TimeOfDay, YokaiKind } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';
import { AI_CONST, KIND_AI } from './config';
import { SENSE } from './senseTuning';

/**
 * NINJA-1（#299）AC7〜AC9: 妖怪の 感知の 表（senseTuning.ts）と 忍び装束。実装の 前の テスト（赤）。
 * 窓口 の 形: `SENSE = { kinds: { karakasa: { sight, giveUp, shinobi }, … }, sightDy, giveUpDyMul, shinobiSightMul }`、
 * YokaiManager の 入り口 `armor?: { equipped(slot): ItemId | null }`（着て いる 防具 を 聞く）。
 */
function makeTime(phase: DayPhase = 'day'): TimeOfDay {
  return {
    dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1,
    set: () => {}, update: () => {}, onPhaseChange: () => () => {},
  };
}
function makeCombat(): PlayerCombat {
  return { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };
}
const inv = { add: () => 0 } as unknown as Inventory;

function setup(initial: ItemId | null = null) {
  let worn: ItemId | null = initial;
  const world = new ArrayVoxelWorld({ x: 64, y: 40, z: 64 });
  for (let x = 0; x <= 40; x++) for (let z = 0; z <= 40; z++) world.setBlock(x, 8, z, 'stone');
  const player = { position: { x: 2.5, y: 9, z: 6.5 } };
  let calls = 0;
  const armor = { equipped: (slot: ArmorSlot): ItemId | null => { calls++; return slot === 'body' ? worn : null; } };
  const m = new YokaiManager({ world, time: makeTime(), getPlayer: () => player, combat: makeCombat(), inventory: inv, seed: 1, armor } as never);
  m.config.yokaiAutoSpawn = false;
  m.config.yokaiWander = false;
  const step = (n = 1) => { for (let i = 0; i < n; i++) m.update(1 / 60); };
  /** 妖怪を プレイヤーから 水平に d、高さの 差 dy の ところに 置く（プレイヤーは 動かさない） */
  const spawnAt = (kind: YokaiKind, d: number, dy = 0) => m.spawn(kind, player.position.x, 9 - dy, player.position.z + d);
  const state = () => m.list()[0]!.state;
  const chasing = () => ['chase', 'attack', 'retreat'].includes(state());
  return { m, player, step, spawnAt, state, chasing, calls: () => calls, wear: (i: ItemId | null) => { worn = i; } };
}

describe('AC7 感知の 表（1 か所）', () => {
  it('4 しゅ の sight / giveUp / shinobi と 全体の 数', () => {
    expect(SENSE.kinds.karakasa).toEqual({ sight: 18, giveUp: 24, shinobi: true });
    expect(SENSE.kinds.chochin).toEqual({ sight: 21, giveUp: 27, shinobi: true });
    expect(SENSE.kinds.nurikabe).toEqual({ sight: 12, giveUp: 18, shinobi: true });
    expect(SENSE.kinds.rokurokubi).toEqual({ sight: 18, giveUp: 24, shinobi: true });
    expect(SENSE.sightDy).toBe(6);
    expect(SENSE.giveUpDyMul).toBe(2);
    expect(SENSE.shinobiSightMul).toBe(0.5);
  });
  it('KIND_AI・AI_CONST に sight・giveUp・sightDy が のこって いない', () => {
    for (const k of Object.keys(KIND_AI) as YokaiKind[]) {
      expect('sight' in KIND_AI[k], `KIND_AI.${k}.sight`).toBe(false);
      expect('giveUp' in KIND_AI[k], `KIND_AI.${k}.giveUp`).toBe(false);
    }
    expect('sightDy' in AI_CONST).toBe(false);
  });
});

describe('AC8 装束 なし で ふるまいが 同じ（からかさ・うろうろ なし・高さ 同じ）', () => {
  it('17.9 で 気づく（追う）、18.1 で 気づかない', () => {
    const a = setup();
    a.spawnAt('karakasa', 17.9);
    a.step(30);
    expect(a.chasing()).toBe(true);
    const b = setup();
    b.spawnAt('karakasa', 18.1);
    b.step(300);
    expect(b.state()).toBe('idle');
  });
  it('追って いる 子は 23.9 で 追う まま・24.1 で あきらめる', () => {
    const keep = setup();
    keep.spawnAt('karakasa', 10);
    keep.step(40);
    expect(keep.state()).toBe('chase');
    const y = keep.m.list()[0]!.position;
    keep.player.position.z = y.z - 23.9;
    keep.player.position.x = y.x;
    keep.step(1);
    expect(keep.state()).toBe('chase');
    const lose = setup();
    lose.spawnAt('karakasa', 10);
    lose.step(40);
    const p = lose.m.list()[0]!.position;
    lose.player.position.z = p.z - 24.1;
    lose.player.position.x = p.x;
    lose.step(2);
    expect(lose.state()).toBe('search');
  });
  it('高さの 差 6 で 気づく・6.1 で 気づかない。追う 子は 12 で 追う まま・12.1 で あきらめる', () => {
    const a = setup();
    a.spawnAt('karakasa', 5, -6); // 妖怪が プレイヤーより 6 下
    a.step(30);
    expect(a.chasing()).toBe(true);
    const b = setup();
    b.spawnAt('karakasa', 5, -6.1);
    b.step(300);
    expect(b.state()).toBe('idle');
    for (const [dy, want] of [[12, 'chase'], [12.1, 'search']] as const) {
      const c = setup();
      c.spawnAt('karakasa', 5);
      c.step(40);
      expect(c.state()).toBe('chase');
      c.player.position.y = c.m.list()[0]!.position.y + dy;
      c.step(2);
      expect(c.state(), `高さの 差 ${dy}`).toBe(want);
    }
  });
});

describe('AC9 装束 あり: 気づく 距離だけ 半分', () => {
  it('からかさ: 9.1 → 気づかない、8.9 → 気づく', () => {
    const a = setup('ninja_shozoku');
    a.spawnAt('karakasa', 9.1);
    a.step(300);
    expect(a.state()).toBe('idle');
    const b = setup('ninja_shozoku');
    b.spawnAt('karakasa', 8.9);
    b.step(30);
    expect(b.chasing()).toBe(true);
  });
  it('ちょうちん: 10.4 → 気づく・10.6 → 気づかない', () => {
    const a = setup('ninja_shozoku');
    a.spawnAt('chochin', 10.4);
    a.step(30);
    expect(a.chasing()).toBe(true);
    const b = setup('ninja_shozoku');
    b.spawnAt('chochin', 10.6);
    b.step(300);
    expect(b.state()).toBe('idle');
  });
  it('もう 追って いる からかさは 装束を 着ても 20 で 追う まま（あきらめるのは 24 の まま）', () => {
    const s = setup();
    s.spawnAt('karakasa', 8);
    s.step(40);
    expect(s.state()).toBe('chase');
    const e = s.m.list()[0]!.position;
    s.wear('ninja_shozoku' as ItemId);
    s.player.position.x = e.x;
    s.player.position.z = e.z - 20;
    s.step(1);
    expect(s.state(), '20 で 追う まま').toBe('chase');
    s.player.position.z = s.m.list()[0]!.position.z - 24.1;
    s.step(2);
    expect(s.state(), '24.1 で あきらめる').toBe('search');
  });
  it('shinobiSightMul を 1 に すると 装束を 着ていても 17.9 で 気づく', () => {
    const saved = SENSE.shinobiSightMul;
    try {
      SENSE.shinobiSightMul = 1;
      const a = setup('ninja_shozoku');
      a.spawnAt('karakasa', 17.9);
      a.step(30);
      expect(a.chasing()).toBe(true);
    } finally {
      SENSE.shinobiSightMul = saved;
    }
  });
  it('shinobi が false の 種類 は 装束で かわらない', () => {
    const saved = SENSE.kinds.karakasa.shinobi;
    try {
      SENSE.kinds.karakasa.shinobi = false;
      const a = setup('ninja_shozoku');
      a.spawnAt('karakasa', 17.9);
      a.step(30);
      expect(a.chasing()).toBe(true);
    } finally {
      SENSE.kinds.karakasa.shinobi = saved;
    }
  });
});

describe('§7 性能: 防具を 見る 回数は 妖怪 1 体 1 ステップ 1 回 まで（妖怪 2 倍で 仕事 2 倍くらい）', () => {
  it('数で 見る', () => {
    const one = setup('ninja_shozoku');
    one.spawnAt('karakasa', 30);
    one.step(40); // 出てくる まで
    const c0 = one.calls();
    one.step(100);
    const perOne = one.calls() - c0;
    const two = setup('ninja_shozoku');
    two.spawnAt('karakasa', 30);
    two.m.spawn('karakasa', 4.5, 9, 6.5 + 31);
    two.step(40);
    const d0 = two.calls();
    two.step(100);
    const perTwo = two.calls() - d0;
    expect(perOne).toBeLessThanOrEqual(100);
    expect(perTwo).toBeLessThanOrEqual(2 * perOne + 2);
  });
});
