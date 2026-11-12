import { describe, expect, it } from 'vitest';
import { checkShape, placeStructure, shapeCells } from './place';
import { STRUCTURES } from './registry';
import type { StructureShape } from './types';

/** 石の 小物・ほこら・やぐら（WAFU-1 追加）。建物の きまりの 基本は structures.test.ts */
const flat = (h: number) => () => h;
const dims = (s: StructureShape): { w: number; d: number; h: number } => {
  const cs = shapeCells(s);
  return { w: Math.max(...cs.map((c) => c.rx)) - Math.min(...cs.map((c) => c.rx)) + 1, d: Math.max(...cs.map((c) => c.rz)) - Math.min(...cs.map((c) => c.rz)) + 1, h: Math.max(...cs.map((c) => c.y)) + 1 };
};
const ids = (s: StructureShape): Map<string, number> => {
  const m = new Map<string, number>();
  for (const b of placeStructure(s, 0, 0, 0, 5, flat(0))!.blocks) m.set(b.id, (m.get(b.id) ?? 0) + 1);
  return m;
};

describe('石の 小物・ほこら・やぐら', () => {
  it('すべて 図の 書きまちがいが なく、置ける', () => {
    for (const name of ['ojizou', 'sekizou', 'hokora', 'ido', 'ishi_torii', 'yagura'] as const) {
      expect(checkShape(STRUCTURES[name]), name).toEqual([]);
      expect(placeStructure(STRUCTURES[name], 0, 0, 0, 1, flat(3)), name).not.toBeNull();
    }
  });
  it('おじぞうさん: 高さ 3〜4・3 たい・前かけ（朱色）が 3 つ', () => {
    const d = dims(STRUCTURES.ojizou);
    expect(d.h).toBeGreaterThanOrEqual(3); expect(d.h).toBeLessThanOrEqual(4);
    expect(shapeCells(STRUCTURES.ojizou).filter((c) => c.ch === 'S').length).toBe(3);
  });
  it('大きな 石ぞう: 高さ 12〜16・すわった 形（肩が どうより 広く、ひざが 前に 出る）・細い 目 2 つと 小さい 口 1 つ・あらいしが 主でこけも 出る', () => {
    const s = STRUCTURES.sekizou;
    const d = dims(s);
    expect(d.h).toBeGreaterThanOrEqual(12); expect(d.h).toBeLessThanOrEqual(16);
    const cells = shapeCells(s);
    const solid = (y: number) => cells.filter((c) => c.y === y && c.ch !== '.');
    const wide = (y: number): number => { const v = solid(y).map((c) => c.rx); return Math.max(...v) - Math.min(...v) + 1; };
    expect(wide(9)).toBeGreaterThan(wide(8));
    expect(wide(11)).toBeLessThan(wide(9));
    expect(Math.max(...solid(1).map((c) => c.rz))).toBeGreaterThan(Math.max(...solid(7).map((c) => c.rz)));
    expect(cells.filter((c) => c.ch === 'K').length).toBe(3);
    const m = ids(s);
    expect(m.get('ara_ishi')!).toBeGreaterThan(m.get('koke_ara_ishi') ?? 0);
    expect(m.has('koke_ara_ishi')).toBe(true);
  });
  it('ほこら: 7×7・石段 3 段・朱色の はしら 4 本・石の かこい・中に 石ぞうと ちょうちん・屋根の すみが 上がる', () => {
    const s = STRUCTURES.hokora;
    const d = dims(s);
    expect([d.w, d.d]).toEqual([7, 7]);
    const cells = shapeCells(s);
    expect(cells.filter((c) => c.ch === 'S' && c.y === 4).length).toBe(4);
    expect(cells.filter((c) => c.ch === 'C').length).toBe(1);
    expect(cells.filter((c) => c.ch === 'N').length).toBe(2);
    const col = (rz: number): number => Math.max(...cells.filter((c) => c.rz === rz && c.rx === 0 && c.ch === 'I').map((c) => c.y));
    expect([col(3), col(2), col(1)]).toEqual([0, 1, 2]); // 手前から 台へ 3 だん（0・1・2。まん中の 列）
    expect(cells.filter((c) => c.y === 7 && c.ch === 'U' && Math.abs(c.rx) === 3 && (c.rz === -3 || c.rz === 1)).length).toBe(4);
  });
  it('いど: 高さ 6〜8・石の わく 8 マス・木の はしら 2 本・つるべの 横木・かわらの 屋根', () => {
    const s = STRUCTURES.ido;
    const d = dims(s);
    expect(d.h).toBeGreaterThanOrEqual(6); expect(d.h).toBeLessThanOrEqual(8);
    const cells = shapeCells(s);
    expect(cells.filter((c) => c.ch === 'R' && c.y === 0).length).toBe(8);
    expect(cells.filter((c) => c.ch === 'P' && c.y === 2).length).toBe(2);
    expect(cells.filter((c) => c.ch === 'B' && c.y === 5).length).toBe(5);
  });
  it('いしの とりい: 朱色の とりいと 同じ 形の 層で 石だけ・高さ 12〜15', () => {
    const s = STRUCTURES.ishi_torii;
    expect(s.layers).toBe(STRUCTURES.torii.layers);
    const d = dims(s);
    expect(d.h).toBeGreaterThanOrEqual(12); expect(d.h).toBeLessThanOrEqual(15);
    for (const id of ids(s).keys()) expect(['ara_ishi', 'koke_ara_ishi', 'koke_ishi', 'hibi_ishi', 'air']).toContain(id);
  });
  it('かねの やぐら: 高さ 9〜11・たて長の 柱 4 本・つりがね（くろい かわら 2 マス）・そった かわら屋根', () => {
    const s = STRUCTURES.yagura;
    const d = dims(s);
    expect(d.h).toBeGreaterThanOrEqual(9); expect(d.h).toBeLessThanOrEqual(11);
    const cells = shapeCells(s);
    expect(cells.filter((c) => c.ch === 'P' && c.y === 3).length).toBe(4);
    expect(cells.filter((c) => c.ch === 'B').length).toBe(2);
    expect(cells.filter((c) => c.y === 8 && c.ch === 'T' && Math.abs(c.rx) === 3 && Math.abs(c.rz) === 3).length).toBe(4);
  });
  it('ゆらぎ: 同じ 入力なら 同じ 結果。下の 段ほど こけが 多い かたより', () => {
    const a = placeStructure(STRUCTURES.sekizou, 7, 9, 0, 3, flat(2))!;
    expect(a).toEqual(placeStructure(STRUCTURES.sekizou, 7, 9, 0, 3, flat(2))!);
    const share = (lo: number, hi: number): number => {
      const bs = a.blocks.filter((q) => q.y >= a.baseY + lo && q.y < a.baseY + hi);
      return bs.filter((q) => q.id === 'koke_ara_ishi').length / Math.max(1, bs.length);
    };
    expect(share(0, 4)).toBeGreaterThan(share(11, 15));
  });
});
