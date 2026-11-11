import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, Vec3, YokaiKind } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';
import { createYokaiConfig, type YokaiConfig } from './config';
import { SENSE } from './senseTuning';
import type { YokaiPartner } from './target';

/**
 * SIGHT-1（#446）AC4〜AC9（妖怪）。先に書いた テスト（実装の前は 赤）。
 * 妖怪は あいだに 固いブロックが あると 気づかない・追いかけ中も 見えない が 1 秒 つづくと さがす・攻撃は 見えている ときだけ。
 * AC8（戦闘の曲）は 曲を 作らず「壁ごしの 妖怪の state が chase / attack に ならない」で かわりに 見る（曲は その state で 始まる）。
 */
const SIZE = { x: 64, y: 40, z: 64 };
/** 1P の 足もと（床は y = 8 の 石の 上） */
const P1 = { x: 2.5, y: 9, z: 6.5 };
const COMBAT_STATES: ReadonlySet<string> = new Set(['chase', 'attack', 'retreat']);
const LOSE: number = (SENSE as unknown as { loseSightSteps?: number }).loseSightSteps ?? 60;

function makeTime(phase: DayPhase = 'night'): TimeOfDay {
  return { dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} };
}
const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };
const inv = { add: () => 0 } as unknown as Inventory;

interface Opts {
  p1?: Vec3;
  p2?: Vec3;
  config?: Partial<YokaiConfig>;
}
function rig(o: Opts = {}) {
  const world = new ArrayVoxelWorld(SIZE);
  world.fill(0, 8, 0, 40, 8, 40, 'stone');
  const p1 = { position: { ...(o.p1 ?? P1) } };
  const hurts: Array<{ amount: number; kind: YokaiKind }> = [];
  const partner: YokaiPartner | null = o.p2 ? { position: { ...o.p2 }, targetable: true, hurt: (amount, kind) => (hurts.push({ amount, kind }), true) } : null;
  const config = { ...createYokaiConfig(), yokaiAutoSpawn: false, yokaiWander: false, ...o.config } as YokaiConfig;
  const m = new YokaiManager({ world, time: makeTime(), getPlayer: () => p1, combat, inventory: inv, seed: 5, config, ...(partner ? { partner: () => partner } : {}) });
  const states: string[] = [];
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      m.update(1 / 60);
      states.push(m.list()[0]?.state ?? 'none');
    }
  };
  /** z の 1 マス（x 0〜40・高さ 9〜14）の 石の 壁。on = false で こわす */
  const wall = (z: number, on = true, x0 = 0, x1 = 40) => void world.fill(x0, 9, Math.floor(z), x1, 14, Math.floor(z), on ? 'stone' : 'air');
  return { m, p1, partner, hurts, step, wall, states, state: () => m.list()[0]!.state, pos: () => m.list()[0]!.position };
}
const inCombat = (s: string) => COMBAT_STATES.has(s);

const KINDS: YokaiKind[] = ['karakasa', 'chochin', 'nurikabe', 'rokurokubi'];

describe('AC4 石の壁ごしには 気づかない・こわすと 気づく', () => {
  it('からかさ: 気づく 距離の 中でも 壁 1 枚で うろうろ・休みのまま。壁を こわすと 追う', () => {
    const r = rig();
    r.wall(11);
    r.m.spawn('karakasa', P1.x, 9, P1.z + 10);
    r.step(300);
    expect(r.states.some(inCombat), `壁ごし: ${[...new Set(r.states)].join(',')}`).toBe(false);
    r.wall(11, false);
    r.step(60);
    expect(inCombat(r.state()), '壁を こわしたら 気づく').toBe(true);
  });
  it('壁が 1 マスぶん うすくても、妖怪の 目の 高さの 上に ブロックが あっても 同じ（目 → 相手の 線が 通らない）', () => {
    const r = rig();
    r.wall(9);
    r.m.spawn('karakasa', P1.x, 9, P1.z + 6);
    r.step(300);
    expect(r.states.some(inCombat)).toBe(false);
  });
});

describe('AC5 追いかけ中に かくれる', () => {
  it('壁の うしろに かくれて loseSightSteps 見えないと さがす。そのあいだ 攻撃を はじめない。見えている あいだは 追う', () => {
    const r = rig();
    r.m.spawn('karakasa', P1.x, 9, P1.z + 12);
    for (let i = 0; i < 90 && r.state() !== 'chase'; i++) r.step(1);
    expect(r.state(), '見えているので 追い はじめる').toBe('chase');
    r.wall(9); // 1P の すぐ 前に 壁（妖怪は まだ 遠い）
    r.states.length = 0;
    r.step(LOSE - 10);
    expect(r.state(), '見えない が まだ 短い あいだは 追う まま').toBe('chase');
    r.step(30);
    expect(r.state(), 'loseSightSteps たったら さがす').toBe('search');
    r.step(120);
    expect(r.states.includes('attack'), 'かくれている あいだ 攻撃しない').toBe(false);
  });
  it('とちゅうで また 見えたら 追いかけに もどる', () => {
    const r = rig();
    r.m.spawn('karakasa', P1.x, 9, P1.z + 12);
    for (let i = 0; i < 90 && r.state() !== 'chase'; i++) r.step(1);
    r.wall(9);
    r.step(LOSE - 20);
    r.wall(9, false);
    r.step(20);
    expect(r.state()).toBe('chase');
  });
});

describe('AC6 壁ごしでは 攻撃を はじめない（4 しゅ）', () => {
  for (const kind of KINDS) {
    it(`${kind}: 壁 1 枚 ごしで とどく 近さでも 戦わない。壁を こわすと 気づく`, () => {
      const r = rig();
      r.wall(7);
      r.m.spawn(kind, P1.x, 9, P1.z + 3);
      r.step(240);
      expect(r.states.some(inCombat), `${kind}: ${[...new Set(r.states)].join(',')}`).toBe(false);
      r.wall(7, false);
      r.step(90);
      expect(r.states.slice(-90).some(inCombat), `${kind}: 壁を こわしたら 戦う`).toBe(true);
    });
  }
});

describe('AC7 2P でも 同じ・1P が かくれ 2P が 見えるなら 2P をねらう', () => {
  const X = 20.5;
  const Z = 20.5;
  it('2P だけ 壁ごし（1P は 遠い）: 気づかない。こわすと 気づく', () => {
    const r = rig({ p1: { x: 2.5, y: 9, z: 38.5 }, p2: { x: X, y: 9, z: Z + 8 } });
    r.wall(Z + 4);
    r.m.spawn('karakasa', X, 9, Z);
    r.step(300);
    expect(r.states.some(inCombat)).toBe(false);
    r.wall(Z + 4, false);
    r.step(60);
    expect(inCombat(r.state())).toBe(true);
  });
  it('壁ごしの 2P には 近くても 攻撃しない（ダメージ 0）', () => {
    const r = rig({ p1: { x: 2.5, y: 9, z: 38.5 }, p2: { x: X, y: 9, z: Z + 3 } });
    r.wall(Z + 1, true, 10, 30);
    r.m.spawn('karakasa', X, 9, Z);
    r.step(300);
    expect(r.hurts.length).toBe(0);
    expect(r.states.some(inCombat)).toBe(false);
  });
  it('追いかけ中の 2P が かくれると さがす', () => {
    const r = rig({ p1: { x: 2.5, y: 9, z: 38.5 }, p2: { x: X, y: 9, z: Z + 12 } });
    r.m.spawn('karakasa', X, 9, Z);
    for (let i = 0; i < 90 && r.state() !== 'chase'; i++) r.step(1);
    expect(r.state()).toBe('chase');
    r.wall(Z + 9, true, 10, 30);
    r.states.length = 0;
    r.step(LOSE + 20);
    expect(r.state()).toBe('search');
    expect(r.states.includes('attack')).toBe(false);
  });
  it('1P は 近いが 壁のうしろ・2P は 遠いが 見える: 2P を ねらって 追う（2P の ほうへ 動く）', () => {
    const r = rig({ p1: { x: X, y: 9, z: Z + 6 }, p2: { x: X - 12, y: 9, z: Z } });
    r.wall(Z + 3, true, 10, 30);
    r.m.spawn('karakasa', X, 9, Z);
    r.step(40);
    expect(inCombat(r.state()), '見える 2P に 気づく').toBe(true);
    expect(r.pos().x, '2P（西）の ほうへ').toBeLessThan(X - 0.3);
  });
});

describe('AC8 壁ごしの 妖怪だけ のとき 戦闘の state（= 戦闘の曲の きっかけ）に ならない', () => {
  it('4 しゅ とも 近くの 壁の むこうでは chase / attack に ならない', () => {
    for (const kind of KINDS) {
      const r = rig();
      r.wall(8);
      r.m.spawn(kind, P1.x, 9, P1.z + 4);
      r.step(240);
      expect(r.states.some((s) => s === 'chase' || s === 'attack'), kind).toBe(false);
    }
  });
});

describe('AC9 新しい数は SENSE の 表', () => {
  it('eyeFrac 0.8・targetHeights [0.9, 1.5]・loseSightSteps 60', () => {
    const s = SENSE as unknown as Record<string, unknown>;
    expect(s.eyeFrac).toBe(0.8);
    expect(s.targetHeights).toEqual([0.9, 1.5]);
    expect(s.loseSightSteps).toBe(60);
  });
});
