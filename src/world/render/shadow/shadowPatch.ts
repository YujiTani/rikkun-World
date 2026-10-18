// 影を受ける材料に入れる差し込み（SHADOW.md §5.3）。影の仕組みを作ったときだけ active を true にする。
// 作らない（?shadow=0）ときは 今のシェーダーのまま（コードも、プログラムも ふえない）。
import type { WebGLProgramParametersWithUniforms } from 'three';
import { SHADOW_DERIV_NORMAL, SHADOW_FRAG_PARS, SHADOW_VARYINGS, createShadowUniforms } from './shadowGlsl';

export const shadowPatch = {
  active: false,
  uniforms: createShadowUniforms(),
};

/** 材料のプログラムの見分け（影ありと影なしで別のプログラム） */
export const shadowCacheKey = (): string => (shadowPatch.active ? '-sh' : '');

function mustReplace(src: string, from: string, to: string, what: string): string {
  if (!src.includes(from)) throw new Error(`[shadow] ${what} の差し込み先が見つかりません: ${from}`);
  return src.replace(from, to);
}

/** 小ブロック・箱の材料（voxelMaterial.ts）: 頂点の光はそのまま、フラグメントで 光に shRatio をかける */
export function patchVoxelShader(shader: WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, shadowPatch.uniforms);
  shader.vertexShader = mustReplace(
    mustReplace(shader.vertexShader, '#include <common>', `#include <common>\n${SHADOW_VARYINGS}`, 'voxel 頂点 common'),
    'vLit = vec3(max(sb, bb)) * tint;',
    'vLit = vec3(max(sb, bb)) * tint;\n  vShSB = sb; vShBB = bb; vShSky = skyIn; vShN = NRM[f];',
    'voxel 頂点 vLit',
  );
  shader.fragmentShader = mustReplace(
    mustReplace(shader.fragmentShader, '#include <common>', `#include <common>\n${SHADOW_VARYINGS}\n${SHADOW_FRAG_PARS}`, 'voxel フラグメント common'),
    'diffuseColor.rgb *= c * vShade * ao * vLit;',
    'diffuseColor.rgb *= c * vShade * ao * vLit * shRatio(vShSB, vShBB, 0.0, vShSky, vWorld, normalize(vShN));',
    'voxel フラグメント光',
  );
}

/** 絵（atlas）・LOD・水の材料（lightShader.ts）: 頂点の色（光×AO）はそのまま、フラグメントで shRatio をかける */
export function patchAtlasShader(shader: WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, shadowPatch.uniforms);
  shader.vertexShader = mustReplace(
    mustReplace(shader.vertexShader, '#include <common>', `#include <common>\n${SHADOW_VARYINGS}`, 'atlas 頂点 common'),
    'vColor.rgb *= max(max(sb, bb), ripe * uRipeMin) * tint * (1.0 - aoD);',
    'vColor.rgb *= max(max(sb, bb), ripe * uRipeMin) * tint * (1.0 - aoD);\n  vShSB = sb; vShBB = bb; vShFloor = ripe * uRipeMin; vShSky = aLight.x; vShW = (modelMatrix * vec4(position, 1.0)).xyz;',
    'atlas 頂点 光',
  );
  shader.fragmentShader = mustReplace(
    mustReplace(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>\n${SHADOW_VARYINGS}\n${SHADOW_FRAG_PARS}\n${SHADOW_DERIV_NORMAL}`,
      'atlas フラグメント common',
    ),
    '#include <color_fragment>',
    '#include <color_fragment>\n  diffuseColor.rgb *= (uShP.x > 0.001 ? shRatio(vShSB, vShBB, vShFloor, vShSky, vShW, shDerivNormal(vShW)) : vec3(1.0));',
    'atlas フラグメント光',
  );
}

/** キャラの板（ShaderMaterial）: 止まっている世界の影を受ける（自分の影は受けない） */
export function patchSpriteMaterial(mat: import('three').ShaderMaterial): void {
  Object.assign(mat.uniforms, shadowPatch.uniforms);
  mat.vertexShader = mustReplace(
    mustReplace(mat.vertexShader, 'varying vec2 vUv;', 'varying vec2 vUv;\nvarying vec3 vShW;', 'sprite 頂点 varying'),
    'vUv = uv;',
    'vUv = uv;\n  vShW = (modelMatrix * vec4(position, 1.0)).xyz;',
    'sprite 頂点 uv',
  );
  mat.fragmentShader = mustReplace(
    mustReplace(mat.fragmentShader, 'varying vec2 vUv;', `varying vec2 vUv;\nvarying vec3 vShW;\n${SHADOW_FRAG_PARS}`, 'sprite フラグメント varying'),
    'gl_FragColor = vec4(mix(uPalette[int(idx)], uMixColor, uMix) * uTint, 1.0);',
    // 影のこさは 見た目の明るさ（2.2 乗でリニアへ）。影の強さ 0 のときは 今と同じ。パリィの光のまぜ（uMix）は そのまま（#199）
    'float shK = 1.0;\n  if (uShP.x > 0.001) shK = pow(mix(1.0, uShP.y, (1.0 - shSunVis(vShW, uShL, false)) * uShP.x * uShSpriteDirect), 2.2);\n  gl_FragColor = vec4(mix(uPalette[int(idx)], uMixColor, uMix) * uTint * shK, 1.0);',
    'sprite フラグメント色',
  );
  mat.needsUpdate = true;
}
