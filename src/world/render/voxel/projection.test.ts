import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX, BLOCK_TYPES } from '../../blocks/blockTypes';
import { BLOCK_TILES, TILE_NAMES, getTilePixels, tileUv, TILE_SIZE, ATLAS_HEIGHT, ATLAS_WIDTH } from '../../blocks/textures';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { FACES, TILE_UV, emptyMesh, pushFace } from '../meshChunk';
import { avgFade, pixelInTile, rowCodeOf, terrainKindOf, terrainSideRow, tileAverage, tileIndexOf, tileSlot, tileTable } from './projection';

/** 前の main の pushFace が作る UV から、面の上の点 (x, y, z)（0〜1）が 読む画素（絵の上から数える） */
function pushFacePixel(face: number, p: [number, number, number]): { px: number; py: number } {
  const w = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
  const m = emptyMesh();
  pushFace(m, w, undefined, 0, 0, 0, FACES[face], TILE_UV[BLOCK_INDEX.stone]![0]);
  // 4 つの角の位置と UV。面は 軸にそろった四角なので、点の位置から 双線形（軸ごとの 1 次式）で UV を出す
  const pos = Array.from({ length: 4 }, (_, i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]);
  const uv = Array.from({ length: 4 }, (_, i) => [m.uvs[i * 2], m.uvs[i * 2 + 1]]);
  // 角 0 と 角 2 が 対角。点が 角 0 から 角 2 へ どれだけ（軸ごとに）進んだか
  const t = [0, 1, 2].map((a) => (pos[2][a] === pos[0][a] ? 0 : (p[a] - pos[0][a]) / (pos[2][a] - pos[0][a])));
  // UV の u は 角 0 → 角 1、v は 角 1 → 角 2 の向き
  const du = [0, 1, 2].map((a) => pos[1][a] - pos[0][a]);
  const dv = [0, 1, 2].map((a) => pos[2][a] - pos[1][a]);
  const axisU = du.findIndex((v) => v !== 0);
  const axisV = dv.findIndex((v) => v !== 0);
  const su = (p[axisU] - pos[0][axisU]) / du[axisU];
  const sv = (p[axisV] - pos[1][axisV]) / dv[axisV];
  void t;
  const u = uv[0][0] + (uv[1][0] - uv[0][0]) * su;
  const v = uv[1][1] + (uv[2][1] - uv[1][1]) * sv;
  // UV → タイルの中の位置（0〜1）。v は下から
  const [u0, v0, u1, v1] = TILE_UV[BLOCK_INDEX.stone]![0];
  const tu = (u - u0) / (u1 - u0);
  const tv = (v - v0) / (v1 - v0);
  return { px: Math.min(15, Math.floor(tu * 16)), py: Math.min(15, Math.floor((1 - tv) * 16)) };
}

describe('投影（TEX-A）: 面の向き → 画素', () => {
  it('どの面も 前の main の pushFace の UV と 同じ向き（左右・上下）', () => {
    const pts: [number, number, number][] = [
      [0.1, 0.2, 0.3],
      [0.8, 0.7, 0.2],
      [0.3, 0.9, 0.6],
      [0.55, 0.45, 0.95],
    ];
    for (let f = 0; f < 6; f++) {
      for (const p of pts) {
        const q: [number, number, number] = [p[0], p[1], p[2]];
        // 面の上の点: その面の平面に のせる
        if (f === 0) q[1] = 1;
        else if (f === 1) q[1] = 0;
        else if (f === 2) q[0] = 1;
        else if (f === 3) q[0] = 0;
        else if (f === 4) q[2] = 1;
        else q[2] = 0;
        const want = pushFacePixel(f, q);
        const got = pixelInTile(f, q[0], q[1], q[2]);
        expect(got, `面 ${f} 点 ${q}`).toEqual(want);
      }
    }
  });

  it('絵の上（行 0）が ブロックの上。横の面は y が高いほど 行が小さい', () => {
    expect(pixelInTile(4, 0.5, 0.99, 0).py).toBe(0);
    expect(pixelInTile(4, 0.5, 0.01, 0).py).toBe(15);
    expect(pixelInTile(0, 0.5, 0, 0.01).py).toBe(0); // 上の面: z が小さい（北）が 絵の上
  });

  it('面の向き → [上, 下, 横] のタイル。かまど・たんす・はたけ・くさ', () => {
    expect(tileSlot(0)).toBe(0);
    expect(tileSlot(1)).toBe(1);
    for (const f of [2, 3, 4, 5]) expect(tileSlot(f)).toBe(2);
    const name = (id: keyof typeof BLOCK_INDEX, slot: number) => TILE_NAMES[tileIndexOf(BLOCK_INDEX[id], slot)];
    expect(name('grass', 0)).toBe('grass_top');
    expect(name('grass', 1)).toBe('dirt');
    expect(name('grass', 2)).toBe('grass_side');
    expect(name('tansu', 2)).toBe('tansu_front');
    expect(name('furnace', 0)).toBe('furnace_top');
    expect(name('furnace', 2)).toBe('furnace_side');
    expect(name('farmland_wet', 2)).toBe('farmland_wet_side');
    expect(name('log', 0)).toBe('log_top');
    expect(tileIndexOf(BLOCK_INDEX.air, 0)).toBe(-1);
  });

  it('シェーダーに渡す表: 種類 × 3 つの タイルの番号（BLOCK_TILES と同じ）', () => {
    const t = tileTable();
    expect(t.length).toBe(BLOCK_TYPES.length * 3);
    BLOCK_TYPES.forEach((b, k) => {
      const tiles = BLOCK_TILES[b.id];
      for (let s = 0; s < 3; s++) expect(t[k * 3 + s]).toBe(tiles ? TILE_NAMES.indexOf(tiles[s]) : -1);
    });
  });

  it('atlas の UV（前の main）と 同じ絵を指す: タイルの 4 すみの画素', () => {
    const [u0, v0, u1, v1] = tileUv('stone');
    expect(u1 - u0).toBeLessThan(TILE_SIZE / ATLAS_WIDTH);
    expect(v1 - v0).toBeLessThan(TILE_SIZE / ATLAS_HEIGHT);
    expect(getTilePixels('stone').length).toBe(256);
  });
});

describe('投影（TEX-A）: 小ブロック地形の横（基準 3）', () => {
  const grassSide = tileIndexOf(BLOCK_INDEX.grass, 2);
  const dirt = TILE_NAMES.indexOf('dirt');
  it('てっぺんから 0〜2 小ブロックは しばふの行（絵の上 4 行ぶんの 帯）。その下は 土の行', () => {
    // 1 小ブロック = 16/9 行。小ブロックの いちばん上の行
    expect(terrainSideRow(BLOCK_INDEX.grass, 0, 0.99, grassSide)).toEqual({ tile: grassSide, py: 0 });
    expect(terrainSideRow(BLOCK_INDEX.grass, 1, 0.99, grassSide).py).toBe(1);
    expect(terrainSideRow(BLOCK_INDEX.grass, 2, 0.99, grassSide).py).toBe(3);
    // 絵の行 0〜3 = しばふ、4〜 = 土（grass_side の絵）。てっぺん 0 小ブロックめ（行 0〜1）・1 小ブロックめ（行 1〜3）は しばふの行
    expect(terrainSideRow(BLOCK_INDEX.grass, 0, 0, grassSide).py).toBe(1);
    expect(terrainSideRow(BLOCK_INDEX.grass, 5, 0.5, grassSide).py).toBeGreaterThan(8);
  });
  it('9 小ブロックより下（16 行より下）は くさ なら 土の絵、ほかは 同じ絵のくり返し', () => {
    const r = terrainSideRow(BLOCK_INDEX.grass, 9, 0.5, grassSide);
    expect(r.tile).toBe(dirt);
    expect(r.py).toBeLessThan(16);
    const stone = tileIndexOf(BLOCK_INDEX.stone, 2);
    const s = terrainSideRow(BLOCK_INDEX.stone, rowCodeOf(12), 0.5, stone);
    expect(s.tile).toBe(stone);
  });
  it('rowCodeOf: 9 より下は 9〜17 をくり返す（9 小ブロック = 絵の 16 行）。同じ行になる', () => {
    expect(rowCodeOf(0)).toBe(0);
    expect(rowCodeOf(8)).toBe(8);
    expect(rowCodeOf(9)).toBe(9);
    expect(rowCodeOf(17)).toBe(17);
    expect(rowCodeOf(18)).toBe(9);
    const stone = tileIndexOf(BLOCK_INDEX.stone, 2);
    for (let ft = 0; ft < 60; ft++) {
      for (const fy of [0.1, 0.5, 0.9]) {
        const a = terrainSideRow(BLOCK_INDEX.stone, ft, fy, stone).py;
        const b = terrainSideRow(BLOCK_INDEX.stone, rowCodeOf(ft), fy, stone).py;
        expect(b, `fromTop ${ft} fy ${fy}`).toBe(a);
      }
    }
    // くさ は 9 より下が いつも 土
    for (let ft = 9; ft < 40; ft++) expect(terrainSideRow(BLOCK_INDEX.grass, rowCodeOf(ft), 0.5, grassSide).tile).toBe(dirt);
    for (let ft = 0; ft < 9; ft++) expect(terrainSideRow(BLOCK_INDEX.grass, rowCodeOf(ft), 0.5, grassSide).tile).toBe(grassSide);
  });
  it('地形のマスの種類: 岩は いし、くさの上の土の見える所は つち、ほかは 地面の種類', () => {
    expect(terrainKindOf(BLOCK_INDEX.grass, 5, true, 0, 0)).toBe(BLOCK_INDEX.stone);
    expect(terrainKindOf(BLOCK_INDEX.sand, 0, false, 3, 4)).toBe(BLOCK_INDEX.sand);
    expect(terrainKindOf(BLOCK_INDEX.coal_ore, 0, false, 3, 4)).toBe(BLOCK_INDEX.coal_ore);
    // くさ + 深い所は くさのまま
    expect(terrainKindOf(BLOCK_INDEX.grass, 5, false, 3, 4)).toBe(BLOCK_INDEX.grass);
  });
});

describe('投影（TEX-A）: 遠くの 平均色', () => {
  it('タイルの平均色（線形）は 0〜1 の中。石の平均は 中くらいの 灰色', () => {
    const a = tileAverage('stone');
    for (const v of a) {
      expect(v).toBeGreaterThan(0.1);
      expect(v).toBeLessThan(0.6);
    }
  });
  it('40 ブロックまでは 画素のまま、80 ブロックから 平均色。その間は なめらか', () => {
    expect(avgFade(0)).toBe(0);
    expect(avgFade(40)).toBe(0);
    expect(avgFade(80)).toBe(1);
    expect(avgFade(120)).toBe(1);
    expect(avgFade(60)).toBeCloseTo(0.5, 5);
    expect(avgFade(50)).toBeLessThan(avgFade(70));
  });
});
