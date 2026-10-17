import { Color, ShaderMaterial, type Data3DTexture } from 'three';
import { TEX_N } from './shapeTexture';

/**
 * 小ブロックのメッシュ用の材料（光なし）。attribute aData = [r, g, b, 面の番号]。
 * position は チャンクの中の小ブロック座標（Uint16）。mesh.scale = 1/9、mesh.position = チャンクの位置で ワールドに置く。
 * - 色の方式: r, g, b が色（sRGB）。
 * - 形の方式（shape）: r = ブロックの種類。色はワールドの小ブロック座標から 3D テクスチャを引く。
 * 面の明るさは今と同じ（上 1.0・横 0.8・下 0.6）。
 */
const VERT = /* glsl */ `
attribute vec4 aData;
varying float vShade;
varying float vDepth;
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
  vShade = f == 0 ? 1.00 : (f == 1 ? 0.60 : 0.80);
#ifdef SHAPE
  vKind = aData.x;
  // 面のすぐ内側の小ブロックの座標（9 倍）。負にならないよう 27 の倍数を足す
  // position は チャンクの中の小ブロック座標。mesh.position（= チャンクの位置）を 9 倍して足すと ワールドの小ブロック座標
  vTex = position + modelMatrix[3].xyz * 9.0 - NRM[f] * 0.5 + vec3(0.001) + vec3(2700.0);
#else
  vCol = pow(aData.xyz / 255.0, vec3(2.2));
#endif
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying float vShade;
varying float vDepth;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
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
  c = mix(c * vShade, uFogColor, smoothstep(uFogNear, uFogFar, vDepth));
  gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`;

/** 霧（Look の fog）。three の Fog と同じ線形の色で、近い距離から遠い距離へ 空の色にとかす */
export function setVoxelFog(mat: ShaderMaterial, fog: { color: number; near: number; far: number }): void {
  (mat.uniforms.uFogColor.value as Color).set(fog.color);
  mat.uniforms.uFogNear.value = fog.near;
  mat.uniforms.uFogFar.value = fog.far;
}

export function createVoxelMaterial(shapeTexture?: Data3DTexture): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: shapeTexture ? { SHAPE: 1 } : {},
    uniforms: {
      uFogColor: { value: new Color(0xffffff) },
      uFogNear: { value: 1e6 },
      uFogFar: { value: 2e6 },
      ...(shapeTexture ? { uTex: { value: shapeTexture } } : {}),
    },
  });
}
