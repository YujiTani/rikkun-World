import type { MeshBasicMaterial } from 'three';
import { ripeMinBrightness } from './cropLight';
import { LIGHT_CONFIG as LC } from '../light/config';
import { skyDarkness } from '../light/skyDarkness';
import { YAKATA_BOX_MAX, YAKATA_LIGHT as YL } from '../light/yakataLight';
import { aoUniforms } from './voxel/aoUniforms';
import { patchAtlasShader, shadowCacheKey, shadowPatch } from './shadow/shadowPatch';

const f = (n: number): string => n.toFixed(4);

/** 頂点シェーダーの先頭に入れる: 光の曲線の関数（world/light/curve.ts と同じ式） */
export const LIGHT_GLSL_FUNCS = `
float skyCurve(float lv) {
  float t = clamp(lv, 0.0, 15.0) / 15.0;
  return ${f(LC.minBrightness)} + ${f(1 - LC.minBrightness)} * (t / (4.0 - 3.0 * t));
}
// #76 夜の倍率: mix(1, 夜の倍率, 夜の度合い × w)。raw = 時刻で弱める前の空の光（0〜15）。world/light/curve.ts の nightSkyFactor と同じ式
float skyNight(float raw) {
  return mix(1.0, ${f(LC.nightSkyMul)}, uNight * clamp(raw / ${f(LC.nightSkyFullLevel)}, 0.0, 1.0));
}
float blockTier(float lv) {
  if (lv <= 0.01) return 0.0;
  float dist = ${f(LC.torchLevel)} - lv;
  // 頂点の平均で値が中間になるので、境目を少しなめらかにする
  float bright = 1.0 - smoothstep(${f(LC.torchBrightRadius)}, ${f(LC.torchBrightRadius + 0.9)}, dist);
  float dim = 1.0 - smoothstep(${f(LC.torchDimRadius)}, ${f(LC.torchDimRadius + 0.9)}, dist);
  return max(bright * ${f(LC.torchBrightBrightness)}, dim * ${f(LC.torchDimBrightness)});
}
// MINE-1F: やかたの 中の 見え方（world/light/yakataLight.ts の 表と 同じ 式）。箱の 外は -1、中は 組の 番号（0 = maou・1 = otera）
uniform vec4 uYakataMin[${YAKATA_BOX_MAX}];
uniform vec4 uYakataMax[${YAKATA_BOX_MAX}];
uniform int uYakataN;
uniform float uYakataSway;
const vec3 YAKATA_TINT[2] = vec3[2](vec3(${YL.lookTint.maou.map(f).join(', ')}), vec3(${YL.lookTint.otera.map(f).join(', ')}));
float yakataLook(vec3 p) {
  for (int i = 0; i < uYakataN; i++) {
    if (all(greaterThanEqual(p, uYakataMin[i].xyz)) && all(lessThanEqual(p, uYakataMax[i].xyz))) return uYakataMin[i].w;
  }
  return -1.0;
}`;

/**
 * 空の光 sky（0〜15）とブロックの光 bl（0〜15）から、色にかける 3 つの数（明るさ × 暖かい色あい）を vec3 vLit に入れる。
 * 時刻は uniform（uDarken）で毎コマかけるだけ。メッシュは作り直さない。
 */
export const LIGHT_GLSL_LIT = `
  float s = max(skyIn * 15.0 - uDarken, 0.0);
  float sb = skyCurve(s) * skyNight(skyIn * 15.0);
  float bb = blockTier(blkIn * 15.0);
  float yk = uYakataN > 0 ? yakataLook(vWorld) : -1.0;
  if (yk < -0.5) {
    float w = clamp((bb - sb) * 3.0, 0.0, 1.0) * ${f(LC.warmTintStrength)};
    vec3 tint = mix(vec3(1.0), vec3(${f(LC.warmTint[0])}, ${f(LC.warmTint[1])}, ${f(LC.warmTint[2])}), w);
    vLit = vec3(max(sb, bb)) * tint;
  } else {
    // やかたの 中: 光 ${YL.dim.from}〜${YL.dim.to} の 所は ${f(YL.dim.shade)} より 暗く しない・光の 色は 組の 色で、${f(YL.dim.shade)} より 上の ぶんにだけ かける
    float bl = blkIn * 15.0;
    float inDim = step(${f(YL.dim.from - 0.5)}, bl) * (1.0 - step(${f(YL.dim.to + 0.5)}, bl));
    bb = max(bb, ${f(YL.dim.shade)} * inDim);
    float w = clamp((bb - sb) * 3.0, 0.0, 1.0) * ${f(LC.warmTintStrength)};
    vec3 tint = mix(vec3(1.0), YAKATA_TINT[int(yk + 0.5)], w);
    float v = max(sb, bb);
    vLit = vec3(min(v, ${f(YL.dim.shade)})) + vec3(max(v - ${f(YL.dim.shade)}, 0.0)) * tint * uYakataSway;
  }`;

/**
 * ブロックの材料に「頂点の光」を入れる。明るさ = max(空の光の曲線, ブロックの光の 3 だんかい)。
 * 時刻は uniform（uDarken）で毎コマかけるだけ。メッシュは作り直さない。
 */
export function applyLightShader(material: MeshBasicMaterial, cacheKey = 'rikkun-world-light'): void {
  material.userData.noDim = true; // sky/Lighting では暗くしない（ここで明るさを決める）
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDarken = skyDarkness.uniform;
    shader.uniforms.uNight = skyDarkness.nightUniform;
    shader.uniforms.uRipeMin = ripeMinBrightness;
    shader.uniforms.uAoOn = aoUniforms.on;
    shader.uniforms.uAoFade = aoUniforms.fade;
    shader.uniforms.uAoCenter = aoUniforms.center;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aLight;
attribute float aDark;
uniform float uDarken;
uniform float uNight;
uniform float uRipeMin;
uniform float uAoOn;
uniform vec2 uAoFade;
uniform vec2 uAoCenter;
${LIGHT_GLSL_FUNCS}`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
{
  float chalk = step(3.5, aLight.y);
  float ripe = step(1.5, aLight.y) - chalk;
  float s = max(aLight.x * 15.0 - uDarken, 0.0);
  float bl = (aLight.y - ripe * 2.0 - chalk * 4.0) * 15.0;
  float rmin = ripe * uRipeMin + chalk * ${f(LC.dollMin)}; // 明るさの 下限（みのった作物・チョークの しるし〔MINE-1B〕）
  float sb = skyCurve(s) * skyNight(aLight.x * 15.0);
  float bb = blockTier(bl);
  float w = clamp((bb - sb) * 3.0, 0.0, 1.0) * ${f(LC.warmTintStrength)};
  vec3 tint = mix(vec3(1.0), vec3(${f(LC.warmTint[0])}, ${f(LC.warmTint[1])}, ${f(LC.warmTint[2])}), w);
  // 角の暗がり（平らな箱の面。小ブロックの半径の外では 1.0 に消える）
  float aoD = aDark * uAoOn * (1.0 - smoothstep(uAoFade.x, uAoFade.y, length((modelMatrix * vec4(position, 1.0)).xz - uAoCenter)));
  vColor.rgb *= max(max(sb, bb), rmin) * tint * (1.0 - aoD);
}`,
      );
    if (shadowPatch.active) patchAtlasShader(shader); // SHADOW-1: 光に影をかける（作らないときは今のまま）
  };
  material.customProgramCacheKey = () => `${cacheKey}${shadowCacheKey()}`;
}
