import { describe, expect, it } from 'vitest';
import { groupsOf, isClearAbove, pickSpot, spotOk, type SpawnProbe, type SpawnTune } from './gashaGeyserSpawn';
import { makeRnd } from './gashaGeyserField';

const TUNE: SpawnTune = { radius: 100, bodyClear: 12, gap: 1, tries: 40 };

/** 平らな 草原（地面の 高さ 10）。穴あけ 用の 上書きを 受ける */
function world(over: Record<string, string> = {}, bodyAt: (x: number, y: number, z: number) => boolean = () => false, surface: (x: number, z: number) => number = () => 10): SpawnProbe {
  return {
    surfaceY: surface,
    blockAt: (x, y, z) => over[`${x},${y},${z}`] ?? (y > surface(x, z) ? 'air' : y === surface(x, z) ? 'grass' : 'dirt'),
    bodySolid: bodyAt,
    taken: () => false,
  };
}

describe('gashaGeyserSpawn（まわりの 地面から えらぶ）', () => {
  it('同じ シードなら 同じ 場所。半径の 中、体の 下（bodyClear）の そと', () => {
    const a = pickSpot(makeRnd(5), 0, 0, 2, world(), TUNE)!;
    const b = pickSpot(makeRnd(5), 0, 0, 2, world(), TUNE)!;
    expect(a).toEqual(b);
    const rnd = makeRnd(9);
    for (let i = 0; i < 200; i++) {
      const s = pickSpot(rnd, 0, 0, 2, world(), TUNE)!;
      const d = Math.hypot(s.x0 + 1, s.z0 + 1);
      expect(d).toBeLessThanOrEqual(TUNE.radius + 1.5);
      expect(d).toBeGreaterThanOrEqual(TUNE.bodyClear);
      expect(s.y).toBe(10);
    }
  });

  it('半径を 小さく すれば その 中だけ（調整表）', () => {
    const rnd = makeRnd(3);
    for (let i = 0; i < 100; i++) {
      const s = pickSpot(rnd, 50, 50, 2, world(), { ...TUNE, radius: 30 })!;
      expect(Math.hypot(s.x0 + 1 - 50, s.z0 + 1 - 50)).toBeLessThanOrEqual(31.5);
    }
  });

  it('草・土の 上だけ。水・木・建物・石の 上と、でこぼこは えらばない', () => {
    const ok = (over: Record<string, string>) => spotOk(40, 40, 2, 0, 0, world(over), TUNE);
    expect(ok({})).toBe(true);
    expect(ok({ '41,10,41': 'stone' })).toBe(false);
    expect(ok({ '41,10,41': 'sand' })).toBe(false);
    expect(ok({ '40,11,40': 'water' })).toBe(false); // 水の 中
    expect(ok({ '40,11,41': 'log' })).toBe(false); // 木
    expect(ok({ '41,12,40': 'leaves' })).toBe(false); // 葉の 下
    expect(ok({ '41,11,41': 'brick' })).toBe(false); // 建物
    expect(ok({ '41,11,41': 'flower_y' })).toBe(true); // はなは じゃまに ならない
    expect(spotOk(40, 40, 2, 0, 0, world({}, () => false, (x) => (x === 41 ? 11 : 10)), TUNE)).toBe(false); // でこぼこ
  });

  it('体の 当たりの 上・そば、ほかの 間欠泉の そばは えらばない', () => {
    expect(spotOk(40, 40, 2, 0, 0, world({}, (x, y, z) => x === 39 && z === 41 && y === 12), TUNE)).toBe(false);
    expect(spotOk(5, 5, 2, 0, 0, world(), TUNE)).toBe(false); // 体の 中心の すぐ そば
    const p = { ...world(), taken: (x: number, z: number) => x === 42 && z === 40 };
    expect(spotOk(40, 40, 2, 0, 0, p, TUNE)).toBe(false); // gap = 1 の となり
    expect(spotOk(40, 40, 2, 0, 0, { ...world(), taken: (x: number, z: number) => x === 44 && z === 40 }, TUNE)).toBe(true);
  });

  it('えらべる 所が ない（ぜんぶ 水）なら null', () => {
    const w = world({}, () => false);
    const water: SpawnProbe = { ...w, blockAt: (x, y) => (y > 10 ? (y === 11 ? 'water' : 'air') : w.blockAt(x, y, 0)) };
    expect(pickSpot(makeRnd(1), 0, 0, 2, water, TUNE)).toBeNull();
  });

  it('isClearAbove / groupsOf', () => {
    expect(isClearAbove('air')).toBe(true);
    expect(isClearAbove('water')).toBe(false);
    expect(isClearAbove('log')).toBe(false);
    expect(groupsOf(0, 2)).toBe(0);
    expect(groupsOf(4, 2)).toBe(1);
    expect(groupsOf(5, 2)).toBe(2);
    expect(groupsOf(12, 2)).toBe(3);
    expect(groupsOf(9, 3)).toBe(1);
  });
});
