import type { BlockId } from '../../contracts';
import {
  KOTATSU_CORNER, KOTATSU_PARTS, KOTATSU_RUN, KOTATSU_TEX, isBigKotatsu, isKotatsuPart, kotatsuUv, type KotatsuPart,
} from '../blocks/kotatsu';
import type { WorldLight } from '../light/WorldLight';
import type { ArrayVoxelWorld } from '../VoxelWorld';
import { FACE_SHADE_BY_INDEX } from './config';
import type { MeshData } from './meshChunk';

/**
 * こたつ 2×2 の 形（1 点 = 1/16 ブロック）。足もと 32×32・高さ 16。天板 20×20 は まわり 6 点 内がわ の 高さ 16。
 * ふとん は 天板 の へり から 足もと へ ひろがる 台形 4 まい（上 20・下 32）で、かど は 折れる。
 * 足もと の 4 つ の かど には 布 の たまり（三角 2 まい）。1 マス ごと に 自分 の 4 分の 1 を 出す
 * （三角形 は 全部 で 天板 2 ＋ ふとん 8 ＋ かど 8 ＝ 18）。当たり は 2×2×1 の 箱 のまま（かど の はみ出し は 見た目 だけ）。
 * 絵 は `KOTATSU_TEX`、寸法 は `blocks/kotatsu.ts` の 定数。
 */
type Pt = readonly [number, number, number];
const A = KOTATSU_RUN;
const C = KOTATSU_CORNER;

// 北西 の マス を 基準 に した 面（座標 は マス の 中 0〜1 と 高さ 0〜1。u=w の 線 が ふとん の 折れ目）
const TOP: readonly Pt[] = [[A, A, 1], [1, A, 1], [1, 1, 1], [A, 1, 1]];
const SLOPE_W: readonly Pt[] = [[0, 0, 0], [A, A, 1], [A, 1, 1], [0, 1, 0]];
const SLOPE_N: readonly Pt[] = [[0, 0, 0], [1, 0, 0], [1, A, 1], [A, A, 1]];
// かど の 布 の たまり（P = 頂上、T = 外 の 先、A・B = へり に そって 内 へ）
const P: Pt = [0, 0, C.peak];
const T: Pt = [-C.out, -C.out, C.lift];
const PA: Pt = [C.along, 0, C.lift];
const PB: Pt = [0, C.along, C.lift];

function shadeOf(faceIndex: number): number {
  return (FACE_SHADE_BY_INDEX[faceIndex] + 1) / 2; // 斜面 は 上 を 向く ので 横 の 面 より 明るい
}

/**
 * 1 マス ぶん を `mesh` に 足す。`id` = このマス の ブロック。2×2 が そろって いない（古い 1 マス こたつ）なら false
 * （そのとき は ふつう の 箱 で 描く）。
 */
export function pushKotatsuCell(
  mesh: MeshData,
  world: ArrayVoxelWorld,
  light: WorldLight | undefined,
  x: number,
  y: number,
  z: number,
  id: BlockId,
): boolean {
  const part: KotatsuPart | null = isKotatsuPart(id) ? id : null;
  const [ox, oz] = part ? KOTATSU_PARTS[part] : [0, 0];
  if (!isBigKotatsu((gx, gy, gz) => String(world.getBlock(gx, gy, gz)), x - ox, y, z - oz)) return false;
  const mx = ox === 1;
  const mz = oz === 1;
  // 光 は 上 の マス（空気）から 取る
  const ly = Math.min(y + 1, world.size.y - 1);
  const sky = light ? light.skyAt(x, ly, z) / 15 : 1;
  const blk = light ? light.blockAt(x, ly, z) / 15 : 0;
  /**
   * 北西 の 形 を このマス の むき に 写して 1 まい（3 か 4 つ の 角）足す。hint = 北西 の 形 での 外向き（表 の むき）。
   * uvOf(gu, gw, h) = こたつ ぜんたい の 位置〈ブロック〉と 高さ から 絵 の UV
   */
  const poly = (pts: readonly Pt[], hint: Pt, shade: number, uvOf: (gu: number, gw: number, h: number) => [number, number]): void => {
    const base = mesh.positions.length / 3;
    const out: [number, number, number][] = [];
    for (const [pu, pw, ph] of pts) {
      const lu = mx ? 1 - pu : pu;
      const lw = mz ? 1 - pw : pw;
      out.push([x + lu, y + ph, z + lw]);
      mesh.positions.push(x + lu, y + ph, z + lw);
      const uv = uvOf(lu + ox, lw + oz, ph);
      mesh.uvs.push(uv[0], uv[1]);
      mesh.colors.push(shade, shade, shade);
      mesh.lights.push(sky, blk);
      mesh.darks.push(0);
    }
    const hx = mx ? -hint[0] : hint[0];
    const hz = mz ? -hint[1] : hint[1];
    const [p0, p1, p2] = out;
    const e1 = [p1![0] - p0![0], p1![1] - p0![1], p1![2] - p0![2]];
    const e2 = [p2![0] - p0![0], p2![1] - p0![1], p2![2] - p0![2]];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const front = n[0]! * hx + n[1]! * hint[2] + n[2]! * hz >= 0;
    if (pts.length === 3) {
      if (front) mesh.indices.push(base, base + 1, base + 2);
      else mesh.indices.push(base, base + 2, base + 1);
    } else if (front) mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else mesh.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    mesh.faceCount++;
  };
  // 天板: 20×20 の 絵 を そのまま（ブロック → 点 は ×16。天板 の 左上 が 絵 の 0,0）
  poly(TOP, [0, 0, 1], shadeOf(0), (gu, gw) => kotatsuUv(KOTATSU_TEX.top, (gu - A) * 16, (gw - A) * 16));
  // ふとん: 32×16 の 台形。ふち に そった 位置 ×16 が 絵 の 横、高さ が 絵 の たて（下 = すそ）
  poly(SLOPE_W, [-1, 0, 1], shadeOf(mx ? 2 : 3), (_gu, gw, h) => kotatsuUv(KOTATSU_TEX.slope, gw * 16, 16 - h * 16));
  poly(SLOPE_N, [0, -1, 1], shadeOf(mz ? 4 : 5), (gu, _gw, h) => kotatsuUv(KOTATSU_TEX.slope, gu * 16, 16 - h * 16));
  // かど: 三角 PTA・PTB。UV は P=(0,0)・T=(0,8)・A/B=(8,0)
  const tri = (a: Pt, b: Pt, c: Pt): void => {
    let k = 0;
    const order = [a, b, c];
    poly(order, [-1, -1, 1], shadeOf(0), () => {
      const pt = order[k++ % 3]!;
      return pt === P ? kotatsuUv(KOTATSU_TEX.corner, 0, 0) : pt === T ? kotatsuUv(KOTATSU_TEX.corner, 0, 8) : kotatsuUv(KOTATSU_TEX.corner, 8, 0);
    });
  };
  tri(P, T, PA);
  tri(P, T, PB);
  return true;
}
