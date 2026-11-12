import { describe, expect, it } from 'vitest';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { createFeathers, flapScale, pickTrails, wingFrame } from './tenshiFxModel';

const T = LEGEND4_TUNING.tenshi;

/** LEGEND-4 T12（§3.7）: 羽は 全部で featherPointsMax 点まで・古い 物から 消す。つばさの コマ・羽ばたき・羽の すじの えらび方 */
describe('舞う 羽', () => {
  it('1 回で burstFeathers まい。featherSteps ステップ あとに 消える', () => {
    const f = createFeathers();
    f.burst({ x: 0, y: 0, z: 0 });
    expect(f.list()).toHaveLength(T.burstFeathers);
    for (let i = 0; i < T.featherSteps; i++) f.step();
    expect(f.list()).toHaveLength(0);
  });
  it('たくさん とんでも 48 点 まで（古い 物から 消す）', () => {
    const f = createFeathers();
    for (let i = 0; i < 40; i++) f.burst({ x: i, y: 0, z: 0 });
    expect(f.list().length).toBeLessThanOrEqual(T.featherPointsMax);
    expect(f.list().length).toBe(T.featherPointsMax);
    expect(f.list().some((p) => Math.round(p.x) === 39)).toBe(true);
    expect(f.list().some((p) => Math.round(p.x) === 0)).toBe(false);
  });
  it('ゆっくり 下へ おちる', () => {
    const f = createFeathers();
    f.burst({ x: 0, y: 5, z: 0 });
    for (let i = 0; i < 30; i++) f.step();
    for (const p of f.list()) expect(p.y).toBeLessThan(5.6);
  });
  it('clear で ぜんぶ 消える', () => {
    const f = createFeathers();
    f.burst({ x: 0, y: 0, z: 0 });
    f.clear();
    expect(f.list()).toHaveLength(0);
  });
});

describe('つばさの コマ・羽ばたき', () => {
  it('wingFrame は 0 〜 wingFrames-1 を ぐるぐる', () => {
    const seen = new Set<number>();
    for (let t = 0; t < T.wingFrames * T.wingStepsPerFrame * 2; t++) seen.add(wingFrame(t));
    expect(seen.size).toBe(T.wingFrames);
    expect(Math.min(...seen)).toBe(0);
  });
  it('flapScale: 羽ばたき中だけ 大きく なって、おわると 1', () => {
    expect(flapScale(0)).toBe(1);
    expect(flapScale(Math.floor(T.flapSteps / 2))).toBeGreaterThan(1);
    expect(flapScale(T.flapSteps)).toBeCloseTo(1, 5);
  });
});

describe('羽の すじを つける や', () => {
  const a = (id: number, feather?: boolean) => ({ id, position: { x: id, y: 0, z: 0 }, velocity: { x: 1, y: 0, z: 0 }, age: 0, feather });
  it('feather の や だけ。trailMax 本まで（新しい 方）', () => {
    const arrows = [a(1, true), a(2), a(3, true), a(4, true), a(5, true)];
    expect(pickTrails(arrows).map((x) => x.id)).toEqual([3, 4, 5].slice(-T.trailMax));
    expect(pickTrails([a(1)])).toEqual([]);
  });
});
