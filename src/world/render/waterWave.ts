import type { MeshBasicMaterial } from 'three';
import { MAGMA_TUNING } from '../blocks/liquids';
import { ATLAS_COLS } from '../blocks/textures';
import { MAGMA_BOIL_FRAMES } from '../blocks/waterfallTextures';
import { WAVE_AMP, WAVE_LENGTH, WAVE_PERIOD } from '../blocks/water';

/**
 * WATER-1 §3 ゆらめき: 水の 材料に「時間の uniform 1 つ」を 足して、水面の 頂点(頂点の 印 `aWave` = 1)を 下向きに ゆらす。
 * 式は `waveOffset(wx, wz, t)`（blocks/water.ts）と 同じ 定数・同じ 形。世界の 座標で 決まるので つぎめが 切れない。
 * メッシュは 時間にも 波の はばにも よらない(描画回数・三角形は ふえない)。
 */
export const waterWaveUniforms = { uWaveTime: { value: 0 }, uWaveAmp: { value: WAVE_AMP } };

/** 設定フック(`settings.get/set('waveAmp')`)の 入れ物(§4.1)。毎ステップ uniform に 写す(メッシュは かわらない) */
export const waterSettings: { waveAmp: number } = { waveAmp: WAVE_AMP };

const g = (n: number): string => n.toFixed(7);
const TAU = Math.PI * 2;

const WAVE_GLSL = `
{
  vec4 wp = modelMatrix * vec4(position, 1.0);
  // WATERFALL-1: 印が 1 より 小さい 頂点（マグマ）は ゆっくり ゆれる
  // 版 2: 印が 1.5 以上 = 煮えたぎる マグマ（印 − 2 が ゆれの 印）
  float boil = step(1.5, aWave);
  float mk = aWave - 2.0 * boil;
  float sp = mk > 0.99 ? 1.0 : ${g(MAGMA_TUNING.waveSpeedMul)};
  float ph = (wp.x + wp.z * 0.7) * ${g(TAU / WAVE_LENGTH)} + uWaveTime * sp * ${g(TAU / WAVE_PERIOD)};
  transformed.y -= mk * uWaveAmp * (1.0 + sin(ph)) * 0.5;
}`;

/** 版 2: 煮えたぎる マグマの 頂点は UV を 1 コマ（アトラスの 1 だん = 1/ATLAS_COLS）ずつ 横に ずらす。メッシュは 作り直さない */
const BOIL_GLSL = `
#ifdef USE_MAP
if (aWave > 1.5) vMapUv.x += floor(mod(uWaveTime * ${g(MAGMA_TUNING.boilFps)}, ${g(MAGMA_BOIL_FRAMES)})) * ${g(1 / ATLAS_COLS)};
#endif`;

/** `applyLightShader` の あとで 呼ぶ(その onBeforeCompile を 包む) */
export function applyWaterWave(material: MeshBasicMaterial): void {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uWaveTime = waterWaveUniforms.uWaveTime;
    shader.uniforms.uWaveAmp = waterWaveUniforms.uWaveAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWave;\nuniform float uWaveTime;\nuniform float uWaveAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>${WAVE_GLSL}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>${BOIL_GLSL}`);
  };
  material.customProgramCacheKey = () => `${prevKey.call(material)}-wave`;
}
