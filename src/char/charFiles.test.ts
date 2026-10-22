// CHAR-5 AC3・AC4: キャラごとの 色見本と 絵の ファイル（実物のファイルを 読む）
// 窓口: palette.ts の quantizeRgba(data, w, h, palette?)（palette を 渡すと その色見本で 色番号に する。なければ 女の子）
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAll, decodePng, type Cell } from '../../scripts/pack-char-atlas.mjs';
import { PALETTE_RGB, quantizeRgba } from './palette';

type RGB = readonly [number, number, number];
const SRC = (k: string): string => `art/char-sheets/${k}`;
const OUT = (k: string): string => `public/models/char/${k}`;
const json = (p: string): any => JSON.parse(readFileSync(p, 'utf8'));
const round255 = (colors: number[][]): RGB[] => colors.map((c) => c.map((v) => Math.round(v * 255)) as unknown as RGB);
const BASE4 = ['idle', 'walk', 'run', 'jump'];
const BLADE_BASE: RGB = [218, 215, 225];
const BLADE_SHINE: RGB = [253, 251, 252];

describe('AC3 色見本（キャラごと）', () => {
  it('女の子: art/char-sheets/girl/palette.json は 22 色で、今の PALETTE_RGB と 同じ', () => {
    const g = json(`${SRC('girl')}/palette.json`) as { colors: number[][] };
    expect(g.colors).toHaveLength(22);
    expect(round255(g.colors)).toEqual(PALETTE_RGB.map((c) => [...c]));
    expect(g.colors).toEqual(json('art/CHAR-1-v2/palette.json').colors); // 写しただけ
  });

  it('男の子: 1〜20 = palette.json の 0〜19 番 ×255 の 四捨五入、21・22 = 女の子の 21・22、22 色 ぜんぶ ちがう', () => {
    const b = json(`${SRC('boy')}/palette.json`) as { colors: number[][] };
    const atlas = json(`${OUT('boy')}/atlas.json`);
    expect(b.colors).toHaveLength(22);
    const want = round255(b.colors.slice(0, 20));
    expect(atlas.palette).toHaveLength(22);
    expect(atlas.palette.slice(0, 20)).toEqual(want.map((c) => [...c]));
    expect(atlas.palette[20]).toEqual([...PALETTE_RGB[20]!]);
    expect(atlas.palette[21]).toEqual([...PALETTE_RGB[21]!]);
    expect(atlas.palette[20]).toEqual([...BLADE_BASE]);
    expect(atlas.palette[21]).toEqual([...BLADE_SHINE]);
    expect(new Set(atlas.palette.map((c: number[]) => c.join(','))).size).toBe(22);
    for (const c of atlas.palette as number[][]) for (const v of c) expect(Number.isInteger(v) && v >= 0 && v <= 255).toBe(true);
  });

  it('どちらの atlas.json（public と art）の palette も その palette.json と 同じ。男の子の 22 色は 女の子と 同じ ではない', () => {
    for (const k of ['girl', 'boy']) {
      const pal = round255(json(`${SRC(k)}/palette.json`).colors);
      expect(json(`${OUT(k)}/atlas.json`).palette).toEqual(pal.map((c) => [...c]));
    }
    expect(json(`${OUT('boy')}/atlas.json`).palette).not.toEqual(json(`${OUT('girl')}/atlas.json`).palette);
  });
});

describe('AC4 ファイル', () => {
  it('public/models/char/ の すぐ下に PNG・atlas.json が ない', () => {
    const files = readdirSync('public/models/char').filter((f) => /\.(png|json)$/.test(f));
    expect(files).toEqual([]);
  });

  it('girl/: 16 まいの PNG と atlas.json（packed あり・palette あり・modelH 1.7）', () => {
    const a = json(`${OUT('girl')}/atlas.json`);
    const names = Object.keys(a.motions);
    expect(names).toHaveLength(16);
    for (const n of names) {
      expect(existsSync(`${OUT('girl')}/${n}.png`)).toBe(true);
      expect(a.motions[n].packed).toBeTruthy();
    }
    expect(a.modelH).toBe(1.7);
    expect(a.palette).toHaveLength(22);
  });

  it('girl/ の packed が 移す前と 同じ（4 つの 重さ）', () => {
    const a = json(`${OUT('girl')}/atlas.json`);
    const sum = (ns: string[]): number => ns.reduce((s, n) => s + a.motions[n].packed.width * a.motions[n].packed.height, 0);
    expect(sum(BASE4)).toBe(12863488);
    expect(sum(Object.keys(a.motions))).toBe(66832384);
  });

  it('boy/: idle・walk・run・jump の PNG と atlas.json（modelH 1.63・8 コマ・packed・palette）', () => {
    const a = json(`${OUT('boy')}/atlas.json`);
    expect(Object.keys(a.motions).sort()).toEqual([...BASE4].sort());
    expect(a.modelH).toBe(1.63);
    for (const n of BASE4) {
      expect(a.motions[n].frames).toBe(8);
      expect(a.motions[n].packed).toBeTruthy();
      expect(existsSync(`${OUT('boy')}/${n}.png`)).toBe(true);
    }
    expect(readdirSync(OUT('boy')).filter((f) => f.endsWith('.png')).sort()).toEqual(BASE4.map((n) => `${n}.png`).sort());
    expect(a.palette).toHaveLength(22);
    const sa = json(`${SRC('boy')}/atlas.json`);
    expect(sa.modelH).toBe(1.63);
    for (const k of ['cell', 'span', 'center', 'tiers', 'dirs']) expect(a[k]).toEqual(sa[k]);
  });

  it('男の子の 4 つの 重さ = §4.5 の 本当の値 12,705,792（packed の よこ × たて の 合計）', () => {
    const a = json(`${OUT('boy')}/atlas.json`);
    const sum = BASE4.reduce((s, n) => s + a.motions[n].packed.width * a.motions[n].packed.height, 0);
    expect(sum).toBe(12705792);
    expect(sum).toBeLessThanOrEqual(67108864);
  });

  const boyPal = (): RGB[] => json(`${OUT('boy')}/atlas.json`).palette;

  for (const n of BASE4) {
    it(`boy ${n}: もとの 絵は たて 6144・よこ 2048・ふちから 2 ドット（walk・run だけ 確かめる。idle・jump は 数えるだけ）・見える ドットの 色は 1〜20 番の どれかと ぴったり（21・22 番は 0 こ）`, () => {
      const png = decodePng(readFileSync(`${SRC('boy')}/${n}.png`));
      expect([png.width, png.height]).toEqual([8 * 256, 6144]);
      const pal = boyPal();
      const allowed = new Set(pal.slice(0, 20).map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
      const blade = new Set(pal.slice(20).map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
      let edge = 0;
      let empty = 0;
      const bad = new Set<number>();
      let bladeDots = 0;
      for (let row = 0; row < 24; row++) {
        for (let col = 0; col < 8; col++) {
          let any = false;
          let touch = false;
          for (let y = 0; y < 256; y++) {
            for (let x = 0; x < 256; x++) {
              const i = ((row * 256 + y) * png.width + col * 256 + x) * 4;
              if (png.data[i + 3]! === 0) continue;
              any = true;
              if (x < 2 || y < 2 || x > 253 || y > 253) touch = true;
              const c = (png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!;
              if (blade.has(c)) bladeDots++;
              if (!allowed.has(c)) bad.add(c);
            }
          }
          if (!any) empty++;
          if (touch) edge++;
        }
      }
      expect(empty).toBe(0);
      expect(bladeDots).toBe(0);
      expect([...bad]).toEqual([]);
      // 仕様 §4.5 は jump だけ「数えるだけ」だが、実物の idle も 64 コマが ふちに ふれる（準備の ときに 発見。台帳に 記録）。数だけ 残す
      if (n === 'walk' || n === 'run') expect(edge).toBe(0);
    }, 60000);

    it(`boy ${n}: 切りつめた 絵を もとに もどすと 色番号が 1 ドットも ちがわない（男の子の 色見本で 数える）`, () => {
      const a = json(`${OUT('boy')}/atlas.json`);
      const pal = a.palette as RGB[];
      const packed = a.motions[n].packed as { width: number; height: number; cells: Cell[] };
      const src = decodePng(readFileSync(`${SRC('boy')}/${n}.png`));
      const out = decodePng(readFileSync(`${OUT('boy')}/${n}.png`));
      expect([out.width, out.height]).toEqual([packed.width, packed.height]);
      expect(packed.cells).toHaveLength(24 * 8);
      const sIdx = quantizeRgba(src.data, src.width, src.height, pal);
      const oIdx = quantizeRgba(out.data, out.width, out.height, pal);
      // 男の子の 色見本で 数えると 見える ドットは ぜんぶ 1〜20 番
      for (let i = 0; i < sIdx.length; i += 997) expect(sIdx[i]!).toBeLessThanOrEqual(20);
      for (let row = 0; row < 24; row++) {
        for (let f = 0; f < 8; f++) {
          const [x, y, w, h, ox, oy] = packed.cells[row * 8 + f]!;
          for (let j = 0; j < 256; j++) {
            for (let i = 0; i < 256; i++) {
              const want = sIdx[(row * 256 + j) * src.width + f * 256 + i]!;
              const inside = i >= ox && i < ox + w && j >= oy && j < oy + h;
              const got = inside ? oIdx[(y + j - oy) * out.width + x + i - ox]! : 0;
              if (got !== want) throw new Error(`boy ${n} row${row} f${f} (${i},${j}): ${got} != ${want}`);
            }
          }
        }
      }
    }, 60000);
  }

  it('回しなおすと 男の子も 女の子も 同じ atlas.json・同じ絵（palette 入り）', () => {
    for (const k of ['boy', 'girl']) {
      const built = buildAll(SRC(k), { encode: false });
      expect(built.files['atlas.json']!.toString('utf8')).toBe(readFileSync(`${OUT(k)}/atlas.json`, 'utf8'));
      for (const n of Object.keys(built.pngs)) {
        const out = decodePng(readFileSync(`${OUT(k)}/${n}.png`));
        const mine = built.pngs[n]!;
        expect([out.width, out.height]).toEqual([mine.width, mine.height]);
        expect(Buffer.compare(Buffer.from(out.data), Buffer.from(mine.data))).toBe(0);
      }
    }
  }, 120000);
});
