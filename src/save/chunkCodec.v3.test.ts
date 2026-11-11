import { describe, expect, it } from 'vitest';
import type { SectionData } from '../contracts';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../world/sections';
import { MemoryBackend, NewerFormatError, SAVE_ID, packColumn, unpackColumn } from './backend';
import { CHUNK_FORMAT_VERSION, CHUNK_FORMAT_VERSION_WIDE, decodeSections, encodeSections, sectionsFormatVersion } from './chunkCodec';
import { exportSave, importSave } from './portable';

// BLOCK-ID16 AC2・AC3: 版の付け方（種類 255 以下 → 2、256 以上 → 3）と、版 3 の列を backend・ファイルが通すこと。
// 本物の BLOCK_TYPES は 217 種類。256 種類以上の列は、表を「今の id の並びを 2 回つないだ もの」にして作る
// （番号 n と n + 217 は 同じ id。読むと 小さい方の 番号に なる）。

const N = BLOCK_TYPES.length;
const IDS = BLOCK_TYPES.map((t) => t.id);
const DOUBLE: readonly string[] = [...IDS, ...IDS];

function fullOfRange(count: number): SectionData {
  const data = new Uint16Array(SECTION_VOLUME);
  for (let i = 0; i < SECTION_VOLUME; i++) data[i] = i % count;
  return { kind: 'full', data };
}

describe('BLOCK-ID16: sectionsFormatVersion', () => {
  it('版の 数: 2 と 3。今の 版は 2 のまま', () => {
    expect(CHUNK_FORMAT_VERSION).toBe(2);
    expect(CHUNK_FORMAT_VERSION_WIDE).toBe(3);
  });

  it('列の 種類が 255 以下なら 2、256 以上なら 3', () => {
    expect(sectionsFormatVersion([{ kind: 'uniform', block: 1023 }])).toBe(2);
    expect(sectionsFormatVersion([fullOfRange(255)])).toBe(2);
    expect(sectionsFormatVersion([fullOfRange(256)])).toBe(3);
    // 種類は 列の 全体で 数える（セクションを またいで）
    const a = fullOfRange(200);
    const b: SectionData = { kind: 'full', data: Uint16Array.from({ length: SECTION_VOLUME }, (_, i) => 200 + (i % 60)) };
    expect(sectionsFormatVersion([a])).toBe(2);
    expect(sectionsFormatVersion([a, b])).toBe(3);
  });
});

describe('BLOCK-ID16: packColumn の v・unpackColumn・ファイル', () => {
  it('packColumn は v を 受けとって record に 入れる（省略 = 2）', async () => {
    const raw = encodeSections([{ kind: 'uniform', block: 1 }]);
    expect((await packColumn(0, 0, raw, 4, 1)).v).toBe(2);
    expect((await packColumn(0, 0, raw, 4, 1, CHUNK_FORMAT_VERSION_WIDE)).v).toBe(3);
  });

  it('版 3 の record を unpackColumn で読める。版 4 は NewerFormatError', async () => {
    const src: SectionData[] = [fullOfRange(300), { kind: 'uniform', block: 0 }];
    const v = sectionsFormatVersion(src);
    expect(v).toBe(3);
    const rec = await packColumn(3, 4, encodeSections(src, DOUBLE), 4, 2, v);
    const col = await unpackColumn(rec, 2);
    const got = sectionToArray(col.sections[0]);
    for (let i = 0; i < SECTION_VOLUME; i++) expect(got[i]).toBe((i % 300) % N);
    await expect(unpackColumn({ ...rec, v: 4 }, 2)).rejects.toBeInstanceOf(NewerFormatError);
  });

  it('版 3 の 列が ファイルに 書き出して 読みこんで も 同じ（MemoryBackend 往復）', async () => {
    const src: SectionData[] = [fullOfRange(300)];
    const rec = await packColumn(0, 0, encodeSections(src, DOUBLE), 4, 1, sectionsFormatVersion(src));
    const db = new MemoryBackend();
    await db.write(SAVE_ID, [rec], { v: 1, seed: 7 } as never);
    const file = await exportSave(db, SAVE_ID);
    const db2 = new MemoryBackend();
    expect(await importSave(db2, SAVE_ID, file, 7)).toBe(1);
    const back = await db2.readChunk(SAVE_ID, 0, 0);
    expect(back?.v).toBe(3);
    const col = await unpackColumn(back!, 1);
    expect(sectionToArray(col.sections[0])[299]).toBe(299 % N);
  });

  it('decodeSections は 版 3 を 読み、版 4 は 読めない（Error）', () => {
    const raw = encodeSections([fullOfRange(300)], DOUBLE);
    expect(() => decodeSections(raw, 1, 3, DOUBLE)).not.toThrow();
    expect(() => decodeSections(raw, 1, 4, DOUBLE)).toThrow();
  });
});
