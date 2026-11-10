import { describe, expect, it } from 'vitest';
import { DataTexture } from 'three';
import { BLOCK_INDEX } from '../../blocks/blockTypes';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { WorldLight } from '../../light/WorldLight';
import { SkyDarkness } from '../../light/skyDarkness';
import { SectionMesher, type SectionMeshData } from './sectionMesher';
import { SEAM_CLAMP, SEAM_PX, seamGrowLocal, seamOverlapPx } from './seamGrow';
import { createVoxelMaterial, createVoxelShared } from './voxelMaterial';

/** 正面から見たとき、1 小ブロックが画面で何画素か（視野の高さ viewH、距離はブロック） */
function faceOnPixels(distance: number, viewH: number, foreshorten = 1): number {
  const fy = 1 / Math.tan((75 * Math.PI) / 360);
  return ((1 / 9) * fy * viewH) / (2 * distance) * foreshorten;
}

/** いままで（0.03 小ブロック固定）の両側の重なり（画素） */
function legacyOverlapPx(pixelsPerMicro: number): number {
  return 2 * 0.03 * pixelsPerMicro;
}

interface Q {
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
}

function quadsOf(d: SectionMeshData): Q[] {
  const out: Q[] = [];
  for (const p of d.pieces) {
    const pos = p.positions;
    for (let v = 0; v + 3 < p.vertexCount; v += 4) {
      let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, z0 = 1e9, z1 = -1;
      for (let i = 0; i < 4; i++) {
        const o = (v + i) * 3;
        const x = pos[o], y = pos[o + 1], z = pos[o + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
      out.push({ x0, x1, y0, y1, z0, z1 });
    }
  }
  return out;
}

/** 辺の途中にほかの面の角が乗っている数（T 字）。端の角は数えない */
function tJunctions(qs: Q[]): number {
  const lines = new Map<string, number[]>();
  const add = (key: string, t: number) => {
    let a = lines.get(key);
    if (!a) lines.set(key, (a = []));
    a.push(t);
  };
  for (const q of qs) {
    const pts: [number, number, number][] = [
      [q.x0, q.y0, q.z0], [q.x1, q.y0, q.z0], [q.x0, q.y1, q.z0], [q.x1, q.y1, q.z0],
      [q.x0, q.y0, q.z1], [q.x1, q.y0, q.z1], [q.x0, q.y1, q.z1], [q.x1, q.y1, q.z1],
    ];
    for (const [x, y, z] of pts) {
      add(`X|${y}|${z}`, x);
      add(`Y|${x}|${z}`, y);
      add(`Z|${x}|${y}`, z);
    }
  }
  const uniq = new Map<string, number[]>();
  for (const [k, a] of lines) {
    a.sort((p, q) => p - q);
    const u: number[] = [];
    for (const t of a) if (u.length === 0 || u[u.length - 1] !== t) u.push(t);
    uniq.set(k, u);
  }
  const inside = (key: string, lo: number, hi: number): number => {
    if (hi <= lo) return 0;
    const u = uniq.get(key);
    if (!u) return 0;
    let n = 0;
    for (const t of u) if (t > lo && t < hi) n++;
    return n;
  };
  let hits = 0;
  for (const q of qs) {
    if (q.y0 === q.y1) {
      hits += inside(`X|${q.y0}|${q.z0}`, q.x0, q.x1) + inside(`X|${q.y0}|${q.z1}`, q.x0, q.x1);
      hits += inside(`Z|${q.x0}|${q.y0}`, q.z0, q.z1) + inside(`Z|${q.x1}|${q.y0}`, q.z0, q.z1);
    } else if (q.x0 === q.x1) {
      hits += inside(`Y|${q.x0}|${q.z0}`, q.y0, q.y1) + inside(`Y|${q.x0}|${q.z1}`, q.y0, q.y1);
      hits += inside(`Z|${q.x0}|${q.y0}`, q.z0, q.z1) + inside(`Z|${q.x0}|${q.y1}`, q.z0, q.z1);
    } else if (q.z0 === q.z1) {
      hits += inside(`X|${q.y0}|${q.z0}`, q.x0, q.x1) + inside(`X|${q.y1}|${q.z0}`, q.x0, q.x1);
      hits += inside(`Y|${q.x0}|${q.z0}`, q.y0, q.y1) + inside(`Y|${q.x1}|${q.z0}`, q.y0, q.y1);
    }
  }
  return hits;
}

function meshOf(w: ArrayVoxelWorld, sx: number, sy: number, sz: number): SectionMeshData {
  const light = new WorldLight(w, new SkyDarkness());
  light.flush();
  return new SectionMesher(w, light).build(sx, sy, sz, 'micro');
}

describe('つぎ目の広げ（#147）', () => {
  it('画面 1 画素ぶん出す。固定の 0.03 小ブロックは、洞くつの壁の距離では 1 画素に届かない', () => {
    expect(SEAM_PX).toBe(1);
    expect(seamGrowLocal(0)).toBe(SEAM_CLAMP);
    const near = faceOnPixels(2, 720);
    expect(seamGrowLocal(near)).toBeCloseTo(SEAM_PX / near, 6);
    expect(seamOverlapPx(near)).toBeGreaterThanOrEqual(1);
    // 8 ブロック先・高さ 720・視野 75 度。いままでの 0.03 は片面 0.2 画素ほど
    const cave = faceOnPixels(8, 720);
    expect(legacyOverlapPx(cave)).toBeLessThan(1);
    expect(seamOverlapPx(cave)).toBeGreaterThanOrEqual(1);
    expect(seamGrowLocal(cave)).toBeGreaterThan(0.03);
  });

  it('正面と 45 度、近い所から小ブロックの輪の手前まで、重なりは 1 画素以上', () => {
    for (const distance of [3, 6, 8, 12, 16, 24]) {
      for (const viewH of [720, 1080, 1440]) {
        for (const foreshorten of [1, Math.SQRT1_2]) {
          const ppm = faceOnPixels(distance, viewH, foreshorten);
          expect(seamOverlapPx(ppm), `d=${distance} H=${viewH} f=${foreshorten.toFixed(2)} ppm=${ppm.toFixed(2)}`).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('洞くつの石のかべと水のふちに T 字があり、その距離では新しい広げだけが 1 画素をふさいでいる', () => {
    const cave = new ArrayVoxelWorld({ x: 48, y: 40, z: 48 });
    cave.fill(0, 0, 0, 47, 0, 47, 'bedrock');
    cave.fill(0, 1, 0, 47, 24, 47, 'stone');
    cave.fill(18, 8, 18, 30, 16, 30, 'air');
    const caveHits = tJunctions(quadsOf(meshOf(cave, 1, 0, 1)));

    const shore = new ArrayVoxelWorld({ x: 48, y: 32, z: 48 });
    shore.fill(0, 0, 0, 47, 0, 47, 'bedrock');
    shore.fill(0, 1, 0, 47, 10, 47, 'dirt');
    shore.fill(0, 11, 0, 47, 11, 47, 'grass');
    shore.fill(8, 10, 8, 20, 11, 20, 'water');
    const shoreHits = tJunctions(quadsOf(meshOf(shore, 0, 0, 0)));

    expect(caveHits, '洞くつの壁の T 字').toBeGreaterThan(1000);
    expect(shoreHits, '水のふちの T 字').toBeGreaterThan(200);

    // 炭鉱の坑道（#350）: 石の中の幅 3・高さ 4 の道、わく（柱と天井のはり）、たいまつ。わくは穴のない箱
    const mine = new ArrayVoxelWorld({ x: 48, y: 32, z: 32 });
    mine.fill(0, 0, 0, 47, 0, 31, 'bedrock');
    mine.fill(0, 1, 0, 47, 16, 31, 'stone');
    mine.fill(4, 6, 6, 40, 9, 8, 'air');
    for (const x of [12, 20, 28]) {
      for (const z of [5, 9]) for (let y = 6; y <= 9; y++) mine.setBlock(x, y, z, 'kodo_waku');
      for (let z = 5; z <= 9; z++) mine.setBlock(x, 10, z, 'kodo_waku');
    }
    mine.setBlock(18, 7, 6, 'torch');
    const mineMesh = meshOf(mine, 1, 0, 0);
    const mineHits = tJunctions(quadsOf(mineMesh));
    let wakuVerts = 0;
    for (const p of mineMesh.pieces) for (let v = 0; v < p.vertexCount; v++) if (p.data[v * 4] === BLOCK_INDEX.kodo_waku) wakuVerts++;
    expect(wakuVerts, 'わくの面がある').toBeGreaterThan(0);
    expect(mineHits, '坑道の T 字').toBeGreaterThan(500);
    // この T 字を、壁を見る距離（8 ブロック・45 度）でふさいでいるか
    const ppm = faceOnPixels(8, 720, Math.SQRT1_2);
    expect(legacyOverlapPx(ppm), '直す前は 1 画素に届かない').toBeLessThan(1);
    expect(seamOverlapPx(ppm), '直したあとは 1 画素以上重なる').toBeGreaterThanOrEqual(1);
  });

  it('材料の頂点シェーダーが、画面の大きさで広げる式を使う', () => {
    const m = createVoxelMaterial(createVoxelShared(new DataTexture(new Uint8Array(4), 1, 1)), null);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\nvoid main() {\n#include <color_vertex>\n#include <begin_vertex>\n}\n',
      fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\nvec3 lit = c * vShade;\n}\n',
    };
    type ShaderArg = Parameters<NonNullable<typeof m.onBeforeCompile>>[0];
    m.onBeforeCompile(shader as unknown as ShaderArg, null as never);
    expect(shader.vertexShader).toContain('uniform vec2 uViewport');
    expect(shader.vertexShader).toContain('seamAxis');
    expect(shader.vertexShader).toContain(SEAM_CLAMP.toFixed(2));
    expect(shader.vertexShader).toContain('transformed += voxGrow');
    expect(shader.uniforms.uViewport).toBeDefined();
    m.dispose();
  });
});
