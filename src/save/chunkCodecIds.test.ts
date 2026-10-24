import { describe, expect, it } from 'vitest';
import type { SectionData } from '../contracts';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { sectionToArray } from '../world/sections';
import { packColumn, unpackColumn } from './backend';
import { BLOCK_IDS_V1 } from './blockIdsV1';
import { CHUNK_FORMAT_VERSION, decodeSections, deflateRaw, encodeSections, persistIds } from './chunkCodec';

const base: readonly string[] = BLOCK_IDS_V1;
const idx = (id: string) => base.indexOf(id);

/** uniform / palette / full の 3 つの形（base の番号で作る） */
function shapes(): SectionData[] {
  const full = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) full[i] = i % 20;
  const packed = new Uint8Array(2048);
  for (let i = 0; i < 2048; i++) packed[i] = (i % 3) | ((i % 2) << 4);
  return [
    { kind: 'uniform', block: idx('stone') },
    { kind: 'palette', palette: Uint8Array.of(idx('air'), idx('farmland'), idx('sprinkler')), packed },
    { kind: 'full', data: full },
  ];
}

const reversed = [...base].reverse();
const inserted = [...base.slice(0, 3), 'new_block', ...base.slice(3)];
const appended = [...base, 'new_block'];

describe('SAVE-30 AC1: 並び順のちがう表で読んでも 同じ id', () => {
  for (const [name, table] of [['並びかえ', reversed], ['途中に足す', inserted], ['後ろに足す', appended]] as const) {
    it(`${name}（uniform / palette / full）`, () => {
      const src = shapes();
      const raw = encodeSections(src, base);
      const got = decodeSections(raw, src.length, 2, table);
      expect(got.map((s) => s.kind)).toEqual(['uniform', 'palette', 'full']);
      for (let s = 0; s < src.length; s++) {
        const a = sectionToArray(src[s]);
        const b = sectionToArray(got[s]);
        for (let i = 0; i < 4096; i++) expect(table[b[i]]).toBe(base[a[i]]);
      }
    });
  }

  it('書いた表と別の表で書いても、どちらでも 同じ id の列になる', () => {
    const src = shapes();
    const viaBase = decodeSections(encodeSections(src, base), 3, 2, base);
    // 並びかえた表で 同じ id の列を作って書き、base で読む
    const pos = (id: string) => reversed.indexOf(id);
    const rev = src.map((s) => {
      const a = sectionToArray(s).map((v) => pos(base[v]));
      return { kind: 'full', data: Uint8Array.from(a) } as SectionData;
    });
    const viaRev = decodeSections(encodeSections(rev, reversed), 3, 2, base);
    for (let s = 0; s < 3; s++) expect(sectionToArray(viaRev[s])).toEqual(sectionToArray(viaBase[s]));
  });

  it('表を渡さなければ 今の BLOCK_TYPES', () => {
    const src = shapes();
    const got = decodeSections(encodeSections(src), 3);
    for (let s = 0; s < 3; s++) expect(sectionToArray(got[s])).toEqual(sectionToArray(src[s]));
  });
});

describe('間欠泉の つち(geyser_dirt) は 保存に 残らない（#293）', () => {
  it('persistIds の 表で 書くと geyser_dirt は 土として もどり、ほかの ブロックは かわらない', () => {
    const ids = BLOCK_TYPES.map((t) => t.id);
    const g = ids.indexOf('geyser_dirt');
    const d = ids.indexOf('dirt');
    const s = ids.indexOf('stone');
    expect(g).toBeGreaterThanOrEqual(0);
    const data = new Uint8Array(4096);
    for (let i = 0; i < 4096; i++) data[i] = i % 3 === 0 ? g : i % 3 === 1 ? s : d;
    const src: SectionData[] = [{ kind: 'full', data }, { kind: 'uniform', block: g }];
    const got = decodeSections(encodeSections(src, persistIds()), 2);
    const a = sectionToArray(got[0]);
    for (let i = 0; i < 4096; i++) expect(a[i]).toBe(i % 3 === 1 ? s : d);
    expect(sectionToArray(got[1]).every((v) => v === d)).toBe(true);
    // ふつうの 表では そのまま
    const plain = decodeSections(encodeSections(src), 2);
    expect(sectionToArray(plain[1]).every((v) => v === g)).toBe(true);
  });
});

describe('SAVE-30 版 2 の形', () => {
  it('頭に id の一覧 [n][長さ 1 B + ASCII]×n。セクションの番号は その一覧の中の番号', () => {
    const raw = encodeSections([{ kind: 'uniform', block: idx('stone') }], base);
    const ids = ['stone'];
    const head = [ids.length, ...ids.flatMap((s) => [s.length, ...[...s].map((c) => c.charCodeAt(0))])];
    expect([...raw]).toEqual([...head, 0, 0]);
  });

  it('使う id だけ入る（2 種類の palette）', () => {
    const few = new Uint8Array(4096);
    few[7] = idx('sand');
    const raw = encodeSections([{ kind: 'full', data: few }], base);
    expect(raw[0]).toBe(2);
    expect(raw.length).toBe(1 + (1 + 3) + (1 + 4) + 2 + 2 + 2048);
  });

  it('CHUNK_FORMAT_VERSION は 2。packColumn は v 2', async () => {
    expect(CHUNK_FORMAT_VERSION).toBe(2);
    expect((await packColumn(0, 0, encodeSections(shapes()), 2, 3)).v).toBe(2);
  });

  it('こわれた版 2 は Error（短い・余り・一覧の外の番号）', () => {
    const raw = encodeSections(shapes(), base);
    expect(() => decodeSections(raw.slice(0, raw.length - 1), 3)).toThrow();
    expect(() => decodeSections(raw, 2)).toThrow();
    expect(() => decodeSections(Uint8Array.of(1, 5, 115, 116, 111, 110, 101, 0, 9), 1)).toThrow(); // 一覧は 1 つなのに 番号 9
  });
});

describe('SAVE-30 AC2: 版 1 の列は 凍らせた表で 今までどおり読める', () => {
  // 今のビルドが書いたバイト列（番号は BLOCK_IDS_V1 の番号）
  const v1uniform = Uint8Array.of(0, 2); // dirt
  const v1palette = (() => {
    const o = new Uint8Array(2 + 3 + 2048);
    o[0] = 1;
    o[1] = 3;
    o.set([0, 9, 30], 2); // air, water, sprinkler
    for (let i = 0; i < 2048; i++) o[5 + i] = (i % 3) | (((i + 1) % 3) << 4);
    return o;
  })();
  const v1full = (() => {
    const o = new Uint8Array(1 + 4096);
    o[0] = 2;
    for (let i = 0; i < 4096; i++) o[1 + i] = i % 31;
    return o;
  })();
  const raw = Uint8Array.from([...v1uniform, ...v1palette, ...v1full]);

  it('今の表で読むと 同じブロック', () => {
    const got = decodeSections(raw, 3, 1);
    expect(sectionToArray(got[0])[0]).toBe(BLOCK_TYPES.findIndex((t) => t.id === 'dirt'));
    expect(got[1].kind).toBe('palette');
    expect(sectionToArray(got[1])[0]).toBe(0);
    expect(BLOCK_TYPES[sectionToArray(got[1])[1]].id).toBe('water');
    expect(BLOCK_TYPES[sectionToArray(got[1])[3]].id).toBe('sprinkler');
  });

  it('並び順のちがう表で読んでも 同じ id', () => {
    const got = decodeSections(raw, 3, 1, reversed);
    const full = sectionToArray(got[2]);
    for (let i = 0; i < 4096; i++) expect(reversed[full[i]]).toBe(base[i % 31]);
    expect(reversed[sectionToArray(got[0])[0]]).toBe('dirt');
  });

  it('版 1 の番号が表の外なら Error', () => {
    expect(() => decodeSections(Uint8Array.of(0, 250), 1, 1)).toThrow();
    expect(() => decodeSections(Uint8Array.of(0, 31), 1, 1)).toThrow();
  });

  it('unpackColumn: v 1 の record を読める。v 3 は NewerFormatError', async () => {
    const rec = { cx: 1, cz: 2, v: 1, gen: 2, h: 3, data: await deflateRaw(raw) };
    const col = await unpackColumn(rec, 3);
    expect(col.sections).toHaveLength(3);
    expect(BLOCK_TYPES[sectionToArray(col.sections[0])[0]].id).toBe('dirt');
    await expect(unpackColumn({ ...rec, v: 3 }, 3)).rejects.toThrow(/新しい/);
  });
});

describe('SAVE-30 AC4: 知らない id', () => {
  it('版 2 の列に 今のゲームにない id があると Error（その列はこわれ扱い）', () => {
    const ghost = base.map((id) => (id === 'dirt' ? 'ghost_block' : id));
    const raw = encodeSections([{ kind: 'uniform', block: idx('dirt') }], ghost);
    expect(() => decodeSections(raw, 1)).toThrow();
    const ok = encodeSections([{ kind: 'uniform', block: idx('stone') }], ghost);
    expect(() => decodeSections(ok, 1)).not.toThrow();
  });
});
