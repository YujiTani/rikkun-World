import { BLOCK_INDEX } from '../blocks/blockTypes';
import { FUTON_FOOT, FUTON_HEAD } from '../blocks/futon';
import { furnBlockId, type FurnRot } from '../blocks/houseBlocks';
import { BOKEN_TUNING as TUNE, SHAPE_TABLE } from './mineBokenConfig';
import { PieceB } from './mineBokenEnd';
import type { Fit, Piece } from './mineBokenFit';
import type { FloorGeo, FrameMark } from './mineBokenFloors';
import { lat } from './mineBokenRoad';
import { roadSpots } from './mineBokenSides';
import type { Pt } from './mineShaftTypes';
import type { Rng } from './random';

/** 冒険者の キャンプあと（MINE-1E §4.8）: 本道の かべに ひらく 5×5 の へや。計算だけ〔世界には さわらない〕。 */

const C = SHAPE_TABLE.camp;
/** 家具の 向きごとの 前の 向き（x, z）。向き 0 は 前が 南〔houseBlocks.ts〕 */
const FRONT: readonly (readonly [number, number])[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const FUTON_STEP: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

export interface CampOut {
  room: { x0: number; y: number; z0: number; x1: number; z1: number };
  tansu: Pt;
  lantern: Pt;
  futon: Pt[];
  takibi: Pt;
  /** 床の マス〔たんすの マスも ふくむ〕 */
  floor: Pt[];
}

/** キャンプを 階 `fl` の 本道に つける。入らなければ null */
export function placeCamp(c: { fit: Fit; rng: Rng; frames: FrameMark[] }, fl: FloorGeo, mouths: { x: number; z: number }[]): { camp: CampOut; mouth: { x: number; z: number } } | null {
  const { fit, rng } = c;
  const half = (C.floor - 1) / 2;
  const spots = roadSpots(fl).sort(() => rng() - 0.5);
  for (const sp of spots.slice(0, 2 * TUNE.roomTries)) {
    const o = fl.main[sp.i]!;
    if (mouths.some((m) => Math.max(Math.abs(m.x - o.x), Math.abs(m.z - o.z)) < TUNE.mouthGap)) continue;
    const fr = sp.hub.frame;
    const sgn = rng() < 0.5 ? -1 : 1;
    const tx = fr.lx * sgn;
    const tz = fr.lz * sgn;
    const dx = fr.ux;
    const dz = fr.uz;
    const y = fl.y;
    const W = (b: number, a: number): Pt => ({ x: o.x + tx * b + dx * a, y, z: o.z + tz * b + dz * a });
    const pb = new PieceB();
    for (let a = -1; a <= 1; a++) pb.cell(W(2, a).x, y, W(2, a).z, 'camp');
    const back = 2 + C.floor;
    const floor: Pt[] = [];
    for (let b = 3; b <= back; b++) {
      for (let a = -half; a <= half; a++) {
        const p = W(b, a);
        floor.push(p);
        // たんすの マスは 固い ので 1 つ 上を 床に する〔上の 空気だけ あける〕
        if (b === back && a === 0) pb.cell(p.x, y + 1, p.z, 'camp');
        else pb.cell(p.x, y, p.z, 'camp');
      }
    }
    const tp = W(back, 0);
    const rot = FRONT.findIndex((f) => f[0] === -tx && f[1] === -tz) as FurnRot;
    pb.put(tp.x, y, tp.z, BLOCK_INDEX[furnBlockId('tansu', 0, rot)]);
    const lantern = W(back, -half);
    pb.put(lantern.x, y, lantern.z, BLOCK_INDEX.lantern);
    const takibi = W(3 + half, 0);
    pb.put(takibi.x, y, takibi.z, BLOCK_INDEX.takibi_ato);
    const head = W(back - 1, 1);
    const foot = W(back - 1, 2);
    const fd = FUTON_STEP.findIndex((f) => f[0] === dx && f[1] === dz);
    pb.put(head.x, y, head.z, BLOCK_INDEX[FUTON_HEAD[fd]!]);
    pb.put(foot.x, y, foot.z, BLOCK_INDEX[FUTON_FOOT[fd]!]);
    const open = W(2, 0);
    const piece: Piece = { cells: pb.cells, puts: [...pb.puts], attach: { x: open.x, z: open.z, dx: tx, dz: tz, y } };
    if (!fit.add(piece)) continue;
    const xs = floor.map((p) => p.x);
    const zs = floor.map((p) => p.z);
    c.frames.push({ x: open.x, z: open.z, y, px: lat(tx, tz)[0], pz: lat(tx, tz)[1], broken: false });
    return {
      camp: { room: { x0: Math.min(...xs), y, z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) }, tansu: tp, lantern, futon: [head, foot], takibi, floor },
      mouth: { x: o.x, z: o.z },
    };
  }
  return null;
}
