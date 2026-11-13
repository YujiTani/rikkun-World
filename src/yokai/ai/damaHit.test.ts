import { describe, expect, it } from 'vitest';
import type { DayPhase, Inventory, PlayerCombat, TimeOfDay, YokaiTitle } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { YokaiManager } from './YokaiManager';
import { createYokaiConfig, type YokaiConfig } from './config';
import type { DefeatDama } from './managerTypes';

/**
 * TOWN-1 1A AC1・AC2: 妖怪が たおれた とき「だれが 1 回でも 当てたか」を onDama で 知らせる。
 * 当てずに 消えた（朝に 帰る・落下・setHp(0)）ときは 知らせない（＝ ようかいダマ 0）。場所の 倍率 M・二つ名は 知らせの 中身。
 */
const SIZE = { x: 40, y: 30, z: 40 };
const time = (phase: DayPhase): TimeOfDay => ({ dayTick: () => 0, day: () => 0, phase: () => phase, skyColor: () => '#000', brightness: () => 1, dollBrightness: () => 1, set: () => {}, update: () => {}, onPhaseChange: () => () => {} });
const combat: PlayerCombat = { hp: () => 20, maxHp: () => 20, dead: () => false, invincibleTicks: () => 0, damage: () => true, heal: () => 0, drainEvents: () => [] };
const inv = { add: () => 0 } as unknown as Inventory;

function rig() {
  const got: DefeatDama[] = [];
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(0, 8, 0, SIZE.x - 1, 8, SIZE.z - 1, 'stone');
  const config = { ...createYokaiConfig(), yokaiAutoSpawn: false, yokaiWander: false } as YokaiConfig;
  const p = { position: { x: 5.5, y: 9, z: 5.5 } };
  const m = new YokaiManager({ world: w, time: time('night'), getPlayer: () => p, combat, inventory: inv, seed: 5, config, onDama: (i) => got.push(i) });
  const spawn = (o: { title?: YokaiTitle; m?: number } = {}) => m.spawn('karakasa', 20.5, 9, 20.5, { ai: false, ...o });
  const from = { x: 19, y: 9, z: 20.5 };
  return { m, got, spawn, from, step: (n: number) => { for (let i = 0; i < n; i++) m.update(1 / 60); } };
}

describe('妖怪を たおした とき 当てた 人を 知らせる（onDama）', () => {
  it('1P だけが 当てて たおした → hit1 のみ', () => {
    const r = rig();
    const id = r.spawn();
    r.m.damage(id, 9999, r.from);
    expect(r.got).toHaveLength(1);
    expect(r.got[0]).toMatchObject({ id, kind: 'karakasa', title: 'none', hit1: true, hit2: false });
  });
  it('2P だけ → hit2 のみ', () => {
    const r = rig();
    const id = r.spawn();
    r.m.damage(id, 9999, r.from, undefined, 'player', 2);
    expect(r.got[0]).toMatchObject({ hit1: false, hit2: true });
  });
  it('1P が 1 回 当てて 2P が とどめ → 2 人とも（1P の 前の 1 回も 数える）', () => {
    const r = rig();
    const id = r.spawn();
    expect(r.m.damage(id, 1, r.from)).toBeGreaterThan(0);
    r.m.damage(id, 9999, r.from, undefined, 'player', 2);
    expect(r.got[0]).toMatchObject({ hit1: true, hit2: true });
  });
  it('二つ名・場所の 倍率は 知らせの 中身（倍率 3 でも 数は 二つ名と 妖怪の 番号だけで 決まる）', () => {
    const r = rig();
    const id = r.spawn({ title: 'oyabun', m: 3 });
    r.m.damage(id, 9999, r.from);
    expect(r.got[0]).toMatchObject({ title: 'oyabun' });
  });
  it('だれも 当てずに たおれた（setHp 0 ＝ 落下・水と 同じ 道）・朝に 帰った → 知らせない', () => {
    const r = rig();
    const id = r.spawn();
    r.m.setHp(id, 0);
    r.step(200);
    expect(r.got).toHaveLength(0);
  });
});
