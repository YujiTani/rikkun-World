import { describe, expect, it, vi } from 'vitest';

// BLOCK-ID16 AC5: mesher が 番号 256 以上の 種類を 別の種類に 化けさせず 頂点データに出す（greedy と box）。
// 本番の 表（217 種類）に ない 番号は、mesher が 見る 窓口（hasLook）だけ 差しかえて 通す。
// 四角を 受ける QuadBuilder は 記録する だけの 偽物にする（頂点の 並びが かわっても 種類の 値は d0 に 来る）。
vi.mock('../looks', async (orig) => {
  const actual = await orig<typeof import('../looks')>();
  return { ...actual, hasLook: (k: number) => k >= 255 || actual.hasLook(k) };
});

const K = await import('./sectionConsts');
const { emitGreedy } = await import('./sectionGreedy');
const { BoxMesher } = await import('./sectionBox');
const { ROW_NONE } = await import('./projection');
import type { QuadBuilder } from './sectionQuads';

type Call = { f: number; d0: number; d1: number; d2: number; sky: number; blk: number; lo: number[]; hi: number[] };
function recorder(): { b: QuadBuilder; calls: Call[] } {
  const calls: Call[] = [];
  const b = {
    quad: (f: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, d0: number, d1: number, d2: number, _flag: number, sky: number, blk: number) =>
      calls.push({ f, d0, d1, d2, sky, blk, lo: [x0, y0, z0], hi: [x1, y1, z1] }),
  } as unknown as QuadBuilder;
  return { b, calls };
}

const WIDE = [255, 256, 300, 511, 512, 556, 767, 1023];

describe('BLOCK-ID16 AC5: greedy（emitGreedy）', () => {
  it('種類 0〜1023 が そのまま d0 に 出る。行の符号・光・つぶの 印は 種類に まざらない', () => {
    for (const kind of WIDE) {
      const row = 77;
      const grain = 5;
      const light = (9 << 4) | 3; // 空 9・ブロック 3
      const mask = new Int32Array(4 * 4);
      mask[0] = kind | (row << K.MK_ROW) | (light << K.MK_LIGHT) | (grain << K.MK_GRAIN);
      const { b, calls } = recorder();
      emitGreedy(b, mask, 2, 1, 0, 2, 4, 0, 4, 0, 4, 0);
      expect(calls.length, `kind ${kind}`).toBe(1);
      expect(calls[0].d0, `kind ${kind}`).toBe(kind);
      expect(calls[0].d1, `row (kind ${kind})`).toBe(row);
      expect(calls[0].d2, `grain (kind ${kind})`).toBe(grain << 3);
      expect(calls[0].sky).toBe(9 * 17);
      expect(calls[0].blk).toBe(3 * 17);
    }
  });

  it('下の 8 ビットが 同じ 別の種類（44・300・556・812）は まとめられず、それぞれ 別の 四角', () => {
    const mask = new Int32Array(4);
    const kinds = [44, 300, 556, 812]; // 下の 8 ビットは みな 44
    mask.set(kinds.map((k) => k | (ROW_NONE << K.MK_ROW)));
    const { b, calls } = recorder();
    emitGreedy(b, mask, 2, 1, 0, 2, 4, 0, 4, 0, 1, 0);
    expect(calls.map((c) => c.d0)).toEqual(kinds);
  });

  it('同じ 広い種類が 3 つ 続けば 1 つの 四角に まとまる', () => {
    const mask = Int32Array.of(700, 700, 700, 0);
    const { b, calls } = recorder();
    emitGreedy(b, mask, 2, 1, 0, 2, 4, 0, 4, 0, 1, 0);
    expect(calls.length).toBe(1);
    expect(calls[0].d0).toBe(700);
    expect(calls[0].hi[0] - calls[0].lo[0]).toBe(3);
  });
});

/** 18³ の 種類が ぜんぶ 空気で、いくつかの マスだけ 種類を 置いた 偽の cube */
function fakeCube(cells: [number, number, number, number][]) {
  const bk = new Int16Array(K.CUBE);
  const at = (x: number, y: number, z: number) => (y * K.BL + z) * K.BL + x;
  for (const [x, y, z, kind] of cells) bk[at(x, y, z)] = kind;
  return {
    bk,
    ox: 0,
    oz: 0,
    oy: 0,
    kindNear(bxi: number, byi: number, bzi: number, f: number): number {
      const d = K.DIR[f];
      return bk[at(bxi + d[0], byi + d[1], bzi + d[2])];
    },
    corner(_bx: number, _by: number, _bz: number, _f: number, _v: unknown, out: Uint8Array, o: number): void {
      out[o] = 200; // 空
      out[o + 1] = 34; // ブロック
    },
  };
}

function runBox(cells: [number, number, number, number][]): Call[] {
  const { b, calls } = recorder();
  const cube = fakeCube(cells);
  const world = { size: { x: 16, y: 16, z: 16 }, getIndex: () => 0 };
  const mask = new Int32Array(K.S * 4);
  type Args = ConstructorParameters<typeof BoxMesher>;
  new BoxMesher(world as unknown as Args[0], cube as unknown as Args[1], b, mask).mesh();
  return calls;
}

describe('BLOCK-ID16 AC5: box（BoxMesher）', () => {
  it('1 つだけ 置いた 種類 0〜1023 が 6 面とも そのまま d0 に 出る', () => {
    for (const kind of [1, 255, 256, 300, 511, 512, 700, 1022, 1023]) {
      const calls = runBox([[5, 5, 5, kind]]);
      expect(calls.length, `kind ${kind}`).toBe(6);
      for (const c of calls) {
        expect(c.d0, `kind ${kind}`).toBe(kind);
        expect(c.d1).toBe(ROW_NONE);
        expect(c.sky, `光が 種類に まざらない (kind ${kind})`).toBe(200);
        expect(c.blk).toBe(34);
      }
    }
  });

  it('300 と 812（下の 9 ビットが 同じ）、255 と 256 が となりあっても 別の 四角のまま', () => {
    for (const [a, b] of [[300, 812], [255, 256], [511, 1023]]) {
      const calls = runBox([[5, 5, 5, a], [6, 5, 5, b]]);
      const kinds = calls.map((c) => c.d0);
      expect(kinds.filter((k) => k === a).length, `${a}`).toBeGreaterThan(0);
      expect(kinds.filter((k) => k === b).length, `${b}`).toBeGreaterThan(0);
      expect(kinds.every((k) => k === a || k === b), `${a}/${b} 以外の 種類が 出た`).toBe(true);
      // 上の面（f=0 = +y）は 1 マスずつ 別の 四角（まとまらない）
      const tops = calls.filter((c) => c.f === 0);
      expect(tops.length).toBe(2);
    }
  });

  it('同じ 広い種類の となりどうしは 上の面が 1 まいに まとまる', () => {
    const calls = runBox([[5, 5, 5, 700], [6, 5, 5, 700]]);
    const tops = calls.filter((c) => c.f === 0);
    expect(tops.length).toBe(1);
    expect(tops[0].d0).toBe(700);
  });
});
