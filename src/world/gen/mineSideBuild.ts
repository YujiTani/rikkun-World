import { BLOCK_INDEX } from '../blocks/blockTypes';
import { MINE_CONFIG } from './mineConfig';
import { layerAt } from './mineLayers';
import { Frame, ShaftBuilder, airHeightOf, keyOf, keyX, keyY, keyZ, ringFor, type Pt3 } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { coverOk, type Geo, type Site } from './mineShaftSite';
import type { PathCell, Pt, ShaftLayer, ShaftSide } from './mineShaftTypes';
import type { Overlay } from './mineCaveGrid';
import { heyaTail, type HeyaBuilt, type HeyaPrep, type HeyaSource } from './mineShaftHeya';
import { Virt } from './mineSideVirt';
import { hashInts, type Rng } from './random';

/** 横穴 1 本を 作る 部品（MINE-1C。mineShaftSide.ts から 分けた。意味は かわらない）: 出口の 向き・形の 組み立て・ぶつかりの しらべ・書きこみ */

const TORCH = BLOCK_INDEX.torch;
const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export interface Hub {
  kind: 'landing' | 'room';
  /** 床の 高さ y */
  y: number;
  /** 出口が ある 列の u〔この 前後 1 マスずつ ＋ 中心 ＝ 3 マス〕 */
  u: number;
  /** 横の はんい。出口は この 外がわの かべ から */
  vMin: number;
  vMax: number;
  frame: Frame;
  alongU: boolean;
}

export interface Cand {
  cells: PathCell[];
  torches: Pt3[];
  /** 先の 面〔かべに しない〕 */
  exempt: Set<number>;
  to: Pt;
  end: 'cave' | 'joint' | 'koheya' | 'heya';
  /** 坑道の へや: 作った 部屋 */
  heya?: HeyaBuilt;
  oreCells: number[];
  oreBlocks: number[];
  /** 出どころの 出口〔この 3×4 だけ ほかの かべを 破って よい〕 */
  door: Set<number>;
  entry: Set<number>;
}

export const MAX_BOX = S.boxMax - 2 * S.boxMargin - 4;

/** 層の 鉱石の ブロック〔光る ほたるいしと 一番 まれな ダイヤは のぞく〕 */
function layerOres(layer: ShaftLayer): number[] {
  return MINE_CONFIG.ores.filter((r) => r.layer === layer && r.hidden !== true).map((r) => BLOCK_INDEX[r.block]);
}

export interface Spec {
  center: { x: number; z: number; leg: number }[];
  dirs: [number, number][];
  corners: { x: number; z: number }[];
  end: 'cave' | 'koheya' | 'joint' | 'heya';
  /** heya: 部屋の 元 */
  heya?: HeyaSource;
  /** joint: 階段の 段の 数（床が 1 マスずつ 上がる／下がる）と 向き */
  stairs: number;
  stairSgn: 1 | -1;
}

/** 出口の 向き t・横 p・最初の 中心 c1 */
export function exitOf(F: Frame, hub: Hub, s: number): { tx: number; tz: number; c1x: number; c1z: number; edge: number; px: number; pz: number } {
  const edge = s < 0 ? hub.vMin - 1 : hub.vMax + 1;
  const tx = F.lx * s;
  const tz = F.lz * s;
  return { tx, tz, c1x: F.x(hub.u, edge), c1z: F.z(hub.u, edge), edge, px: -tz, pz: tx };
}

export function build(
  G: Geo,
  b: ShaftBuilder,
  hub: Hub,
  y: number,
  spec: Spec,
  F: Frame,
  region: { x0: number; z0: number } | null,
  site: Site,
  chestCells: ReadonlySet<number>,
  rng: Rng,
  s: number,
): Cand | null {
  const { center, dirs, corners, end } = spec;
  const { tx: tdx, tz: tdz, c1x, c1z } = exitOf(F, hub, s);
  const seen = new Set<number>();
  const cells: PathCell[] = [];
  const add = (x: number, yy: number, z: number, part: PathCell['part']): void => {
    const k = keyOf(x, yy, z);
    if (seen.has(k)) return;
    seen.add(k);
    cells.push({ x, y: yy, z, part });
  };
  for (const c of center) {
    const [dx, dz] = dirs[c.leg]!;
    for (const j of [-1, 0, 1]) add(c.x - dz * j, y, c.z + dx * j, 'side');
  }
  for (const cn of corners) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) add(cn.x + dx, y, cn.z + dz, 'side');
  const lastC = center[center.length - 1]!;
  const [ldx, ldz] = dirs[lastC.leg]!;
  const torches: Pt3[] = [];
  center.forEach((c, i) => {
    if (i % S.road.torchEvery === 2) {
      const [dx, dz] = dirs[c.leg]!;
      const sg = (i / S.road.torchEvery) % 2 < 1 ? 1 : -1;
      torches.push({ x: c.x - dz * sg, y, z: c.z + dx * sg });
    }
  });
  for (const cn of corners) torches.push({ x: cn.x + 1, y, z: cn.z + 1 });
  torches.push({ x: lastC.x - ldz, y, z: lastC.z + ldx });
  torches.push({ x: lastC.x + ldz, y, z: lastC.z - ldx }); // 出口の 両がわ（§4.5.2）
  let to: Pt = { x: lastC.x, y, z: lastC.z };
  const exempt = new Set<number>();
  let faceY = y;
  let faceX = lastC.x;
  let faceZ = lastC.z;
  const roomPart = end === 'joint' ? 'joint' : 'koheya';
  if (end === 'koheya' || end === 'joint') {
    const K = end === 'joint' ? S.side.jointSize : S.side.koheyaSize;
    const half = (K - 1) / 2;
    for (let k = 1; k <= K; k++) for (let j = -half; j <= half; j++) add(lastC.x + ldx * k - ldz * j, y, lastC.z + ldz * k + ldx * j, roomPart);
    const mid = Math.ceil(K / 2);
    to = { x: lastC.x + ldx * mid, y, z: lastC.z + ldz * mid };
    torches.push({ ...to });
    if (end === 'joint') {
      // 階段: 床が 1 マスずつ 上がる／下がる。はば 3
      for (let k = 1; k <= spec.stairs; k++) {
        const yy = y + spec.stairSgn * k;
        const sx = lastC.x + ldx * (K + k);
        const sz = lastC.z + ldz * (K + k);
        for (const j of [-1, 0, 1]) add(sx - ldz * j, yy, sz + ldx * j, 'joint');
        // 階段にも 2 だんおきに たいまつ〔光 6 を ほしょうする〕
        if (k % 2 === 0 || k === spec.stairs) torches.push({ x: sx - ldz * (k % 4 < 2 ? 1 : -1), y: yy, z: sz + ldx * (k % 4 < 2 ? 1 : -1) });
        if (k === spec.stairs) torches.push({ x: sx + ldz * (k % 4 < 2 ? 1 : -1), y: yy, z: sz - ldx * (k % 4 < 2 ? 1 : -1) }); // 出口の 両がわ
      }
      faceY = y + spec.stairSgn * spec.stairs;
      faceX = lastC.x + ldx * (K + spec.stairs);
      faceZ = lastC.z + ldz * (K + spec.stairs);
      to = { x: faceX, y: faceY, z: faceZ };
    }
  }
  let prep: HeyaPrep | null = null;
  if (end === 'heya') {
    if (center.some((c) => spec.heya!.oldAt(c.x, c.z))) return null; // 古い 列が かかる 横穴は 1C の 形のまま
    const tail = heyaTail(spec.heya!, y, lastC, ldx, ldz, center);
    if (!tail) return null;
    prep = tail.prep;
    for (const c of tail.cells) add(c.x, c.y, c.z, 'side');
    torches.push(...tail.torches);
    faceX = tail.face.x;
    faceY = tail.face.y;
    faceZ = tail.face.z;
    to = { x: faceX, y: faceY, z: faceZ };
  }
  if (end === 'cave' || end === 'joint' || end === 'heya') {
    for (let j = -1; j <= 1; j++) for (let h = 0; h < 4; h++) exempt.add(keyOf(faceX + ldx - ldz * j, faceY + h, faceZ + ldz + ldx * j));
  }
  // 範囲
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const c of [...b.path, ...cells]) {
    x0 = Math.min(x0, c.x);
    x1 = Math.max(x1, c.x);
    z0 = Math.min(z0, c.z);
    z1 = Math.max(z1, c.z);
  }
  if (prep) {
    x0 = Math.min(x0, prep.box.x0 - 1);
    x1 = Math.max(x1, prep.box.x1 + 1);
    z0 = Math.min(z0, prep.box.z0 - 1);
    z1 = Math.max(z1, prep.box.z1 + 1);
  }
  if (site.mound) {
    const mh = site.mound.tc;
    x0 = Math.min(x0, site.mound.x - mh);
    x1 = Math.max(x1, site.mound.x + mh);
    z0 = Math.min(z0, site.mound.z - mh);
    z1 = Math.max(z1, site.mound.z + mh);
  }
  if (x1 - x0 + 1 > MAX_BOX || z1 - z0 + 1 > MAX_BOX) return null;
  if (region) {
    const R = S.region;
    if (x0 - 4 < region.x0 || x1 + 4 >= region.x0 + R || z0 - 4 < region.z0 || z1 + 4 >= region.z0 + R) return null;
  }
  for (const r of b.reserved) {
    for (const c of cells) if (c.x >= r.x0 - 3 && c.x <= r.x1 + 3 && c.z >= r.z0 - 3 && c.z <= r.z1 + 3 && c.y >= r.y0 - 3 && c.y <= r.y1 + 3) return null;
  }
  for (const c of cells) {
    if (G.nearMouth(c.x, c.z, 2)) return null;
    if (G.special(c.x, c.z, 2)) return null;
    if (!coverOk(G, site, c, airHeightOf(c.part))) return null;
  }
  if (cells.filter((c) => c.part === 'side').length > 3 * S.side.lengthMax) return null;
  // ほかの 横穴と 上から 見て かさならない〔かたまりを 見わけやすく する〕
  const sideXZ = new Set<number>();
  for (const p of b.path) if (p.part === 'side' || p.part === 'koheya' || p.part === 'joint') sideXZ.add(p.x * 100003 + p.z);
  if (sideXZ.size > 0) {
    for (const c of cells) {
      if (c.part !== 'side' && c.part !== 'koheya' && c.part !== 'joint') continue;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (sideXZ.has((c.x + dx) * 100003 + c.z + dz)) return null;
    }
  }
  // 空気・かべの ぶつかり
  const air = new Set<number>();
  for (const c of cells) for (let h = 0; h < airHeightOf(c.part); h++) air.add(keyOf(c.x, c.y + h, c.z));
  const door = new Set<number>();
  const entry = new Set<number>();
  const px = -tdz;
  const pz = tdx;
  for (let j = -1; j <= 1; j++) {
    for (let h = 0; h < 4; h++) {
      door.add(keyOf(c1x + px * j, y + h, c1z + pz * j));
      entry.add(keyOf(c1x - tdx + px * j, y + h, c1z - tdz + pz * j));
    }
  }
  for (const k of air) {
    if (b.air.has(k)) return null;
    if (b.ring.has(k) && !door.has(k)) return null;
    if (chestCells.has(k)) return null;
  }
  const ring = new Set<number>();
  ringFor(air, cells, exempt, ring);
  for (const k of ring) if (b.air.has(k) && !entry.has(k)) return null;
  const v = new Virt(G, b, air, ring, exempt);
  const oreCells: number[] = [];
  const oreBlocks: number[] = [];
  let built: HeyaBuilt | undefined;
  if (end === 'cave' || end === 'joint') {
    // 先: 前の 面が ひらいて いて、4 歩 いじょう 先の ほらあなの 床へ 行き来 できる
    const pathKeys = new Set<number>(b.pathKeys);
    for (const c of cells) pathKeys.add(keyOf(c.x, c.y, c.z));
    const out = v.walk(to, S.side.walkLimit, (p, d) => d >= S.side.beyondSteps && !pathKeys.has(keyOf(p.x, p.y, p.z)));
    if (!out.hit) return null;
    const back = v.walk(out.hit, S.side.walkLimit, (p) => p.x === to.x && p.y === to.y && p.z === to.z);
    if (!back.hit) return null;
  } else if (end === 'heya') {
    // 坑道の 空気・かべを「自然の ほらあな」に して 部屋を 作る。出口は 部屋の 床の 高さ
    const hard = (k: number): boolean => {
      const p = b.put.get(k);
      return p !== undefined && p !== TORCH;
    };
    const over: Overlay = {
      air: (k) => !hard(k) && (air.has(k) || b.air.has(k)),
      solid: (k) => hard(k) || ring.has(k) || b.ring.has(k),
      taken: (k) => air.has(k) || b.air.has(k) || ring.has(k) || b.ring.has(k) || b.put.has(k),
    };
    built = prep!.stage(over, { x: faceX, y: faceY, z: faceZ }) ?? undefined;
    if (!built) return null;
  } else {
    // こべやの かべに その 層の 鉱石を 4 こ いじょう
    const layer = layerAt(y) ?? 'fukai';
    const ores = layerOres(layer);
    if (ores.length === 0) return null;
    const wall: number[] = [];
    for (const r of cells) {
      if (r.part !== 'koheya') continue;
      for (const [dx, dz] of FOUR) {
        for (let h = 0; h < 4; h++) {
          const k = keyOf(r.x + dx, y + h, r.z + dz);
          if (!air.has(k) && ring.has(k)) wall.push(k);
        }
      }
    }
    const uniq = [...new Set(wall)]
      .map((k) => ({ k, r: hashInts(G.seed, keyX(k), keyZ(k), keyY(k), 91) }))
      .sort((p, q) => p.r - q.r)
      .slice(0, S.side.koheyaOres + 1);
    if (uniq.length < S.side.koheyaOres) return null;
    for (const [i, u] of uniq.entries()) {
      oreCells.push(u.k);
      oreBlocks.push(ores[(i + Math.floor(rng() * 7)) % ores.length]!);
    }
  }
  return { cells, torches, exempt, to, end, heya: built, oreCells, oreBlocks, door, entry };
}

export function commit(b: ShaftBuilder, hub: Hub, c: Cand, length: number, bends: number, s: number, F: Frame): ShaftSide {
  for (const cell of c.cells) b.addCell(cell, cell.part);
  for (const t of c.torches) b.put.set(keyOf(t.x, t.y, t.z), TORCH);
  for (const k of c.exempt) b.exempt.add(k);
  b.buildRing();
  c.oreCells.forEach((k, i) => b.put.set(k, c.oreBlocks[i]!));
  const from = { x: F.x(hub.u, s < 0 ? hub.vMin : hub.vMax), y: hub.y, z: F.z(hub.u, s < 0 ? hub.vMin : hub.vMax) };
  const layer = (layerAt(hub.y) ?? 'fukai') as ShaftLayer;
  // 実際の マス数の 目安〔はば 3〕と、つなぎの へやの 角（3×3 が 1 つ 数えられる）も 計画の 値に ふくめる
  const sideCells = c.cells.filter((x) => x.part === 'side').length;
  if (c.heya) b.reserved.push({ ...c.heya.cave.box });
  const heya = c.heya ? { end: c.heya.cave.shaft === null ? ('cave' as const) : ('heya' as const), heyaHit: true, heyaKind: c.heya.cave.kind as string | null, cave: c.heya.cave.id } : { end: c.end, heyaHit: false, heyaKind: null };
  return { layer, from, to: c.to, ...heya, length: Math.min(S.side.lengthMax, Math.max(length, Math.ceil(sideCells / 3))), bends: Math.min(S.side.bendsMax, bends + (c.end === 'joint' ? 1 : 0)) };
}
