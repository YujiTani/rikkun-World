import { describe, expect, it } from 'vitest';
import { OPEN_UP, UZU, UzuField, uzuBead, uzuBeadColor, uzuKindOf, uzuVentBead, uzuVentOf, type UzuBead, type UzuFace, type UzuSpot } from './uzuModel';

const spot = (x: number, y: number, z: number, id = 'wakimizu'): UzuSpot => ({ x, y, z, kind: uzuKindOf(id)!, open: OPEN_UP });
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

  const blank = (): UzuBead => ({ x: 0, y: 0, z: 0, size: 0, lead: 0 });
  const FACES: UzuFace[] = [0, 1, 2, 3];

  it('マグマは 色ちがい（動きは 同じ）', () => {
    const a = uzuBead(uzuKindOf('wakimizu')!, 0.3, 1.1, 2, 0, blank());
    const b = uzuBead(uzuKindOf('magma_wakimizu')!, 0.3, 1.1, 2, 0, blank());
    expect({ ...b, x: 0 }).toEqual({ ...a, x: 0 });
    expect(uzuBeadColor(false, 1)).toBe(UZU.waterHead);
    expect(uzuBeadColor(true, 1)).toBe(UZU.magmaHead);
    expect(uzuBeadColor(true, 0)).toBe(UZU.magmaTail);
    expect(uzuBeadColor(false, 0)).not.toBe(uzuBeadColor(true, 0));
  });

  it('つぶの 数は 18〜24・腕の 数で わりきれる・小さな 四角', () => {
    expect(UZU.beads).toBeGreaterThanOrEqual(18);
    expect(UZU.beads).toBeLessThanOrEqual(24);
    expect(UZU.beads % UZU.arms).toBe(0);
    expect(UZU.arms).toBeGreaterThanOrEqual(2);
    expect(UZU.arms).toBeLessThanOrEqual(3);
    expect(UZU.sizeMax).toBeLessThanOrEqual(0.09);
    expect(UZU.sizeMin).toBeGreaterThanOrEqual(0.06);
  });

  it('水の ブロックは ブロックの 中に おさまる（どの 向き・どの 時間でも）', () => {
    const half = UZU.sizeMax / 2;
    for (const id of ['wakimizu', 'takitsubo']) {
      for (const f of FACES) {
        for (let t = 0; t < 4; t += 0.05) {
          for (let i = 0; i < UZU.beads; i++) {
            const b = uzuBead(uzuKindOf(id)!, 0.37, t, i, f, blank());
            for (const v of [b.x, b.y, b.z]) {
              expect(v - half).toBeGreaterThanOrEqual(0);
              expect(v + half).toBeLessThanOrEqual(1);
            }
            expect(Math.hypot(b.y - 0.5, f < 2 ? b.z - 0.5 : b.x - 0.5)).toBeLessThanOrEqual(UZU.radius + 1 / UZU.gridDiv);
            expect(f < 2 ? b.x : b.z).toBe(0.5); // 輪の 面は ブロックの まん中
          }
        }
      }
    }
  });

  it('マグマは 吹き出し: 2.5 秒ごとに 約 0.6 秒だけ、上の 面から 0.5 マスまで', () => {
    const k = 0;
    let shownTimes = 0;
    let quiet = 0;
    let maxH = 0;
    for (let t = 0; t < UZU.ventEvery * 2; t += 1 / UZU.fps) {
      let any = false;
      for (let i = 0; i < UZU.ventBeads; i++) {
        const b = uzuVentBead(k, t, i, 4, blank());
        if (b.size <= 0) continue;
        any = true;
        maxH = Math.max(maxH, b.y - 1);
        expect(b.y).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(b.size).toBeLessThanOrEqual(UZU.sizeMax);
        expect(b.size).toBeGreaterThanOrEqual(UZU.sizeMin);
        expect(Math.abs(b.x - 0.5)).toBeLessThanOrEqual(UZU.ventSpread + 1 / UZU.gridDiv);
        for (const v of [b.x, b.y, b.z]) expect(Math.abs(v * UZU.gridDiv - Math.round(v * UZU.gridDiv))).toBeLessThan(1e-9);
      }
      if (any) shownTimes++;
      else quiet++;
    }
    expect(UZU.ventBeads).toBeGreaterThanOrEqual(8);
    expect(UZU.ventBeads).toBeLessThanOrEqual(12);
    expect(maxH).toBeLessThanOrEqual(UZU.ventPeak + 1 / UZU.gridDiv);
    expect(maxH).toBeGreaterThan(0.25);
    expect(shownTimes / UZU.fps).toBeLessThan(2 * (UZU.ventDelay + UZU.ventLife) + 0.2); // 2 回ぶんで 約 1.2 秒
    expect(shownTimes / UZU.fps).toBeGreaterThan(0.8);
    expect(quiet).toBeGreaterThan(shownTimes);
  });

  it('マグマの 吹き出しは ブロックごとに 時刻が ずれる・コマの あいだは 止まる', () => {
    const at = (phase: number, t: number): number => {
      let n = 0;
      for (let i = 0; i < UZU.ventBeads; i++) if (uzuVentBead(phase, t, i, 4, blank()).size > 0) n++;
      return n;
    };
    expect(at(0, 0.2)).toBeGreaterThan(0);
    expect(at(0.5, 0.2)).toBe(0);
    const a = uzuVentBead(0, 0.2 + 0.001, 3, 4, blank());
    const b = uzuVentBead(0, 0.2 + 0.5 / UZU.fps - 0.002, 3, 4, blank());
    expect(b).toEqual(a);
  });

  it('マグマの 吹き出す 面: 上があけば 上・ふさがれば プレイヤー側の よこ・全部ふさがれば 出さない', () => {
    expect(uzuVentOf(OPEN_UP | 1 | 2, 1)).toBe(4);
    expect(uzuVentOf(1 | 2 | 4, 2)).toBe(2);
    expect(uzuVentOf(1 | 2 | 4, 3)).toBe(0); // その 面は ふさがり → ほかの よこ
    expect(uzuVentOf(0, 0)).toBe(-1);
    const out = uzuVentBead(0, 0.2, 0, uzuVentOf(1, 0), blank());
    expect(out.x).toBeGreaterThanOrEqual(1); // +x の 面から 外へ
    const f = new UzuField(1);
    const closed = { ...spot(0, 0, 0, 'magma_wakimizu'), open: 0 };
    f.sync([closed], [at(1, 0.5, 0.5)]);
    run(f, 1);
    expect(f.shown()).toBe(0);
  });

  it('位置は 1/18 マスの 格子に まるまる', () => {
    for (let t = 0; t < 3; t += 0.07) {
      for (let i = 0; i < UZU.beads; i++) {
        const b = uzuBead(uzuKindOf('takitsubo')!, 0.21, t, i, 2, blank());
        for (const v of [b.x, b.y]) expect(Math.abs(v * UZU.gridDiv - Math.round(v * UZU.gridDiv))).toBeLessThan(1e-9);
      }
    }
  });

  it('動きは 1 秒 12 コマ（コマの あいだは 止まって いる）', () => {
    const k = uzuKindOf('wakimizu')!;
    const dt = 1 / UZU.fps;
    for (let i = 0; i < UZU.beads; i++) {
      const a = uzuBead(k, 0, 5 * dt + 0.001, i, 0, blank());
      const b = uzuBead(k, 0, 6 * dt - 0.001, i, 0, blank());
      expect(b).toEqual(a);
    }
    let moved = false;
    for (let i = 0; i < UZU.beads; i++) {
      const a = uzuBead(k, 0, 5 * dt + 0.001, i, 0, blank());
      const b = uzuBead(k, 0, 6 * dt + 0.001, i, 0, blank());
      if (a.y !== b.y || a.z !== b.z) moved = true;
    }
    expect(moved).toBe(true);
  });

  it('わきどころは 外へ・たきつぼは 内へ ながれる', () => {
    const radius = (id: string, t: number, i: number): number => {
      const b = uzuBead(uzuKindOf(id)!, 0, t, i, 0, blank());
      return Math.hypot(b.y - 0.5, b.z - 0.5);
    };
    const mean = (id: string, t: number): number => {
      let s = 0;
      for (let i = 0; i < UZU.beads; i++) s += radius(id, t, i);
      return s / UZU.beads;
    };
    // 1 つぶの 動き: 0.3 秒で わきどころは 遠く（外へ）、たきつぼは 近く（内へ）
    let out = 0;
    let inn = 0;
    for (let i = 0; i < UZU.beads; i++) {
      if (radius('wakimizu', 0.4, i) > radius('wakimizu', 0.1, i)) out++;
      if (radius('takitsubo', 0.4, i) < radius('takitsubo', 0.1, i)) inn++;
    }
    expect(out).toBeGreaterThan(UZU.beads * 0.7);
    expect(inn).toBeGreaterThan(UZU.beads * 0.7);
    expect(mean('wakimizu', 0)).toBeGreaterThan(0.1);
  });

  it('先頭は 大きく あかるく・うしろほど 小さい', () => {
    const k = uzuKindOf('wakimizu')!;
    const list: UzuBead[] = [];
    for (let i = 0; i < UZU.beads; i++) list.push(uzuBead(k, 0.1, 0.5, i, 0, blank()));
    const mid = list.filter((b) => b.lead > 0.3 && b.lead < 0.7);
    const hi = mid.reduce((a, b) => (b.lead > a.lead ? b : a));
    const lo = mid.reduce((a, b) => (b.lead < a.lead ? b : a));
    expect(hi.size).toBeGreaterThan(lo.size);
  });

  it('輪の 向きは いちばん 近い プレイヤーを おいかける', () => {
    const f = new UzuField(1);
    const s = [spot(0, 0, 0)];
    const faceNow = (): number => f.entries.find((e) => e.used)!.face;
    f.sync(s, [at(3, 0.5, 0.5)]);
    expect(faceNow()).toBe(0);
    f.sync(s, [at(0.5, 0.5, 3)]);
    expect(faceNow()).toBe(2);
    f.sync(s, [at(-3, 0.5, 0.5)]);
    expect(faceNow()).toBe(1);
    f.sync(s, [at(0.5, 0.5, -3)]);
    expect(faceNow()).toBe(3);
    f.sync(s, [at(5, 0.5, 0.5), at(0.5, 0.5, 2)]); // 2 人: ちかい ほう
    expect(faceNow()).toBe(2);
  });

  it('水平の 案は もう ない', () => {
    expect((UZU as Record<string, unknown>).look).toBeUndefined();
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
