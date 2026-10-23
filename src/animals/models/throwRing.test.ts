import { describe, expect, it } from 'vitest';
import { RING_DIAMETER, RING_TEX, ringState, rasterRing } from './throwRing';

describe('LIVE-2.1 着地点 の 丸（§2.2・§3.2）', () => {
  it('なげられる（ok）なら 直径 0.8 の 丸。ok でない・null は 出さない', () => {
    expect(ringState(null)).toBeNull();
    expect(ringState({ x: 5, y: 9, z: 7, ok: false, home: null, toss: true })).toBeNull();
    const r = ringState({ x: 5.5, y: 9, z: 7.5, ok: true, home: null, toss: true })!;
    expect(r).toMatchObject({ x: 5.5, z: 7.5, home: false, diameter: 0.8 });
    expect(RING_DIAMETER).toBe(0.8);
    expect(r.y).toBeGreaterThan(9); // 地面 から すこし うかせる（ちらつき よけ）
    expect(r.y - 9).toBeLessThan(0.1);
  });

  it('そっと おろす（toss false）でも 丸 は 出す。とりごや の 中 は いえ の しるし つき', () => {
    expect(ringState({ x: 1, y: 2, z: 3, ok: true, home: null, toss: false })).not.toBeNull();
    expect(ringState({ x: 1, y: 2, z: 3, ok: true, home: 4, toss: true })!.home).toBe(true);
  });

  it('絵: 丸 の うす い かげ（光らない・点滅 しない）。いえ の しるし 版 は 中 に 点 が ふえる', () => {
    const a = (px: Uint8Array) => {
      let n = 0;
      let lum = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3]! > 0) n++;
        lum = Math.max(lum, px[i]!, px[i + 1]!, px[i + 2]!);
      }
      return { n, lum };
    };
    const plain = rasterRing(false);
    const home = rasterRing(true);
    expect(plain.length).toBe(RING_TEX * RING_TEX * 4);
    const p = a(plain);
    const h = a(home);
    expect(p.n).toBeGreaterThan(RING_TEX * RING_TEX * 0.5);
    expect(h.n).toBeGreaterThanOrEqual(p.n);
    expect(Array.from(plain).join() === Array.from(home).join()).toBe(false);
    // 四すみ は すきとおる（丸）
    expect(plain[3]).toBe(0);
    // 輪 は 太く 明るい（家 の しるし と 同じ 濃さ・白）。光らない・点滅 しない（絵 は 1 枚 だけ）
    const N = RING_TEX;
    const edge = (x: number) => ((x * N + N / 2) * 4);
    let wide = 0;
    for (let x = 0; x < N / 2; x++) if (plain[edge(x) + 3]! >= 200 && plain[edge(x)]! >= 240) wide++;
    expect(wide).toBeGreaterThanOrEqual(4);
  });
});
