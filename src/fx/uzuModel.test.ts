import { describe, expect, it } from 'vitest';
import { UZU, UzuField, uzuBead, uzuBeadColor, uzuKindOf, type UzuBead, type UzuSpot } from './uzuModel';

const spot = (x: number, y: number, z: number, id = 'wakimizu'): UzuSpot => ({ x, y, z, kind: uzuKindOf(id)! });
const at = (x: number, y = 0, z = 0) => ({ x, y, z });
const run = (f: UzuField, sec: number): void => {
  for (let t = 0; t < sec; t += 1 / 60) f.step(1 / 60);
};

describe('あわのうず（uzuModel）', () => {
  it('わきどころ・たきつぼ・マグマ版だけが 対象', () => {
    expect(uzuKindOf('wakimizu')).toEqual({ magma: false, dir: 1 });
    expect(uzuKindOf('takitsubo')).toEqual({ magma: false, dir: -1 });
    expect(uzuKindOf('magma_wakimizu')).toEqual({ magma: true, dir: 1 });
    expect(uzuKindOf('magma_takitsubo')).toEqual({ magma: true, dir: -1 });
    expect(uzuKindOf('stone')).toBeNull();
    expect(uzuKindOf('water')).toBeNull();
  });

  it('6 マス いないで 出る・はなれると 消える', () => {
    const f = new UzuField(1);
    const s = [spot(0, 0, 0)];
    f.sync(s, [at(UZU.range - 0.5)]);
    run(f, 1);
    expect(f.shown()).toBe(1);
    f.sync(s, [at(UZU.range + 2)]);
    run(f, UZU.fadeOut + 0.2);
    expect(f.shown()).toBe(0);
  });

  it('1P・2P どちらか 近ければ 出る', () => {
    const f = new UzuField(1);
    f.sync([spot(0, 0, 0)], [at(50), at(2)]);
    run(f, 1);
    expect(f.shown()).toBe(1);
  });

  it('ふっと 小さくなって 消える（すぐには 消えない）', () => {
    const f = new UzuField(1);
    f.sync([spot(0, 0, 0)], [at(1)]);
    run(f, 1);
    f.sync([spot(0, 0, 0)], []);
    f.step(UZU.fadeOut / 2);
    expect(f.shown()).toBe(1);
    const e = f.entries.find((x) => x.used)!;
    expect(e.grow).toBeGreaterThan(0);
    expect(e.grow).toBeLessThan(1);
  });

  it('同時に 出す 上限（近い ほうから）', () => {
    const f = new UzuField(1);
    const s: UzuSpot[] = [];
    for (let i = 0; i < 30; i++) s.push(spot(i % 5, 0, Math.floor(i / 5)));
    f.sync(s, [at(0)]);
    run(f, 1);
    expect(f.shown()).toBe(UZU.maxShown);
    expect(f.entries.filter((e) => e.used && e.spot.x === 0 && e.spot.z === 0)).toHaveLength(1);
  });

  it('マグマは 色ちがい（動きは 同じ）', () => {
    const a: UzuBead = { x: 0, y: 0, z: 0, scale: 0 };
    const b: UzuBead = { x: 0, y: 0, z: 0, scale: 0 };
    uzuBead('flat', uzuKindOf('wakimizu')!, 0.3, 1.1, 2, 0, a);
    uzuBead('flat', uzuKindOf('magma_wakimizu')!, 0.3, 1.1, 2, 0, b);
    expect(b).toEqual(a);
    expect(uzuBeadColor(false, 0)).not.toBe(uzuBeadColor(true, 0));
    expect(uzuBeadColor(true, 0)).toBe(UZU.magmaHead);
    expect(uzuBeadColor(false, 0)).toBe(UZU.waterHead);
  });

  it('つぶの 数は 6〜8・うしろほど 小さい・横向きは まん中の 高さ', () => {
    expect(UZU.beads).toBeGreaterThanOrEqual(6);
    expect(UZU.beads).toBeLessThanOrEqual(8);
    const k = uzuKindOf('wakimizu')!;
    const b: UzuBead = { x: 0, y: 0, z: 0, scale: 0 };
    uzuBead('flat', k, 0, 0, 0, 0, b);
    const head = b.scale;
    uzuBead('flat', k, 0, 0, UZU.beads - 1, 0, b);
    expect(b.scale).toBeLessThan(head);
    uzuBead('flat', k, 0, 0, 0, 0, b);
    expect(Math.abs(b.y - 0.5)).toBeLessThanOrEqual(UZU.bob + 1e-9);
    expect(Math.hypot(b.x - 0.5, b.z - 0.5)).toBeCloseTo(UZU.radius, 1);
  });

  it('1 周 約 2 秒（先頭が 同じ 場所に もどる）', () => {
    const k = uzuKindOf('wakimizu')!;
    const a: UzuBead = { x: 0, y: 0, z: 0, scale: 0 };
    const b: UzuBead = { x: 0, y: 0, z: 0, scale: 0 };
    uzuBead('flat', k, 0, 0, 0, 0, a);
    uzuBead('flat', k, 0, UZU.period, 0, 0, b);
    expect(b.x).toBeCloseTo(a.x, 5);
    expect(b.z).toBeCloseTo(a.z, 5);
  });

  it('わきどころは 外へ・たきつぼは 内へ らせん', () => {
    const r = (id: string, i: number): number => {
      const b: UzuBead = { x: 0, y: 0, z: 0, scale: 0 };
      uzuBead('flat', uzuKindOf(id)!, 0, 0, i, 0, b);
      return Math.hypot(b.x - 0.5, b.z - 0.5);
    };
    expect(r('wakimizu', UZU.beads - 1)).toBeLessThan(r('wakimizu', 0));
    expect(r('takitsubo', UZU.beads - 1)).toBeGreaterThan(r('takitsubo', 0));
  });

  it('横だおし案は たての 輪（高さが 変わる）', () => {
    const k = uzuKindOf('wakimizu')!;
    const ys: number[] = [];
    for (let i = 0; i < UZU.beads; i++) {
      const b: UzuBead = { x: 0, y: 0, z: 0, scale: 0 };
      uzuBead('ring', k, 0, 0, i, 0, b);
      ys.push(b.y);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.5);
  });

  it('同じ シードなら 同じ（決まる）', () => {
    const mk = (): number[] => {
      const f = new UzuField(7);
      f.sync([spot(3, 4, 5)], [at(3, 4, 5)]);
      return f.entries.map((e) => e.phase);
    };
    expect(mk()).toEqual(mk());
  });
});
