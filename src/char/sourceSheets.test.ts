import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../../scripts/pack-char-atlas.mjs';
import { PALETTE_RGB, quantizeRgba } from './palette';

/**
 * CHAR-2 AC24・CHAR-4 AC10・AC11: もとの 14 まい（art/char-sheets/）と もとの atlas.json（実物のファイルを読む）。
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
    it(`${m}: たて 6144・よこ = frames × 256・どのコマも 見えるドットあり・ふちから 2 ドット・色は 22 色だけ`, () => {
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

/**
 * CHAR-4 AC10: 色見本は 22 色（20 番・21 番 = 刀の 刃の地・ふちの光。仕様書 §4.6）。
 * 色の 番号は 表の 0 から 数える。PNG を 読んだ あとの 色番号は 表の 番号 + 1（0 = とうめい）。
 */
const OLD_20: readonly (readonly [number, number, number])[] = [
  [102, 7, 52], [194, 60, 133], [176, 169, 181], [245, 45, 157], [182, 10, 102], [143, 134, 142], [218, 215, 224], [234, 166, 176], [253, 26, 150], [247, 209, 212],
  [248, 242, 246], [101, 93, 99], [21, 14, 19], [232, 16, 132], [208, 9, 116], [139, 44, 94], [58, 54, 59], [238, 232, 237], [253, 251, 253], [200, 195, 207],
];
const BLADE_BASE = [218, 215, 225] as const; // 表の 20 番
const BLADE_SHINE = [253, 251, 252] as const; // 表の 21 番

describe('CHAR-4 AC10 色見本 22 色', () => {
  it('22 色・0〜19 番は 今のまま・22 色が ぜんぶ ちがう', () => {
    expect(PALETTE_RGB).toHaveLength(22);
    expect(PALETTE_RGB.slice(0, 20)).toEqual(OLD_20);
    expect(new Set(PALETTE_RGB.map((c) => c.join(','))).size).toBe(22);
  });
  it('20 番・21 番が art/CHAR-1-v2/palette.json と 同じ（0〜255 に 丸める）', () => {
    const json = JSON.parse(readFileSync('art/CHAR-1-v2/palette.json', 'utf8')) as { colors: number[][] };
    expect(json.colors).toHaveLength(22);
    expect(PALETTE_RGB.map((c) => [...c])).toEqual(json.colors.map((c) => c.map((v) => Math.round(v * 255))));
    expect([...PALETTE_RGB[20]!]).toEqual([...BLADE_BASE]);
    expect([...PALETTE_RGB[21]!]).toEqual([...BLADE_SHINE]);
  });
  it('20 番・21 番の 色の ドットを 読むと 色番号 21・22（どれとも 丸まらない）', () => {
    const idx = quantizeRgba([...BLADE_BASE, 255, ...BLADE_SHINE, 255], 2, 1);
    expect([...idx]).toEqual([21, 22]);
    // 今の 刃の 6 番・18 番に 近い 色は そのまま 7・19 番
    expect([...quantizeRgba([218, 215, 224, 255, 253, 251, 253, 255], 2, 1)]).toEqual([7, 19]);
  });
});

/**
 * CHAR-4 AC11: 実物の 14 まい（もとの art/char-sheets/ と、切りつめた public/models/char/）。
 * 刀の 6 まいは 20 番・21 番の ドットを ふくみ、ほかの 8 まいは 1 つも ない。色は 22 色だけ。
 * （テストの 準備の 時点では palette.ts が 20 色・public/models/char/ が 古いので 赤。開発で B が 直す）
 */
const KATANA_6 = ['katana_thrust', 'katana_kesa', 'katana_kiriage', 'katana_walk_chudan', 'katana_walk_jodan', 'katana_walk_gedan'];
const OTHER_8 = [...OLD, 'bow_shot', 'bow_walk', 'bow_hold_walk', 'bow_rapid'];

function countBladeDots(file: string): { base: number; shine: number; bad: number } {
  const png = decodePng(readFileSync(file));
  const key = (c: readonly number[]) => (c[0]! << 16) | (c[1]! << 8) | c[2]!;
  const kBase = key(BLADE_BASE);
  const kShine = key(BLADE_SHINE);
  let base = 0;
  let shine = 0;
  let bad = 0;
  const d = png.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! === 0) continue;
    const c = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
    if (c === kBase) base++;
    else if (c === kShine) shine++;
    if (!COLORS.has(c)) bad++;
  }
  return { base, shine, bad };
}

describe('CHAR-4 AC11 実物の 絵の 刃の色', () => {
  for (const dir of [DIR, 'public/models/char']) {
    for (const m of [...KATANA_6, ...OTHER_8]) {
      it(`${dir}/${m}: ${KATANA_6.includes(m) ? '20 番・21 番の ドットが ある' : '20 番・21 番は 1 つも ない'}・色は 22 色だけ`, () => {
        const r = countBladeDots(`${dir}/${m}.png`);
        if (KATANA_6.includes(m)) {
          expect(r.base).toBeGreaterThan(0);
          expect(r.shine).toBeGreaterThan(0);
        } else {
          expect(r.base).toBe(0);
          expect(r.shine).toBe(0);
        }
        expect(r.bad).toBe(0);
      });
    }
  }
});
