import { describe, expect, it } from 'vitest';
import { BOLT, SPARKS, boltFrameOf, groundGlow, landingRing, makeSparks, sparkAt } from './thunderModel';

/** WEAPON-7 §3.5 + 決定「雷 v4」「光のつぶ」: 雷の コマ・着地の 光・光の つぶ（コードで 動かす） */
describe('雷の コマ（8 コマ × 2 ステップ）', () => {
  it('F1 は まだ 出ない。F2〜17 で 8 コマ（2 ステップごと）。F8〜9 が 着地（コマ 3）。F18〜は 出ない', () => {
    expect(boltFrameOf(1)).toBe(-1);
    expect(boltFrameOf(2)).toBe(0);
    expect(boltFrameOf(3)).toBe(0);
    expect(boltFrameOf(4)).toBe(1);
    expect(boltFrameOf(8)).toBe(3);
    expect(boltFrameOf(9)).toBe(3);
    expect(boltFrameOf(16)).toBe(7);
    expect(boltFrameOf(17)).toBe(7);
    expect(boltFrameOf(18)).toBe(-1);
    expect(BOLT.frames * BOLT.stepsPerFrame).toBe(16);
  });
  it('着地の コマは 雷が 当たる F（strikeF = 8）と そろう', () => {
    expect(boltFrameOf(8)).toBe(BOLT.landFrame);
    expect(2 + BOLT.landFrame * BOLT.stepsPerFrame).toBe(8);
  });
});

describe('着地の 光（地面の 光の たまり・わ）', () => {
  it('光の たまり: F8 から ふくらみながら きえる（点滅なし = 明るさは 下がる だけ）', () => {
    expect(groundGlow(7)).toBeNull();
    let last = Infinity;
    let lastScale = 0;
    for (let F = 8; F <= 8 + 12; F++) {
      const g = groundGlow(F);
      if (F > 8 + 11) {
        expect(g).toBeNull();
        break;
      }
      expect(g).not.toBeNull();
      expect(g!.alpha).toBeLessThanOrEqual(last + 1e-9);
      expect(g!.scale).toBeGreaterThanOrEqual(lastScale);
      last = g!.alpha;
      lastScale = g!.scale;
    }
  });
  it('わ（半径 5）: 20 ステップで きえる。広がりながら 暗くなる', () => {
    expect(landingRing(7)).toBeNull();
    const a = landingRing(8)!;
    const b = landingRing(18)!;
    expect(a.radius).toBeLessThan(b.radius);
    expect(b.radius).toBeLessThanOrEqual(5);
    expect(a.alpha).toBeGreaterThan(b.alpha);
    expect(landingRing(8 + 19)).not.toBeNull();
    expect(landingRing(8 + 20)).toBeNull();
  });
});

describe('光の つぶ（30〜40 こ・2〜3 マス のぼる・点滅なし）', () => {
  const sparks = makeSparks(1234);
  it('数は 30〜40', () => {
    expect(sparks.length).toBeGreaterThanOrEqual(30);
    expect(sparks.length).toBeLessThanOrEqual(40);
    expect(SPARKS.count).toBe(sparks.length);
  });
  it('どの つぶも 上へ 2〜3 マス のぼってから きえる（のぼる 高さの 最大）', () => {
    for (const s of sparks) {
      const top = Math.max(...Array.from({ length: s.life + 1 }, (_, t) => sparkAt(s, t).dy));
      expect(top).toBeGreaterThanOrEqual(2 - 1e-6);
      expect(top).toBeLessThanOrEqual(3 + 1e-6);
    }
  });
  it('上へ のぼるだけ（もどらない）・明るさは 下がる だけ（点滅しない）・きえたら 0', () => {
    for (const s of sparks) {
      let dy = -1;
      let a = Infinity;
      for (let t = 0; t <= s.life; t++) {
        const p = sparkAt(s, t);
        expect(p.dy).toBeGreaterThanOrEqual(dy - 1e-9);
        expect(p.alpha).toBeLessThanOrEqual(a + 1e-9);
        dy = p.dy;
        a = p.alpha;
      }
      expect(sparkAt(s, s.life).alpha).toBe(0);
    }
  });
  it('同じ シードで 同じ つぶ（シード付き）・長さは 90 ステップ 以内', () => {
    expect(makeSparks(1234)).toEqual(sparks);
    expect(makeSparks(99)).not.toEqual(sparks);
    for (const s of sparks) expect(s.life).toBeLessThanOrEqual(90);
  });
  it('まん中から 外へ ふわっと ひろがる（水平は 2 マス 以内）', () => {
    for (const s of sparks) {
      const p = sparkAt(s, s.life);
      expect(Math.hypot(p.dx, p.dz)).toBeLessThanOrEqual(2.5);
    }
  });
});
