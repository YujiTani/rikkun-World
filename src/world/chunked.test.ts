import { describe, expect, it } from 'vitest';
import { blockIndexOf } from './blocks/blockTypes';
import { compactSection, localIndex, sectionGet, sectionSet, sectionToArray, uniformSection } from './sections';
import { ChunkedVoxelWorld, columnKey } from './VoxelWorld';

/** 小さい検査用: 負の座標をふくむ列を自分で足す */
function makeWorld(cols: Array<[number, number]>, y = 64): ChunkedVoxelWorld {
  const w = new ChunkedVoxelWorld({ x: 0, z: 0, y });
  for (const [cx, cz] of cols) {
    const n = Math.ceil(y / 16);
    w.loadColumn({ cx, cz, sections: Array.from({ length: n }, () => uniformSection(0)) });
  }
  return w;
}

describe('列のキー・座標（VOX-A）', () => {
  it('列のキーは負でも ちがう数になる', () => {
    const keys = new Set<number>();
    for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) keys.add(columnKey(cx, cz));
    expect(keys.size).toBe(49);
    expect(columnKey(0, 0)).toBe(32768 * 65536 + 32768);
  });

  it('負の座標の get/set（>>4 と &15）', () => {
    const w = makeWorld([[-1, -1], [-1, 0], [0, -1], [0, 0], [-2, 0]]);
    expect(w.getBlock(-1, 5, -1)).toBe('air');
    expect(w.setBlock(-1, 5, -1, 'stone')).toBe(true);
    expect(w.getBlock(-1, 5, -1)).toBe('stone');
    expect(w.getBlock(-16, 5, -1)).toBe('air');
    expect(w.getBlock(15, 5, -1)).toBe('air'); // 列 (0,-1) は読みこみずみ・空気
    w.setBlock(-16, 0, 0, 'dirt');
    w.setBlock(-17, 63, 15, 'sand');
    expect(w.getBlock(-16, 0, 0)).toBe('dirt');
    expect(w.getBlock(-17, 63, 15)).toBe('sand');
    expect(w.getBlock(-15, 0, 0)).toBe('air');
    // 列のへだたり: (-1,-1) と (0,0) の中のおなじ位置はちがうマス
    w.setBlock(15, 1, 15, 'log');
    expect(w.getBlock(-1, 1, -1)).toBe('air');
    expect(w.getBlock(15, 1, 15)).toBe('log');
  });

  it('読みこんでいないマス・高さの外は outside で、書けない', () => {
    const w = makeWorld([[0, 0]]);
    expect(w.isLoaded(0, 0)).toBe(true);
    expect(w.isLoaded(15.5, 15.5)).toBe(true);
    expect(w.isLoaded(-0.5, 0)).toBe(false);
    expect(w.isLoaded(16, 0)).toBe(false);
    expect(w.getBlock(16, 0, 0)).toBe('outside');
    expect(w.getBlock(-1, 0, 0)).toBe('outside');
    expect(w.getBlock(0, -1, 0)).toBe('outside');
    expect(w.getBlock(0, 64, 0)).toBe('outside');
    expect(w.setBlock(16, 0, 0, 'stone')).toBe(false);
    expect(w.setBlock(0, 64, 0, 'stone')).toBe(false);
    expect(w.isSolid(16, 0, 0)).toBe(false);
    expect(w.loadedBounds()).toEqual({ x0: 0, z0: 0, x1: 16, z1: 16 });
  });

  it('列を捨てると outside にもどる', () => {
    const w = makeWorld([[0, 0], [1, 0]]);
    w.setBlock(20, 3, 3, 'stone');
    expect(w.unloadColumn(1, 0)).toBe(true);
    expect(w.getBlock(20, 3, 3)).toBe('outside');
    expect(w.unloadColumn(1, 0)).toBe(false);
    expect(w.columnCount()).toBe(1);
  });
});

describe('セクションの 3 つの形', () => {
  it('uniform → full → palette → uniform を行き来しても中身が同じ', () => {
    let s = uniformSection(0);
    expect(sectionGet(s, 123)).toBe(0);
    s = sectionSet(s, localIndex(1, 2, 3), 3);
    expect(s.kind).toBe('full');
    s = sectionSet(s, localIndex(15, 15, 15), 5);
    const before = Uint8Array.from(sectionToArray(s));
    const p = compactSection(s);
    expect(p.kind).toBe('palette');
    expect(Array.from(sectionToArray(p))).toEqual(Array.from(before));
    // palette に書く（表に空きがある間は palette のまま）
    const p2 = sectionSet(p, localIndex(0, 0, 0), 9);
    expect(p2.kind).toBe('palette');
    expect(sectionGet(p2, 0)).toBe(9);
    expect(sectionGet(p2, localIndex(1, 2, 3))).toBe(3);
    expect(sectionGet(p2, localIndex(15, 15, 15))).toBe(5);
    // 全部同じにもどすと uniform
    let u = p2;
    for (let i = 0; i < 4096; i++) u = sectionSet(u, i, 4);
    const c = compactSection(u);
    expect(c.kind).toBe('uniform');
    expect(c.kind === 'uniform' && c.block).toBe(4);
    expect(sectionToArray(c).every((v) => v === 4)).toBe(true);
  });

  it('palette は 16 種類まで。17 種類目で full になり、中身は同じ', () => {
    let s = uniformSection(0);
    for (let k = 0; k < 16; k++) s = sectionSet(s, k, k);
    s = compactSection(s);
    expect(s.kind).toBe('palette');
    s = sectionSet(s, 100, 20);
    expect(s.kind).toBe('full');
    for (let k = 0; k < 16; k++) expect(sectionGet(s, k)).toBe(k);
    expect(sectionGet(s, 100)).toBe(20);
    expect(compactSection(s).kind).toBe('full');
  });

  it('world の compactAll のあとも getBlock が同じ', () => {
    const w = makeWorld([[0, 0], [-1, 0]]);
    w.fill(-10, 2, 1, 10, 9, 4, 'stone');
    w.setBlock(3, 3, 3, 'coal_ore');
    const snap = (): string[] => {
      const out: string[] = [];
      for (let x = -16; x < 16; x++) for (let y = 0; y < 64; y += 3) for (let z = 0; z < 16; z++) out.push(w.getBlock(x, y, z));
      return out;
    };
    const a = snap();
    const hash = w.hash();
    w.compactAll();
    expect(snap()).toEqual(a);
    expect(w.hash()).toBe(hash);
    expect(w.section(0, 3, 0)?.kind).toBe('uniform');
    expect(w.section(0, 0, 0)?.kind).toBe('palette');
    w.setBlock(3, 3, 3, 'air');
    expect(w.getBlock(3, 3, 3)).toBe('air');
  });

  it('fillFlat は getIndex と同じ', () => {
    const w = new ChunkedVoxelWorld({ x: 32, y: 40, z: 32 });
    w.fill(2, 1, 3, 30, 35, 20, 'dirt');
    w.setBlock(31, 39, 31, 'log');
    const out = new Uint8Array(32 * 40 * 32);
    w.fillFlat(out, 32, 32);
    for (let y = 0; y < 40; y += 3) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) expect(out[(y * 32 + z) * 32 + x]).toBe(w.getIndex(x, y, z));
    expect(out[(39 * 32 + 31) * 32 + 31]).toBe(blockIndexOf('log'));
  });
});

describe('見えない印（VOX-plan §6）', () => {
  const stone3x3 = () => {
    const cols: Array<[number, number]> = [];
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) cols.push([cx, cz]);
    const w = makeWorld(cols, 64);
    w.fill(-16, 0, -16, 31, 47, 31, 'stone'); // y 0〜47 は石、その上は空気
    return w;
  };

  it('囲まれた地下のセクションに付く。地表・世界のふちには付かない', () => {
    const w = stone3x3();
    expect(w.isSectionHidden(0, 1, 0)).toBe(true);
    expect(w.isSectionHidden(0, 0, 0)).toBe(true); // 底はふさがっている
    expect(w.isSectionHidden(0, 2, 0)).toBe(false); // 上のとなりが空気
    expect(w.isSectionHidden(0, 3, 0)).toBe(false); // 空気だけ
    expect(w.isSectionHidden(-1, 1, 0)).toBe(false); // 読みこんでいないとなりがある
    expect(w.isSectionHidden(5, 1, 5)).toBe(false); // 読みこんでいない
  });

  it('ほると 自分と 6 つのとなりで外れる', () => {
    const w = stone3x3();
    // 先に すべて読む（印を計算させる）
    for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) for (let sy = 0; sy < 4; sy++) w.isSectionHidden(cx, sy, cz);
    expect(w.isSectionHidden(0, 1, 0)).toBe(true);
    w.setBlock(8, 20, 8, 'air'); // 列 (0,0) の sy=1 のまんなか
    expect(w.isSectionHidden(0, 1, 0)).toBe(false); // 自分
    // まんなかをほっただけ: となりの面はまだ石なので、となりは付いたまま（見なおした結果が true）
    expect(w.isSectionHidden(0, 0, 0)).toBe(true);
    expect(w.isSectionHidden(1, 1, 0)).toBe(false); // ふちのとなりは もともと false
    // 面まで ほる: 面のマスを ほると となりの面が あく
    const w2 = stone3x3();
    for (let sy = 0; sy < 4; sy++) w2.isSectionHidden(0, sy, 0);
    w2.setBlock(15, 20, 8, 'air'); // 列 (0,0) の x+ ぎわ
    expect(w2.isSectionHidden(0, 1, 0)).toBe(false);
    w2.setBlock(8, 16, 8, 'air'); // 下のふち（sy=1 の底の面）
    expect(w2.isSectionHidden(0, 0, 0)).toBe(false); // 下のとなりの面が あいた
    w2.setBlock(8, 16, 8, 'stone');
    // 埋めなおすと 付く
    w2.setBlock(15, 20, 8, 'stone');
    expect(w2.isSectionHidden(0, 1, 0)).toBe(true);
  });

  it('洞くつの口では付かない（となりの面に空気がある）', () => {
    const w = stone3x3();
    for (let sy = 0; sy < 4; sy++) w.isSectionHidden(0, sy, 0);
    // x+ のとなり列 (1,0) の sy=1 の中に、(0,0) に ふれる面に 1 マスだけ 空気
    w.setBlock(16, 20, 8, 'air');
    expect(w.isSectionHidden(0, 1, 0)).toBe(false);
    // 洞くつの奥（ふれない所）では 付く
    const w3 = stone3x3();
    w3.setBlock(24, 20, 8, 'air'); // 列 (1,0) の まんなか
    expect(w3.isSectionHidden(0, 1, 0)).toBe(true);
    expect(w3.isSectionHidden(1, 1, 0)).toBe(false);
    // 水・たいまつ・はっぱは ふさがっていない
    const w4 = stone3x3();
    w4.setBlock(8, 20, 8, 'leaves');
    expect(w4.isSectionHidden(0, 1, 0)).toBe(false);
    const w5 = stone3x3();
    w5.setBlock(8, 20, 8, 'water');
    expect(w5.isSectionHidden(0, 1, 0)).toBe(false);
  });

  it('セクションごとの dirty: ほったセクションと、ふちならとなりのセクション', () => {
    const w = stone3x3();
    w.takeDirtySections();
    w.setBlock(8, 20, 8, 'air');
    expect(w.takeDirtySections()).toEqual([{ cx: 0, sy: 1, cz: 0 }]);
    w.setBlock(15, 16, 8, 'air'); // x+ のふち・sy=1 の下のふち
    const d = w.takeDirtySections().map((s) => `${s.cx},${s.sy},${s.cz}`).sort();
    expect(d).toEqual(['0,0,0', '0,1,0', '1,1,0']);
    expect(w.takeDirtySections()).toEqual([]);
  });
});
