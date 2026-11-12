import { describe, expect, it } from 'vitest';
import { FACINGS, placedLookPieces, styledForms, type Facing } from '../../house/recipes/craftKit';
import { STYLES } from '../../house/recipes/kinds';
import { lookPieces } from './houseLookPieces';

/**
 * HOUSE-2C（仕様 3.4 版 §2.6・§2.7。docs/tickets/HOUSE-2A.md「2C の 進め方」）: 手で 置いた ななめの やね・のれん・はなだんは 置いた ときの 記録の 向き（placedLook.facing）で 描く
 * （2B の lookPieces(id, null) は 立方体 だった）。窓口 placedLookPieces(id, { style, facing } | null) は src/house/recipes/craftKit.ts の「2C の 約束」。
 * 面の 角は 1 マス ぶんの 0〜1 の 座標（pos ＝ x,y,z × 4 つ）。ブロックの 向き: n ＝ −z・s ＝ ＋z・e ＝ ＋x・w ＝ −x（前・のきが その がわ）。形・数は 表から（#311）。
 */

type Piece = { pos: number[] };
const verts = (ps: readonly Piece[]): Array<[number, number, number]> => ps.flatMap((p) => [0, 3, 6, 9].map((i): [number, number, number] => [p.pos[i]!, p.pos[i + 1]!, p.pos[i + 2]!]));
const key = (ps: readonly Piece[]): string => JSON.stringify(ps.map((p) => p.pos.map((v) => Math.round(v * 1000) / 1000)).sort());
/** 立方体か（6 つの 面が ぜんぶ 軸に そろって いる ＝ どの 面も 4 つの 角の x・y・z の どれかが ぜんぶ 同じ） */
const flatFace = (p: Piece): boolean =>
  [0, 1, 2].some((k) => [0, 3, 6, 9].every((i) => Math.abs(p.pos[i + k]! - p.pos[k]!) < 1e-6));
const isCube = (ps: readonly Piece[]): boolean => ps.every(flatFace);
/** その 向きの がわ（0〜1 の 座標で 0.5 より 向きの ほう）の 角の 平均 y と 反対がわの 平均 y */
const axis = (f: Facing): { k: 0 | 2; sign: 1 | -1 } => (f === 's' ? { k: 2, sign: 1 } : f === 'n' ? { k: 2, sign: -1 } : f === 'e' ? { k: 0, sign: 1 } : { k: 0, sign: -1 });
function sideMean(ps: readonly Piece[], f: Facing, side: 'front' | 'back', c: 0 | 1 | 2): number {
  const { k, sign } = axis(f);
  const vs = verts(ps).filter((v) => (side === 'front' ? 1 : -1) * sign * (v[k] - 0.5) > 0);
  if (vs.length === 0) return NaN;
  return vs.reduce((n, v) => n + v[c], 0) / vs.length;
}
const centroid = (ps: readonly Piece[], c: 0 | 1 | 2): number => {
  const vs = verts(ps);
  return vs.reduce((n, v) => n + v[c], 0) / vs.length;
};

const forms = styledForms();
const roofs = forms.filter((f) => f.part === 'roof');
const fronts = forms.filter((f) => f.form === 'noren' || f.form === 'hanadan');

describe('手で 置いた ななめの やね: 置いた ときの 記録の 向き（facing）で 描く（立方体では ない）', () => {
  it('やね 4 形 × 3 案 × 4 向き: 立方体では なく、のき（ひくい がわ）が facing の がわ', () => {
    expect(roofs.length).toBeGreaterThan(0);
    for (const f of roofs) {
      for (const style of STYLES) {
        for (const facing of FACINGS) {
          const ps = placedLookPieces(f.blocks[0]!, { style, facing });
          expect(ps.length, `${f.form}_${style} ${facing}: 面が ある`).toBeGreaterThan(0);
          expect(isCube(ps), `${f.form}_${style} ${facing}: 立方体の まま`).toBe(false);
          const front = sideMean(ps, facing, 'front', 1);
          const back = sideMean(ps, facing, 'back', 1);
          expect(front, `${f.form}_${style} ${facing}: のきの がわの ほうが ひくい`).toBeLessThan(back);
        }
      }
    }
  });

  it('4 つの 向きで 4 つとも ちがう 形（案ごと）。null は 今までの 立方体（lookPieces(id, null)）と 同じ', () => {
    for (const f of roofs) {
      for (const style of STYLES) {
        const keys = FACINGS.map((facing) => key(placedLookPieces(f.blocks[0]!, { style, facing })));
        expect(new Set(keys).size, `${f.form}_${style}: 4 向き`).toBe(FACINGS.length);
      }
      expect(key(placedLookPieces(f.blocks[0]!, null)), `${f.form}: null ＝ 立方体`).toBe(key(lookPieces(f.blocks[0]!, null)));
    }
  });

  it('3 案で 形が ちがう（同じ 向きでも 案が ちがえば 面が ちがう）', () => {
    for (const f of roofs) {
      const keys = STYLES.map((style) => key(placedLookPieces(f.blocks[0]!, { style, facing: 's' })));
      expect(new Set(keys).size, `${f.form}: 3 案`).toBe(STYLES.length);
    }
  });
});

describe('手で 置いた のれん・はなだん: 前が facing の がわ', () => {
  it('のれん・はなだん × 3 案 × 4 向き: 向きが かわれば 形が かわり、のれんは facing の がわに さがる', () => {
    expect(fronts.length).toBeGreaterThan(0);
    for (const f of fronts) {
      for (const style of STYLES) {
        const keys = FACINGS.map((facing) => key(placedLookPieces(f.blocks[0]!, { style, facing })));
        expect(new Set(keys).size, `${f.form}_${style}: 4 向き ぜんぶ ちがう`).toBe(FACINGS.length);
        for (const facing of FACINGS) {
          const ps = placedLookPieces(f.blocks[0]!, { style, facing });
          expect(ps.length, `${f.form}_${style} ${facing}`).toBeGreaterThan(0);
          // のれんは 前（facing の がわ）の ふちに さがる（はなだんは 箱が 前に よる が 片よりが ごく 小さい ので 見ない）
          if (f.form === 'noren') {
            const { k, sign } = axis(facing);
            expect(sign * (centroid(ps, k) - 0.5), `${f.form}_${style} ${facing}: 前の がわに さがる`).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});
