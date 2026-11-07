import { colKey } from '../stream/ring';
import { layerAt } from './mineLayers';
import { Frame, ShaftBuilder } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import type { Geo, Site } from './mineShaftSite';
import type { PathCell, ShaftSide } from './mineShaftTypes';
import { CAVE_CONFIG as CC, type CaveKind } from './mineCaveConfig';
import type { HiroiTryRow, PlacedCave } from './mineCaves';
import { HEYA_TRIES, LINK_TRIES, cellsSig, heyaSource, pickKind, planBoxOk, type HeyaSource, type SideRef, type StartLink } from './mineShaftHeya';
import { scanFloors, tryAimed } from './mineSideAimed';
import { LIM_C, build, commit, exitOf, type Hub, type SideLim, type Spec } from './mineSideBuild';
import { createRng, hash01, hashInts, subSeed, type Rng } from './random';

/**
 * 横穴（MINE-1C。docs/design/MINE-1.md §4.5.2）: おどりば・いちばん 下の へやから 出る はば 3 の 平らな 道。
 * 先は ほらあなに 出る（cave）か、5×5 の こべや（koheya）。ほらあなに 出られるかは 世界の 空気を 計算で 見て 決める。
 */

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
export function tryWinding(G: Geo, b: ShaftBuilder, hub: Hub, rng: Rng, F: Frame, region: { x0: number; z0: number } | null, site: Site, chestCells: ReadonlySet<number>, s: number, heya?: HeyaSource, lim: SideLim = LIM_C, inc = false, accept?: (cells: readonly PathCell[]) => boolean): ShaftSide | null {
  const E = S.side;
  const { tx, tz, c1x, c1z } = exitOf(F, hub, s);
  const length = lim.lengthMin + Math.floor(rng() * (lim.lengthMax - lim.lengthMin + 1));
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
  const c = build(G, b, hub, hub.y, spec, F, region, site, chestCells, rng, s, lim);
  return c && (!accept || accept(c.cells)) ? commit(b, hub, c, length, bends, s, F, lim, inc) : null;
}
