import { MeshBasicMaterial, type Data3DTexture } from 'three';
import { TEX_N } from '../../../proto/voxel/shapeTexture';
import { RENDER_CONFIG } from '../config';
import { LIGHT_GLSL_FUNCS, LIGHT_GLSL_LIT } from '../lightShader';
import { skyDarkness } from '../../light/skyDarkness';

/**
 * 小ブロック・箱のメッシュ用の材料（VOX-E）。試作 `proto/voxel/voxelMaterial.ts` を ゲーム本体の霧・光・昼夜に合わせたもの。
 * - 頂点: position = セクションの中の小ブロック座標（Uint16）。mesh.scale = 1/9、mesh.position = セクションの位置で ワールドに置く。
 * - aData = [r, g, b, 面の番号 (+8 なら 色の面)]。形の面は r = ブロックの種類（色は 3D テクスチャを引く）。色の面は r, g, b が色（sRGB）。
 * - aLight = [空の光, ブロックの光]（0〜1 に正規化した Uint8。15 を 17 倍して 255）。昼夜は uniform（uDarken）で毎コマ。
 * - 面の明るさは今と同じ（上 1.0・横 0.8・下 0.6）。霧・色の出力は three の MeshBasicMaterial のまま。
 */
const VERT_DECL = `
attribute vec4 aData;
attribute vec2 aLight;
uniform float uDarken;
varying float vShade;
varying vec3 vLit;
varying vec3 vCol;
varying vec3 vTex;
flat varying float vKind;
flat varying float vIsCol;
const vec3 NRM[6] = vec3[6](
  vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(1.0, 0.0, 0.0),
  vec3(-1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0));
${LIGHT_GLSL_FUNCS}`;

const VERT_BODY = `
{
  float fw = aData.w + 0.5;
  float isCol = step(8.0, fw);
  int f = int(fw - isCol * 8.0);
  vShade = f == 0 ? ${RENDER_CONFIG.brightnessTop.toFixed(2)} : (f == 1 ? ${RENDER_CONFIG.brightnessBottom.toFixed(2)} : ${RENDER_CONFIG.brightnessSide.toFixed(2)});
  vIsCol = isCol;
  vKind = aData.x;
  vCol = pow(aData.xyz / 255.0, vec3(2.2));
  // 面のすぐ内側の小ブロックの座標（9 倍）。負にならないよう 27 の倍数を足す
  vTex = position + modelMatrix[3].xyz * 9.0 - NRM[f] * 0.5 + vec3(0.001) + vec3(2700.0);
  float skyIn = aLight.x;
  float blkIn = aLight.y;
  ${LIGHT_GLSL_LIT}
}`;

const FRAG_DECL = `
varying float vShade;
varying vec3 vLit;
varying vec3 vCol;
varying vec3 vTex;
flat varying float vKind;
flat varying float vIsCol;
uniform highp sampler3D uTex;`;

const FRAG_BODY = `
{
  vec3 c = vCol;
  if (vIsCol < 0.5) {
    ivec3 t = ivec3(floor(vTex)) % ${TEX_N};
    t.z += ${TEX_N} * int(vKind + 0.5);
    c = pow(texelFetch(uTex, t, 0).rgb, vec3(2.2));
  }
  diffuseColor.rgb *= c * vShade * vLit;
}`;

export function createVoxelMaterial(shapeTexture: Data3DTexture): MeshBasicMaterial {
  const m = new MeshBasicMaterial({});
  m.userData.noDim = true; // sky/Lighting では暗くしない（ここで明るさを決める）
  m.userData.voxelTexture = shapeTexture;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDarken = skyDarkness.uniform;
    shader.uniforms.uTex = { value: m.userData.voxelTexture };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_BODY}`);
  };
  m.customProgramCacheKey = () => 'rikkun-voxel';
  return m;
}
