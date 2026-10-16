// #144 影の試作（本番ではない。?shadow=1 のときだけ使う）。
// 影を受ける側（ブロック・キャラの板）に入れる GLSL と、みんなで同じものを指す uniform。
import { Matrix4, Vector3, Vector4, type Texture } from 'three';
import { LIGHT_CONFIG as LC } from '../../world/light/config';

const f = (n: number): string => n.toFixed(4);

/** 点光源（たいまつ）の影の地図の数の上限（GLSL の配列の大きさ） */
export const MAX_TORCH_SHADOWS = 2;
/** 丸い影の数の上限 */
export const MAX_BLOBS = 4;

/**
 * 受ける側の材料が みんなで同じものを指す uniform（値は SunShadow / TorchShadow が毎コマ書く）。
 * three は uniform の入れ物（{ value }）をそのまま使うので、ここで 1 つ作って全部の材料に配る。
 */
export function createShadowUniforms() {
  return {
    uShMap0: { value: null as Texture | null },
    uShMap1: { value: null as Texture | null },
    uShMapD: { value: null as Texture | null },
    uShMat0: { value: new Matrix4() },
    uShMat1: { value: new Matrix4() },
    uShMatD: { value: new Matrix4() },
    /** x,y,z: 地図 0・1・動く物 の 1 テクセルの大きさ（ブロック）。w: 地図の数（1 か 2） */
    uShTexel: { value: new Vector4(0.03, 0.2, 0.03, 2) },
    /** x,y,z: 地図 0・1・動く物 の 深さのはば（ブロック）。深さのずらしを 0..1 に直すため */
    uShRange: { value: new Vector3(320, 320, 320) },
    /** 光の来る向き（地面 → 太陽・月。長さ 1） */
    uShL: { value: new Vector3(0, 1, 0) },
    /** x: 影の強さ（太陽・月の高さと昼夜。0 で影なし）、y: 影の中の明るさ（こさ。見た目の明るさ 0..1）、z: 小ブロックの目（9 = 1/9 にそろえる。0 = しない）、w: たいまつの影の中の明るさ */
    uShP: { value: new Vector4(0, 0.55, 9, 0.35) },
    /** 丸い影: (x, 足の高さ, z, 半径)。半径 0 は なし */
    uShBlob: { value: Array.from({ length: MAX_BLOBS }, () => new Vector4(0, 0, 0, 0)) },
    /** 丸い影のこさ（0..1） */
    uShBlobK: { value: 0.35 },
    /** たいまつの影: (x, y, z, とどく距離)。距離 0 は なし。2 つ あれば 近い方を 重く数えて まぜる */
    uShTorch: { value: Array.from({ length: MAX_TORCH_SHADOWS }, () => new Vector4(0, 0, 0, 0)) },
    uShTorchMap0: { value: null as Texture | null },
    uShTorchMap1: { value: null as Texture | null },
    /** 昼の ブロックの光（たいまつ）の強さ（見た目の明るさ。太陽が強いほど 影のこさ まで下げる: 昼の影を たいまつが消さないように。空の光が あたる所だけ） */
    uShBlockDay: { value: 1 },
    /** 止まっている地図の 深さの ずらし（ブロック）。大きいと 小ブロックの 凸凹どうしの 小さい影が 消える（ブロックの影は のこる） */
    uShBias: { value: 0.22 },
    /** キャラの板の「じかの 日の光」の 割合（0..1。頭の高さの 空の光から） */
    uShSpriteDirect: { value: 1 },
    /** 調べる用: 1 = 動く物の地図の答え、2 = 止まっている地図の答え、3 = たいまつの地図の答え を色で出す */
    uShDebug: { value: 0 },
  };
}
export type ShadowUniforms = ReturnType<typeof createShadowUniforms>;

/** 受ける側の宣言と関数（フラグメントの #include <common> のあと） */
export const SHADOW_FRAG_PARS = /* glsl */ `
uniform highp sampler2DShadow uShMap0;
uniform highp sampler2DShadow uShMap1;
uniform highp sampler2DShadow uShMapD;
uniform highp samplerCubeShadow uShTorchMap0;
uniform highp samplerCubeShadow uShTorchMap1;
uniform mat4 uShMat0;
uniform mat4 uShMat1;
uniform mat4 uShMatD;
uniform vec4 uShTexel;
uniform vec3 uShRange;
uniform vec3 uShL;
uniform vec4 uShP;
uniform vec4 uShBlob[${MAX_BLOBS}];
uniform float uShBlobK;
uniform vec4 uShTorch[${MAX_TORCH_SHADOWS}];
uniform float uShDebug;
uniform float uShBlockDay;
uniform float uShBias;
uniform float uShSpriteDirect;

// 1 枚の地図を引く。edge: 地図の真ん中 0 〜 へり 1（外は 1 より大きい）
float shTap(highp sampler2DShadow m, mat4 M, vec3 p, float biasWorld, float range, out float edge) {
  vec3 q = (M * vec4(p, 1.0)).xyz;
  vec2 d = abs(q.xy - 0.5) * 2.0;
  edge = max(max(d.x, d.y), step(1.0, q.z) * 2.0);
  // 地図の外は 読まない（画素ごとの 読みこみを へらす）
  if (edge >= 1.0) return 1.0;
  return texture(m, vec3(q.xy, q.z - biasWorld / range));
}

// 小ブロックの目（1/9）の面の真ん中にそろえる: 影のへりが ドットの段になる
vec3 shSnap(vec3 wp, vec3 n) {
  if (uShP.z < 0.5) return wp;
  return (floor(wp * uShP.z - n * 0.5) + 0.5 + n * 0.5) / uShP.z;
}

// 太陽・月の光が とどく割合（1 = 日なた、0 = 影）
float shSunVis(vec3 wp, vec3 n, bool useDyn) {
  if (uShP.x <= 0.001) return 1.0;
  vec3 p = shSnap(wp, n);
  float e0, e1, ed;
  float off0 = max(0.5 / 9.0, uShTexel.x * 1.5);
  float v = 1.0;
  float v0 = shTap(uShMap0, uShMat0, p + n * off0, uShBias, uShRange.x, e0);
  if (uShTexel.w > 1.5 && e0 > 0.8) {
    float off1 = max(0.5 / 9.0, uShTexel.y * 1.5);
    float v1 = shTap(uShMap1, uShMat1, p + n * off1, max(0.06, uShBias), uShRange.y, e1);
    v1 = mix(v1, 1.0, smoothstep(0.85, 1.0, e1));
    v = e0 < 1.0 ? mix(v0, v1, smoothstep(0.8, 1.0, e0)) : v1;
  } else if (uShTexel.w > 1.5) {
    v = v0;
  } else {
    v = mix(v0, 1.0, smoothstep(0.8, 1.0, e0));
  }
  if (useDyn) {
    float offd = max(0.5 / 9.0, uShTexel.z * 1.5);
    float vd = shTap(uShMapD, uShMatD, p + n * offd, 0.02, uShRange.z, ed);
    v = min(v, mix(vd, 1.0, smoothstep(0.85, 1.0, ed)));
  }
  // 光に背を向けた面（地図の手前ずらしで光がもれるのを止める）
  v *= smoothstep(-0.12, 0.0, dot(n, uShL));
  return v;
}

// たいまつの光が とどく割合。近くの たいまつ ほど 重く数える（ほかの たいまつ が 影を すこし うすくする）
vec2 shTorchOne(highp samplerCubeShadow m, vec4 t, vec3 p) {
  if (t.w <= 0.0) return vec2(0.0);
  vec3 v = p - t.xyz;
  vec3 a = abs(v);
  float z = max(max(a.x, a.y), a.z);
  if (z >= t.w || z < 0.06) return vec2(0.0);
  float nearZ = 0.05;
  float dp = (t.w * (z - nearZ)) / (z * (t.w - nearZ));
  float w = clamp(1.0 - length(v) / t.w, 0.0, 1.0);
  return vec2(texture(m, vec4(normalize(v), dp - 0.0004)) * w, w);
}
float shTorchVis(vec3 wp, vec3 n) {
  vec3 p = shSnap(wp, n) + n * 0.08;
  vec2 s = shTorchOne(uShTorchMap0, uShTorch[0], p) + shTorchOne(uShTorchMap1, uShTorch[1], p);
  return s.y > 0.0001 ? s.x / s.y : 1.0;
}

// 丸い影（キャラ・妖怪の足もと。上を向いた面だけ）
float shBlob(vec3 wp, vec3 n) {
  if (n.y < 0.5 || uShBlobK <= 0.0) return 0.0;
  vec3 p = shSnap(wp, n);
  float s = 0.0;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    vec4 b = uShBlob[i];
    if (b.w <= 0.0) continue;
    float h = b.y - p.y;
    if (h < -0.06 || h > 3.0) continue;
    float d = length(p.xz - b.xz);
    float a = (1.0 - smoothstep(b.w * 0.55, b.w, d)) * (1.0 - clamp(h / 3.0, 0.0, 1.0));
    s = max(s, a);
  }
  return s;
}

// 空の光の明るさ sb・ブロックの光の明るさ bb（lightShader と同じ曲線のあと）から、影を入れた明るさ。
// sky: 空の光の だんかい（0..1、1 = 空が真上に見える）。洞くつの おく など 空の光が まわりこんで来た所（9 より下）は
// もう「じかに来る光」が ないので、太陽の影で さらに暗くしない
vec3 shLit(float sb, float bb, float floorB, float sky, vec3 wp, vec3 n) {
  if (uShDebug > 0.5) {
    vec3 p = shSnap(wp, n);
    float e;
    if (uShDebug < 1.5) return vec3(shTap(uShMapD, uShMatD, p + n * 0.06, 0.02, uShRange.z, e), e < 1.0 ? 0.5 : 0.0, 0.0);
    if (uShDebug > 2.5) return vec3(shTorchVis(wp, n), 0.3, bb);
    return vec3(shTap(uShMap0, uShMat0, p + n * 0.06, 0.02, uShRange.x, e), e < 1.0 ? 0.5 : 0.0, 0.0);
  }
  float direct = smoothstep(8.5 / 15.0, 12.5 / 15.0, sky);
  // じかの 日の光が ない所（洞くつの おく）・影の 強さ 0 は 地図を 読まない
  float vis = direct * uShP.x > 0.0 ? shSunVis(wp, n, true) : 1.0;
  // こさは 見た目（sRGB）の明るさで決める: 色は リニアでかけるので 2.2 乗にする
  float sbs = sb * pow(mix(1.0, uShP.y, (1.0 - vis) * uShP.x * direct), 2.2);
  // 昼の たいまつ は 空が見える所（sb が大きい）だけ 弱める: 洞くつの たいまつ は そのまま
  float bbs = bb * pow(mix(1.0, uShBlockDay, smoothstep(0.25, 0.85, sb)), 2.2);
  if (bb > 0.0) bbs *= pow(mix(uShP.w, 1.0, shTorchVis(wp, n)), 2.2);
  float w = clamp((bbs - sbs) * 3.0, 0.0, 1.0) * ${f(LC.warmTintStrength)};
  vec3 tint = mix(vec3(1.0), vec3(${f(LC.warmTint[0])}, ${f(LC.warmTint[1])}, ${f(LC.warmTint[2])}), w);
  return vec3(max(max(sbs, bbs), floorB)) * tint * pow(1.0 - shBlob(wp, n) * uShBlobK, 2.2);
}
`;

/** 頂点 → フラグメントへ渡すもの */
export const SHADOW_VARYINGS = /* glsl */ `
varying vec3 vShW;
varying vec3 vShN;
varying float vShSB;
varying float vShBB;
varying float vShFloor;
varying float vShSky;
`;

/** 面の向きがない材料（絵の板・LOD）で、フラグメントで面の向きを出す（カメラの側を向ける） */
export const SHADOW_DERIV_NORMAL = /* glsl */ `
vec3 shDerivNormal(vec3 wp) {
  vec3 n = normalize(cross(dFdx(wp), dFdy(wp)));
  if (dot(n, cameraPosition - wp) < 0.0) n = -n;
  return n;
}
`;
