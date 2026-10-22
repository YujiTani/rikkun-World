import { describe, expect, it } from 'vitest';
import { BOLT, RING, SPARKS, boltCell, boltFrameOf, boltVariantOf, landingRing, makeSparks, sparkAt, sparkShape } from './thunderModel';

/**
 * ART-PIPE-1（docs/design/ART-PIPE-1.md 1.1）: 雷 B の コマ・形・輪・光の つぶ（コードで 動かす）。
 * 前の WEAPON-7 §3.5 の テスト（8 コマ × 2 ステップ・光の たまり・つぶ 36）は この 仕様で 置きかえ（台帳・テストレポート参照）。
 * 光の たまり（groundGlow）の テストは 消した: 雷 B では 決めの 玉が かわりに なる（仕様 §4）。
 * このファイルが 要る 名前（developer が `src/legend/thunderModel.ts` に 作る）:
 *   boltVariantOf(seed, n)（n 回目の 落雷の 形 0〜3。シード付き。LegendSystem の variantOf を ここへ 移す）
 *   BOLT・RING・SPARKS（定数）、boltFrameOf(F)、boltCell(variant, frame, layer)、landingRing(F)、makeSparks(seed)、sparkAt(s, t)、sparkShape(s, t)
 */

/** §4.2 の 時間割り（コマ → 始まりの F・ステップ数） */
const TABLE: { frame: number; from: number; steps: number }[] = [
  { frame: 0, from: 2, steps: 4 },
  { frame: 1, from: 6, steps: 2 },
  { frame: 2, from: 8, steps: 2 },
  { frame: 3, from: 10, steps: 6 },
  { frame: 4, from: 16, steps: 6 },
  { frame: 5, from: 22, steps: 4 },
  { frame: 6, from: 26, steps: 4 },
  { frame: 7, from: 30, steps: 3 },
];

describe('AC1: 雷の コマと 時間（8 コマ・F2〜32）', () => {
  it('F1 は 出ない。F2〜32 の コマは 表どおり。F33 から 出ない', () => {
    expect(boltFrameOf(1)).toBe(-1);
    for (const r of TABLE) {
      for (let F = r.from; F < r.from + r.steps; F++) expect(boltFrameOf(F), `F${F}`).toBe(r.frame);
    }
    expect(boltFrameOf(32)).toBe(7);
    expect(boltFrameOf(33)).toBe(-1);
    expect(boltFrameOf(89)).toBe(-1);
  });
  it('決め（玉）の コマは F10〜15 の 6 ステップ ずっと 同じ。絵は 31 ステップ', () => {
    const set = new Set([10, 11, 12, 13, 14, 15].map(boltFrameOf));
    expect([...set]).toEqual([3]);
    expect(TABLE.reduce((a, r) => a + r.steps, 0)).toBe(31);
    expect(BOLT.frames).toBe(8);
  });
  it('着地の コマ（F8〜9）は 雷が 当たる F（strikeF = 8）と そろう', () => {
    expect(boltFrameOf(8)).toBe(BOLT.landFrame);
    expect(boltFrameOf(9)).toBe(BOLT.landFrame);
    expect(BOLT.landFrame).toBe(2);
    expect(boltFrameOf(7)).not.toBe(BOLT.landFrame);
    expect(boltFrameOf(10)).not.toBe(BOLT.landFrame);
  });
});

describe('AC3: 形（絵の 場所と 左右 反転）', () => {
  it('絵は 1024×1024・1 コマ 64×256・形 4 通り・重ね 3 まい', () => {
    expect(BOLT.cellW).toBe(64);
    expect(BOLT.cellH).toBe(256);
    expect(BOLT.variants).toBe(4);
    expect(BOLT.layers).toBe(3);
    expect(BOLT.sheetW).toBe(1024);
    expect(BOLT.sheetH).toBe(1024);
  });
  it('x =（(形 % 2) × 8 + コマ）× 64、y = 重ね × 256。形 2・3 は 形 0・1 の 左右 反転、0・1 は 反転なし', () => {
    for (let v = 0; v < 4; v++) {
      for (let f = 0; f < 8; f++) {
        for (let layer = 0; layer < 3; layer++) {
          const c = boltCell(v, f, layer);
          expect(c.x, `v${v} f${f}`).toBe(((v % 2) * 8 + f) * 64);
          expect(c.y, `layer${layer}`).toBe(layer * 256);
          expect(c.flip, `v${v}`).toBe(v >= 2);
        }
      }
    }
  });
  it('形 v と v + 2 は 同じ 場所を 読み、反転だけ ちがう', () => {
    for (const v of [0, 1]) {
      const a = boltCell(v, 3, 1);
      const b = boltCell(v + 2, 3, 1);
      expect({ x: b.x, y: b.y }).toEqual({ x: a.x, y: a.y });
      expect(a.flip).toBe(false);
      expect(b.flip).toBe(true);
    }
  });
  it('3 まいは 同じ コマ・同じ 形の 重ね 0・1・2（x が 同じ・y だけ 256 ずつ）', () => {
    const cs = [0, 1, 2].map((l) => boltCell(3, 5, l));
    expect(new Set(cs.map((c) => c.x)).size).toBe(1);
    expect(new Set(cs.map((c) => c.flip)).size).toBe(1);
    expect(cs.map((c) => c.y)).toEqual([0, 256, 512]);
  });
});

describe('AC8: 地面の 輪（F8〜27）', () => {
  it('F8〜27 だけ 出る（F7 まで・F28 から なし）', () => {
    expect(landingRing(7)).toBeNull();
    for (let F = 8; F <= 27; F++) expect(landingRing(F), `F${F}`).not.toBeNull();
    expect(landingRing(28)).toBeNull();
    expect(landingRing(89)).toBeNull();
    expect(RING.fromF).toBe(8);
    expect(RING.steps).toBe(20);
  });
  it('大きさ: F8 = 0.35、F18 から 1、あいだは 式どおり（へらない）。外の 円 = 半径 5 × 大きさ', () => {
    expect(landingRing(8)!.scale).toBeCloseTo(0.35, 6);
    let last = 0;
    for (let F = 8; F <= 27; F++) {
      const a = F - 8;
      const g = Math.min(1, a / 10);
      const want = 0.35 + 0.65 * (1 - (1 - g) ** 2);
      const r = landingRing(F)!;
      expect(r.scale, `F${F}`).toBeCloseTo(want, 6);
      expect(r.scale).toBeGreaterThanOrEqual(last - 1e-9);
      expect(r.radius).toBeCloseTo(5 * r.scale, 6);
      last = r.scale;
    }
    for (let F = 18; F <= 27; F++) expect(landingRing(F)!.scale).toBeCloseTo(1, 6);
    expect(RING.outerRadius).toBe(5);
    expect(RING.plateSize).toBe(12);
  });
  it('明るさ: F8 = 0.9 から 1 ステップごとに 下がる だけ（上がる ステップ 0）', () => {
    expect(landingRing(8)!.alpha).toBeCloseTo(0.9, 6);
    let up = 0;
    for (let F = 9; F <= 27; F++) {
      const a = landingRing(F)!.alpha;
      if (a > landingRing(F - 1)!.alpha + 1e-9) up++;
      expect(a, `F${F}`).toBeCloseTo(0.9 * (1 - (F - 8) / 20), 6);
    }
    expect(up).toBe(0);
  });
  it('絵: F8〜17 =「出る」、F18〜27 =「きえる」。高さは S.y + 0.03', () => {
    for (let F = 8; F <= 17; F++) expect(landingRing(F)!.image, `F${F}`).toBe('appear');
    for (let F = 18; F <= 27; F++) expect(landingRing(F)!.image, `F${F}`).toBe('vanish');
    expect(RING.lift).toBeCloseTo(0.03, 6);
  });
});

describe('AC9: 光の つぶ（32 こ・F8 から・寿命 50〜80）', () => {
  const sparks = makeSparks(1234);
  it('数は 32', () => {
    expect(sparks).toHaveLength(32);
    expect(SPARKS.count).toBe(32);
  });
  it('寿命 50〜80。上へ 2〜3 マス のぼる。水平は 2.2 以下', () => {
    for (const s of sparks) {
      expect(s.life).toBeGreaterThanOrEqual(50);
      expect(s.life).toBeLessThanOrEqual(80);
      const ps = Array.from({ length: s.life + 1 }, (_, t) => sparkAt(s, t));
      const top = Math.max(...ps.map((p) => p.dy));
      expect(top).toBeGreaterThanOrEqual(2 - 1e-6);
      expect(top).toBeLessThanOrEqual(3 + 1e-6);
      for (const p of ps) expect(Math.hypot(p.dx, p.dz)).toBeLessThanOrEqual(2.2 + 1e-6);
    }
  });
  it('絵: 寿命の 45% 未満 = ＋、80% 未満 = Y1 の 1 点、のこり = Y3 の 1 点', () => {
    for (const s of sparks) {
      for (let t = 0; t < s.life; t++) {
        const u = t / s.life;
        const want = u < 0.45 ? 'plus' : u < 0.8 ? 'y1' : 'y3';
        expect(sparkShape(s, t), `life${s.life} t${t}`).toBe(want);
      }
    }
  });
  it('上へ のぼるだけ・1 つぶの 明るさは 前の ステップより 上がらない（点滅なし）・きえたら 0', () => {
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
  it('同じ シード → 同じ 32 こ。ちがう シード → ちがう', () => {
    expect(makeSparks(1234)).toEqual(sparks);
    expect(makeSparks(99)).not.toEqual(sparks);
  });
  it('つぶの いちばん 長い 寿命は 80 以下 → F8 + 80 = F88 が さいご', () => {
    expect(Math.max(...sparks.map((s) => s.life))).toBeLessThanOrEqual(80);
    expect(SPARKS.lifeMax).toBe(80);
  });
});

describe('AC3: 形は 落雷ごとに 1 つ（シード付き）', () => {
  it('どの 落雷も 0〜3 の 整数 1 つ。同じ シード・同じ 順で 同じ 形', () => {
    const seq = (seed: number) => Array.from({ length: 64 }, (_, n) => boltVariantOf(seed, n));
    for (const v of seq(1234)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(3);
    }
    expect(seq(1234)).toEqual(seq(1234));
    expect(seq(99)).not.toEqual(seq(1234));
  });
  it('形 4 通りが ぜんぶ 出る（かたよらない）', () => {
    const seen = new Set(Array.from({ length: 64 }, (_, n) => boltVariantOf(7, n)));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });
});
