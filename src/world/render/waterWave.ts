import type { MeshBasicMaterial } from 'three';
import { MAGMA_TUNING } from '../blocks/liquids';
import { ATLAS_COLS } from '../blocks/textures';
import { MAGMA_BOIL_FRAMES } from '../blocks/waterfallTextures';
import { FLOW_STRIPE } from '../blocks/waterFlow';
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

/**
 * 水 11 回め: 落ちる水の 横の 面に「下へ 流れる しろい すじ」。式は `flowStripe`（blocks/waterFlow.ts）と 同じ。
 * 横の 面かは 画面の 微分から 出す（面の 法線の y が 小さい）。水の 青い 絵（アトラス）だけに かける（マグマは 赤いので かからない）。
 * 時間は `uWaveTime`（ゆらめきと 同じ。一時停止で とまる）。material は 1 つの まま、描画回数は ふえない。`applyWaterWave` の あとで 呼ぶ。
 */
const FLOW_FRAG = `
{
  vec3 fn = cross(dFdx(vFlowPos), dFdy(vFlowPos));
  float side = 1.0 - step(0.5, abs(fn.y) / max(length(fn), 1e-6));
  float blue = clamp((diffuseColor.b - diffuseColor.r) * 4.0, 0.0, 1.0);
  float col = floor((vFlowPos.x + vFlowPos.z) * ${g(FLOW_STRIPE.columns)});
  float h = fract(sin(col * 12.9898) * 43758.5453);
  float on = 1.0 - step(${g(FLOW_STRIPE.density)}, h);
  float p = (vFlowPos.y + ${g(FLOW_STRIPE.speed)} * uWaveTime) * ${g(FLOW_STRIPE.repeat)} + fract(sin((col + 7.3) * 12.9898) * 43758.5453);
  float f = fract(p);
  float st = on * clamp(f / 0.08, 0.0, 1.0) * clamp((${g(FLOW_STRIPE.length)} - f) / ${g(FLOW_STRIPE.length * 0.8)}, 0.0, 1.0);
  float k = st * side * blue;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.97, 1.0), k * ${g(FLOW_STRIPE.white)});
  diffuseColor.a = max(diffuseColor.a, k * 0.8);
}`;

export function applyWaterFlow(material: MeshBasicMaterial): void {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    shader.uniforms.uWaveTime = waterWaveUniforms.uWaveTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlowPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFlowPos;\nuniform float uWaveTime;')
      .replace('#include <map_fragment>', `#include <map_fragment>${FLOW_FRAG}`);
  };
  material.customProgramCacheKey = () => `${prevKey.call(material)}-flow`;
}
