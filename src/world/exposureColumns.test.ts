import { describe, expect, it } from 'vitest';
import { uniformSection } from './sections';
import { ChunkedVoxelWorld } from './VoxelWorld';

/** 列の出入りのたびに 世界ぜんぶを数えなおさない（VOX-D）: 少しずつ足しても、ぜんぶ足してから数えたのと 同じ答え */

const H = 64;

function colSections(cx: number): ReturnType<ChunkedVoxelWorld['column']> {
  const tmp = new ChunkedVoxelWorld({ x: 16, z: 16, y: H });
  tmp.fill(0, 0, 0, 15, 39, 15, 'stone');
  tmp.fill(0, 20, 6, 15, 22, 8, 'air'); // x 方向にぬけるトンネル（列のはし 2 つにふれる）
  if (cx === 0) tmp.fill(2, 20, 6, 4, 45, 8, 'air'); // 列 0 の たて穴（空まで）
  return { cx, cz: 0, sections: tmp.column(0, 0)!.sections.slice() };
}

function load(w: ChunkedVoxelWorld, cx: number): void {
  const c = colSections(cx)!;
  w.loadColumn({ cx, cz: 0, sections: c.sections.slice() });
}

function hiddenAll(w: ChunkedVoxelWorld, n: number): boolean[] {
  const out: boolean[] = [];
  for (let cx = 0; cx < n; cx++) for (let sy = 0; sy < 4; sy++) out.push(w.isSectionHidden(cx, sy, 0));
  return out;
}

function fresh(order: number[]): ChunkedVoxelWorld {
  const w = new ChunkedVoxelWorld({ x: 0, z: 0, y: H });
  w.edgeClosedBelow = 40;
  for (const cx of order) load(w, cx);
  return w;
}

describe('列ごとの数えなおし', () => {
  it('足すたびに 答えを聞いても、ぜんぶ足してから聞いたのと同じ', () => {
    const w = new ChunkedVoxelWorld({ x: 0, z: 0, y: H });
    w.edgeClosedBelow = 40;
    load(w, 2);
    load(w, 3);
    expect(w.isSectionHidden(2, 1, 0)).toBe(true); // 空にとどいていない
    load(w, 1);
    expect(w.isSectionHidden(2, 1, 0)).toBe(true);
    load(w, 0); // たて穴が空にとどく → つながったトンネルが 見える
    expect(w.isSectionHidden(2, 1, 0)).toBe(false);
    expect(w.isSectionHidden(3, 1, 0)).toBe(false);
    expect(hiddenAll(w, 4)).toEqual(hiddenAll(fresh([0, 1, 2, 3]), 4));
  });

  it('捨てても 数えたマスは ちぢまず、読みこみなおすと同じ', () => {
    const w = fresh([0, 1, 2, 3]);
    const before = hiddenAll(w, 4);
    w.unloadColumn(0, 0);
    expect(w.isSectionHidden(2, 1, 0)).toBe(false);
    load(w, 0);
    expect(hiddenAll(w, 4)).toEqual(before);
  });
});

describe('isSaveDirty・hash・loadedBounds', () => {
  it('さわった列だけ isSaveDirty。takeSaveDirty でもどる', () => {
    const w = fresh([0, 1]);
    expect(w.isSaveDirty(1, 0)).toBe(false);
    w.setBlock(20, 5, 3, 'air');
    expect(w.isSaveDirty(1, 0)).toBe(true);
    expect(w.isSaveDirty(0, 0)).toBe(false);
    expect(w.isSaveDirty(9, 9)).toBe(false);
    w.takeSaveDirty();
    expect(w.isSaveDirty(1, 0)).toBe(false);
  });

  it('負の列でも loadedBounds が合い、捨てると小さくなる。hash は 入れる順にかかわらず同じ', () => {
    const a = new ChunkedVoxelWorld({ x: 0, z: 0, y: H });
    const b = new ChunkedVoxelWorld({ x: 0, z: 0, y: H });
    const empty = () => Array.from({ length: 4 }, () => uniformSection(0));
    for (const [cx, cz] of [[-3, -2], [5, 1], [0, 0]] as const) a.loadColumn({ cx, cz, sections: empty() });
    for (const [cx, cz] of [[0, 0], [5, 1], [-3, -2]] as const) b.loadColumn({ cx, cz, sections: empty() });
    expect(a.loadedBounds()).toEqual({ x0: -48, z0: -32, x1: 96, z1: 32 });
    expect(a.hash()).toBe(b.hash());
    a.unloadColumn(5, 1);
    expect(a.loadedBounds()).toEqual({ x0: -48, z0: -32, x1: 16, z1: 16 });
    a.unloadColumn(-3, -2);
    a.unloadColumn(0, 0);
    expect(a.loadedBounds()).toEqual({ x0: 0, z0: 0, x1: 0, z1: 0 });
  });
});
