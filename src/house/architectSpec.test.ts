import { describe, expect, it } from 'vitest';
import { ARCHITECT_TRI_LIMIT, architectModel, architectSpec, nodPose } from './architectSpec';

/** HOUSE-1A: 建築士さん（案 A）の 形。三角形の 数・骨の 並び（docs/art/design/06-housing.md 19.4） */

describe('建築士さんの 形', () => {
  it('骨は 体・足 2・うで 2・木づち・頭 の 7 本。親は 体 → うで → 木づち / 体 → 頭', () => {
    const m = architectModel();
    expect(m.names).toEqual(['body', 'legL', 'legR', 'armL', 'armR', 'tool', 'head']);
    const parentName = (n: string): string | null => {
      const p = m.parents[m.names.indexOf(n)]!;
      return p < 0 ? null : m.names[p]!;
    };
    expect(parentName('body')).toBeNull();
    expect(parentName('armL')).toBe('body');
    expect(parentName('armR')).toBe('body');
    expect(parentName('tool')).toBe('armR');
    expect(parentName('head')).toBe('body');
  });

  it('三角形は 514 ぐらい（上限 600）。ふちどりは 430 ぐらい', () => {
    const m = architectModel();
    expect(m.tris).toBeGreaterThan(0);
    expect(m.tris).toBeLessThanOrEqual(ARCHITECT_TRI_LIMIT);
    expect(m.hullTris).toBeLessThanOrEqual(ARCHITECT_TRI_LIMIT);
    expect(m.tris).toBe(514);
    expect(m.hullTris).toBe(430);
  });

  it('同じ 形は 1 回だけ 組む（何人 いても 同じ もの）', () => {
    expect(architectModel()).toBe(architectModel());
  });

  it('背の 高さは 木づちを まっすぐ 立てても 1.7 ブロック いない（1/16 ブロックの 小キューブ。木づちは ふだん ねかせて ある）', () => {
    const bb = architectModel().geo.boundingBox!;
    expect(bb.min.y).toBeGreaterThanOrEqual(0);
    expect(bb.max.y).toBeLessThanOrEqual(1.7);
    // 横はば（木づちの 頭を ふくむ）も 1.3 ブロック いない（かわいい 大きさ）
    expect(bb.max.x - bb.min.x).toBeLessThan(1.3);
  });

  it('形の データは 呼ぶたびに 同じ（乱数なし）', () => {
    expect(JSON.stringify(architectSpec())).toBe(JSON.stringify(architectSpec()));
  });
});

describe('うなずきの 数', () => {
  it('頭は 0 → 下へ 26° → 0。体は 2 コマ おくれて 6° まで', () => {
    expect(nodPose(0).head).toBe(0);
    expect(nodPose(8).head).toBeCloseTo(26, 6);
    expect(nodPose(12).head).toBeCloseTo(26, 6);
    expect(nodPose(20).head).toBeCloseTo(0, 6);
    const maxBody = Math.max(...Array.from({ length: 23 }, (_, f) => nodPose(f).body));
    expect(maxBody).toBeCloseTo(6, 6);
    expect(nodPose(22).body).toBeCloseTo(0, 6);
  });
});
