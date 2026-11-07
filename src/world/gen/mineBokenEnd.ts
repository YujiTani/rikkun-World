import { BLOCK_INDEX } from '../blocks/blockTypes';
import { CHEST_RIGHT, chestBlockId } from '../blocks/chestBlock';
import { DEAD_END_TABLE as DT, SHAPE_TABLE, type DeadEndKind, type Depth } from './mineBokenConfig';
import type { FrameMark } from './mineBokenFloors';
import { lat, type Pt3 } from './mineBokenRoad';
import { chestTierAt } from './mineChestTable';
import { COMPASS, DV, airHeightOf, keyOf, keyX, keyY, keyZ } from './mineShaftBuild';
import type { Compass, PathCell, PathPart, Pt, Tier } from './mineShaftTypes';
import { hashInts, type Rng } from './random';

/**
 * 行きどまり 1 つの 中身（MINE-1E §4.4・§4.5）: へや・宝箱・鉱石・ひびの 通り道・こわれた わく。えだ道の おわりと 迷路の 行きどまりで 同じ 形を 使う。計算だけ〔世界には さわらない〕。
 */

const TORCH = BLOCK_INDEX.torch;
const R = SHAPE_TABLE.room;
const HB = SHAPE_TABLE.hibi;

/** 部品を 組み立てる 入れもの: 道の マス・置く ブロック・空気の キー */
export class PieceB {
  readonly cells: PathCell[] = [];
  readonly air = new Set<number>();
  readonly puts = new Map<number, number>();
  readonly exempt: number[] = [];
  private readonly seen = new Set<number>();
  cell(x: number, y: number, z: number, part: PathPart): void {
    const k = keyOf(x, y, z);
    if (this.seen.has(k)) return;
    this.seen.add(k);
    this.cells.push({ x, y, z, part });
    for (let h = 0; h < airHeightOf(part); h++) this.air.add(keyOf(x, y + h, z));
  }
  put(x: number, y: number, z: number, block: number): void {
    this.puts.set(keyOf(x, y, z), block);
  }
  has(k: number): boolean {
    return this.air.has(k) || this.puts.has(k);
  }
}

export interface DeadEndOut {
  at: Pt;
  kind: DeadEndKind;
  hibi: Pt[];
  room: { x0: number; y: number; z0: number; x1: number; z1: number } | null;
  chest: { x: number; y: number; z: number; cells: Pt[]; front: Compass; tier: Tier } | null;
  ores: Record<string, number>;
}

export interface EndIn {
  seed: number;
  depth: Depth;
  rng: Rng;
  kind: DeadEndKind;
  /** 行きどまりの 足の マス〔つきあたりの かべの 手前〕と 奥の 向き */
  at: Pt3;
  dx: number;
  dz: number;
  /** へやの 前に 足す 口の 列の 数〔迷路の 外わくは 1・えだ道は 0〕 */
  gap: number;
  /** 口の 列の 道の 名前 */
  gapPart: PathPart;
  /** ひびの 手前の たいまつを 置く 位置〔−1 ＝ 行きどまりの 1 つ 手前〕 */
  band: number;
  /** 行きどまりの 両がわに たいまつを 置くか */
  pair: boolean;
  pb: PieceB;
  /** すでに ある 空気・置く物か */
  taken(k: number): boolean;
  frames: FrameMark[];
  chestKeys: number[];
}

/** 結果の くじ */
export function pickEndKind(rng: Rng): DeadEndKind {
  let r = rng();
  for (const k of DT.kinds) {
    r -= k.chance;
    if (r < 0) return k.kind;
  }
  return DT.kinds[DT.kinds.length - 1]!.kind;
}

const dirIndex = (dx: number, dz: number): number => DV.findIndex((d) => d[0] === dx && d[1] === dz);

/** へやの まわりの かべ・床・天井の うち へやの 空気に ふれる マス */
export function rimCells(r: { x0: number; z0: number; x1: number; z1: number; y: number }, height: number, taken: (k: number) => boolean): number[] {
  const out: number[] = [];
  const inside = (x: number, y: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y >= r.y && y < r.y + height;
  const NB: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
    for (let z = r.z0 - 1; z <= r.z1 + 1; z++) {
      for (let y = r.y - 1; y <= r.y + height; y++) {
        if (inside(x, y, z) || !NB.some(([a, b, c]) => inside(x + a, y + b, z + c))) continue;
        const k = keyOf(x, y, z);
        if (!taken(k)) out.push(k);
      }
    }
  }
  return out;
}

/** 鉱石の 置き場所 〔表の 数 ＋ extra こ ずつ〕と 数 */
export function orePuts(seed: number, rim: number[], table: Record<string, number>, extra: number): { puts: [number, number][]; count: Record<string, number> } {
  const order = rim.map((k) => ({ k, r: hashInts(seed, keyX(k), keyZ(k), keyY(k), 77) })).sort((p, q) => p.r - q.r);
  const puts: [number, number][] = [];
  const count: Record<string, number> = {};
  let at = 0;
  for (const [ore, n] of Object.entries(table)) {
    for (let i = 0; i < n + extra && at < order.length; i++) {
      puts.push([order[at++]!.k, BLOCK_INDEX[ore as 'iron_ore']]);
      count[ore] = (count[ore] ?? 0) + 1;
    }
  }
  return { puts, count };
}

/** 行きどまりの 中身を 部品 `pb` に 足す */
export function buildEnd(i: EndIn): DeadEndOut {
  const { pb, at, kind, rng } = i;
  const [lx, lz] = lat(i.dx, i.dz);
  const y = at.y;
  const pos = (a: number, v: number): { x: number; z: number } => ({ x: at.x + i.dx * a + lx * v, z: at.z + i.dz * a + lz * v });
  const hibi = kind === 'hibi_naka' || kind === 'hibi_oo';
  const roomed = kind === 'oo' || kind === 'naka' || hibi;
  const out: DeadEndOut = { at: { x: at.x, y, z: at.z }, kind, hibi: [], room: null, chest: null, ores: {} };
  const torch = (a: number, v: number): void => {
    const p = pos(a, v);
    pb.put(p.x, y, p.z, TORCH);
  };
  if (i.pair) {
    torch(0, -1);
    torch(0, 1);
  }
  let a0 = 1;
  if (hibi) {
    const depth = HB.depth[0] + Math.floor(rng() * (HB.depth[1] - HB.depth[0] + 1));
    for (let k = 1; k <= depth; k++) {
      const p = pos(k, 0);
      pb.cell(p.x, y, p.z, 'hibi');
      for (let h = 0; h < HB.height; h++) {
        pb.put(p.x, y + h, p.z, BLOCK_INDEX.hibi_ishi);
        out.hibi.push({ x: p.x, y: y + h, z: p.z });
      }
    }
    a0 = depth + 1;
    torch(i.band, rng() < 0.5 ? -1 : 1);
  } else if (roomed && i.gap > 0) {
    for (let g = 1; g <= i.gap; g++) for (let v = -1; v <= 1; v++) {
      const p = pos(g, v);
      pb.cell(p.x, y, p.z, i.gapPart);
    }
    a0 = 1 + i.gap;
  }
  if (roomed) {
    const half = (R.floor - 1) / 2;
    const part: PathPart = hibi ? 'kakushi' : 'end';
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let a = a0; a < a0 + R.floor; a++) {
      for (let v = -half; v <= half; v++) {
        const p = pos(a, v);
        pb.cell(p.x, y, p.z, part);
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        z0 = Math.min(z0, p.z);
        z1 = Math.max(z1, p.z);
      }
    }
    const room = { x0, y, z0, x1, z1 };
    out.room = room;
    const back = a0 + R.floor - 1;
    torch(back, -half);
    torch(back, half);
    if (kind === 'oo' || kind === 'hibi_oo') {
      const front = COMPASS[dirIndex(-i.dx, -i.dz)] as Compass;
      const [rx, rz] = CHEST_RIGHT[front];
      const mid = pos(back, 0);
      const same = mid.x >> 4 === (mid.x + rx) >> 4 && mid.z >> 4 === (mid.z + rz) >> 4;
      const cs: Pt[] = same ? [{ x: mid.x, y, z: mid.z }, { x: mid.x + rx, y, z: mid.z + rz }] : [{ x: mid.x - rx, y, z: mid.z - rz }, { x: mid.x, y, z: mid.z }];
      const main = cs[0]!;
      const tier = chestTierAt(i.seed, main.x, main.y, main.z, hibi ? 'kodo_kakushi' : 'kodo_eda');
      cs.forEach((p, n) => {
        pb.put(p.x, p.y, p.z, BLOCK_INDEX[chestBlockId(tier, false, n === 1)]);
        i.chestKeys.push(keyOf(p.x, p.y, p.z));
      });
      out.chest = { x: main.x, y, z: main.z, cells: cs, front, tier };
    } else {
      const rim = rimCells(room, R.height, (k) => i.taken(k) || pb.has(k));
      const o = orePuts(i.seed, rim, DT.ores[i.depth].naka, 2);
      for (const [k, b] of o.puts) pb.puts.set(k, b);
      out.ores = o.count;
    }
  } else if (kind === 'atari') {
    const [lo, hi] = DT.atariCount;
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    const list = DT.ores[i.depth].atari;
    const wall: number[] = [];
    for (let v = -1; v <= 1; v++) for (let h = 0; h < 4; h++) {
      const p = pos(1, v);
      const k = keyOf(p.x, y + h, p.z);
      if (!i.taken(k) && !pb.has(k)) wall.push(k);
    }
    const order = wall.map((k) => ({ k, r: hashInts(i.seed, keyX(k), keyZ(k), keyY(k), 78) })).sort((p, q) => p.r - q.r);
    for (let j = 0; j < n && j < order.length; j++) {
      const ore = list[(j + Math.floor(rng() * list.length)) % list.length]!;
      pb.puts.set(order[j]!.k, BLOCK_INDEX[ore as 'iron_ore']);
      out.ores[ore] = (out.ores[ore] ?? 0) + 1;
    }
  } else if (kind === 'hazure') {
    if (rng() < 0.5) {
      const p = pos(-1, 0);
      i.frames.push({ x: p.x, z: p.z, y, px: lx, pz: lz, broken: true });
    } else {
      const p = pos(0, rng() < 0.5 ? -1 : 1);
      pb.put(p.x, y, p.z, i.dx !== 0 ? BLOCK_INDEX.taoreta_hashigo_x : BLOCK_INDEX.taoreta_hashigo_z);
    }
  }
  return out;
}
