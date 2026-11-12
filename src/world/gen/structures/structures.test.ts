import { describe, expect, it } from 'vitest';
import { ISHIDAN_TUNE, placeStairs, type Dir4 } from './ishidan';
import { checkShape, footOf, placeStructure, rotate, shapeCells, type ShapeCell } from './place';
import { STRUCTURES } from './registry';
import { ROTS, type PlacedCell, type Rot, type StructureShape } from './types';

/** 小さな 図（2×1 の 床 + その 上に 1 つ ずつ。かけら = skip 0.5 の 列） */
const MINI: StructureShape = {
  id: 'mini',
  layers: [['AB'], ['.C'], ['D.']],
  legend: { A: 'stone', B: 'dirt', C: 'log', D: { id: 'leaves', skip: 0.5, moss: 0.5 } },
  anchor: { x: 0, z: 0 },
  base: { id: 'stone', maxFill: 2 },
  maxSlope: 1,
};

const flat = (h: number) => () => h;
const key = (b: PlacedCell): string => `${b.x},${b.y},${b.z}`;

describe('structure kit: 向き', () => {
  it('rotate: 4 回で もとに もどる・1 回めは 東 → 南', () => {
    expect(rotate(1, 0, 1)).toEqual([0, 1]);
    for (const [dx, dz] of [[3, 2], [-1, 4], [0, 0]] as const) {
      let p: readonly [number, number] = [dx, dz];
      for (let i = 0; i < 4; i++) p = rotate(p[0], p[1], 1);
      expect(p).toEqual([dx, dz]);
    }
  });
  it('4 つの 向きで 足もとの はばと ふかさが 入れかわる・ブロックの 数は 同じ（ゆらぎが ない 図）', () => {
    const t = STRUCTURES.torii;
    const sizes = ROTS.map((r) => footOf(t, 100, 100, r)).map((f) => [f[2] - f[0] + 1, f[3] - f[1] + 1]);
    expect(sizes[0]).toEqual([11, 3]);
    expect(sizes[1]).toEqual([3, 11]);
    expect(sizes[2]).toEqual([11, 3]);
    expect(sizes[3]).toEqual([3, 11]);
    const noRandom: StructureShape = { ...t, legend: { S: 'shu_ita', K: 'kawara', T: 'kawara', N: 'shu_ita', I: 'ishidatami', J: 'ishidatami' } };
    const counts = ROTS.map((r) => placeStructure(noRandom, 0, 0, r, 1, flat(5))!.blocks.length);
    expect(new Set(counts).size).toBe(1);
  });
});

describe('structure kit: 置く', () => {
  it('同じ (シード, 場所, 向き) なら 同じ 結果。シードが ちがうと ゆらぎが ちがう', () => {
    const a = placeStructure(MINI, 10, 10, 0, 5, flat(3))!;
    const b = placeStructure(MINI, 10, 10, 0, 5, flat(3))!;
    expect(a).toEqual(b);
    const ids = (seed: number): string => placeStructure(STRUCTURES.odou, 0, 0, 0, seed, flat(3))!.blocks.map((c) => c.id).join();
    expect(ids(1)).not.toBe(ids(2));
  });
  it('ゆらぎは 場所だけで 決まる: 作る 順（ならべかえ）や 分け方に かかわらず 同じ マスは 同じ ブロック', () => {
    const whole = placeStructure(STRUCTURES.odou, 46, 46, 1, 9, flat(7))!;
    const shifted = placeStructure(STRUCTURES.odou, 46, 46, 1, 9, flat(7))!;
    const m = new Map(whole.blocks.map((b) => [key(b), b.id]));
    for (const b of shifted.blocks.slice().reverse()) expect(m.get(key(b))).toBe(b.id);
    // チャンク（16×16）ごとに 切りとっても、足すと 全体に なる
    const chunks = new Map<string, PlacedCell[]>();
    for (const b of whole.blocks) {
      const k = `${b.x >> 4},${b.z >> 4}`;
      chunks.set(k, [...(chunks.get(k) ?? []), b]);
    }
    expect([...chunks.values()].flat().length).toBe(whole.blocks.length);
    expect(chunks.size).toBeGreaterThan(1); // 40±4 は チャンクの 境目（48）の ちかく → 2 つ 以上に またがる 位置で 試す
  });
  it('いちばん 下の 段は 足もとの いちばん 高い 所の 上。空気（.）は air、ゆらぎは skip で air・moss で koke_ishi', () => {
    const p = placeStructure(MINI, 0, 0, 0, 3, (x) => (x === 0 ? 4 : 4))!;
    expect(p.baseY).toBe(5);
    const at = (x: number, y: number) => p.blocks.find((b) => b.x === x && b.y === y && b.z === 0);
    expect(at(0, 5)?.id).toBe('stone');
    expect(at(1, 5)?.id).toBe('dirt');
    expect(at(0, 6)?.id).toBe('air');
    expect(at(1, 6)?.id).toBe('log');
    const seen = new Set<string>();
    for (let s = 0; s < 80; s++) seen.add(placeStructure(MINI, 0, 0, 0, s, flat(4))!.blocks.find((b) => b.y === 7 && b.x === 0)!.id);
    expect([...seen].sort()).toEqual(['air', 'koke_ishi', 'leaves']);
  });
  it('土台: 地面が ひくい 列は 土台の ブロックで うめる。うめる 上限を こえる／高さの 差が 大きい 時は 置かない', () => {
    const p = placeStructure(MINI, 0, 0, 0, 3, (x) => (x === 0 ? 5 : 4))!;
    expect(p.baseY).toBe(6);
    expect(p.blocks.filter((b) => b.x === 1 && b.y === 5).map((b) => b.id)).toEqual(['stone']); // x = 1 の 地面 4 → 5 を うめる
    expect(placeStructure(MINI, 0, 0, 0, 3, (x) => (x === 0 ? 7 : 4))).toBeNull(); // 差 3 > maxSlope 1
    const steep: StructureShape = { ...MINI, maxSlope: 9 };
    expect(placeStructure(steep, 0, 0, 0, 3, (x) => (x === 0 ? 9 : 4))).toBeNull(); // うめる 4 > maxFill 2
    expect(placeStructure(MINI, 0, 0, 0, 3, (x) => (x === 0 ? 4 : -1))).toBeNull(); // 置けない 列
  });
  it('凡例に ない 文字は 例外（無言で 空気に しない）', () => {
    const bad: StructureShape = { ...MINI, layers: [['AX']] };
    expect(() => placeStructure(bad, 0, 0, 0, 1, flat(1))).toThrow();
    expect(checkShape(bad).length).toBeGreaterThan(0);
  });
});

/** 図から 数える ひな形の 数 */
const used = (s: StructureShape, rot: Rot = 0): Set<string> => new Set(placeStructure(s, 0, 0, rot, 1, flat(0))!.blocks.map((b) => b.id));
const dims = (s: StructureShape): { w: number; d: number; h: number } => {
  const cs = shapeCells(s);
  return { w: Math.max(...cs.map((c) => c.rx)) - Math.min(...cs.map((c) => c.rx)) + 1, d: Math.max(...cs.map((c) => c.rz)) - Math.min(...cs.map((c) => c.rz)) + 1, h: Math.max(...cs.map((c) => c.y)) + 1 };
};

describe('5 つの 目じるし: 大きさと 使う ブロック', () => {
  it('どの 図も 書きまちがいが ない（はばが そろう・凡例に ある）', () => {
    for (const s of Object.values(STRUCTURES)) expect(checkShape(s), s.id).toEqual([]);
  });
  it('とりい: 高さ 13〜15・はば 9〜11・柱は 1×1。柱の あいだ 5 以上（たて長）・かさぎは 柱より 外へ 2・ぬきは 外へ 1 で かさぎの 2 段 下・かわらの 笠は 1 段・はしが 1 段 上がる', () => {
    const s = STRUCTURES.torii;
    const d = dims(s);
    expect(d.h).toBeGreaterThanOrEqual(13); expect(d.h).toBeLessThanOrEqual(15); // yuzu: 細くて 高い
    expect(d.w).toBeGreaterThanOrEqual(9); expect(d.w).toBeLessThanOrEqual(11);
    for (const id of ['shu_ita', 'kawara', 'ishidatami']) expect(used(s).has(id), id).toBe(true);
    const cells = shapeCells(s);
    expect(cells.filter((c) => c.y === 3 && c.ch === 'S').length).toBe(2); // 柱は 1×1 が 2 本
    const pillars = [...new Set(cells.filter((c) => c.y === 3 && c.ch === 'S').map((c) => c.rx))].sort((p, q) => p - q);
    expect(pillars.length).toBe(2);
    expect(pillars[1]! - pillars[0]! - 1, '柱の あいだ').toBeGreaterThanOrEqual(5);
    const span = (y: number, ch: string): [number, number] => { const v = cells.filter((c) => c.y === y && c.ch === ch).map((c) => c.rx); return [Math.min(...v), Math.max(...v)]; };
    const [pl, pr] = span(3, 'S');
    const kasagi = span(12, 'S');
    expect([pl - kasagi[0], kasagi[1] - pr]).toEqual([2, 2]); // かさぎ（朱色）は 柱より 外へ 2
    const nukiCells = cells.filter((c) => c.y === 10 && (c.ch === 'S' || c.ch === 'N')).map((c) => c.rx);
    const nuki: [number, number] = [Math.min(...nukiCells), Math.max(...nukiCells)];
    expect([pl - nuki[0], nuki[1] - pr]).toEqual([1, 1]); // ぬきは 外へ 1、かさぎの 2 段 下
    expect(cells.filter((c) => c.ch === 'T').map((c) => c.y)).toEqual(cells.filter((c) => c.ch === 'T').map(() => 13)); // 笠は 1 段だけ
    expect(cells.some((c) => c.y === 13 && c.ch === 'S' && c.rx === kasagi[0])).toBe(true); // はしが 1 段 上がる
    expect(cells.some((c) => c.y === 1 && c.ch === 'K')).toBe(true); // 根もとは 黒い かわら
  });
  it('お堂: 7×7〜9×9・高さ 8〜10。屋根は かべより 2 外へ・3〜4 段・すみが 上がる・軒先に ちょうちん 2〜4', () => {
    const s = STRUCTURES.odou;
    const d = dims(s);
    expect(d.w).toBeGreaterThanOrEqual(7); expect(d.w).toBeLessThanOrEqual(9);
    expect(d.d).toBeLessThanOrEqual(9);
    expect(d.h).toBeGreaterThanOrEqual(8); expect(d.h).toBeLessThanOrEqual(10);
    for (const id of ['ishidatami', 'shu_ita', 'shikkui', 'kawara', 'chouchin']) expect(used(s).has(id), id).toBe(true);
    const cells = shapeCells(s);
    const ext = (pred: (c: { ch: string; y: number }) => boolean): number => { const xs = cells.filter(pred).map((c) => c.rx); return Math.max(...xs) - Math.min(...xs) + 1; };
    const roofY = [...new Set(cells.filter((c) => c.ch === 'K' || c.ch === 'T' || c.ch === 'E').map((c) => c.y))].sort((a, b) => a - b);
    expect(roofY.length).toBeGreaterThanOrEqual(3); expect(roofY.length).toBeLessThanOrEqual(5);
    const wall = ext((c) => c.ch === 'W' || (c.ch === 'S' && c.y === 1));
    expect(ext((c) => c.y === roofY[0] && (c.ch === 'K' || c.ch === 'E')) - wall).toBe(4); // 両がわ 2 マスずつ
    expect(cells.filter((c) => (c.ch === 'T' || c.ch === 'U') && c.y === roofY[1] && Math.abs(c.rx) === 4 && Math.abs(c.rz) === 4).length).toBe(4); // すみ（2 段めの 四すみが 1 段 上がる）
    const lamps = cells.filter((c) => c.ch === 'C').length;
    expect(lamps).toBeGreaterThanOrEqual(2); expect(lamps).toBeLessThanOrEqual(4);
  });
  it('あずまや: ゆか 7×7・はしら 4 本（高さ 4）・屋根 9×9 は 柱の 5×5 より 2 張り出し・3 段・すみが 上がる・入り口・ひくい らんかん・ちょうちん 2', () => {
    const s = STRUCTURES.azumaya;
    const d = dims(s);
    expect(d.h).toBeGreaterThanOrEqual(8); expect(d.h).toBeLessThanOrEqual(9);
    const cells = shapeCells(s);
    expect(cells.filter((c) => c.y === 0 && c.ch === 'I').length).toBe(49);
    expect(cells.filter((c) => c.y === 4 && c.ch === 'S').length).toBe(4);
    const ext = (pred: (c: ShapeCell) => boolean): number => { const v = cells.filter(pred).map((c) => c.rx); return Math.max(...v) - Math.min(...v) + 1; };
    expect(ext((c) => c.y === 5 && (c.ch === 'K' || c.ch === 'E')) - ext((c) => c.y === 4 && c.ch === 'S')).toBe(4); // 両がわ 2
    expect(new Set(cells.filter((c) => c.ch === 'K' || c.ch === 'T').map((c) => c.y)).size).toBe(3);
    expect(cells.filter((c) => c.y === 6 && c.ch === 'T' && Math.abs(c.rx) === 4 && Math.abs(c.rz) === 4).length).toBe(4); // すみ
    expect(cells.filter((c) => c.y === 1 && c.ch === 'S').length).toBeLessThan(cells.filter((c) => c.y === 0).length); // らんかんは ひくい（1 段）
    expect(cells.some((c) => c.y === 1 && c.rz === 2 && c.rx === 0 && c.ch !== '.')).toBe(false); // 正面の まん中は あいている
    expect(cells.filter((c) => c.ch === 'C').length).toBe(2);
    expect(cells.some((c) => c.ch === 'W')).toBe(true); // てっぺんの かざり
  });
  it('あかい はし: 長さ 9〜15・5 段階で 上がって 下がる（差 2〜3）・らんかんは 2 マスおきの はしら（高さ 2）と 横木 1 本・両はしは 1 マス 高く 頭に こけいし', () => {
    const s = STRUCTURES.hashi;
    const d = dims(s);
    expect(d.w).toBeGreaterThanOrEqual(9); expect(d.w).toBeLessThanOrEqual(15);
    expect(d.d).toBe(5); // あるける 3 ＋ らんかん 2
    const cells = shapeCells(s);
    const xs = [...new Set(cells.map((c) => c.rx))].sort((a, b) => a - b);
    const deck = xs.map((x) => Math.min(...cells.filter((c) => c.rx === x && c.rz === 0 && c.ch === 'S' && cells.some((q) => q.rx === x && q.rz === 1 && q.y === c.y && q.ch === 'S')).map((c) => c.y)));
    expect(new Set(deck).size, '段の 数').toBe(3);
    expect(Math.max(...deck) - Math.min(...deck)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...deck) - Math.min(...deck)).toBeLessThanOrEqual(3);
    expect(deck.join()).toBe([...deck].reverse().join()); // 左右 そろって 上がって 下がる
    const mid = deck.filter((v) => v === Math.max(...deck)).length;
    expect(mid).toBe(5); // まん中 5 マスが いちばん 高い
    // 左はしの はしら: 床の 上 3 マス（はしら 2 ＋ 横木）、頭（こけいし）が その 上
    const x0 = xs[0]!;
    const col = cells.filter((c) => c.rx === x0 && c.rz === -2 && c.ch !== '.').sort((a, b) => a.y - b.y);
    expect(col.map((c) => c.ch).slice(-2)).toEqual(['B', 'M']);
    const posts = cells.filter((c) => c.rz === -2 && c.y === deck[0]! + 1 && c.ch === 'P').map((c) => c.rx);
    expect(posts.filter((x) => x < xs[2]!)).toEqual([x0, x0 + 2].filter((x) => x < xs[2]!)); // 2 マスおき
    expect(cells.some((c) => c.ch === 'P' && c.y === deck[0]! + 1 && c.rz === -2 && c.rx === x0 + 1)).toBe(false); // はしらの あいだは ひくい かきね（はしらは 立たない）
    for (const id of used(s)) expect(['shu_ita', 'koke_ishi', 'air', 'ishidatami', 'shu_ita_hashira', 'shu_ita_kakine_x', 'shu_ita_usuita_shita']).toContain(id);
  });
});

describe('石段（道に そって 置く）', () => {
  const east: Dir4 = [1, 0];
  const slope = (x: number, _z: number): number => Math.max(0, 20 - Math.floor(x * 0.8));
  it('はば 3・1 歩ごとの 高さの 差は 1 以下・地形に そう・4〜6 歩ごとに いしどうろうを 左右 たがいちがいに', () => {
    const st = placeStairs(0, 0, east, 3, slope, (x) => slope(x, 0) <= 1)!;
    expect(st).not.toBeNull();
    expect(st.path.length).toBeGreaterThanOrEqual(ISHIDAN_TUNE.minSteps);
    for (let i = 1; i < st.path.length; i++) expect(Math.abs(st.path[i]!.y - st.path[i - 1]!.y)).toBeLessThanOrEqual(1);
    const floor = st.blocks.filter((b) => b.id === 'ishidatami' && b.y === st.path[1]!.y && b.x === st.path[1]!.x && Math.abs(b.z) <= 1);
    expect(floor.map((b) => b.z).sort((a, b) => a - b)).toEqual([-1, 0, 1]);
    expect(st.lanterns.length).toBeGreaterThanOrEqual(2);
    st.lanterns.forEach((l, i) => expect(l.z, `${i} 番めは たがいちがい`).toBe(i % 2 === 0 ? ISHIDAN_TUNE.lampOffset : -ISHIDAN_TUNE.lampOffset));
    for (let i = 1; i < st.lanterns.length; i++) {
      expect(st.lanterns[i]!.x - st.lanterns[i - 1]!.x).toBeGreaterThanOrEqual(ISHIDAN_TUNE.lanternEvery[0]);
      expect(st.lanterns[i]!.x - st.lanterns[i - 1]!.x).toBeLessThanOrEqual(ISHIDAN_TUNE.lanternEvery[1]);
    }
    // 道の はば（z -1〜1）には いしどうろうの ブロックが かからない
    expect(st.blocks.some((b) => Math.abs(b.z) <= 1 && (b.id === 'chouchin' || b.id === 'koke_ishi' && b.y > st.path[0]!.y + 10))).toBe(false);
    expect(st.blocks.some((b) => b.id === 'chouchin')).toBe(true);
    expect(st.blocks.some((b) => b.id === 'touro')).toBe(false);
  });
  it('いしどうろう 3 しゅ: 大 = 高さ 6〜7・台 3×3、中 = 高さ 4〜5、小 = 高さ 3 で 笠が 5×5。笠は 3×3 以上・光る 所（ちょうちん）が ある', () => {
    for (const [name, h] of [['ishidourou-dai', [6, 7]], ['ishidourou-chu', [4, 5]], ['ishidourou-sho', [3, 3]]] as const) {
      const s = STRUCTURES[name];
      const d = dims(s);
      expect(d.h, name).toBeGreaterThanOrEqual(h[0]); expect(d.h, name).toBeLessThanOrEqual(h[1]);
      const cells = shapeCells(s);
      const roof = (c: ShapeCell): boolean => c.ch === 'E' || c.ch === 'K' || c.ch === 'G';
      const roofY = Math.max(...cells.filter(roof).map((c) => c.y));
      expect(cells.filter((c) => c.y === roofY && roof(c)).length, name).toBeGreaterThanOrEqual(9);
      expect(cells.some((c) => c.ch === 'C'), name).toBe(true);
    }
    expect(shapeCells(STRUCTURES['ishidourou-dai']).filter((c) => c.y === 0 && c.ch === 'M').length).toBe(9);
  });
  it('短すぎる 道は 作らない・同じ 入力なら 同じ 結果', () => {
    expect(placeStairs(0, 0, east, 3, () => 5, (x) => x >= 2)).toBeNull();
    const a = placeStairs(0, 0, east, 3, slope, (x) => slope(x, 0) <= 1);
    const b = placeStairs(0, 0, east, 3, slope, (x) => slope(x, 0) <= 1);
    expect(a).toEqual(b);
  });
});
