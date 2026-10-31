import type { MeshBasicMaterial } from 'three';
import { WAVE_AMP, WAVE_LENGTH, WAVE_PERIOD } from '../blocks/water';

/**
 * WATER-1 §3 ゆらめき: 水の 材料に「時間の uniform 1 つ」を 足して、水面の 頂点(頂点の 印 `aWave` = 1)を 下向きに ゆらす。
 * 式は `waveOffset(wx, wz, t)`（blocks/water.ts）と 同じ 定数・同じ 形。世界の 座標で 決まるので つぎめが 切れない。
 * メッシュは 時間にも 波の はばにも よらない(描画回数・三角形は ふえない)。
 */
export const waterWaveUniforms = { uWaveTime: { value: 0 } };

const g = (n: number): string => n.toFixed(7);
const TAU = Math.PI * 2;

export const WAVE_GLSL = `
{
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float ph = (wp.x + wp.z * 0.7) * ${g(TAU / WAVE_LENGTH)} + uWaveTime * ${g(TAU / WAVE_PERIOD)};
  transformed.y -= aWave * ${g(WAVE_AMP)} * (1.0 + sin(ph)) * 0.5;
}`;

/** `applyLightShader` の あとで 呼ぶ(その onBeforeCompile を 包む) */
export function applyWaterWave(material: MeshBasicMaterial): void {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uWaveTime = waterWaveUniforms.uWaveTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWave;\nuniform float uWaveTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>${WAVE_GLSL}`);
  };
  material.customProgramCacheKey = () => `${prevKey.call(material)}-wave`;
}
