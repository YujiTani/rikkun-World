import { describe, expect, it } from 'vitest';
import type { DayPhase, Vec3 } from '../contracts';
import { createLiveSettings } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { AnimalManager } from './AnimalManager';

/**
 * COOP-1 作業 3a（#416）の 先行テスト（赤）。§9.5「野生の動物の数: 近い方のプレイヤーのまわりで数える（上限は 今の値）」・§2.6 の 動物の行
 * 「野生の数は 近い方で数える。消すのは 2 人とも 遠いとき」。数は 設定（createLiveSettings）から 読む（#311）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   AnimalManagerOptions.partner?: () => { position: Vec3 } | null  … 仲間（2P）の 足もと。なし / null = 1 人のときと 同じ。
 *     - 数える: 野生（なかまで ない）の にわとりを「いちばん 近い プレイヤー」に わりふり、その 人から animalRemoveDist 以内の 分を 数える。上限 animalWildMax は 1 人ごと。
 *     - 出す（trySpawn）: 野生が 上限未満の プレイヤーの まわりに 出す（2 人とも 未満なら 数が 少ない方・同じなら 1P）。2 人とも 上限なら null。
 *     - 消す: 野生は 2 人の 両方から animalRemoveDist より 遠いときだけ 消える。
 *     - ついてくる・運ぶ・だっこ・小屋の 子は 1P のまま（段階 3）。
 */

const WX = 200;
const WZ = 100;

function setup(o: { p1: Vec3; p2: Vec3 | null; phase?: DayPhase }) {
  const world = new ArrayVoxelWorld({ x: WX, y: 40, z: WZ });
  for (let x = 0; x < WX; x++) for (let z = 0; z < WZ; z++) world.setBlock(x, 8, z, 'grass');
  const settings = createLiveSettings();
  settings.animalAutoSpawn = false;
  settings.natsukiBugWaitTicks = 0;
  settings.natsukiPetWaitTicks = 0;
  const p1 = { position: { ...o.p1 } };
  const p2 = o.p2 ? { position: { ...o.p2 } } : null;
  const phase = o.phase ?? 'day';
  const m = new AnimalManager({
    world,
    getPlayer: () => p1,
    ...(p2 ? { partner: () => p2 } : {}),
    deps: {
      seed: 7,
      settings,
      dropEgg: () => {},
      addItem: () => true,
      carriedBefore: () => false,
      day: () => 0,
      phase: () => phase,
      countryAt: () => ({ kind: 'harappa' }),
    },
  });
  return { m, p1, p2, settings, step: (n: number) => void Array.from({ length: n }, () => m.update()) };
}

const hd = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** 消える 距離より 少し 遠い 間かく（設定から 読む） */
const FARD = createLiveSettings().animalRemoveDist + 6;
const P1: Vec3 = { x: 30.5, y: 9, z: 50.5 };
const P2: Vec3 = { x: 170.5, y: 9, z: 50.5 };

describe('§9.5 野生の動物の数は 近い方の プレイヤーの まわりで 数える', () => {
  it('2P の まわりが 上限まで 野生で いっぱいでも 1P の まわりには 出る。出た 場所は 1P の 出る 範囲', () => {
    const s = setup({ p1: P1, p2: P2 });
    for (let i = 0; i < s.settings.animalWildMax; i++) s.m.spawn(P2.x + i, 9, P2.z);
    const id = s.m.trySpawn();
    expect(id).not.toBeNull();
    const a = s.m.list().find((e) => e.id === id)!;
    expect(hd(a, P1)).toBeGreaterThanOrEqual(s.settings.animalSpawnMinDist - 1e-6);
    expect(hd(a, P1)).toBeLessThanOrEqual(s.settings.animalSpawnMaxDist + 1e-6);
  });
  it('1P の まわりが いっぱいなら 2P の まわりに 出る', () => {
    const s = setup({ p1: P1, p2: P2 });
    for (let i = 0; i < s.settings.animalWildMax; i++) s.m.spawn(P1.x + i, 9, P1.z);
    const id = s.m.trySpawn();
    expect(id).not.toBeNull();
    const a = s.m.list().find((e) => e.id === id)!;
    expect(hd(a, P2)).toBeLessThanOrEqual(s.settings.animalSpawnMaxDist + 1e-6);
  });
  it('2 人とも 上限なら 出ない。1 人ぶんの 上限を こえて 全体では 2 人分まで 出る', () => {
    const s = setup({ p1: P1, p2: P2 });
    const max = s.settings.animalWildMax;
    let got = 0;
    for (let i = 0; i < max * 2 + 4; i++) if (s.m.trySpawn() !== null) got++;
    expect(got).toBe(max * 2);
    expect(s.m.trySpawn()).toBeNull();
  });
  it('2P が いなければ（1 人）今までどおり 1 人の 上限だけ', () => {
    const s = setup({ p1: P1, p2: null });
    const max = s.settings.animalWildMax;
    let got = 0;
    for (let i = 0; i < max * 2 + 4; i++) if (s.m.trySpawn() !== null) got++;
    expect(got).toBe(max);
  });
  it('夜は 2 人とも 出ない（今までの きまり）', () => {
    const s = setup({ p1: P1, p2: P2, phase: 'night' });
    for (let i = 0; i < 50; i++) expect(s.m.trySpawn()).toBeNull();
  });
});

describe('§2.6 野生の 動物が 消えるのは 2 人とも 遠いとき', () => {
  const FAR_FROM_P1: Vec3 = { x: 30.5 + FARD, y: 9, z: 50.5 }; // 1P から animalRemoveDist より 遠い
  it('1P から 遠く・2P から 10 の にわとりは 消えない', () => {
    const s = setup({ p1: P1, p2: { x: FAR_FROM_P1.x + 10, y: 9, z: 50.5 } });
    const id = s.m.spawn(FAR_FROM_P1.x, 9, FAR_FROM_P1.z)!;
    s.step(5);
    expect(s.m.list().map((e) => e.id)).toContain(id);
  });
  it('2P が いなければ 同じ にわとりは 消える（今までどおり）', () => {
    const s = setup({ p1: P1, p2: null });
    const id = s.m.spawn(FAR_FROM_P1.x, 9, FAR_FROM_P1.z)!;
    s.step(5);
    expect(s.m.list().map((e) => e.id)).not.toContain(id);
  });
  it('2 人の 両方から 遠ければ 消える', () => {
    const s = setup({ p1: P1, p2: { x: 30.5, y: 9, z: 20.5 } });
    const id = s.m.spawn(FAR_FROM_P1.x + FARD / 2, 9, FAR_FROM_P1.z)!;
    s.step(5);
    expect(s.m.list().map((e) => e.id)).not.toContain(id);
  });
});
