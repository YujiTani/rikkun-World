// 影を受ける側（ブロック・キャラの板）に入れる GLSL と、みんなで同じものを指す uniform（SHADOW.md §5.3）。
// 影は「光」に 1 か所かけ算するだけ（shRatio）。面の明るさ・AO・テクスチャの色はさわらない（§10）。
import { Matrix4, Vector3, Vector4, type CubeTexture, type Texture } from 'three';
import { LIGHT_CONFIG as LC } from '../../light/config';

const f = (n: number): string => n.toFixed(4);

/** 受ける側の材料が みんなで同じものを指す uniform（値は ShadowSystem が毎コマ書く。three は { value } の入れ物をそのまま使う） */
export function createShadowUniforms() {
  return {
    uShMap0: { value: null as Texture | null },
    uShMap1: { value: null as Texture | null },
    uShMapD: { value: null as Texture | null },
    uShMat0: { value: new Matrix4() },
    uShMat1: { value: new Matrix4() },
    uShMatD: { value: new Matrix4() },
    /** x,y,z: 地図 0・1・動く物 の 1 目の大きさ（ブロック） */
    uShTexel: { value: new Vector3(0.03, 0.2, 0.03) },
    /** x,y,z: 地図 0・1・動く物 の 深さのはば（ブロック）。深さのずらしを 0..1 に直すため */
    uShRange: { value: new Vector3(320, 320, 320) },
    /** 光の来る向き（地面 → 太陽・月。長さ 1） */
    uShL: { value: new Vector3(0, 1, 0) },
    /** x: 影の強さ（0 で影なし）、y: 影の中の明るさ（見た目の明るさ 0..1）、z: 小ブロックの目（9 = 1/9 にそろえる） */
    uShP: { value: new Vector4(0, 0.55, 9, 0) },
    /** 昼の ブロックの光（たいまつ）の強さ（見た目の明るさ）。昼に たいまつが 影を消さないように、空が見える所だけ影のこさまで下げる */
    uShBlockDay: { value: 1 },
    /** 止まっている地図の 深さの ずらし（ブロック）。大きいと 小ブロックの 凸凹どうしの 小さい影が 消える */
    uShBias: { value: 0.22 },
    /** キャラの板の「じかの 日の光」の 割合（0..1。頭の高さの 空の光から。洞くつで 太陽の影にしない） */
    uShSpriteDirect: { value: 1 },
    /** たいまつの影（段 2）: x: 1 = 使う、y: 光のとどく半径（ブロック）、z: 影の中の明るさ（見た目 0..1）、w: 奥行きの符号の 1 ぶん（ブロック。地図の距離の 8bit を ブロックに戻す大きさ） */
    uShT: { value: new Vector4(0, 10, 0.3, 12) },
    /** 近い 2 本の たいまつの光の中心（xyz）と、使うか（w = 1）。地図は 光からの距離 ÷ w（uShT）を 赤に書いた キューブ地図 */
    uShTA: { value: new Vector4() },
    uShTB: { value: new Vector4() },
    uShCubeA: { value: null as CubeTexture | null },
    uShCubeB: { value: null as CubeTexture | null },
  };
}
export type ShadowUniforms = ReturnType<typeof createShadowUniforms>;

/** 受ける側の宣言と関数（フラグメントの #include <common> のあと） */
export const SHADOW_FRAG_PARS = /* glsl */ `
uniform highp sampler2DShadow uShMap0;
uniform highp sampler2DShadow uShMap1;
uniform highp sampler2DShadow uShMapD;
uniform mat4 uShMat0;
uniform mat4 uShMat1;
uniform mat4 uShMatD;
uniform vec3 uShTexel;
uniform vec3 uShRange;
uniform vec3 uShL;
uniform vec4 uShP;
uniform float uShBlockDay;
uniform float uShBias;
uniform float uShSpriteDirect;
uniform vec4 uShT;
uniform vec4 uShTA;
uniform vec4 uShTB;
uniform highp samplerCube uShCubeA;
uniform highp samplerCube uShCubeB;

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
  if (e0 > 0.8) {
    float off1 = max(0.5 / 9.0, uShTexel.y * 1.5);
    float v1 = shTap(uShMap1, uShMat1, p + n * off1, max(0.06, uShBias), uShRange.y, e1);
    v1 = mix(v1, 1.0, smoothstep(0.85, 1.0, e1));
    v = e0 < 1.0 ? mix(v0, v1, smoothstep(0.8, 1.0, e0)) : v1;
  } else {
    v = v0;
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

// たいまつ 1 本ぶん: 影の中 = 1 を num に、近さの重みを den に足す（キャラ・妖怪だけの 地図。8bit の距離 + 小さなずらし）。
// へりは 少しぼかす: 光に直角の 2 方向へ ±0.6 目ずらした 4 点の 平均（段 1 の 2×2 と同じくらい）。
void shTorchOne(highp samplerCube m, vec4 T, vec3 p, inout float num, inout float den) {
  if (T.w < 0.5) return;
  vec3 dv = p - T.xyz;
  float d = length(dv);
  float c = clamp(1.0 - d / uShT.y, 0.0, 1.0);
  if (c <= 0.0) return;
  vec3 a = normalize(cross(dv, abs(dv.y) < 0.9 * d ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = normalize(cross(dv, a));
  float e = d * (2.0 / 256.0) * 0.6; // 1 目の 大きさ（90° を 256 目）× 0.6
  float lit = 0.0;
  for (int i = 0; i < 4; i++) {
    float sx = (i & 1) == 0 ? -1.0 : 1.0;
    float sy = (i & 2) == 0 ? -1.0 : 1.0;
    float stored = texture(m, dv + (a * sx + b * sy) * e).r * uShT.w;
    lit += step(d - 0.12, stored);
  }
  num += c * (1.0 - lit * 0.25);
  den += c;
}

// たいまつの影の割合（0 = 影なし、1 = まるごと影）。近い 2 本を 近さの重みでまぜる。遠いほどうすい
float shTorchOcc(vec3 wp, vec3 n) {
  if (uShT.x < 0.5) return 0.0;
  vec3 p = wp + n * 0.06;
  float num = 0.0;
  float den = 0.0;
  shTorchOne(uShCubeA, uShTA, p, num, den);
  shTorchOne(uShCubeB, uShTB, p, num, den);
  return num / max(den, 0.35);
}

// 明るさ（空の光 s・ブロックの光 b・畑の下限 fl）と暖かい色あい。lightShader と同じ式
vec3 shLitOf(float s, float b, float fl) {
  float w = clamp((b - s) * 3.0, 0.0, 1.0) * ${f(LC.warmTintStrength)};
  vec3 tint = mix(vec3(1.0), vec3(${f(LC.warmTint[0])}, ${f(LC.warmTint[1])}, ${f(LC.warmTint[2])}), w);
  return vec3(max(max(s, b), fl)) * tint;
}

// 影を入れた光 ÷ 影なしの光。色（今の光の式の結果）にかけるだけ。影が弱いか、なければ 1。
// sb, bb: 空の光・ブロックの光の明るさ（曲線のあと）、sky: 空の光の段階（0..1、1 = 空が真上に見える）。
// 洞くつの おく など 空の光が まわりこんで来た所（段階 9 より下）は もう「じかに来る光」が ないので 影で さらに暗くしない
vec3 shRatio(float sb, float bb, float fl, float sky, vec3 wp, vec3 n) {
  if (uShP.x <= 0.001 && uShT.x < 0.5) return vec3(1.0);
  float direct = smoothstep(8.5 / 15.0, 12.5 / 15.0, sky);
  float vis = (direct > 0.0 && uShP.x > 0.001) ? shSunVis(wp, n, true) : 1.0;
  // たいまつの影: ブロックの光が 0 の所は引かない
  float tOcc = bb > 0.001 ? shTorchOcc(wp, n) : 0.0;
  // こさは 見た目（sRGB）の明るさで決める: 色は リニアでかけるので 2.2 乗にする
  float sbs = sb * pow(mix(1.0, uShP.y, (1.0 - vis) * uShP.x * direct), 2.2);
  // 昼の たいまつ は 空が見える所（sb が大きい）だけ 影のこさまで弱める: 洞くつの たいまつ は そのまま
  float bbs = bb * pow(mix(1.0, uShBlockDay, smoothstep(0.25, 0.85, sb)), 2.2) * pow(mix(1.0, uShT.z, tOcc), 2.2);
  return shLitOf(sbs, bbs, fl) / max(shLitOf(sb, bb, fl), vec3(0.0001));
}
`;

/** 頂点 → フラグメントへ渡すもの（箱の材料は vWorld があるので vShW は 絵の板だけ） */
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
