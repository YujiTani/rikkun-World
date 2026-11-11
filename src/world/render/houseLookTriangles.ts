/**
 * 家の 三角形の 数（HOUSE-2B AC12。家具を のぞく）。しゅるいの ブロックは 実際に 描く 面〔houseLookPieces.ts〕を 数える。
 * いつもの 物は 区の メッシュの かべ・やね・ゆかと 同じ 数え方: ゆか ＝ 上の 面 / かべ ＝ そと・なかの 面（となりと 重なる 面は 描かない）/ やね（たいら）＝ 上・下 / しょうじ・戸・ちょうちんは 箱の 数。
 */
import { lookPieces, type LookCtx } from './houseLookPieces';

const TRI_PER_FACE = 2;
/** いつもの 物 1 マスの 三角形（地面に 出る 面だけ）。しょうじ ＝ 紙の 板 ＋ 窓わく 2 本、戸 ＝ 板 ＋ 戸わく、ちょうちん ＝ 小さな 箱 の 数（art README の 見つもり） */
const USUAL_TRIANGLES: Readonly<Record<string, number>> = {
  house_floor: TRI_PER_FACE, // 上の 面
  house_wall: 2 * TRI_PER_FACE, // そと・なかの 2 面（となりの かべと 重なる 面は 描かない）
  house_roof: 2 * TRI_PER_FACE, // 上・天井
  shoji: 28,
  house_door: 44,
  house_door_top: 44,
  lantern: 36,
};

/** 外の 箱の ぜんぶの マス（houseShape の cells）の 三角形 */
/** ふちの 面は かべの 下で 見えない ので 数えない ブロック */
const RING_SKIPPED: ReadonlySet<string> = new Set(['house_floor']);

export function lookTriangles(cells: ReadonlyArray<{ x: number; y: number; z: number; id: string; look?: string }>, ow: number, od: number): number {
  let h = 0;
  for (const c of cells) h = Math.max(h, c.y + 1);
  let n = 0;
  for (const c of cells) {
    if (c.id === 'air') continue;
    if (c.id.startsWith('lk_')) {
      const ctx: LookCtx = { look: c.look ?? '', rx: c.x, ry: c.y, rz: c.z, ow, od, h };
      n += lookPieces(c.id, ctx).length * TRI_PER_FACE;
    } else if (RING_SKIPPED.has(c.id) && (c.x === 0 || c.z === 0 || c.x === ow - 1 || c.z === od - 1)) continue; // ふちの ゆかは かべの 下
    else n += USUAL_TRIANGLES[c.id] ?? 0;
  }
  return n;
}
