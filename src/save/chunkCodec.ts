import type { SectionData } from '../contracts';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { BLOCK_IDS_V1 } from './blockIdsV1';
import { MAX_BLOCK_KINDS } from '../world/blocks/maxBlockKinds';
import { SECTION_VOLUME, compactSection } from '../world/sections';

/**
 * 列の保存の形（VOX-plan §7、SAVE-30 で版 2、BLOCK-ID16 で版 3）。縮める前のバイト列は
 *   版 3: 版 2 と 同じ 並びで、id の数と セクションの中の番号が 2 バイト（下の バイトが先）。1 列に 256 種類以上あるときだけ 書く。
 *   版 2: [id の数 n][各 id: 長さ 1 B + ASCII] のあとに セクションを下から並べる。
 *   版 1: セクションだけ（番号は BLOCK_IDS_V1 の番号。読むだけ）。
 * セクションは 頭の 1 バイトで形をしめす。番号は 版 2 では「頭の一覧の中の番号」（0〜n-1）。
 * 0 = 1 種類だけ [0, 番号] / 1 = パレット [1, 種類の数 n, 番号 × n, 4 ビット × 4096 (2,048 B)] / 2 = そのまま 4,096 B。
 * 読むとき 一覧の id から 今の BLOCK_TYPES の番号を引き直す（並びかえ・途中に足すに強い）。
 * ここは「縮める前」の並び。縮める（deflate-raw）のは backend の側。光・見えない印・小ブロックの形は保存しない。
 */

/** 形式の版（record.v）。列の 種類が 255 以下なら この版（バイト列は BLOCK-ID16 の前と 1 バイトも 同じ） */
export const CHUNK_FORMAT_VERSION = 2;
/** 1 列の 種類が 256 以上のときの 版（BLOCK-ID16）。一覧の数と 一覧の中の番号が 2 バイト（下の バイトが先） */
export const CHUNK_FORMAT_VERSION_WIDE = 3;
/** 版 2 の 一覧に 入れられる 種類の 数（一覧の 数が 1 バイト） */
const MAX_LIST_V2 = 255;

/** 今の BLOCK_TYPES の id の並び（番号 → id） */
const currentIds = (): readonly string[] => BLOCK_TYPES.map((t) => t.id);

/** 縮めたあとの 区画（形が 小さい順）の 列の 使う 番号の 表と、一覧に した 数 */
interface Used {
  parts: SectionData[];
  used: Uint8Array;
  count: number;
}

function collectUsed(sections: readonly SectionData[]): Used {
  const parts: SectionData[] = sections.map((s) => compactSection(s));
  const used = new Uint8Array(MAX_BLOCK_KINDS);
  let count = 0;
  const mark = (b: number): void => {
    if (b >= MAX_BLOCK_KINDS) throw new Error('番号が 上限を こえている');
    if (used[b] === 0) {
      used[b] = 1;
      count++;
    }
  };
  for (const s of parts) {
    if (s.kind === 'uniform') mark(s.block);
    else if (s.kind === 'palette') for (const b of s.palette) mark(b);
    else for (let i = 0; i < SECTION_VOLUME; i++) mark(s.data[i]);
  }
  return { parts, used, count };
}

/** 列を 書くときの 版: 使う 種類が 255 以下 → 2、256 以上 → 3 */
export function sectionsFormatVersion(sections: readonly SectionData[]): 2 | 3 {
  return collectUsed(sections).count > MAX_LIST_V2 ? CHUNK_FORMAT_VERSION_WIDE : CHUNK_FORMAT_VERSION;
}

/**
 * 列をバイト列にする（同期。保存の瞬間のコピーなので、このあと世界が変わっても影響しない）。
 * table = sections の番号が指す id の表（省略 = 今の BLOCK_TYPES。テストで並びのちがう表を渡せる）。
 * 版は sectionsFormatVersion と同じ（255 種類以下 = 版 2、256 以上 = 版 3）。
 */
export function encodeSections(sections: readonly SectionData[], table: readonly string[] = currentIds()): Uint8Array {
  return encodeSectionsV(sections, table).raw;
}

/** encodeSections と 同じ。バイト列に 加えて 書いた 版も 返す（record.v に 入れる） */
export function encodeSectionsV(sections: readonly SectionData[], table: readonly string[] = currentIds()): { raw: Uint8Array; v: 2 | 3 } {
  const { parts, used, count } = collectUsed(sections);
  const v = count > MAX_LIST_V2 ? CHUNK_FORMAT_VERSION_WIDE : CHUNK_FORMAT_VERSION;
  const w = v === CHUNK_FORMAT_VERSION_WIDE ? 2 : 1; // 一覧の数・一覧の中の番号の バイト数
  const local = new Uint16Array(MAX_BLOCK_KINDS); // 表の番号 → 一覧の中の番号
  const ids: string[] = [];
  for (let b = 0; b < MAX_BLOCK_KINDS; b++) {
    if (used[b] === 0) continue;
    const id = table[b];
    if (id === undefined) throw new Error('表にない番号');
    local[b] = ids.length;
    ids.push(id);
  }
  let size = w;
  for (const id of ids) size += 1 + id.length;
  for (const s of parts) size += s.kind === 'uniform' ? 1 + w : s.kind === 'palette' ? 2 + s.palette.length * w + s.packed.length : 1 + SECTION_VOLUME * w;
  const out = new Uint8Array(size);
  let o = 0;
  const put = (n: number): void => {
    out[o++] = n & 255;
    if (w === 2) out[o++] = n >> 8;
  };
  put(ids.length);
  for (const id of ids) {
    out[o++] = id.length;
    for (let i = 0; i < id.length; i++) out[o++] = id.charCodeAt(i);
  }
  for (const s of parts) {
    if (s.kind === 'uniform') {
      out[o++] = 0;
      put(local[s.block]);
    } else if (s.kind === 'palette') {
      out[o++] = 1;
      out[o++] = s.palette.length;
      for (let i = 0; i < s.palette.length; i++) put(local[s.palette[i]]);
      out.set(s.packed, o);
      o += s.packed.length;
    } else {
      out[o++] = 2;
      if (w === 1) for (let i = 0; i < SECTION_VOLUME; i++) out[o++] = local[s.data[i]];
      else for (let i = 0; i < SECTION_VOLUME; i++) put(local[s.data[i]]);
    }
  }
  return { raw: out, v };
}

/**
 * バイト列を sections にもどす。こわれていたら Error（呼ぶ側が その列だけ生成に戻す）。
 * version 1 = 凍らせた BLOCK_IDS_V1 の番号 / 2 = 頭の一覧（番号 1 バイト）/ 3 = 頭の一覧（数・番号が 2 バイト）。
 * table = 戻す先の id の表（省略 = 今の BLOCK_TYPES）。一覧の id が table にない（ゲームから消えたブロック）ときも Error。
 */
export function decodeSections(raw: Uint8Array, count: number, version: number = CHUNK_FORMAT_VERSION, table: readonly string[] = currentIds()): SectionData[] {
  let o = 0;
  let source: readonly string[];
  const w = version === CHUNK_FORMAT_VERSION_WIDE ? 2 : 1; // 一覧の数・一覧の中の番号の バイト数
  const get = (): number => {
    const lo = raw[o++];
    return w === 2 ? lo | (raw[o++] << 8) : lo;
  };
  if (version === 1) source = BLOCK_IDS_V1;
  else if (version === CHUNK_FORMAT_VERSION || version === CHUNK_FORMAT_VERSION_WIDE) {
    if (raw.length < w) throw new Error('id の一覧がない');
    const m = get();
    if (!(m >= 0)) throw new Error('id の一覧がない');
    const list: string[] = [];
    for (let i = 0; i < m; i++) {
      const len = raw[o++];
      if (!(len >= 1) || o + len > raw.length) throw new Error('id の一覧がおかしい');
      let id = '';
      for (let k = 0; k < len; k++) id += String.fromCharCode(raw[o + k]);
      o += len;
      list.push(id);
    }
    source = list;
  } else throw new Error(`形式の版 ${version} は読めない`);
  const n = source.length;
  // 一覧の番号 → table の番号
  const map = new Uint16Array(Math.max(n, 1));
  for (let i = 0; i < n; i++) {
    const j = table.indexOf(source[i]);
    if (j < 0 || j >= MAX_BLOCK_KINDS) throw new Error(`知らない id: ${source[i]}`);
    map[i] = j;
  }
  const out: SectionData[] = [];
  for (let k = 0; k < count; k++) {
    const kind = raw[o++];
    if (kind === 0) {
      if (o + w > raw.length) throw new Error('uniform が短い');
      const block = get();
      if (block >= n) throw new Error('uniform の番号がおかしい');
      out.push({ kind: 'uniform', block: map[block] });
    } else if (kind === 1) {
      const len = raw[o++];
      if (!(len >= 1 && len <= 16) || o + len * w + SECTION_VOLUME / 2 > raw.length) throw new Error('palette の長さがおかしい');
      const palette = new Uint16Array(len);
      for (let i = 0; i < len; i++) {
        const b = get();
        if (b >= n) throw new Error('palette の番号がおかしい');
        palette[i] = map[b];
      }
      const packed = raw.slice(o, o + SECTION_VOLUME / 2);
      o += SECTION_VOLUME / 2;
      for (let i = 0; i < packed.length; i++) if ((packed[i] & 15) >= len || (packed[i] >> 4) >= len) throw new Error('palette の添字がおかしい');
      out.push({ kind: 'palette', palette, packed });
    } else if (kind === 2) {
      if (o + SECTION_VOLUME * w > raw.length) throw new Error('full が短い');
      const data = new Uint16Array(SECTION_VOLUME);
      for (let i = 0; i < SECTION_VOLUME; i++) {
        const b = w === 1 ? raw[o++] : get();
        if (b >= n) throw new Error('full の番号がおかしい');
        data[i] = map[b];
      }
      out.push({ kind: 'full', data });
    } else throw new Error('セクションの形がおかしい');
  }
  if (o !== raw.length) throw new Error('余りがある');
  return out;
}

/** 高さが足りない保存を、上を空気のセクションで足す（h が今より小さいとき） */
export function padSections(sections: SectionData[], count: number): SectionData[] {
  const out = sections.slice();
  while (out.length < count) out.push({ kind: 'uniform', block: 0 });
  return out;
}

const toBuf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

async function pipe(input: Uint8Array, stream: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> }): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(toBuf(input)).catch(() => {});
  void w.close().catch(() => {});
  return new Uint8Array(await new Response(stream.readable as ReadableStream).arrayBuffer());
}

/** deflate-raw で縮める / 広げる（CompressionStream。ブラウザでも Node でも使える） */
export const deflateRaw = (raw: Uint8Array): Promise<Uint8Array> => pipe(raw, new CompressionStream('deflate-raw'));
export const inflateRaw = (z: Uint8Array): Promise<Uint8Array> => pipe(z, new DecompressionStream('deflate-raw'));
export const gzip = (raw: Uint8Array): Promise<Uint8Array> => pipe(raw, new CompressionStream('gzip'));
export const gunzip = (z: Uint8Array): Promise<Uint8Array> => pipe(z, new DecompressionStream('gzip'));

export const compressionAvailable = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
