import { describe, expect, it } from 'vitest';
import type { SectionData } from '../contracts';
import { SECTION_VOLUME, compactSection, sectionBytes, sectionGet, sectionSet, sectionToArray, uniformSection } from './sections';

// BLOCK-ID16 AC1: 番号 256〜1023（2 バイト）が 区画の 3 つの形（uniform / palette / full）で 往復する。
// 番号をじかに渡すので、本物の BLOCK_TYPES（217 種類）には 左右されない。

const WIDE = [256, 300, 511, 512, 700, 1023];

/** 4,096 マスに kinds を くりかえして 入れた full */
function fullOf(kinds: number[]): SectionData {
  const data = new Uint16Array(SECTION_VOLUME);
  for (let i = 0; i < SECTION_VOLUME; i++) data[i] = kinds[i % kinds.length];
  return { kind: 'full', data };
}

describe('BLOCK-ID16 AC1: 番号 256〜1023 の往復', () => {
  it('uniform: sectionGet / sectionToArray / compactSection', () => {
    for (const b of WIDE) {
      const s = uniformSection(b);
      expect(sectionGet(s, 0)).toBe(b);
      expect(sectionGet(s, 4095)).toBe(b);
      const arr = sectionToArray(s);
      expect(arr).toBeInstanceOf(Uint16Array);
      expect(arr.every((v) => v === b)).toBe(true);
      expect(compactSection(s)).toEqual({ kind: 'uniform', block: b });
    }
  });

  it('uniform に 別の番号を書くと full。広い番号も 空気も そのまま', () => {
    for (const b of WIDE) {
      const s = sectionSet(uniformSection(0), 5, b);
      expect(s.kind).toBe('full');
      expect(sectionGet(s, 5)).toBe(b);
      expect(sectionGet(s, 4)).toBe(0);
      const t = sectionSet(uniformSection(b), 9, 1023);
      expect(sectionGet(t, 9)).toBe(1023);
      expect(sectionGet(t, 10)).toBe(b);
    }
  });

  it('palette: compactSection が 広い番号を 持つ palette を 作り、読むと 同じ', () => {
    const kinds = [0, 255, 256, 300, 700, 1023];
    const src = fullOf(kinds);
    const p = compactSection(src);
    expect(p.kind).toBe('palette');
    if (p.kind !== 'palette') return;
    expect(p.palette).toBeInstanceOf(Uint16Array);
    expect([...p.palette].sort((a, b) => a - b)).toEqual(kinds);
    const want = sectionToArray(src);
    for (let i = 0; i < SECTION_VOLUME; i++) expect(sectionGet(p, i)).toBe(want[i]);
    expect(sectionToArray(p)).toEqual(want);
  });

  it('palette: sectionSet で 広い番号を足す（16 種類まで palette、17 種類目で full）', () => {
    let s: SectionData = compactSection(fullOf([0, 300]));
    expect(s.kind).toBe('palette');
    s = sectionSet(s, 7, 1000);
    expect(s.kind).toBe('palette');
    expect(sectionGet(s, 7)).toBe(1000);
    expect(sectionGet(s, 0)).toBe(0);
    expect(sectionGet(s, 1)).toBe(300);
    // 16 種類（0, 300 のほか 14）まで入れる → palette のまま
    for (let k = 0; k < 14; k++) s = sectionSet(s, 100 + k, 400 + k);
    expect(s.kind === 'palette' ? s.palette.length : -1).toBe(16);
    // 17 種類目 → full。中身は変わらない
    s = sectionSet(s, 200, 1023);
    expect(s.kind).toBe('full');
    expect(sectionGet(s, 200)).toBe(1023);
    expect(sectionGet(s, 7)).toBe(1000);
    expect(sectionGet(s, 113)).toBe(413);
    expect(sectionGet(s, 1)).toBe(300);
  });

  it('full: 広い番号を 書いて 読む。compactSection は 17 種類以上なら full のまま', () => {
    const kinds = Array.from({ length: 20 }, (_, i) => 250 + i * 40);
    const s = fullOf(kinds);
    expect(s.kind === 'full' ? s.data : null).toBeInstanceOf(Uint16Array);
    const c = compactSection(s);
    expect(c.kind).toBe('full');
    for (let i = 0; i < SECTION_VOLUME; i++) expect(sectionGet(c, i)).toBe(kinds[i % kinds.length]);
    const w = sectionSet(c, 3, 1023);
    expect(w.kind).toBe('full');
    expect(sectionGet(w, 3)).toBe(1023);
  });

  it('full が 少ない種類なら compactSection で palette・uniform に 縮み、戻しても 同じ', () => {
    const one = fullOf([777]);
    expect(compactSection(one)).toEqual({ kind: 'uniform', block: 777 });
    const two = fullOf([777, 256]);
    const pal = compactSection(two);
    expect(pal.kind).toBe('palette');
    expect(sectionToArray(pal)).toEqual(sectionToArray(two));
  });

  it('sectionToArray は 3 つの形とも Uint16Array で 4,096 マス', () => {
    for (const s of [uniformSection(300), compactSection(fullOf([0, 300])), fullOf(Array.from({ length: 20 }, (_, i) => i + 300))]) {
      const a = sectionToArray(s);
      expect(a).toBeInstanceOf(Uint16Array);
      expect(a.length).toBe(SECTION_VOLUME);
    }
  });

  it('sectionBytes: full は 2 バイト × 4,096 = 8,192（メモリの ふえ方の 記録）', () => {
    expect(sectionBytes(fullOf([1, 2, 3]))).toBe(SECTION_VOLUME * 2);
  });
});
