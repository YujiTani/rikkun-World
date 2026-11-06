import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SEA_Y } from '../../contracts';
import { colKey } from '../stream/ring';
import { MINE_CONFIG } from './mineConfig';
import { layerAt } from './mineLayers';
import { Frame, ShaftBuilder, airHeightOf, keyOf, keyX, keyY, keyZ, ringFor, type Pt3 } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { coverOk, type Geo, type Site } from './mineShaftSite';
import type { PathCell, Pt, ShaftLayer, ShaftSide } from './mineShaftTypes';
import { CAVE_CONFIG as CC, type CaveKind } from './mineCaveConfig';
import type { Overlay } from './mineCaveGrid';
import type { HiroiTryRow, PlacedCave } from './mineCaves';
import { HEYA_TRIES, LINK_TRIES, cellsSig, heyaSource, heyaTail, pickKind, planBoxOk, type HeyaBuilt, type HeyaPrep, type HeyaSource, type SideRef, type StartLink } from './mineShaftHeya';
import { createRng, hash01, hashInts, subSeed, type Rng } from './random';

/**
 * 横穴（MINE-1C。docs/design/MINE-1.md §4.5.2）: おどりば・いちばん 下の へやから 出る はば 3 の 平らな 道。
 * 先は ほらあなに 出る（cave）か、5×5 の こべや（koheya）。ほらあなに 出られるかは 世界の 空気を 計算で 見て 決める。
 */

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

/** 計画中の 世界を 計算で 答える（ブロックは 作らない）。ほらあなの 空気は mineCaveAir、坑道の 計画は 重ねる */
class Virt {
  constructor(
    private readonly G: Geo,
    private readonly b: ShaftBuilder,
    private readonly air: ReadonlySet<number>,
    private readonly ring: ReadonlySet<number>,
    private readonly exempt: ReadonlySet<number>,
  ) {}

  solid(x: number, y: number, z: number): boolean {
    if (y <= 0) return true;
    const k = keyOf(x, y, z);
    const p = this.b.put.get(k);
    if (p !== undefined) return p !== TORCH;
    if (this.air.has(k) || this.b.air.has(k)) return false;
    if (this.ring.has(k) || this.b.ring.has(k)) return true;
    if (this.exempt.has(k)) return this.natural(x, y, z);
    return this.natural(x, y, z);
  }
  private natural(x: number, y: number, z: number): boolean {
    const h = this.G.h(x, z);
    if (y > h) return false;
    return !this.G.cave.airAt(x, y, z);
  }
  body(x: number, y: number, z: number): boolean {
    if (y <= 0) return false;
    const k = keyOf(x, y, z);
    if (this.air.has(k) || this.b.air.has(k)) return true;
    if (this.solid(x, y, z)) return false;
    return !(y <= SEA_Y && y > this.G.h(x, z));
  }
  standable(x: number, y: number, z: number): boolean {
    return this.body(x, y, z) && this.body(x, y + 1, z) && this.solid(x, y - 1, z);
  }
  step(a: Pt, dx: number, dz: number): Pt | null {
    const x = a.x + dx;
    const z = a.z + dz;
    if (this.standable(x, a.y, z)) return { x, y: a.y, z };
    if (this.standable(x, a.y - 1, z) && this.body(x, a.y + 1, z)) return { x, y: a.y - 1, z };
    if (this.standable(x, a.y + 1, z) && this.body(a.x, a.y + 2, a.z) && this.body(a.x, a.y + 3, a.z)) return { x, y: a.y + 1, z };
    return null;
  }
  /** from から 歩いて 行ける マス〔打ちきり limit〕。goal を 見つけたら 止める。`stop` が true を 返した マスも 返して 止める */
  walk(from: Pt, limit: number, stop?: (p: Pt, d: number) => boolean): { dist: Map<number, number>; hit: Pt | null } {
    const dist = new Map<number, number>();
    if (!this.standable(from.x, from.y, from.z)) return { dist, hit: null };
    dist.set(keyOf(from.x, from.y, from.z), 0);
    let frontier: Pt[] = [from];
    while (frontier.length > 0 && dist.size < limit) {
      const next: Pt[] = [];
      for (const a of frontier) {
        const d = dist.get(keyOf(a.x, a.y, a.z))!;
        for (const [dx, dz] of FOUR) {
          const n = this.step(a, dx, dz);
          if (!n) continue;
          const k = keyOf(n.x, n.y, n.z);
          if (dist.has(k)) continue;
          dist.set(k, d + 1);
          if (stop?.(n, d + 1)) return { dist, hit: n };
          next.push(n);
        }
      }
      frontier = next;
    }
    return { dist, hit: null };
  }
}

interface Cand {
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

const MAX_BOX = S.boxMax - 2 * S.boxMargin - 4;

/** 層の 鉱石の ブロック〔光る ほたるいしと 一番 まれな ダイヤは のぞく〕 */
function layerOres(layer: ShaftLayer): number[] {
  return MINE_CONFIG.ores.filter((r) => r.layer === layer && r.hidden !== true).map((r) => BLOCK_INDEX[r.block]);
}

/** 坑道の へやに 使う もの〔1D〕 */
export interface HeyaCtx {
  shaftId: string;
  /** 横穴ごとの くじ〔坑道の へや〕を 引くか。false は 1C の まま */
  lottery: boolean;
  /** はじまりの 坑道で なかほどの いちばん 上の 横穴を ほたるの ほらあなへ つなぐ ための ためし〔なければ 1C の 形〕 */
  link: StartLink | null;
  /** 古い 列〔坑道・部屋〕か */
  isOld(k: number): boolean;
}

export interface SidesOut {
  sides: ShaftSide[];
  rooms: PlacedCave[];
  tries: HiroiTryRow[];
  ref: SideRef;
}

/** 横穴を 計画する。短い 仕事ごとに yield する〔先読みが 時間で 止まれる ように。結果は 同じ〕 */
export function* planSides(G: Geo, b: ShaftBuilder, hubs: Hub[], start: boolean, rng: Rng, F: Frame, site: Site, chestCells: ReadonlySet<number>, hc: HeyaCtx): Generator<void, SidesOut | null> {
  const E = S.side;
  const inMid = (y: number): boolean => y >= E.startMidY[0] && y <= E.startMidY[1];
  const count = E.countMin + weightedIndex(rng, E.countWeights);
  const out: SidesOut = { sides: [], rooms: [], tries: [], ref: { sigs: [], target: -1 } };
  const sides = out.sides;
  // はじまりの 坑道は なかほど〔y 64〜84〕の おどりばを 先に
  const order = hubs
    .map((h, i) => ({ h, i, r: rng() }))
    .sort((p, q) => {
      if (start) {
        const pm = inMid(p.h.y) ? 0 : 1;
        const qm = inMid(q.h.y) ? 0 : 1;
        if (pm !== qm) return pm - qm;
      }
      return p.r - q.r;
    });
  const region = start ? null : { x0: Math.floor(site.x / S.region) * S.region, z0: Math.floor(site.z / S.region) * S.region };
  /** 古い 列〔坑道・部屋〕が かかる マスか */
  const oldCell = (c: { x: number; z: number }): boolean => {
    for (const dz of [-2, 0, 2]) for (const dx of [-2, 0, 2]) if (hc.isOld(colKey((c.x + dx) >> 4, (c.z + dz) >> 4))) return true;
    return false;
  };
  /** 道・山・部屋を 入れた 箱が 大きさ・区画の きまりに 合うか〔合わないと 計画ごと だめに なる ので へやの 形を 取りさげる〕 */
  const boxOk = (): boolean => planBoxOk(b.path, site, [...b.reserved, ...out.rooms.map((q) => q.box)], start);
  /** 坑道の へやを つくる 横穴〔決まった 種類で 横穴の 形を かえて ためす。t0 〜 t1 番の 形〕 */
  const heyaSide = function* (h: Hub, s0: number, kind: CaveKind, owner: string | null, t0: number, t1: number): Generator<void, { side: ShaftSide; t: number } | null> {
    const layer = layerAt(h.y) ?? 'fukai';
    const salt = hashInts(site.x, site.z, h.y, h.u);
    const src = heyaSource({ G, kind, layer, id: (box) => (owner === null ? `c${Math.floor(box.x0 / CC.region)}_${Math.floor(box.z0 / CC.region)}_nakahodo` : `${hc.shaftId}_h${out.rooms.length}`), shaft: owner, salt, rooms: b.reserved, isOld: hc.isOld, snap: owner === null });
    for (let t = t0; t < t1; t++) {
      yield; // 形を 1 つ ためす ごとに ひと休み
      const hrng = createRng(hashInts(subSeed(G.seed, 953), site.x, site.z, h.y, t));
      const side = tryWinding(G, b, h, hrng, F, region, site, chestCells, t % 2 === 0 ? s0 : -s0, src);
      const cave = src.built();
      if (side && cave) {
        out.rooms.push(cave);
        const row = src.row();
        if (row) out.tries.push(row);
        return { side, t };
      }
    }
    const row = src.row();
    if (row) out.tries.push(row);
    return null;
  };
  let slot = -1;
  const slotOf: number[] = [];
  for (const { h } of order) {
    yield;
    const haveMid = sides.some((d) => d.layer === 'nakahodo' && inMid(d.from.y));
    if (sides.length >= count && (!start || haveMid)) break;
    if (sides.length >= count && !inMid(h.y)) continue;
    slot++;
    const wantAimed = rng() < E.aimedChance;
    const s0 = rng() < 0.5 ? -1 : 1;
    // 坑道の へやの くじ〔横穴 1 本ごと。主の 乱数は つかわない〕
    const layer = layerAt(h.y) ?? 'fukai';
    const hit = hc.lottery && !start && hash01(subSeed(G.seed, 951), site.x, site.z, h.y, h.u) < CC.link[layer].chance;
    // くじに 当たった 種類〔部屋が 入らず はずれに した ときも のこす〕
    const hitKind = hit ? pickKind(layer, hash01(subSeed(G.seed, 952), site.x, site.z, h.y, h.u)) : null;
    const linkHere = hc.link !== null && slot === hc.link.ref.target;
    const snap0 = hit || linkHere ? b.snapshot() : null;
    const p0 = b.path.length;
    // まず 1C の 形を 作る〔主の 乱数は 1C と 同じだけ すすむ〕
    let side: ShaftSide | null = null;
    if (wantAimed) {
      for (const sg of [s0, -s0]) {
        if (side) break;
        const found = scanFloors(G, h, F, sg);
        yield;
        side = yield* tryAimed(G, b, h, rng, F, region, site, chestCells, sg, found);
      }
    }
    for (let t = 0; t < E.tries && side === null; t++) {
      yield;
      side = tryWinding(G, b, h, rng, F, region, site, chestCells, t % 2 === 0 ? s0 : -s0);
    }
    if (snap0 !== null) {
      const touchesOld = b.path.slice(p0).some(oldCell);
      if (linkHere) {
        // はじまりの 坑道: この 横穴を ほたるの ほらあなへ かえる〔1C の 形が 古い 列に かかる ときは かえない〕
        if (!side || touchesOld) return null;
        b.restore(snap0);
        const r = yield* heyaSide(h, s0, 'hotaru', null, hc.link!.from, LINK_TRIES);
        if (!r) return null;
        hc.link!.used = r.t;
        if (!boxOk()) return null;
        side = r.side;
      } else if (!touchesOld) {
        // 1C の 形が 古い 列に かからない ときだけ へやの 形を ためす。入らなければ 1C の 形
        const snapA = b.snapshot();
        const nr = out.rooms.length;
        const nt = out.tries.length;
        b.restore(snap0);
        const r = yield* heyaSide(h, s0, hitKind!, hc.shaftId, 0, HEYA_TRIES);
        if (r && boxOk()) side = r.side;
        else {
          out.rooms.length = nr; // 取りさげた 部屋は 記録からも 外す
          out.tries.length = nt;
          b.restore(snapA);
        }
      }
      if (hit && side) {
        side.heyaHit = true;
        side.heyaKind = hitKind;
      }
    }
    if (side) {
      sides.push(side);
      slotOf.push(slot);
    }
    out.ref.sigs.push(side ? cellsSig(b.path, p0) : null);
  }
  if (sides.length < 2) return null;
  if (start) {
    const top = sides.reduce((best, d, i) => (d.layer === 'nakahodo' && (best < 0 || d.from.y > sides[best]!.from.y) ? i : best), -1);
    out.ref.target = top < 0 ? -1 : slotOf[top]!;
  }
  if (hc.link) {
    // ほたるへ かえた 1 本の ほかは 1C の 計画と 1 マスも ちがわない こと
    const ref = hc.link.ref.sigs;
    if (out.ref.sigs.length !== ref.length) return null;
    for (let i = 0; i < ref.length; i++) if (i !== hc.link.ref.target && out.ref.sigs[i] !== ref[i]) return null;
  }
  return out;
}

function weightedIndex(rng: Rng, w: readonly number[]): number {
  let t = 0;
  for (const x of w) t += x;
  let r = rng() * t;
  for (let i = 0; i < w.length; i++) {
    r -= w[i]!;
    if (r < 0) return i;
  }
  return w.length - 1;
}

interface Spec {
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
function exitOf(F: Frame, hub: Hub, s: number): { tx: number; tz: number; c1x: number; c1z: number; edge: number; px: number; pz: number } {
  const edge = s < 0 ? hub.vMin - 1 : hub.vMax + 1;
  const tx = F.lx * s;
  const tz = F.lz * s;
  return { tx, tz, c1x: F.x(hub.u, edge), c1z: F.z(hub.u, edge), edge, px: -tz, pz: tx };
}

/** 自然の ほらあなの 床〔立てる マス〕か（計算だけ） */
function caveFloor(G: Geo, x: number, y: number, z: number): boolean {
  return G.cave.airAt(x, y, z) && G.cave.airAt(x, y + 1, z) && !G.cave.airAt(x, y - 1, z) && y - 1 <= G.h(x, z);
}

interface Found {
  a: number;
  o: number;
  dy: number;
}

/** 出口 s がわの ほらあなの 床を さがす: 前へ a・横へ o・高さ dy */
function scanFloors(G: Geo, hub: Hub, F: Frame, s: number): Found[] {
  const E = S.side;
  const { tx, tz, c1x, c1z, px, pz } = exitOf(F, hub, s);
  const y = hub.y;
  const found: Found[] = [];
  for (let a = E.aimMin; a <= E.aimMax; a += 2) {
    for (const o of E.aimLateral) {
      for (let dy = -E.jointStepMax; dy <= E.jointStepMax; dy++) {
        const fx = c1x + tx * a + px * o;
        const fz = c1z + tz * a + pz * o;
        if (!caveFloor(G, fx, y + dy, fz)) continue;
        // 1 段 下りる ときは 上も 空いて いる〔頭が ぶつからない〕
        if (dy === -1 && !(G.cave.airAt(fx, y + 1, fz) && G.cave.airAt(fx, y + 2, fz))) continue;
        // 先に 歩ける ひろがりが ある 床だけ〔となりの 4 マスの うち 2 つ いじょうが 床〕
        let nb = 0;
        for (const [ox, oz] of FOUR) if ([0, 1, -1].some((e) => caveFloor(G, fx + ox, y + dy + e, fz + oz))) nb++;
        if (nb >= 2) found.push({ a, o, dy });
      }
    }
  }
  return found;
}

function* tryAimed(G: Geo, b: ShaftBuilder, hub: Hub, rng: Rng, F: Frame, region: { x0: number; z0: number } | null, site: Site, chestCells: ReadonlySet<number>, s: number, found: Found[]): Generator<void, ShaftSide | null> {
  const E = S.side;
  const { tx, tz, c1x, c1z, px, pz } = exitOf(F, hub, s);
  const y = hub.y;
  for (let t = 0; t < E.aimTries && found.length > 0; t++) {
    const f = found.splice(Math.floor(rng() * found.length), 1)[0]!;
    const m = Math.abs(f.dy) <= E.caveStep ? 0 : Math.abs(f.dy);
    const tail = m > 0 ? E.jointSize + m : 0;
    // 最後の leg の 向き d
    const lateral = Math.abs(f.o) >= 2;
    const d: [number, number] = lateral ? [px * Math.sign(f.o), pz * Math.sign(f.o)] : [tx, tz];
    const center: Spec['center'] = [];
    const corners: Spec['corners'] = [];
    const dirs: [number, number][] = [[tx, tz]];
    let n1: number;
    if (!lateral) {
      n1 = f.a - tail;
      if (n1 < E.legMin) continue;
    } else {
      n1 = f.a + 1;
      dirs.push(d);
    }
    for (let k = 0; k < n1; k++) center.push({ x: c1x + tx * k, z: c1z + tz * k, leg: 0 });
    if (lateral) {
      const nlat = Math.abs(f.o) - 1 - tail;
      if (nlat < 1) continue;
      corners.push({ x: c1x + tx * (n1 - 1), z: c1z + tz * (n1 - 1) });
      for (let j = 1; j <= nlat; j++) center.push({ x: c1x + tx * (n1 - 1) + d[0] * j, z: c1z + tz * (n1 - 1) + d[1] * j, leg: 1 });
    }
    const spec: Spec = { center, dirs, corners, end: m > 0 ? 'joint' : 'cave', stairs: m, stairSgn: f.dy > 0 ? 1 : -1 };
    if (center.some((c) => G.nearMouth(c.x, c.z, 3))) continue;
    yield; // 1 つ ためす ごとに ひと休み
    const c = build(G, b, hub, y, spec, F, region, site, chestCells, rng, s);
    if (c) return commit(b, hub, c, Math.min(E.lengthMax, Math.max(E.lengthMin, center.length + tail)), corners.length, s, F);
  }
  return null;
}

function tryWinding(G: Geo, b: ShaftBuilder, hub: Hub, rng: Rng, F: Frame, region: { x0: number; z0: number } | null, site: Site, chestCells: ReadonlySet<number>, s: number, heya?: HeyaSource): ShaftSide | null {
  const E = S.side;
  const { tx, tz, c1x, c1z } = exitOf(F, hub, s);
  const length = E.lengthMin + Math.floor(rng() * (E.lengthMax - E.lengthMin + 1));
  const bends = weightedIndex(rng, E.bendWeights);
  const legs: number[] = [];
  let rest = length;
  for (let i = 0; i < bends; i++) {
    const hi = rest - E.legMin * (bends - i);
    if (hi < E.legMin) return null;
    const l = E.legMin + Math.floor(rng() * (hi - E.legMin + 1));
    legs.push(l);
    rest -= l;
  }
  legs.push(rest);
  const dirs: [number, number][] = [[tx, tz]];
  for (let i = 0; i < bends; i++) {
    const [dx, dz] = dirs[i]!;
    const sg = rng() < 0.5 ? -1 : 1;
    dirs.push([-dz * sg, dx * sg]);
  }
  const center: Spec['center'] = [];
  let px = c1x;
  let pz = c1z;
  for (let li = 0; li < legs.length; li++) {
    const [dx, dz] = dirs[li]!;
    for (let k = 0; k < legs[li]!; k++) {
      center.push({ x: px, z: pz, leg: li });
      if (k < legs[li]! - 1) {
        px += dx;
        pz += dz;
      }
    }
    if (li < legs.length - 1) {
      px += dirs[li + 1]![0];
      pz += dirs[li + 1]![1];
    }
  }
  const corners: { x: number; z: number }[] = [];
  for (let li = 0; li < legs.length - 1; li++) {
    const last = [...center].reverse().find((c) => c.leg === li)!;
    corners.push({ x: last.x, z: last.z });
  }
  const spec: Spec = { center, dirs, corners, end: heya ? 'heya' : 'koheya', heya, stairs: 0, stairSgn: 1 };
  const c = build(G, b, hub, hub.y, spec, F, region, site, chestCells, rng, s);
  return c ? commit(b, hub, c, length, bends, s, F) : null;
}

function build(
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

function commit(b: ShaftBuilder, hub: Hub, c: Cand, length: number, bends: number, s: number, F: Frame): ShaftSide {
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
