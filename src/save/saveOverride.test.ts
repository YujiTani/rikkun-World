import { describe, expect, it } from 'vitest';
import type { ChunkColumn, SectionData } from '../contracts';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { localIndex, sectionGet } from '../world/sections';
import { decodeSections, encodeSections } from './chunkCodec';
import { columnForSave, pendingCellsForSave, type SaveBlockOverride } from './saveOverride';

const idx = (id: string) => BLOCK_TYPES.findIndex((t) => t.id === id);
const GEY = idx('geyser_dirt');
const DIRT = idx('dirt');
const GRASS = idx('grass');
const STONE = idx('stone');

const OV = (x: number, y: number, z: number): SaveBlockOverride => ({ x, y, z, live: 'geyser_dirt', save: 'grass' });

/** 保存して 読みなおす（本物の 符号化） */
const roundTrip = (col: ChunkColumn, ov: readonly SaveBlockOverride[]): SectionData[] =>
  decodeSections(encodeSections(columnForSave(col, ov).sections), col.sections.length);

function column(sec: SectionData): ChunkColumn {
  return { cx: 1, cz: -1, sections: [sec] } as unknown as ChunkColumn;
}

describe('保存だけの 置きかえ（#293 間欠泉の 土）', () => {
  const x = 16 + 3, y = 5, z = -16 + 7;
  const i = localIndex(3, 5, 7);

  it('full: 管理が 作った マスだけ 元の ブロックで 書く。ほかの geyser_dirt（プレイヤーが 置いた もの）は そのまま', () => {
    const data = new Uint8Array(4096).fill(STONE);
    data[i] = GEY;
    const other = localIndex(9, 5, 7);
    data[other] = GEY;
    const col = column({ kind: 'full', data });
    const got = roundTrip(col, [OV(x, y, z)]);
    expect(sectionGet(got[0], i)).toBe(GRASS);
    expect(sectionGet(got[0], other)).toBe(GEY);
    // 遊んでいる 世界の 列は かわらない
    expect(data[i]).toBe(GEY);
  });

  it('palette 版（16 種類 いかい）でも 置きかえて 保存できる。元の 列は かわらない', () => {
    const palette = Uint8Array.of(STONE, GEY, DIRT);
    const packed = new Uint8Array(2048);
    for (let k = 0; k < 4096; k++) {
      const p = k % 3;
      packed[k >> 1] = (k & 1) === 0 ? (packed[k >> 1] & 0xf0) | p : (packed[k >> 1] & 0x0f) | (p << 4);
    }
    const src: SectionData = { kind: 'palette', palette, packed };
    const col = column(src);
    // k % 3 === 1 の マスが geyser_dirt（localIndex(4,5,7) = 1396）
    const live = localIndex(4, 5, 7);
    expect(sectionGet(src, live)).toBe(GEY);
    const lx = 4;
    const got = roundTrip(col, [OV(16 + lx, 5, -16 + 7)]);
    expect(sectionGet(got[0], live)).toBe(GRASS);
    // ほかの マスは そのまま
    for (let k = 0; k < 4096; k++) if (k !== live) expect(sectionGet(got[0], k)).toBe(sectionGet(src, k));
    expect(sectionGet(src, live)).toBe(GEY);
  });

  it('uniform 版でも 置きかえられる', () => {
    const col = column({ kind: 'uniform', block: GEY });
    const got = roundTrip(col, [OV(x, y, z)]);
    expect(sectionGet(got[0], i)).toBe(GRASS);
    expect(sectionGet(got[0], localIndex(0, 0, 0))).toBe(GEY);
  });

  it('そのマスが もう geyser_dirt でなければ（掘られた・かわった）さわらない', () => {
    const data = new Uint8Array(4096).fill(STONE);
    const col = column({ kind: 'full', data });
    const got = roundTrip(col, [OV(x, y, z)]);
    expect(sectionGet(got[0], i)).toBe(STONE);
  });

  it('置きかえが ない・ほかの 列の ものだけ なら 同じ 列を そのまま かえす', () => {
    const col = column({ kind: 'uniform', block: STONE });
    expect(columnForSave(col, [])).toBe(col);
    expect(columnForSave(col, [OV(500, 5, 500)])).toBe(col);
  });

  it('pagehide の 保険の 記録 [x,y,z,番号] も 同じ マスだけ 置きかえる', () => {
    const cells = [x, y, z, GEY, x + 1, y, z, GEY, x, y, z, STONE];
    expect(pendingCellsForSave(cells, [OV(x, y, z)])).toEqual([x, y, z, GRASS, x + 1, y, z, GEY, x, y, z, STONE]);
    expect(pendingCellsForSave(cells, [])).toBe(cells);
  });
});
