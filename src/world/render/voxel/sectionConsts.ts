import { LOOK_N, grainMapOf, hasLook, initLooks, occludes } from '../looks';
import { BLOCK_TYPES, isLeafIndex, isOpaqueIndex } from '../../blocks/blockTypes';
import { OPACITY } from '../../light/opacity';

/** sectionMesher の定数と表（SectionMesher・BlockCube・BoxMesher が共有する。4-7） */

export const N = LOOK_N;
/** まわり 1 ブロックをふくむ 1 辺のブロック数と、小ブロック数 */
export const BL = 18;
export const S = BL * N;
export const SS = S * S;
/** 小ブロック地形で調べる列の幅（ブロック）: セクション + まわり 2 ブロック */
export const BW = 20;
export const OWN = 16 * N; // 144
export const ROWS_ALL = 17 * N; // 153: 自分の高さ + 上のはみ出しの 1 ブロック
export const CUBE = BL * BL * BL;
const NB = BLOCK_TYPES.length;

initLooks(BLOCK_TYPES.map((t) => t.id));

/** 面の向きの順: 上, 下, +x, -x, +z, -z（meshChunk の FACES と同じ） */
export const DIR: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export const FACE_VERTS: readonly (readonly [number, number, number])[][] = [
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
export const AXIS_OF = [1, 1, 0, 0, 2, 2];
export const NEIGHBOR_OFF = [SS, -SS, 1, -1, S, -S];
export const GSTRIDE = [1, SS, S];

/** この種類は となりの面をかくすか（形のある種類は look、形のない固いブロック（絵のブロック）は かくす） */
function buildOcc(): Uint8Array {
  const t = new Uint8Array(NB);
  for (let i = 0; i < NB; i++) t[i] = hasLook(i) ? (occludes(i) ? 1 : 0) : isOpaqueIndex(i) ? 1 : 0;
  return t;
}
export const OCC = buildOcc();
/** つぶ〔B「とびだす つぶ」。MINE-1B〕の ある 種類か（格子の 値 2 = 地の 石、3 以上 = つぶ）と、色番号 → 格子の 値の 表 */
export const GRAIN_MAPS: readonly (Uint8Array | undefined)[] = Array.from({ length: NB }, (_t, i) => grainMapOf(i));
export const GRAIN_KIND = Uint8Array.from(GRAIN_MAPS, (m) => (m ? 1 : 0));

/** 1 平面の mask〔Int32〕の ビット: 種類 0〜7（MINE-1B で 6 → 8 ビットに ひろげた）・行の符号 8〜15・光 16〜23・つぶの 印 24〜28 */
export const MK_ROW = 8;
export const MK_LIGHT = 16;
export const MK_GRAIN = 24;
/** はっぱの種類（#202: はっぱは 地下あつかいしない） */
export const LEAF = Uint8Array.from(BLOCK_TYPES, (_t, i) => (isLeafIndex(i) ? 1 : 0));
/** 光を通さない（光の読みを まわりからかりる） */
export const OPAQUE_LIGHT = Uint8Array.from(OPACITY, (o) => (o >= 15 ? 1 : 0));

/** 面ごとの層の数（上下 = 17 ブロック、ほかは 16 ブロック。小ブロック数） */
export const NBLOCKS = [16, 17, 16];
export const LAYERS = [0, 1, 2, 3, 4, 5].map((f) => NBLOCKS[AXIS_OF[f]] * N);
export const G_BASE = N + N * S + N * SS;

// 段（続きから再開できる仕事。PERF-2）と、止めてよい 1 単位の大きさ
export const PH_IDLE = 0;
export const PH_BOX = 1;
export const PH_READ = 2;
export const PH_LIGHT2 = 3;
export const PH_SCAN = 4;
export const PH_SAMPLE = 5;
export const PH_EXPOSE = 6;
export const PH_FILL = 7;
export const PH_TFILL = 8;
export const PH_PLANES = 9;
export const PH_FINISH = 10;
export const PH_OCC = 11;
export const READ_ROWS = 3;
export const SCAN_ROWS = 2;
export const SAMPLE_ROWS = 8;
export const EXPOSE_ROWS = 3;
/** 1 行に 地面が集まると 重いので、行では切らず ブロックの数で切る */
export const FILL_BLOCKS = 8;
export const TFILL_ROWS = 8;
export const PLANES_PER_STEP = 2;
export const OCC_ROWS = 4;

/** edgeTy の「まだ調べていない」しるし */
export const EDGE_UNKNOWN = -2147483648;
