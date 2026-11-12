import type { BlockId } from '../../../contracts';
import { hash01 } from '../random';
import type { GroundFn, LegendEntry, LegendFull, Placed, PlacedCell, Rot, StructureShape } from './types';

/**
 * 建物を 置く 関数（structure kit の 心臓。何も 読みこまない 純粋な 関数 = Terrain も チャンクも 知らない）。
 * ブロックの 決め方は 場所（ワールドの x, y, z）と シードの 乱数だけ → 作る 順にも チャンクの 切れ目にも 関係なく 同じ 結果になる
 * （世界へ 置く ときは 結果を 国だけの 物の 「置く 物 1 こ」（FeatureSite）に して、チャンクごとに 自分の ぶんだけ 書く）。
 */

/** ゆらぎの 乱数の 番号（同じ 場所でも 目的ごとに ちがう 値に する） */
const SALT_SKIP = 11;
const SALT_MOSS = 12;
const SALT_MIX = 13;

/** 図の 中の 相対の マス (dx, dz)（基準の 点から）を 向き rot で まわす。1 = 時計まわりに 90°（東 → 南） */
export function rotate(dx: number, dz: number, rot: Rot): readonly [number, number] {
  switch (rot) {
    case 0: return [dx, dz];
    case 1: return [0 - dz, dx];
    case 2: return [0 - dx, 0 - dz];
    case 3: return [dz, 0 - dx];
    default: { const never: never = rot; return never; }
  }
}

const entryOf = (e: LegendEntry): Required<LegendFull> =>
  typeof e === 'string'
    ? { id: e, skip: 0, moss: 0, mossId: 'koke_ishi', mossLow: 0, mix: [] }
    : { id: e.id, skip: e.skip ?? 0, moss: e.moss ?? 0, mossId: e.mossId ?? 'koke_ishi', mossLow: e.mossLow ?? 0, mix: e.mix ?? [] };

/** 凡例に ない 文字は 図の 書きまちがい（無言で 空気に しない） */
function legendOf(shape: StructureShape, ch: string): LegendEntry {
  const e = shape.legend[ch];
  if (e === undefined) throw new Error(`structure ${shape.id}: 凡例に ない 文字 '${ch}'`);
  return e;
}

/** 図の マス 1 つ（' ' 以外）。x, z は 基準の 点からの 相対（まわす 前） */
export interface ShapeCell {
  readonly rx: number;
  readonly rz: number;
  readonly y: number;
  readonly ch: string;
}

/** 図を 平らな 一覧に する（' ' は 入れない） */
export function shapeCells(shape: StructureShape): ShapeCell[] {
  const out: ShapeCell[] = [];
  shape.layers.forEach((rows, y) => {
    rows.forEach((row, z) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch !== ' ') out.push({ rx: x - shape.anchor.x, rz: z - shape.anchor.z, y, ch });
      }
    });
  });
  return out;
}

/** 足もとの 四角（基準の 点が (ax, az) の とき。向き rot） */
export function footOf(shape: StructureShape, ax: number, az: number, rot: Rot): readonly [number, number, number, number] {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const c of shapeCells(shape)) {
    const [dx, dz] = rotate(c.rx, c.rz, rot);
    x0 = Math.min(x0, ax + dx);
    x1 = Math.max(x1, ax + dx);
    z0 = Math.min(z0, az + dz);
    z1 = Math.max(z1, az + dz);
  }
  return [x0, z0, x1, z1];
}

/**
 * 基準の 点 (ax, az) に 向き rot で 置く。置けない（地面の 高さの 差が 大きい・土台の うめる 高さが 上限を こえる・置けない 列が ある）時は null。
 * いちばん 下の 段は 足もとの 地面の いちばん 高い 所の すぐ 上（けずらない。低い 所は 土台で うめる）。
 */
export function placeStructure(shape: StructureShape, ax: number, az: number, rot: Rot, seed: number, ground: GroundFn): Placed | null {
  const cells = shapeCells(shape);
  // 足もと = いちばん 下の 段に ある 列
  const feet = cells.filter((c) => c.y === 0).map((c) => {
    const [dx, dz] = rotate(c.rx, c.rz, rot);
    return { x: ax + dx, z: az + dz, ch: c.ch, h: ground(ax + dx, az + dz) };
  });
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of feet) {
    if (f.h < 0) return null;
    lo = Math.min(lo, f.h);
    hi = Math.max(hi, f.h);
  }
  if (feet.length === 0 || hi - lo > shape.maxSlope) return null;
  const baseY = hi + 1;
  const blocks: PlacedCell[] = [];
  // 土台: 足もとの 段が 空気でない 列を 地面から うめる
  for (const f of feet) {
    if (f.ch === '.') continue;
    if (baseY - 1 - f.h > shape.base.maxFill) return null;
    const e = entryOf(shape.base);
    const depth = Math.max(1, baseY - 1 - f.h);
    for (let y = f.h + 1; y < baseY; y++) {
      if (y === baseY - 1 && shape.base.cap) { blocks.push({ x: f.x, y, z: f.z, id: shape.base.cap }); continue; }
      const pMoss = e.moss + e.mossLow * ((baseY - 1 - y) / depth); // 地面に 近い 段ほど こけが 多い
      let id: BlockId = e.id;
      if (pMoss > 0 && hash01(seed, f.x, y, f.z, SALT_MOSS) < pMoss) id = e.mossId;
      else if (e.mix.length > 0) {
        let r = hash01(seed, f.x, y, f.z, SALT_MIX);
        for (const [mid, p] of e.mix) {
          if (r < p) { id = mid; break; }
          r -= p;
        }
      }
      blocks.push({ x: f.x, y, z: f.z, id });
    }
  }
  for (const c of cells) {
    const [dx, dz] = rotate(c.rx, c.rz, rot);
    const x = ax + dx;
    const z = az + dz;
    const y = baseY + c.y;
    if (c.ch === '.') {
      blocks.push({ x, y, z, id: 'air' });
      continue;
    }
    const e = entryOf(legendOf(shape, c.ch));
    if (e.skip > 0 && hash01(seed, x, y, z, SALT_SKIP) < e.skip) {
      blocks.push({ x, y, z, id: 'air' });
      continue;
    }
    let id: BlockId = e.id;
    const pMoss = e.moss + e.mossLow * (1 - c.y / Math.max(1, shape.layers.length - 1)); // 下の 段ほど こけが 多い
    if (pMoss > 0 && hash01(seed, x, y, z, SALT_MOSS) < pMoss) id = e.mossId;
    else if (e.mix.length > 0) {
      let r = hash01(seed, x, y, z, SALT_MIX);
      for (const [mid, p] of e.mix) {
        if (r < p) { id = mid; break; }
        r -= p;
      }
    }
    blocks.push({ x, y, z, id });
  }
  return { blocks, foot: footOf(shape, ax, az, rot), baseY };
}

/** 図の 検査（テストと 見る 道具が 使う）: 段ごとの 行の はばが そろって いる・凡例に ない 文字が ない。問題の 説明の 一覧（なければ 空） */
export function checkShape(shape: StructureShape): string[] {
  const bad: string[] = [];
  const w = Math.max(...shape.layers.flatMap((rows) => rows.map((r) => r.length)));
  const d = Math.max(...shape.layers.map((rows) => rows.length));
  shape.layers.forEach((rows, y) => {
    if (rows.length !== d) bad.push(`段 ${y}: 行の 数 ${rows.length} （${d} でない）`);
    rows.forEach((r, z) => {
      if (r.length !== w) bad.push(`段 ${y} 行 ${z}: はば ${r.length} （${w} でない）`);
      for (const ch of r) if (ch !== ' ' && ch !== '.' && shape.legend[ch] === undefined) bad.push(`段 ${y} 行 ${z}: 凡例に ない '${ch}'`);
    });
  });
  if (shape.anchor.x < 0 || shape.anchor.x >= w || shape.anchor.z < 0 || shape.anchor.z >= d) bad.push('基準の 点が 図の そと');
  return bad;
}
