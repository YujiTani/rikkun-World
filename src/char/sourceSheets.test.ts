import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/pack-char-atlas.mjs';
import { PALETTE_RGB } from './palette';

/**
 * CHAR-2 AC24: もとの 14 まい（art/char-sheets/）と もとの atlas.json（実物のファイルを読む）。
 * 切りつめた絵（public/models/char/）は packAtlas.test.ts（AC32）が見る。
 */
const DIR = 'art/char-sheets';
const OLD = ['idle', 'walk', 'run', 'jump'];
const NEW = ['bow_shot', 'bow_walk', 'bow_hold_walk', 'bow_rapid', 'katana_thrust', 'katana_kesa', 'katana_kiriage', 'katana_walk_chudan', 'katana_walk_jodan', 'katana_walk_gedan'];
const WALKS = ['bow_walk', 'bow_hold_walk', 'katana_walk_chudan', 'katana_walk_jodan', 'katana_walk_gedan'];
const atlas = JSON.parse(readFileSync(`${DIR}/atlas.json`, 'utf8'));
const COLORS = new Set(PALETTE_RGB.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));

describe('AC24 もとの 14 まい', () => {
  it('atlas.json は 14 の動き。naginata_sweep は どこにもない', () => {
    expect(Object.keys(atlas.motions).sort()).toEqual([...OLD, ...NEW].sort());
    expect(existsSync(`${DIR}/naginata_sweep.png`)).toBe(false);
    expect(existsSync('public/models/char/naginata_sweep.png')).toBe(false);
    expect(atlas.motions.naginata_sweep).toBeUndefined();
  });
  for (const m of [...OLD, ...NEW]) {
    it(`${m}: たて 6144・よこ = frames × 256・どのコマも 見えるドットあり・ふちから 2 ドット・色は 20 色だけ`, () => {
      const frames: number = atlas.motions[m].frames;
      const png = decodePng(readFileSync(`${DIR}/${m}.png`));
      expect([png.width, png.height]).toEqual([frames * 256, 6144]);
      if (NEW.includes(m)) {
        expect(atlas.motions[m].ticks).toHaveLength(frames);
        if (WALKS.includes(m)) {
          expect(frames).toBe(8);
          expect(atlas.motions[m].ticks).toEqual(Array(8).fill(9));
        }
      }
      let empty = 0;
      let edge = 0;
      const bad = new Set<number>();
      for (let row = 0; row < 24; row++) {
        for (let col = 0; col < frames; col++) {
          let any = false;
          let touch = false;
          for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
              const i = ((row * 256 + y) * png.width + col * 256 + x) * 4;
              if (png.data[i + 3]! === 0) continue;
              any = true;
              if (x < 2 || y < 2 || x > 253 || y > 253) touch = true;
              const c = (png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!;
              if (!COLORS.has(c)) bad.add(c);
            }
          }
          if (!any) empty++;
          if (touch) edge++;
        }
      }
      expect(empty).toBe(0);
      expect([...bad]).toEqual([]);
      // CHAR-1 AC30 の NG（jump の 足のうらが 下のふちにふれる。台帳に記録ずみ）は もとの絵の問題なので jump だけ 数を残す
      if (m !== 'jump') expect(edge).toBe(0);
    });
  }
});
