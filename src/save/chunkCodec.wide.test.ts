import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SectionData } from '../contracts';
import { SECTION_VOLUME, sectionToArray } from '../world/sections';
import { BLOCK_IDS_V1 } from './blockIdsV1';
import { decodeSections, encodeSections } from './chunkCodec';

// BLOCK-ID16 AC2: 番号 256 以上の 列の 往復と、版 2 の バイト列が 今の main と 同じ こと。
// 表は 引数で 渡す（本番の BLOCK_TYPES を よごさない）。番号 n の id は 'k<n>'（0 だけ 'air'）。

const TABLE: readonly string[] = Array.from({ length: 1100 }, (_, i) => (i === 0 ? 'air' : `k${i}`));
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

function fullOf(kinds: number[]): SectionData {
  const data = new Uint16Array(SECTION_VOLUME);
  for (let i = 0; i < SECTION_VOLUME; i++) data[i] = kinds[(i * 7 + (i >> 4)) % kinds.length];
  return { kind: 'full', data };
}

function palettePart(palette: number[]): SectionData {
  const packed = new Uint8Array(2048);
  for (let i = 0; i < 2048; i++) packed[i] = (i % palette.length) | (((i * 3 + 1) % palette.length) << 4);
  return { kind: 'palette', palette: Uint16Array.from(palette), packed };
}

function same(a: SectionData[], b: SectionData[]) {
  expect(b.length).toBe(a.length);
  for (let s = 0; s < a.length; s++) expect([...sectionToArray(b[s])], `セクション ${s}`).toEqual([...sectionToArray(a[s])]);
}

describe('BLOCK-ID16 AC2: 種類が 255 以下の 列（版 2）', () => {
  it('番号 256 以上を ふくむ列が 版 2 で 往復する（uniform / palette / full）', () => {
    const src: SectionData[] = [
      { kind: 'uniform', block: 300 },
      palettePart([0, 256, 700, 1023]),
      fullOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 300, 301, 1023]),
    ];
    const raw = encodeSections(src, TABLE);
    // 版 2: 頭は 使う番号の 数（1 バイト）。0, 1..17, 256, 300, 301, 700, 1023 のうち 使った 数
    const used = new Set<number>();
    for (const s of src) for (const v of sectionToArray(s)) used.add(v);
    expect(raw[0]).toBe(used.size);
    same(src, decodeSections(raw, src.length, 2, TABLE));
  });

  it('255 種類 ぴったりの 列（番号は 0〜253 と 900）は 版 2 で 往復する', () => {
    const kinds = [...Array.from({ length: 254 }, (_, i) => i), 900];
    const src = [fullOf(kinds), fullOf(kinds.slice(100))];
    const raw = encodeSections(src, TABLE);
    expect(raw[0]).toBe(255);
    same(src, decodeSections(raw, 2, 2, TABLE));
  });

  it('列の 全体で 255 種類（0〜254）。番号が 255 以下なら 版 2 の バイト列は 今の main と 同じ（写し）', () => {
    const kinds = Array.from({ length: 255 }, (_, i) => i);
    const src = [fullOf(kinds)];
    const raw = encodeSections(src, TABLE);
    expect(raw[0]).toBe(255);
    expect(raw.length).toBe(5264);
    expect(sha(raw)).toBe('91b464d411d1403a6d2a38a5379210082b810fdb0c7a9b9a5ae620799e0108dc');
    same(src, decodeSections(raw, 1, 2, TABLE));
  });

  it('今の main が 書いた 版 2 の バイト列と 同じ（uniform / palette / full ・ 凍らせた表 BLOCK_IDS_V1）', () => {
    const full = new Uint16Array(SECTION_VOLUME);
    for (let i = 0; i < SECTION_VOLUME; i++) full[i] = i % 20;
    const packed = new Uint8Array(2048);
    for (let i = 0; i < 2048; i++) packed[i] = (i % 3) | ((i % 2) << 4);
    const idx = (id: string) => BLOCK_IDS_V1.indexOf(id);
    const src: SectionData[] = [
      { kind: 'uniform', block: idx('stone') },
      { kind: 'palette', palette: Uint16Array.of(idx('air'), idx('farmland'), idx('sprinkler')), packed },
      { kind: 'full', data: full },
    ];
    const raw = encodeSections(src, BLOCK_IDS_V1);
    expect(raw.length).toBe(6310);
    expect(sha(raw)).toBe('54f4bc2f5d01203646198df86a3c3796276b32b3075b77ef4e1c557482c3f4d6');
    same(src, decodeSections(raw, 3, 2, BLOCK_IDS_V1));
  });
});

describe('BLOCK-ID16 AC2: 種類が 256 以上の 列（版 3）', () => {
  it('256 種類を こえる 列が 版 3 で 往復する（番号 256 以上・2 バイトの 一覧）', () => {
    const kinds = Array.from({ length: 300 }, (_, i) => i + (i >= 200 ? 500 : 0)); // 0〜199 と 700〜799
    const src: SectionData[] = [fullOf(kinds), { kind: 'uniform', block: 1023 }, palettePart([0, 300, 800])];
    const raw = encodeSections(src, TABLE);
    same(src, decodeSections(raw, src.length, 3, TABLE));
  });

  it('版 3 は 版 2 として 読めない（こわれた 列と して Error）', () => {
    const kinds = Array.from({ length: 260 }, (_, i) => i);
    const src = [fullOf(kinds)];
    const raw = encodeSections(src, TABLE);
    expect(() => decodeSections(raw, 1, 2, TABLE)).toThrow();
  });

  it('表にない 番号は Error（広い番号でも）', () => {
    expect(() => encodeSections([{ kind: 'uniform', block: 1050 }], TABLE.slice(0, 1000))).toThrow();
  });
});
