import { Data3DTexture, MeshBasicMaterial, NearestFilter, RedIntegerFormat, UnsignedByteType, Vector3, type Texture } from 'three';
import { TILE_NAMES, ATLAS_COLS } from '../../blocks/textures';
import { BLOCK_INDEX } from '../../blocks/blockTypes';
import { skyDarkness } from '../../light/skyDarkness';
import { AO_LEVELS, FACE_SHADE_BY_INDEX } from '../config';
import { LIGHT_GLSL_FUNCS, LIGHT_GLSL_LIT } from '../lightShader';
import { OCC_NY, OCC_NZ, OCC_W } from './ao';
import { aoUniforms } from './aoUniforms';
import { FADE_FAR, FADE_NEAR, KINDS, tileAverageTable, tileTable } from './projection';

/**
 * 小ブロック・箱のメッシュ用の材料（TEX-A）。色 = 16×16 の絵（atlas）の画素 × 面の明るさ × 角の暗がり（AO）× 光。
 * - 頂点: position = セクションの中の小ブロック座標（Uint16）。mesh.scale = 1/9、mesh.position = セクションの位置で ワールドに置く。
 * - aData = [ブロックの種類, 地形の横の面の行の符号（255 = 世界の高さで決める）, 0, 面の番号]。
 * - aLight = [空の光, ブロックの光]（0〜1 に正規化した Uint8。15 を 17 倍して 255）。昼夜は uniform（uDarken）で毎コマ。
 * - 絵: 面の向きで [上, 下, 横] のタイル（uTileOf）を選び、ワールド座標の小数部から 16×16 の画素を texelFetch（atlas は sRGB の
 *   テクスチャなので 読むと 線形になる）。式の TS 写しは projection.ts（`render.texelAt`）。
 * - 遠く: 40 → 80 ブロックで 画素の色を タイルの平均色へよせる（ちらつき止め）。
 * - AO: セクションごとの「うまり」の 3D テクスチャ（uAo。ao.ts）から 面の前の層の となり 8 こを読んで 4 すみの段を出し、
 *   面の中は 双線形。三角形は ふえない。半径 r の 8 ブロック手前から 1.0 へ消す。TS 写しは ao.ts（`render.aoAt`）。
 * - 面の明るさ・AO の値・霧・色の出力は three の MeshBasicMaterial のまま。
 */
const SHADE_GLSL = `float[6](${FACE_SHADE_BY_INDEX.map((v) => v.toFixed(2)).join(', ')})`;
const AO_GLSL = AO_LEVELS.map((v) => v.toFixed(2));
const N_TILES = TILE_NAMES.length;
/** 面を ひろげる量（小ブロック。1/9 ブロックの 0.03）。つぎ目の 1 画素の すきまを ふさぐ */
const GROW = 0.03;
const DIRT_TILE = TILE_NAMES.indexOf('dirt');

const VERT_DECL = `
attribute vec4 aData;
attribute vec2 aLight;
uniform float uDarken;
uniform vec3 uTileOf[${KINDS}];
uniform vec3 uTileAvg[${N_TILES}];
varying float vShade;
varying vec3 vLit;
varying vec3 vWorld;
varying vec3 vLocal;
flat varying vec4 vInfo;
flat varying vec3 vAvg;
vec3 voxGrow = vec3(0.0);
const float SHADE[6] = ${SHADE_GLSL};
const vec3 NRM[6] = vec3[6](
  vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(1.0, 0.0, 0.0),
  vec3(-1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0));
${LIGHT_GLSL_FUNCS}`;

const VERT_BODY = `
{
  int f = int(aData.w + 0.5);
  // 面を 面の中の向きに ごく少し ひろげる（つぎ目の 1 画素の すきまを ふさぐ）。計算は ひろげる前の位置で
  float cb = aData.z + 0.5;
  vec3 corner = vec3(mod(floor(cb), 2.0), mod(floor(cb / 2.0), 2.0), mod(floor(cb / 4.0), 2.0)) * 2.0 - 1.0;
  voxGrow = corner * (vec3(1.0) - abs(NRM[f])) * ${GROW.toFixed(3)};
  int kind = int(aData.x + 0.5);
  float tile = uTileOf[kind][f == 0 ? 0 : (f == 1 ? 1 : 2)];
  vShade = SHADE[f];
  vInfo = vec4(tile, aData.y, float(f), aData.x);
  vAvg = tile < -0.5 ? vec3(1.0) : uTileAvg[int(tile + 0.5)];
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vLocal = position;
  float skyIn = aLight.x;
  float blkIn = aLight.y;
  ${LIGHT_GLSL_LIT}
}`;

const FRAG_DECL = `
varying float vShade;
varying vec3 vLit;
varying vec3 vWorld;
varying vec3 vLocal;
flat varying vec4 vInfo;
flat varying vec3 vAvg;
uniform sampler2D uAtlas;
uniform highp usampler3D uAo;
uniform float uHasAo;
uniform float uAoOn;
uniform vec2 uAoFade;
const vec3 NRM_F[6] = vec3[6](
  vec3(0.0, 1.0, 0.0), vec3(0.0, -1.0, 0.0), vec3(1.0, 0.0, 0.0),
  vec3(-1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0));
bool occ(ivec3 p) {
  ivec3 t = p + ivec3(1);
  uint b = texelFetch(uAo, ivec3(t.x >> 3, t.z, t.y), 0).r;
  return ((b >> uint(t.x & 7)) & 1u) != 0u;
}
float aoCorner(bool s1, bool s2, bool c) {
  int k = (s1 && s2) ? 3 : (int(s1) + int(s2) + int(c));
  return k == 0 ? ${AO_GLSL[0]} : (k == 1 ? ${AO_GLSL[1]} : (k == 2 ? ${AO_GLSL[2]} : ${AO_GLSL[3]}));
}`;

const FRAG_BODY = `
{
  // 見おろし距離は フラグメントで 1 回だけ（大きな面でも 合う）
  float vDist = length(vWorld.xz - cameraPosition.xz);
  int face = int(vInfo.z + 0.5);
  vec3 nrm = NRM_F[face];
  // 絵: 面の向き → 画素（projection.ts pixelInTile と同じ）
  vec3 fr = fract(vWorld - nrm * 0.001);
  float u = face == 2 ? 1.0 - fr.z : (face == 3 ? fr.z : (face == 5 ? 1.0 - fr.x : fr.x));
  float v = face == 0 ? fr.z : (face == 1 ? 1.0 - fr.z : 1.0 - fr.y);
  float tile = vInfo.x;
  float py = floor(v * 16.0);
  if (vInfo.y < 254.5 && face >= 2) {
    // 小ブロック地形の横: 絵の行 = 地面のてっぺんからの深さ（16/9 行 / 小ブロック）
    py = floor((vInfo.y + 1.0 - fract((vWorld.y - nrm.y * 0.001) * 9.0)) * 16.0 / 9.0);
    if (py >= 16.0) {
      py = mod(py, 16.0);
      if (abs(vInfo.w - ${BLOCK_INDEX.grass}.0) < 0.5) tile = ${DIRT_TILE}.0;
    }
  }
  py = clamp(py, 0.0, 15.0);
  float px = clamp(floor(u * 16.0), 0.0, 15.0);
  vec3 c = vec3(1.0, 0.0, 1.0);
  if (vDist >= ${FADE_FAR.toFixed(1)}) {
    c = vAvg; // 遠くは 絵を引かない（かすみで平均の色になるので同じ）
  } else if (tile > -0.5) {
    float tcol = mod(tile, ${ATLAS_COLS}.0);
    float trow = floor(tile / ${ATLAS_COLS}.0);
    c = texelFetch(uAtlas, ivec2(int(tcol * 16.0 + px), int(trow * 16.0 + 15.0 - py)), 0).rgb;
  }
  if (vDist < ${FADE_FAR.toFixed(1)}) c = mix(c, vAvg, smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, vDist));
  // 角の暗がり（AO）
  float ao = 1.0;
  if (uHasAo > 0.5 && uAoOn > 0.5) {
    float fk = 1.0 - smoothstep(uAoFade.x, uAoFade.y, vDist);
    if (fk > 0.0) {
      vec3 lp = vLocal;
      ivec3 cell = ivec3(floor(lp - 0.5 * nrm + 0.001));
      ivec3 fcell = cell + ivec3(nrm);
      ivec3 A = face < 2 ? ivec3(1, 0, 0) : (face < 4 ? ivec3(0, 0, 1) : ivec3(1, 0, 0));
      ivec3 B = face < 2 ? ivec3(0, 0, 1) : (face < 4 ? ivec3(0, 1, 0) : ivec3(0, 1, 0));
      vec3 rel = lp - vec3(cell);
      float fa = clamp(dot(rel, vec3(A)), 0.0, 1.0);
      float fb = clamp(dot(rel, vec3(B)), 0.0, 1.0);
      bool am = occ(fcell - A);
      bool ap = occ(fcell + A);
      bool bm = occ(fcell - B);
      bool bp = occ(fcell + B);
      float v00 = aoCorner(am, bm, occ(fcell - A - B));
      float v10 = aoCorner(ap, bm, occ(fcell + A - B));
      float v01 = aoCorner(am, bp, occ(fcell - A + B));
      float v11 = aoCorner(ap, bp, occ(fcell + A + B));
      ao = mix(1.0, mix(mix(v00, v10, fa), mix(v01, v11, fa), fb), fk);
    }
  }
  diffuseColor.rgb *= c * vShade * ao * vLit;
}`;

/** 全部の材料で 共有する 値 */
export interface VoxelShared {
  atlas: Texture;
  /** うまりの 3D テクスチャが ない メッシュ（箱の段）に 渡す 1 マスの ダミー */
  dummyAo: Data3DTexture;
}

/** うまり（R8UI の 3D テクスチャ）を作る。data は ao.ts の並び */
export function createOccupancyTexture(data: Uint8Array): Data3DTexture {
  const t = new Data3DTexture(data, OCC_W, OCC_NZ, OCC_NY);
  t.format = RedIntegerFormat;
  t.internalFormat = 'R8UI';
  t.type = UnsignedByteType;
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.unpackAlignment = 1;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function createVoxelShared(atlas: Texture): VoxelShared {
  return { atlas, dummyAo: createOccupancyTexture(new Uint8Array(OCC_W * OCC_NZ * OCC_NY)) };
}

let TILE_OF: Vector3[] | null = null;
let TILE_AVG: Vector3[] | null = null;
function tables(): { of: Vector3[]; avg: Vector3[] } {
  if (!TILE_OF || !TILE_AVG) {
    const t = tileTable();
    TILE_OF = [];
    for (let k = 0; k < KINDS; k++) TILE_OF.push(new Vector3(t[k * 3], t[k * 3 + 1], t[k * 3 + 2]));
    const a = tileAverageTable();
    TILE_AVG = [];
    for (let i = 0; i < N_TILES; i++) TILE_AVG.push(new Vector3(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]));
  }
  return { of: TILE_OF, avg: TILE_AVG };
}

/**
 * 材料を 1 つ作る。ao = そのセクションの うまりのテクスチャ（無ければ AO なし）。
 * どの材料も 同じ プログラム（customProgramCacheKey）を 使う。セクションごとに 1 つ作る（テクスチャが ちがうため）。
 */
export function createVoxelMaterial(shared: VoxelShared, ao: Data3DTexture | null): MeshBasicMaterial {
  const m = new MeshBasicMaterial({});
  m.userData.noDim = true; // sky/Lighting では暗くしない（ここで明るさを決める）
  const t = tables();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDarken = skyDarkness.uniform;
    shader.uniforms.uAtlas = { value: shared.atlas };
    shader.uniforms.uTileOf = { value: t.of };
    shader.uniforms.uTileAvg = { value: t.avg };
    shader.uniforms.uAo = { value: ao ?? shared.dummyAo };
    shader.uniforms.uHasAo = { value: ao ? 1 : 0 };
    shader.uniforms.uAoOn = aoUniforms.on;
    shader.uniforms.uAoFade = aoUniforms.fade;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${VERT_BODY}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += voxGrow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_BODY}`);
  };
  m.customProgramCacheKey = () => 'rikkun-voxel-tex';
  return m;
}
