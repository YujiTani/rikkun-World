import { BLOCK_INDEX } from '../blocks/blockTypes';
import { packOp } from './mineOpPack';
import { colKey } from '../stream/ring';
import type { RoomColOps } from './mineCaveRoom';
import type { HiroiLayout } from './mineHiroiShape';
import { HIROI_SHAPE } from './mineHiroiTable';

/**
 * 性能の くらべ用の 場面（MINE-1D §6.1 `hiroiScene`・D16）。部屋の 南の かべに 出口を 1 つ（はば 3・高さ 4・長さ exitLength の 横穴）つけ、
 * 出口の 両がわの 床に たいまつを 1 本ずつ 置く。くらべ用（plain）は 同じ たまご・天井・出口で 柱・天井の こぶ・床の こぶ・鉱石 なし。
 */

const pack = packOp;

/** くらべ用: 柱・こぶ・床の こぶを けして、天井は たまごの まま */
export function plainLayout(l: HiroiLayout): HiroiLayout {
  const lo = new Int8Array(l.lo.length);
  const hi = Int8Array.from(l.full);
  return { ...l, pillars: [], knobs: [], bumps: [], lo, hi };
}

/** 出口の 横穴（空気）と 両がわの たいまつを 置く 物。ox・oy・oz ＝ 部屋の 北西の すみの 床。出口は 南向き（+z） */
export function exitOps(l: HiroiLayout, ox: number, oy: number, oz: number): Map<number, RoomColOps> {
  const S = HIROI_SHAPE;
  const lists = new Map<number, number[]>();
  const slot = (x: number, z: number): { put: number[] } => {
    const k = colKey(x >> 4, z >> 4);
    let v = lists.get(k);
    if (!v) lists.set(k, (v = []));
    return { put: v };
  };
  const half = (S.exitWidth - 1) / 2;
  const z0 = oz + l.exit.z + 1;
  for (let z = z0; z < z0 + S.exitLength; z++) for (let x = ox + l.exit.x - half; x <= ox + l.exit.x + half; x++) for (let y = oy; y < oy + S.exitHeight; y++) slot(x, z).put.push(pack(BLOCK_INDEX.air, y, z & 15, x & 15));
  for (const d of [-2, 2]) {
    const x = ox + l.exit.x + d;
    const z = oz + l.exit.z;
    slot(x, z).put.push(pack(BLOCK_INDEX.torch, oy, z & 15, x & 15));
  }
  const out = new Map<number, RoomColOps>();
  // 空気も put で 置く（部屋の かべの 石の あとに 重ねる ため。air は ぜんぶの 列の put より 先に 置かれる）
  for (const [k, v] of lists) out.set(k, { ring: new Int32Array(0), air: new Int32Array(0), put: Int32Array.from(v) });
  return out;
}
