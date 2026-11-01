import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { BLOCK_INDEX, BLOCK_TYPES, isOpaqueIndex } from '../blocks/blockTypes';
import { waterId } from '../blocks/water';
import { OPACITY } from '../light/opacity';
import { SkyDarkness } from '../light/skyDarkness';
import { WorldLight } from '../light/WorldLight';
import { scanColumn, type ColumnInfo } from '../micro/worldColumns';
import { meshChunkLod } from './lodMesh';
import { FACES, type MeshData } from './meshChunk';
import { meshSectionExtras } from './voxel/sectionExtras';
import { SectionMesher } from './voxel/sectionMesher';

/**
 * WATER-1（docs/design/WATER-1.md）の ユニット: AC15（見た目）・AC16b（ゆらめきで メッシュは かわらない）と、§4.6 の
 * 遠景・ミクロ・光（量 1〜7 の 水も みな 水として あつかう）。
 * 実装の まえに 書いた テスト（`water.ts` と 量 1〜7 の 水の メッシュが まだ 無いので 落ちるのが 正しい）。
 *
 * 場所: 石の 床（y 0〜3）の 上の y=4 に 水を 置く。メッシュの 座標は 世界の 座標（1 マス = 1）。
 */

const FLOOR_TOP = 3;
const Y = FLOOR_TOP + 1; // 水の 1 段目

function pond(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 32, y: 32, z: 32 });
  w.fill(0, 0, 0, 31, FLOOR_TOP, 31, 'stone');
  return w;
}

/** 水の メッシュ（近くの メッシュの 水の 材料） */
const waterOf = (w: ArrayVoxelWorld): MeshData => meshSectionExtras(w, 0, 0, 0, undefined).water;

interface Quad {
  /** 4 つの 頂点（世界の 座標） */
  v: [number, number, number][];
  /** 4 頂点で そろって いる 軸（0 = x・1 = y・2 = z）。どれも そろわない = ななめ */
  flat: 0 | 1 | 2 | null;
  min: [number, number, number];
  max: [number, number, number];
}

function quadsOf(m: MeshData): Quad[] {
  expect(m.positions.length, '1 まい = 4 頂点').toBe(m.faceCount * 12);
  const out: Quad[] = [];
  for (let q = 0; q < m.faceCount; q++) {
    const v: [number, number, number][] = [];
    for (let i = 0; i < 4; i++) {
      const o = (q * 4 + i) * 3;
      v.push([m.positions[o], m.positions[o + 1], m.positions[o + 2]]);
    }
    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const p of v) {
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], p[a]);
        hi[a] = Math.max(hi[a], p[a]);
      }
    }
    const flat = ([0, 1, 2] as const).find((a) => lo[a] === hi[a]) ?? null;
    out.push({ v, flat, min: lo, max: hi });
  }
  return out;
}

/** 水平の まい（上の 面・下の 面） */
const horizontals = (qs: Quad[]): Quad[] => qs.filter((q) => q.flat === 1);
/** 軸 axis が 値 at の 平面に ある まい */
const onPlane = (qs: Quad[], axis: 0 | 2, at: number): Quad[] => qs.filter((q) => q.flat === axis && q.min[axis] === at);

describe('AC15 水面の 高さ = 量 / 8（上が 空き）', () => {
  it('量 a（1〜8）の 1 マス: 上の 面の 4 頂点が y + a/8、横の 4 まいは 底から a/8 まで', () => {
    for (let a = 1; a <= 8; a++) {
      const w = pond();
      w.setBlock(8, Y, 8, waterId(a));
      const qs = quadsOf(waterOf(w));
      expect(qs.length, `量 ${a}: 上 1 ＋ 横 4（下は 石なので 無い）`).toBe(5);
      const tops = horizontals(qs);
      expect(tops.length, `量 ${a}: 上の 面は 1 まい`).toBe(1);
      for (const p of tops[0].v) expect(p[1], `量 ${a}: 水面の 頂点`).toBeCloseTo(Y + a / 8, 9);
      const sides = qs.filter((q) => q.flat !== 1);
      expect(sides.length).toBe(4);
      for (const s of sides) {
        expect(s.min[1], `量 ${a}: 横の 面の 下の 辺は 底`).toBeCloseTo(Y, 9);
        expect(s.max[1], `量 ${a}: 横の 面の 上の 辺は 水面`).toBeCloseTo(Y + a / 8, 9);
      }
    }
  });

  it('すぐ 上が 水（量は 問わない）なら、下の マスの 横の 面は いっぱいの 高さまで。上の 面は 上の マスの 水面 1 まいだけ', () => {
    const w = pond();
    w.setBlock(8, Y, 8, waterId(3));
    w.setBlock(8, Y + 1, 8, waterId(5));
    const qs = quadsOf(waterOf(w));
    const tops = horizontals(qs);
    expect(tops.length, '水に ふさがれた 下の マスの 上の 面は 無い').toBe(1);
    for (const p of tops[0].v) expect(p[1]).toBeCloseTo(Y + 1 + 5 / 8, 9);
    const lower = qs.filter((q) => q.flat !== 1 && q.max[1] <= Y + 1 + 1e-9);
    expect(lower.length).toBe(4);
    for (const s of lower) {
      expect(s.min[1]).toBeCloseTo(Y, 9);
      expect(s.max[1], '下の マスの 横の 面の 上の 辺 = 1（いっぱい）').toBeCloseTo(Y + 1, 9);
    }
    const upper = qs.filter((q) => q.flat !== 1 && q.min[1] >= Y + 1 - 1e-9);
    expect(upper.length).toBe(4);
    for (const s of upper) {
      expect(s.min[1]).toBeCloseTo(Y + 1, 9);
      expect(s.max[1]).toBeCloseTo(Y + 1 + 5 / 8, 9);
    }
  });

  it('高さ 6 と 2 の となりあい: 境の 横の 面は 1 まいだけ。2/8〜6/8（高い ほうが かぎ 描く）', () => {
    const w = pond();
    w.setBlock(7, Y, 8, waterId(6));
    w.setBlock(8, Y, 8, waterId(2));
    const qs = quadsOf(waterOf(w));
    const seam = onPlane(qs, 0, 8);
    expect(seam.length, '境（x = 8）の 面は 6 の 東がわの 1 まいだけ').toBe(1);
    expect(seam[0].min[1]).toBeCloseTo(Y + 2 / 8, 9);
    expect(seam[0].max[1]).toBeCloseTo(Y + 6 / 8, 9);
    expect(seam[0].min[2]).toBe(8);
    expect(seam[0].max[2]).toBe(9);
  });

  it('量 8 と 量 4 の となりあいも 同じ（4/8〜8/8）。同じ 高さなら 境の 面は 無い（今と 同じ）', () => {
    const a = pond();
    a.setBlock(7, Y, 8, 'water');
    a.setBlock(8, Y, 8, waterId(4));
    const seam = onPlane(quadsOf(waterOf(a)), 0, 8);
    expect(seam.length).toBe(1);
    expect(seam[0].min[1]).toBeCloseTo(Y + 4 / 8, 9);
    expect(seam[0].max[1]).toBeCloseTo(Y + 1, 9);

    const b = pond();
    b.setBlock(7, Y, 8, waterId(4));
    b.setBlock(8, Y, 8, waterId(4));
    expect(onPlane(quadsOf(waterOf(b)), 0, 8).length, '同じ 高さ').toBe(0);
    const c = pond();
    c.setBlock(7, Y, 8, 'water');
    c.setBlock(8, Y, 8, 'water');
    expect(onPlane(quadsOf(waterOf(c)), 0, 8).length, '量 8 どうし').toBe(0);
  });

  it('石との さかいには 面を 描かない（今と 同じ）。空気に 面した 横だけ', () => {
    const w = pond();
    w.setBlock(8, Y, 8, waterId(5));
    w.setBlock(9, Y, 8, 'stone');
    const qs = quadsOf(waterOf(w));
    expect(onPlane(qs, 0, 9).length, '石がわの 東の 面は 無い').toBe(0);
  });

  it('量 8 だけの 池の メッシュは 今と 同じ（空気に 面した 面を 1 マス 1 まい。頂点は マスの 角）', () => {
    const w = pond();
    w.fill(4, Y, 4, 6, Y + 1, 6, 'water');
    const got = quadsOf(waterOf(w)).map((q) => q.v.map((p) => p.join(',')).sort().join('|')).sort();
    // 今の きまり: 水の マスの 6 つの 面のうち、となりが 空気の ものだけ。頂点は FACES の 角 + マスの 座標
    const expected: string[] = [];
    for (let y = Y; y <= Y + 1; y++)
      for (let z = 4; z <= 6; z++)
        for (let x = 4; x <= 6; x++)
          for (const f of FACES) {
            const n = w.getIndex(x + f.dir[0], y + f.dir[1], z + f.dir[2]);
            if (n !== BLOCK_INDEX.air) continue;
            expected.push(f.verts.map((v) => [x + v[0], y + v[1], z + v[2]].join(',')).sort().join('|'));
          }
    expect(got.length).toBeGreaterThan(0);
    expect(got).toEqual(expected.sort());
  });

  it('近くの メッシュの どちらの 段（micro・box）も 同じ 水を 出す', () => {
    const w = pond();
    w.setBlock(7, Y, 8, waterId(6));
    w.setBlock(8, Y, 8, waterId(2));
    w.setBlock(9, Y, 8, 'water');
    const base = waterOf(w);
    expect(base.faceCount).toBeGreaterThan(0);
    const mesher = new SectionMesher(w);
    for (const tier of ['micro', 'box'] as const) {
      const d = mesher.build(0, 0, 0, tier);
      expect(d.water.positions, `${tier}`).toEqual(base.positions);
      expect(d.water.indices).toEqual(base.indices);
      expect(d.triangles).toBeGreaterThanOrEqual(base.indices.length / 3);
    }
  });
});

describe('AC16b ゆらめきは シェーダーで。メッシュは 時間にも waveAmp にも よらない', () => {
  it('頂点の 高さは ちょうど 1/8 の 倍数（ゆれを メッシュに 焼きこまない）で、作り直しても 同じ', () => {
    const w = pond();
    w.setBlock(6, Y, 8, waterId(1));
    w.setBlock(7, Y, 8, waterId(3));
    w.setBlock(8, Y, 8, waterId(5));
    w.setBlock(9, Y, 8, waterId(7));
    w.setBlock(10, Y, 8, 'water');
    const a = waterOf(w);
    const b = waterOf(w);
    expect(b.positions).toEqual(a.positions);
    expect(b.indices).toEqual(a.indices);
    expect(a.faceCount).toBeGreaterThan(0);
    for (let i = 1; i < a.positions.length; i += 3) expect((a.positions[i] * 8) % 1, '1/8 の 倍数').toBe(0);
  });

  it('頂点・三角形の 数は 形だけで 決まる（量が 同じ 形なら 量が かわっても 同じ 数）', () => {
    // 量 1〜7 の どれでも、まわりが 空気の 1 マスは 面 5 まい（上 1 ＋ 横 4）= 頂点 20・三角形 10
    for (let a = 1; a <= 8; a++) {
      const w = pond();
      w.setBlock(8, Y, 8, waterId(a));
      const m = waterOf(w);
      expect(m.positions.length / 3, `量 ${a}: 頂点`).toBe(20);
      expect(m.indices.length / 3, `量 ${a}: 三角形`).toBe(10);
    }
  });
});

describe('§4.6 遠景（lodMesh）・ミクロ・光: 量 1〜7 も みな 水として あつかう', () => {
  /** 池（床 y 1〜3、水面の マス = y 4）。top = その 上の 段（y 4）の 水 */
  function lodPond(top: BlockId): ArrayVoxelWorld {
    const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    w.fill(0, 0, 0, 31, 0, 31, 'bedrock');
    w.fill(0, 1, 0, 31, 3, 31, 'stone');
    w.fill(0, Y, 0, 15, Y, 15, top);
    return w;
  }

  it('遠景: 上の 段が 量 1〜7 でも 量 8 と 同じ 水面 1 まい（高さの ちがいは 近くの メッシュ だけ）', () => {
    const ref = meshChunkLod(lodPond('water'), 0, 0);
    expect(ref.water.faceCount).toBe(1);
    for (let a = 1; a <= 7; a++) {
      const got = meshChunkLod(lodPond(waterId(a)), 0, 0);
      expect(got.water.faceCount, `量 ${a}`).toBe(1);
      expect(got.water.positions, `量 ${a}: 位置は 量 8 と 同じ`).toEqual(ref.water.positions);
      expect(got.water.colors, `量 ${a}: 色も 同じ`).toEqual(ref.water.colors);
      expect(got.opaque.positions, `量 ${a}: 地面は かわらない`).toEqual(ref.opaque.positions);
    }
  });

  it('ミクロ（小ブロック地形の 列の 走査）: 水の 下の 地面の 見つけ方は 量 8 と 同じ', () => {
    const mk = (top: BlockId): ColumnInfo => {
      const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
      w.fill(0, 0, 0, 31, 0, 31, 'bedrock');
      w.fill(0, 1, 0, 31, 2, 31, 'dirt');
      w.fill(0, 3, 0, 31, 3, 31, 'grass');
      w.fill(0, Y, 0, 31, Y, 31, top);
      const out: ColumnInfo = { ty: -1, kind: 0, reach: 0, rockOk: false };
      scanColumn(w, 5, 5, out);
      return out;
    };
    const ref = mk('water');
    expect(ref.ty).toBe(3);
    for (let a = 1; a <= 7; a++) expect(mk(waterId(a)), `量 ${a}`).toEqual(ref);
  });

  it('光: 量 1〜7 の 水は 量 8 と 同じに 光を 1 弱める（不透明では ない・固くない・こわれない）', () => {
    for (let a = 1; a <= 7; a++) {
      const id = waterId(a);
      const i = BLOCK_INDEX[id];
      expect(OPACITY[i], `${id} の 光の 弱め`).toBe(OPACITY[BLOCK_INDEX.water]);
      expect(OPACITY[i]).toBe(1);
      expect(isOpaqueIndex(i), `${id} は 不透明 では ない`).toBe(false);
      expect(BLOCK_TYPES[i].solid).toBe(false);
      expect(BLOCK_TYPES[i].breakable).toBe(false);
      expect(BLOCK_TYPES[i].name).toBe('みず');
    }
  });

  it('光: 空から 水の 柱を 通ると、量が 1〜8 の どれでも 1 マスごとに 1 弱まる', () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 16, z: 48 });
    w.fill(0, 0, 0, 47, 0, 47, 'stone');
    w.fill(0, 1, 0, 47, 6, 47, 'stone');
    w.fill(20, 1, 20, 20, 6, 20, 'air');
    // 上から 量 3・8・5 の 水（光の 弱めは 量に よらない）
    w.setBlock(20, 6, 20, waterId(3));
    w.setBlock(20, 5, 20, 'water');
    w.setBlock(20, 4, 20, waterId(5));
    const l = new WorldLight(w, new SkyDarkness());
    l.update();
    l.flush();
    expect(l.skyLight(20, 7, 20)).toBe(15);
    expect(l.skyLight(20, 6, 20)).toBe(14);
    expect(l.skyLight(20, 5, 20)).toBe(13);
    expect(l.skyLight(20, 4, 20)).toBe(12);
  });
});
