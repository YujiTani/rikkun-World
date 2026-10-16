import type { SectionData } from '../contracts';

/** セクション 1 つのマス数（16³） */
export const SECTION_VOLUME = 4096;

/** 中の番号。lx, ly, lz は 0〜15 */
export function localIndex(lx: number, ly: number, lz: number): number {
  return (ly * 16 + lz) * 16 + lx;
}

export function uniformSection(block: number): SectionData {
  return { kind: 'uniform', block };
}

/** 1 マス読む（i = localIndex） */
export function sectionGet(s: SectionData, i: number): number {
  if (s.kind === 'full') return s.data[i];
  if (s.kind === 'uniform') return s.block;
  const byte = s.packed[i >> 1];
  return s.palette[(i & 1) === 0 ? byte & 15 : byte >> 4];
}

/** 全マスを 4,096 B に広げた配列（full ならそのもの。書きかえると中身が変わる） */
export function sectionToArray(s: SectionData): Uint8Array {
  if (s.kind === 'full') return s.data;
  const out = new Uint8Array(SECTION_VOLUME);
  if (s.kind === 'uniform') {
    if (s.block !== 0) out.fill(s.block);
    return out;
  }
  for (let i = 0; i < SECTION_VOLUME; i++) out[i] = s.palette[(i & 1) === 0 ? s.packed[i >> 1] & 15 : s.packed[i >> 1] >> 4];
  return out;
}

/** full にする（もう full ならそのまま） */
export function sectionToFull(s: SectionData): SectionData {
  return s.kind === 'full' ? s : { kind: 'full', data: sectionToArray(s) };
}

/**
 * 1 マス書く。形が変わるなら新しい SectionData を返す（full は中身を書きかえて同じものを返す）。
 * uniform に別の種類 → full。palette に新しい種類 → 16 種類まで palette のまま、17 種類目で full。
 */
export function sectionSet(s: SectionData, i: number, b: number): SectionData {
  if (s.kind === 'full') {
    s.data[i] = b;
    return s;
  }
  if (s.kind === 'uniform') {
    if (s.block === b) return s;
    const data = new Uint8Array(SECTION_VOLUME);
    if (s.block !== 0) data.fill(s.block);
    data[i] = b;
    return { kind: 'full', data };
  }
  let p = s.palette.indexOf(b);
  if (p < 0) {
    if (s.palette.length >= 16) {
      const full = sectionToFull(s) as { data: Uint8Array };
      full.data[i] = b;
      return { kind: 'full', data: full.data };
    }
    const palette = new Uint8Array(s.palette.length + 1);
    palette.set(s.palette);
    palette[s.palette.length] = b;
    p = s.palette.length;
    s = { kind: 'palette', palette, packed: s.packed };
  }
  const byte = s.packed[i >> 1];
  s.packed[i >> 1] = (i & 1) === 0 ? (byte & 0xf0) | p : (byte & 0x0f) | (p << 4);
  return s;
}

/** いちばん小さい形にする: 1 種類 → uniform、16 種類まで → palette、それ以上 → full。中身は変わらない */
export function compactSection(s: SectionData): SectionData {
  if (s.kind === 'uniform') return s;
  const arr = sectionToArray(s);
  const seen = new Uint8Array(256);
  const kinds: number[] = [];
  for (let i = 0; i < SECTION_VOLUME; i++) {
    const b = arr[i];
    if (seen[b] === 0) {
      seen[b] = 1;
      kinds.push(b);
      if (kinds.length > 16) return s.kind === 'full' ? s : { kind: 'full', data: arr };
    }
  }
  if (kinds.length === 1) return { kind: 'uniform', block: kinds[0] };
  const pos = new Uint8Array(256);
  kinds.forEach((b, k) => (pos[b] = k));
  const packed = new Uint8Array(SECTION_VOLUME / 2);
  for (let i = 0; i < SECTION_VOLUME; i += 2) packed[i >> 1] = pos[arr[i]] | (pos[arr[i + 1]] << 4);
  return { kind: 'palette', palette: Uint8Array.from(kinds), packed };
}

/** メモリの目安（バイト） */
export function sectionBytes(s: SectionData): number {
  if (s.kind === 'uniform') return 1;
  if (s.kind === 'palette') return s.palette.length + s.packed.length;
  return s.data.length;
}
