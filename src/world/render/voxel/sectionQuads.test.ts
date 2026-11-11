import { describe, expect, it } from 'vitest';
import { QuadBuilder, pieceKind } from './sectionQuads';

// BLOCK-ID16 AC5: 頂点データの 種類は 10 ビット。頂点 1 つは 今までと 同じ（位置 6 B + aData 4 B + 光 2 B = 12 B）。
describe('BLOCK-ID16: pieceKind（頂点ごとの 種類）', () => {
  it('種類 0・255・256・300・700・1023 が 4 つの 頂点とも そのまま 届く。面の番号・角の印・つぶの 印は まざらない', () => {
    for (const kind of [0, 1, 255, 256, 300, 511, 512, 700, 1022, 1023]) {
      for (let f = 0; f < 6; f++) {
        const b = new QuadBuilder();
        b.quad(f, 0, 9, 0, 9, 0, 9, kind, 77, 5 << 3, 0, 100, 50, null);
        const [p] = b.finish();
        expect(p.vertexCount).toBe(4);
        for (let v = 0; v < 4; v++) {
          expect(pieceKind(p, v), `kind ${kind} f ${f} v ${v}`).toBe(kind);
          expect(p.data[v * 4 + 3] & 7, '面の番号').toBe(f);
          expect(p.data[v * 4 + 1], '行の符号').toBe(77);
          expect(p.data[v * 4 + 2] >> 3, 'つぶの 印').toBe(5);
          expect(p.data[v * 4 + 2] & 7, '角の印（3 ビット）').toBeLessThan(8);
        }
      }
    }
  });

  it('頂点 1 つの バイト数は 12 のまま（位置 3×2 B + aData 4 B + 光 2 B）', () => {
    const b = new QuadBuilder();
    b.quad(0, 0, 9, 0, 9, 0, 9, 700, 255, 0, 0, 0, 0, null);
    const [p] = b.finish();
    const bytes = p.positions.byteLength + p.data.byteLength + p.light.byteLength;
    expect(bytes / p.vertexCount).toBe(12);
  });
});
