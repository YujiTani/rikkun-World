import { describe, expect, it, vi } from 'vitest';
import { ShaftWorld } from './mineShafts';
import { spawnOf } from './terrain';

/**
 * MINE-1D レビュー直し 4〔性能〕: ほらあなの 区画の 計画は 短い 仕事ごとに 止まれる。
 *  ・先読み〔warmStep〕を 1 つずつ すすめた 結果は、いっきに 作った 結果〔region〕と 同じ
 *  ・ひろい ほらあなの 計画・ためし 1 回ごと・部屋の 前半と 後半で 止まる ので、区画 1 つの 計画は 層の 数〔3〕より ずっと 多い 回数に 分かれる
 *  ・坑道の 先読みと ほらあなの 先読みは 時間を わけあう〔どちらも 1 回の warm で すすむ〕
 */

vi.setConfig({ testTimeout: 720_000 });

const SEED = 20261012;
const view = (w: ShaftWorld, rx: number, rz: number) => w.caves.region(rx, rz).rooms.map((r) => (r ? { id: r.id, kind: r.kind, box: r.box, shaft: r.shaft } : null));

describe('ほらあなの 先読み', () => {
  const sp = spawnOf(SEED);
  const R = 64;
  const centers = [{ x: sp.x + 200, z: sp.z - 150 }];

  it('1 つずつ すすめた 結果は いっきに 作った 結果と 同じ・区画 1 つは 層の 数より ずっと 多い 回数に 分かれる', () => {
    const stepwise = new ShaftWorld(SEED, undefined);
    stepwise.caves.warmPrep(centers, 2 * R);
    let steps = 0;
    while (stepwise.caves.warmStep()) steps++;
    const sync = new ShaftWorld(SEED, undefined);
    let regions = 0;
    let rooms = 0;
    for (let rz = Math.floor((centers[0]!.z - 2 * R) / R); rz <= Math.floor((centers[0]!.z + 2 * R) / R); rz++) {
      for (let rx = Math.floor((centers[0]!.x - 2 * R) / R); rx <= Math.floor((centers[0]!.x + 2 * R) / R); rx++) {
        regions++;
        const a = view(stepwise, rx, rz);
        expect(a, `区画 (${rx}, ${rz})`).toEqual(view(sync, rx, rz));
        rooms += a.filter((r) => r !== null).length;
      }
    }
    expect(rooms, '置けた 部屋').toBeGreaterThan(0);
    expect(steps, `${regions} 区画の 先読みの 回数`).toBeGreaterThan(regions * 3 + rooms * 4);
  });

  it('坑道の 先読みと ほらあなの 先読みは 1 回の warm で 両方 すすむ', () => {
    const w = new ShaftWorld(SEED, undefined);
    w.warm(centers, 0, 2 * R); // 一覧を 作る
    let cave = 0;
    const spy = w.caves.warmStep.bind(w.caves);
    w.caves.warmStep = () => {
      cave++;
      return spy();
    };
    for (let i = 0; i < 4000 && w.caves.warmFront() !== null; i++) w.warm(centers, 0, 2 * R);
    expect(cave, 'ほらあなの 先読みが 動いた 回数').toBeGreaterThanOrEqual(1);
  });
});
