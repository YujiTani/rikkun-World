import type { SectionData } from '../contracts';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { SECTION_VOLUME, compactSection } from '../world/sections';

/**
 * 列の保存の形（VOX-plan §7）。セクション（16³）を下から並べ、頭の 1 バイトで形をしめす。
 * 0 = 1 種類だけ [0, 番号] / 1 = パレット [1, 種類の数 n, 番号 × n, 4 ビット × 4096 (2,048 B)] / 2 = そのまま 4,096 B。
 * ここは「縮める前」の並び。縮める（deflate-raw）のは backend の側。光・見えない印・小ブロックの形は保存しない。
 */

/** 形式の版（record.v） */
export const CHUNK_FORMAT_VERSION = 1;

/** 列をバイト列にする（同期。保存の瞬間のコピーなので、このあと世界が変わっても影響しない） */
export function encodeSections(sections: readonly SectionData[]): Uint8Array {
  const parts: SectionData[] = sections.map((s) => compactSection(s));
  let size = 0;
  for (const s of parts) size += s.kind === 'uniform' ? 2 : s.kind === 'palette' ? 2 + s.palette.length + s.packed.length : 1 + SECTION_VOLUME;
  const out = new Uint8Array(size);
  let o = 0;
  for (const s of parts) {
    if (s.kind === 'uniform') {
      out[o++] = 0;
      out[o++] = s.block;
    } else if (s.kind === 'palette') {
      out[o++] = 1;
      out[o++] = s.palette.length;
      out.set(s.palette, o);
      o += s.palette.length;
      out.set(s.packed, o);
      o += s.packed.length;
    } else {
      out[o++] = 2;
      out.set(s.data, o);
      o += SECTION_VOLUME;
    }
  }
  return out;
}

/** バイト列を sections にもどす。こわれていたら Error（呼ぶ側が その列だけ生成に戻す） */
export function decodeSections(raw: Uint8Array, count: number): SectionData[] {
  const n = BLOCK_TYPES.length;
  const out: SectionData[] = [];
  let o = 0;
  for (let k = 0; k < count; k++) {
    const kind = raw[o++];
    if (kind === 0) {
      const block = raw[o++];
      if (block === undefined || block >= n) throw new Error('uniform の番号がおかしい');
      out.push({ kind: 'uniform', block });
    } else if (kind === 1) {
      const len = raw[o++];
      if (!(len >= 1 && len <= 16) || o + len + SECTION_VOLUME / 2 > raw.length) throw new Error('palette の長さがおかしい');
      const palette = raw.slice(o, o + len);
      o += len;
      for (const b of palette) if (b >= n) throw new Error('palette の番号がおかしい');
      const packed = raw.slice(o, o + SECTION_VOLUME / 2);
      o += SECTION_VOLUME / 2;
      for (let i = 0; i < packed.length; i++) if ((packed[i] & 15) >= len || (packed[i] >> 4) >= len) throw new Error('palette の添字がおかしい');
      out.push({ kind: 'palette', palette, packed });
    } else if (kind === 2) {
      if (o + SECTION_VOLUME > raw.length) throw new Error('full が短い');
      const data = raw.slice(o, o + SECTION_VOLUME);
      o += SECTION_VOLUME;
      for (let i = 0; i < SECTION_VOLUME; i++) if (data[i] >= n) throw new Error('full の番号がおかしい');
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
