import { ShaderMaterial, type Data3DTexture } from 'three';
import { RENDER_CONFIG } from '../../world/render/config';
import { TEX_N } from './shapeTexture';

/**
 * 小ブロックのメッシュ用の材料（光なし）。attribute aData = [r, g, b, 面の番号]。
 * - 色の方式: r, g, b が色（sRGB）。
 * - 形の方式（shape）: r = ブロックの種類。色はワールドの小ブロック座標から 3D テクスチャを引く。
 * 面の明るさは今と同じ（上 1.0・横 0.8・下 0.6）。
 */
const VERT = /* glsl */ `
attribute vec4 aData;
varying float vShade;
#ifdef SHAPE
flat varying float vKind;
varying vec3 vTex;
#else
varying vec3 vCol;
#endif
const vec3 NRM[6] = vec3[6](
  vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(1.0, 0.0, 0.0),
  vec3(-1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0));
void main() {
  int f = int(aData.w + 0.5);
  vShade = f == 0 ? ${RENDER_CONFIG.brightnessTop.toFixed(2)} : (f == 1 ? ${RENDER_CONFIG.brightnessBottom.toFixed(2)} : ${RENDER_CONFIG.brightnessSide.toFixed(2)});
#ifdef SHAPE
  vKind = aData.x;
  // 面のすぐ内側の小ブロックの座標（9 倍）。負にならないよう 27 の倍数を足す
  vTex = position * 9.0 - NRM[f] * 0.5 + vec3(0.001) + vec3(2700.0);
#else
  vCol = pow(aData.xyz / 255.0, vec3(2.2));
#endif
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
varying float vShade;
#ifdef SHAPE
flat varying float vKind;
varying vec3 vTex;
uniform highp sampler3D uTex;
#else
varying vec3 vCol;
#endif
void main() {
#ifdef SHAPE
  ivec3 t = ivec3(floor(vTex)) % ${TEX_N};
  t.z += ${TEX_N} * int(vKind + 0.5);
  vec3 c = pow(texelFetch(uTex, t, 0).rgb, vec3(2.2));
#else
  vec3 c = vCol;
#endif
  gl_FragColor = vec4(c * vShade, 1.0);
#include <colorspace_fragment>
}`;

export function createVoxelMaterial(shapeTexture?: Data3DTexture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: shapeTexture ? { SHAPE: 1 } : {},
    uniforms: shapeTexture ? { uTex: { value: shapeTexture } } : {},
  });
}
