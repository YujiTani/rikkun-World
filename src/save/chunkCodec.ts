import type { SectionData } from '../contracts';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { BLOCK_IDS_V1 } from './blockIdsV1';
import { SECTION_VOLUME, compactSection } from '../world/sections';

/**
 * 列の保存の形（VOX-plan §7、SAVE-30 で版 2）。縮める前のバイト列は
 *   版 2: [id の数 n][各 id: 長さ 1 B + ASCII] のあとに セクションを下から並べる。
 *   版 1: セクションだけ（番号は BLOCK_IDS_V1 の番号。読むだけ）。
 * セクションは 頭の 1 バイトで形をしめす。番号は 版 2 では「頭の一覧の中の番号」（0〜n-1）。
 * 0 = 1 種類だけ [0, 番号] / 1 = パレット [1, 種類の数 n, 番号 × n, 4 ビット × 4096 (2,048 B)] / 2 = そのまま 4,096 B。
 * 読むとき 一覧の id から 今の BLOCK_TYPES の番号を引き直す（並びかえ・途中に足すに強い）。
 * ここは「縮める前」の並び。縮める（deflate-raw）のは backend の側。光・見えない印・小ブロックの形は保存しない。
 */

/** 形式の版（record.v） */
export const CHUNK_FORMAT_VERSION = 2;

/** 今の BLOCK_TYPES の id の並び（番号 → id） */
const currentIds = (): readonly string[] => BLOCK_TYPES.map((t) => t.id);

/**
 * 保存に 書く id の 表。`geyser_dirt` は 保存に 残さず `dirt` として 書く（がしゃどくろは 保存しないので、
 * 持ち主の いない 間欠泉の つちが ワールドに のこらない ため。開きなおすと ふつうの 土）。
 */
export const persistIds = (): readonly string[] => BLOCK_TYPES.map((t) => (t.id === 'geyser_dirt' ? 'dirt' : t.id));

/**
 * 列をバイト列にする（同期。保存の瞬間のコピーなので、このあと世界が変わっても影響しない）。
 * table = sections の番号が指す id の表（省略 = 今の BLOCK_TYPES。テストで並びのちがう表を渡せる）。
 */
export function encodeSections(sections: readonly SectionData[], table: readonly string[] = currentIds()): Uint8Array {
  const parts: SectionData[] = sections.map((s) => compactSection(s));
  // 使う番号を集める
  const used = new Uint8Array(256);
  for (const s of parts) {
    if (s.kind === 'uniform') used[s.block] = 1;
    else if (s.kind === 'palette') for (const b of s.palette) used[b] = 1;
    else for (let i = 0; i < SECTION_VOLUME; i++) used[s.data[i]] = 1;
  }
  const local = new Uint8Array(256); // 表の番号 → 一覧の中の番号
  const ids: string[] = [];
  for (let b = 0; b < 256; b++) {
    if (used[b] === 0) continue;
    const id = table[b];
    if (id === undefined) throw new Error('表にない番号');
    local[b] = ids.length;
    ids.push(id);
  }
  let size = 1;
  for (const id of ids) size += 1 + id.length;
  for (const s of parts) size += s.kind === 'uniform' ? 2 : s.kind === 'palette' ? 2 + s.palette.length + s.packed.length : 1 + SECTION_VOLUME;
  const out = new Uint8Array(size);
  let o = 0;
  out[o++] = ids.length;
  for (const id of ids) {
    out[o++] = id.length;
    for (let i = 0; i < id.length; i++) out[o++] = id.charCodeAt(i);
  }
  for (const s of parts) {
    if (s.kind === 'uniform') {
      out[o++] = 0;
      out[o++] = local[s.block];
    } else if (s.kind === 'palette') {
      out[o++] = 1;
      out[o++] = s.palette.length;
      for (let i = 0; i < s.palette.length; i++) out[o++] = local[s.palette[i]];
      out.set(s.packed, o);
      o += s.packed.length;
    } else {
      out[o++] = 2;
      for (let i = 0; i < SECTION_VOLUME; i++) out[o + i] = local[s.data[i]];
      o += SECTION_VOLUME;
    }
  }
  return out;
}

/**
 * バイト列を sections にもどす。こわれていたら Error（呼ぶ側が その列だけ生成に戻す）。
 * version 1 = 凍らせた BLOCK_IDS_V1 の番号 / 2 = 頭の一覧。table = 戻す先の id の表（省略 = 今の BLOCK_TYPES）。
 * 一覧の id が table にない（ゲームから消えたブロック）ときも Error。
 */
export function decodeSections(raw: Uint8Array, count: number, version: number = CHUNK_FORMAT_VERSION, table: readonly string[] = currentIds()): SectionData[] {
  let o = 0;
  let source: readonly string[];
  if (version === 1) source = BLOCK_IDS_V1;
  else if (version === 2) {
    const m = raw[o++];
    if (m === undefined) throw new Error('id の一覧がない');
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
  const map = new Uint8Array(Math.max(n, 1));
  for (let i = 0; i < n; i++) {
    const j = table.indexOf(source[i]);
    if (j < 0 || j > 255) throw new Error(`知らない id: ${source[i]}`);
    map[i] = j;
  }
  const out: SectionData[] = [];
  for (let k = 0; k < count; k++) {
    const kind = raw[o++];
    if (kind === 0) {
      const block = raw[o++];
      if (block === undefined || block >= n) throw new Error('uniform の番号がおかしい');
      out.push({ kind: 'uniform', block: map[block] });
    } else if (kind === 1) {
      const len = raw[o++];
      if (!(len >= 1 && len <= 16) || o + len + SECTION_VOLUME / 2 > raw.length) throw new Error('palette の長さがおかしい');
      const palette = raw.slice(o, o + len);
      o += len;
      for (let i = 0; i < len; i++) {
        if (palette[i] >= n) throw new Error('palette の番号がおかしい');
        palette[i] = map[palette[i]];
      }
      const packed = raw.slice(o, o + SECTION_VOLUME / 2);
      o += SECTION_VOLUME / 2;
      for (let i = 0; i < packed.length; i++) if ((packed[i] & 15) >= len || (packed[i] >> 4) >= len) throw new Error('palette の添字がおかしい');
      out.push({ kind: 'palette', palette, packed });
    } else if (kind === 2) {
      if (o + SECTION_VOLUME > raw.length) throw new Error('full が短い');
      const data = raw.slice(o, o + SECTION_VOLUME);
      o += SECTION_VOLUME;
      for (let i = 0; i < SECTION_VOLUME; i++) {
        if (data[i] >= n) throw new Error('full の番号がおかしい');
        data[i] = map[data[i]];
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
