// #381（PR #485 の あと）: ブロックが 627 しゅるい・絵が 708 まいに ふえて、小ブロックの 材料の 頂点シェーダーの
// uniform が 1335 本（vec3 の 表 2 つ）に なり、M4 の Mac（Chrome・Safari とも MAX_VERTEX_UNIFORM_VECTORS = 1024）で
// シェーダーが 作れず、近くの 地面が 描かれなかった。クラウドの swiftshader は 4096 まで 通るので E2E では 気づけない。
// ブロック・絵の 数で ふえる 表は テクスチャで わたし、uniform の 数は ブロックの 数に よらない ことを ここで 見る。
import { afterEach, describe, expect, it } from 'vitest';
import { DataTexture, MeshBasicMaterial, ShaderLib, type WebGLProgramParametersWithUniforms } from 'three';
import { applyLightShader } from '../lightShader';
import { shadowPatch } from '../shadow/shadowPatch';
import { TILE_TAB_W, createTileTabTexture, createVoxelMaterial, createVoxelShared } from './voxelMaterial';
import { KINDS, tileAverageTable, tileTable } from './projection';

/** WebGL2 で どの 機械でも 使えると 決まっている 頂点の uniform の 数（vec4 の 本数）。three が 足す 行列などの 分を のこす */
const VERTEX_UNIFORM_BUDGET = 256 - 32; // 本〔vec4〕

/** 1 つの uniform が 使う vec4 の 本数（GLSL ES 3.0 の 詰め方。sampler は 数えない） */
const SLOTS: Record<string, number> = { float: 1, int: 1, bool: 1, vec2: 1, vec3: 1, vec4: 1, ivec2: 1, ivec3: 1, ivec4: 1, mat3: 3, mat4: 4 };

function vertexUniformVectors(src: string): number {
  let n = 0;
  for (const m of src.matchAll(/^\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)(?:\[(\d+)\])?\s*;/gm)) {
    const type = m[1]!;
    if (type.includes('sampler')) continue;
    const per = SLOTS[type];
    if (per === undefined) throw new Error(`知らない uniform の 型: ${type}`);
    n += per * (m[3] ? Number(m[3]) : 1);
  }
  return n;
}

function basicShader(): WebGLProgramParametersWithUniforms {
  return { uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader } as unknown as WebGLProgramParametersWithUniforms;
}
const compile = (m: MeshBasicMaterial, s: WebGLProgramParametersWithUniforms): void => (m.onBeforeCompile as (s: unknown, r: unknown) => void)(s, null);

afterEach(() => {
  shadowPatch.active = false;
});

describe('頂点シェーダーの uniform の 数（実 GPU の 上限）', () => {
  for (const shadow of [false, true]) {
    it(`小ブロック・箱の 材料（かげ ${shadow ? 'オン' : 'オフ'}）は ${VERTEX_UNIFORM_BUDGET} 本 以内`, () => {
      shadowPatch.active = shadow;
      const m = createVoxelMaterial(createVoxelShared(new DataTexture(new Uint8Array(4), 1, 1)), null);
      const s = basicShader();
      compile(m, s);
      expect(vertexUniformVectors(s.vertexShader)).toBeLessThanOrEqual(VERTEX_UNIFORM_BUDGET);
    });

    it(`絵・LOD・水の 材料（かげ ${shadow ? 'オン' : 'オフ'}）は ${VERTEX_UNIFORM_BUDGET} 本 以内`, () => {
      shadowPatch.active = shadow;
      const m = new MeshBasicMaterial({});
      applyLightShader(m);
      const s = basicShader();
      compile(m, s);
      expect(vertexUniformVectors(s.vertexShader)).toBeLessThanOrEqual(VERTEX_UNIFORM_BUDGET);
    });
  }
});

describe('タイルの 表の テクスチャ（uTileTab）', () => {
  it('ブロックごとの [上, 下, 横] と タイルの 平均色が 前の uniform の 表と 同じ 並びで 入る', () => {
    const tex = createTileTabTexture();
    const d = tex.image.data as Float32Array;
    expect(tex.image.width).toBe(TILE_TAB_W);
    const of = tileTable();
    const avg = tileAverageTable();
    for (let k = 0; k < KINDS; k++) expect([d[k * 4], d[k * 4 + 1], d[k * 4 + 2]]).toEqual([of[k * 3], of[k * 3 + 1], of[k * 3 + 2]]);
    for (let i = 0; i < avg.length / 3; i++) {
      const o = (KINDS + i) * 4;
      for (let c = 0; c < 3; c++) expect(d[o + c]).toBeCloseTo(avg[i * 3 + c]!, 6);
    }
  });
});
