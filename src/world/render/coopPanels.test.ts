import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from '../blocks/blockTypes';
import { emptyMesh, pushCoopPanels } from './meshChunk';

/**
 * LIVE-2.1 AC15（さく・もん の 見た目。オーナーが えらんだ 形 9dc0f0c）: ブロック の 箱 に 見せない。
 * さく ＝ 線 に そう 板 2 面（両面）・高さ 12/9・マス の 中央、角 は L で 板 2 枚。
 * もん ＝ はば 1.5 の 板 ＋ くい 2 本・高さ 1.8、もん の 上 の マス は 何も 出さない。箱 の 面 は 0。
 * 絵 そのもの は UI 検査 と オーナー確認（AC17 (5)）。
 */
const idx = (id: string) => BLOCK_TYPES.findIndex((t) => t.id === id);
const FENCE = idx('toriya_fence');
const GATE = idx('toriya_gate');
const STONE = idx('stone');

function worldOf(cells: Array<[number, number, number, number]>) {
  const m = new Map(cells.map(([x, y, z, b]) => [`${x},${y},${z}`, b]));
  return { getIndex: (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? 0 };
}
function draw(cells: Array<[number, number, number, number]>, at: [number, number, number]) {
  const mesh = emptyMesh();
  const b = worldOf(cells).getIndex(...at);
  const drawn = pushCoopPanels(mesh, worldOf(cells), at[0], at[1], at[2], b, 1, 0);
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    xs.push(mesh.positions[i]);
    ys.push(mesh.positions[i + 1]);
    zs.push(mesh.positions[i + 2]);
  }
  const span = (a: number[]) => (a.length ? Math.max(...a) - Math.min(...a) : 0);
  return { mesh, drawn, xs, ys, zs, span };
}

describe('pushCoopPanels（さく・もん は 板）', () => {
  it('まっすぐ の さく: 線 に そう 板 1 まい（両面 = 2 面）・はば 1・高さ 12/9・マス の 中央・厚み 0', () => {
    const cells: Array<[number, number, number, number]> = [[4, 9, 5, FENCE], [5, 9, 5, FENCE], [6, 9, 5, FENCE]];
    const r = draw(cells, [5, 9, 5]);
    expect(r.drawn).toBe(true);
    expect(r.mesh.faceCount, '板 1 まい の 両面').toBe(2);
    expect(r.span(r.xs)).toBeCloseTo(1, 5);
    expect(r.span(r.ys)).toBeCloseTo(12 / 9, 5);
    expect(Math.min(...r.ys)).toBeCloseTo(9, 5);
    expect(new Set(r.zs.map((z) => z.toFixed(4))), '厚み 0（z は マス の 中央 だけ）').toEqual(new Set(['5.5000']));
  });

  it('たて の 線（z 方向）の さく: 板 は z 方向、x は マス の 中央 だけ', () => {
    const r = draw([[5, 9, 4, FENCE], [5, 9, 5, FENCE], [5, 9, 6, FENCE]], [5, 9, 5]);
    expect(r.mesh.faceCount).toBe(2);
    expect(r.span(r.zs)).toBeCloseTo(1, 5);
    expect(new Set(r.xs.map((x) => x.toFixed(4)))).toEqual(new Set(['5.5000']));
  });

  it('角: L で 板 2 まい（4 面）', () => {
    const r = draw([[5, 9, 5, FENCE], [6, 9, 5, FENCE], [5, 9, 6, FENCE]], [5, 9, 5]);
    expect(r.mesh.faceCount).toBe(4);
  });

  it('もん: はば 1.5 の 板 ＋ くい 2 本（直角 の 細い 板）・高さ 1.8', () => {
    const cells: Array<[number, number, number, number]> = [[4, 9, 5, FENCE], [5, 9, 5, GATE], [6, 9, 5, FENCE]];
    const r = draw(cells, [5, 9, 5]);
    expect(r.drawn).toBe(true);
    expect(r.mesh.faceCount, '板 2 面 ＋ くい 2 本 × 2 面').toBe(6);
    expect(r.span(r.xs)).toBeCloseTo(1.5, 5);
    expect(r.span(r.ys)).toBeCloseTo(1.8, 5);
  });

  it('もん の 上 の マス（下 が もん）は 何も 出さない（描いた 扱い で 箱 も 出さない）', () => {
    const r = draw([[5, 9, 5, GATE], [5, 10, 5, GATE]], [5, 10, 5]);
    expect(r.drawn).toBe(true);
    expect(r.mesh.faceCount).toBe(0);
  });

  it('さく・もん で ない ブロック は 描かない（false）', () => {
    const r = draw([[5, 9, 5, STONE]], [5, 9, 5]);
    expect(r.drawn).toBe(false);
    expect(r.mesh.faceCount).toBe(0);
  });

  it('箱の 面 0: どの 面 も 厚み 0 の 縦 の 板（4 つ の 角 が 同じ x か 同じ z）', () => {
    for (const cells of [
      [[4, 9, 5, FENCE], [5, 9, 5, FENCE], [6, 9, 5, FENCE]],
      [[5, 9, 5, FENCE], [6, 9, 5, FENCE], [5, 9, 6, FENCE]],
      [[4, 9, 5, FENCE], [5, 9, 5, GATE], [6, 9, 5, FENCE]],
    ] as Array<Array<[number, number, number, number]>>) {
      const r = draw(cells, cells[1].slice(0, 3) as [number, number, number]);
      for (let q = 0; q < r.mesh.faceCount; q++) {
        const xs = r.xs.slice(q * 4, q * 4 + 4);
        const zs = r.zs.slice(q * 4, q * 4 + 4);
        expect(Math.max(...xs) - Math.min(...xs) < 1e-6 || Math.max(...zs) - Math.min(...zs) < 1e-6, `面 ${q}`).toBe(true);
      }
    }
  });
});
