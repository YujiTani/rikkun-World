// 影が オン（ふだんの 既定。shadowPref.ts）のとき、地面・絵の材料の シェーダーに 影を 差し込める こと。
// 材料の シェーダーの 文を 変えたら、shadowPatch.ts の 差し込み先も 合わせる
// （MINE-1B で 光る つぶの 行を かえたら 影ありで 小ブロックの 材料が 作れなく なった。E2E は 影を 切って 起動するので 気づけない）。
import { afterEach, describe, expect, it } from 'vitest';
import { DataTexture, MeshBasicMaterial, ShaderLib, type WebGLProgramParametersWithUniforms } from 'three';
import { applyLightShader } from '../lightShader';
import { createVoxelMaterial, createVoxelShared } from '../voxel/voxelMaterial';
import { shadowPatch } from './shadowPatch';

/** three の MeshBasicMaterial の ほんものの シェーダーの ひな形（onBeforeCompile が 受け取る 物と 同じ 形） */
function basicShader(): WebGLProgramParametersWithUniforms {
  return { uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader } as unknown as WebGLProgramParametersWithUniforms;
}
const compile = (m: MeshBasicMaterial, s: WebGLProgramParametersWithUniforms): void => (m.onBeforeCompile as (s: unknown, r: unknown) => void)(s, null);

afterEach(() => {
  shadowPatch.active = false;
});

describe('影ありの 材料（shadowPatch.active = true）', () => {
  it('小ブロック・箱の 材料（voxelMaterial）の シェーダーに 影を 差し込める。光る つぶの 光には かけない', () => {
    shadowPatch.active = true;
    const m = createVoxelMaterial(createVoxelShared(new DataTexture(new Uint8Array(4), 1, 1)), null);
    const s = basicShader();
    expect(() => compile(m, s)).not.toThrow();
    const f = s.fragmentShader;
    expect(f).toContain('shRatio(vShSB, vShBB, 0.0, vShSky, vWorld, normalize(vShN))');
    // 影は 地の 色の 行に だけ かかり、光る つぶ（max）の あとの 行には かからない
    const lit = f.indexOf('vec3 lit = c * vShade * ao * vLit * shRatio(');
    const glow = f.indexOf('lit = max(lit, c * glowK * br);');
    expect(lit, '影を かける 行').toBeGreaterThan(-1);
    expect(glow, '光る つぶの 行').toBeGreaterThan(lit);
    expect(f.slice(glow)).not.toContain('shRatio(');
  });

  it('絵（atlas）・LOD・水の 材料（applyLightShader）の シェーダーにも 影を 差し込める', () => {
    shadowPatch.active = true;
    const m = new MeshBasicMaterial({});
    applyLightShader(m);
    const s = basicShader();
    expect(() => compile(m, s)).not.toThrow();
    expect(s.fragmentShader).toContain('shRatio(vShSB, vShBB, vShFloor, vShSky, vShW, shDerivNormal(vShW))');
  });

  it('影なしの ときは 何も 差し込まない（今の シェーダーの まま）', () => {
    shadowPatch.active = false;
    const m = createVoxelMaterial(createVoxelShared(new DataTexture(new Uint8Array(4), 1, 1)), null);
    const s = basicShader();
    compile(m, s);
    expect(s.fragmentShader).not.toContain('shRatio(');
    expect(s.fragmentShader).toContain('vec3 lit = c * vShade * ao * vLit;');
  });
});
