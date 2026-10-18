import { describe, expect, it } from 'vitest';
import { BUG_TRI_LIMIT, NET_TRI_LIMIT, getBugModel, getNetModel } from './bugNetModel';

describe('LIVE-1 版 3.2 むし・むしとりあみ の 形（DESIGN 16.16・§3.2）', () => {
  it('むし: 三角形 200 以下・1 ぴき 1 メッシュ・長さ 約 0.6・高さ 約 0.2', () => {
    const m = getBugModel();
    expect(m.tris).toBeGreaterThan(60);
    expect(m.tris).toBeLessThanOrEqual(BUG_TRI_LIMIT);
    expect(BUG_TRI_LIMIT).toBe(200);
    const bb = m.geo.boundingBox!;
    expect(bb.max.z - bb.min.z).toBeGreaterThan(0.55);
    expect(bb.max.z - bb.min.z).toBeLessThan(0.7);
    expect(bb.max.y - bb.min.y).toBeGreaterThan(0.15);
    expect(bb.max.y - bb.min.y).toBeLessThan(0.3);
    expect(m.names).toHaveLength(1);
  });
  it('むしとりあみ: 三角形 700 以下・長い 柄（22 点 ＋ わ・ふくろ で 約 2 ブロック）', () => {
    const m = getNetModel();
    expect(m.tris).toBeGreaterThan(200);
    expect(m.tris).toBeLessThanOrEqual(NET_TRI_LIMIT);
    expect(NET_TRI_LIMIT).toBe(700);
    const bb = m.geo.boundingBox!;
    expect(bb.max.y - bb.min.y).toBeGreaterThan(1.8); // 手に 持つ とき 0.62 倍 → 約 1.2
    expect(bb.max.y - bb.min.y).toBeLessThan(2.2);
  });
  it('色: むしは 生成り・だいだい・目。あみは 藍・柄・こい木・生成りの ふくろ', () => {
    const colors = (m: ReturnType<typeof getBugModel>): Set<string> => {
      const col = m.geo.getAttribute('color');
      const out = new Set<string>();
      const toS = (x: number) => Math.round((x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055) * 255);
      for (let i = 0; i < col.count; i++) out.add(((toS(col.getX(i)) << 16) | (toS(col.getY(i)) << 8) | toS(col.getZ(i))).toString(16).padStart(6, '0'));
      return out;
    };
    const b = colors(getBugModel());
    for (const c of ['f3e6c8', 'e8962e', '2e2438']) expect(b.has(c), c).toBe(true);
    const n = colors(getNetModel());
    for (const c of ['3d5a9e', 'c9b26a', '8c5e3a', 'efe7d4']) expect(n.has(c), c).toBe(true);
  });
  it('同じ 形を 何回 よんでも 同じ もの（1 回 だけ 作る）', () => {
    expect(getBugModel()).toBe(getBugModel());
    expect(getNetModel()).toBe(getNetModel());
  });
});
