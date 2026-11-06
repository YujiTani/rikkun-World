import { SEA_Y } from '../../contracts';
import { colKey } from '../stream/ring';
import { CAVE_CONFIG as C, CAVE_LAYERS, CAVE_KIND_LIST, type CaveKind } from './mineCaveConfig';
import { buildRoom, finishRoom, stageRoom, type BuiltRoom, type RoomColOps, type RoomStage } from './mineCaveRoom';
import { makeShape } from './mineCaveShape';
import { layerSpan } from './mineLayers';
import type { MineLayerId } from './mineConfig';
import type { Geo } from './mineShaftSite';
import { colId } from './mineHiroiRoom';
import { tryHiroiPlan } from './mineHiroiPlan';
import { exitOps, plainLayout } from './mineHiroiScene';
import { hiroiShape, turnPlan, worldPlan, type HiroiLayout, type HiroiWorldPlan, type Turn } from './mineHiroiShape';
import type { HiroiWork } from './mineHiroiTable';
import { createRng, hash01, hashInts, randInt, subSeed, type Rng } from './random';

/**
 * 区画 × 層の 抽選と、部屋の 置き場所（MINE-1D §4.7.1）。列を 作る ときは 自分の 区画の 部屋だけ 見る（列 1 つで 見る 区画は 1 つ）。
 * 計画は 区画ごとに 1 回 作って おぼえる。同じ シード・同じ 古い 列の 一覧なら いつも 同じ。
 */

/** 部屋が 世界の 他の 物と ぶつからないか 聞く 相手（ShaftWorld） */
export interface CaveHost {
  readonly seed: number;
  readonly G: Geo;
  /** 古い 部屋の 列か（colKey） */
  isOldHeya(k: number): boolean;
  /** 箱（両はし ふくむ）の 近くに 坑道の 道・へやが あるか */
  nearShaft(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean;
}

export interface PlacedCave {
  id: string;
  kind: CaveKind;
  layer: MineLayerId;
  box: BuiltRoom['box'];
  room: BuiltRoom;
  /** 4 版: 坑道の へやは その 坑道の id */
  shaft: string | null;
  /** ひろい ほらあなの 計画（ほかは null） */
  hiroi: HiroiWorldPlan | null;
}

/** ひろい ほらあなの 計画を ためした 記録（窓口 hiroiTries の 1 行） */
export interface HiroiTryRow {
  rx: number;
  rz: number;
  layer: MineLayerId;
  shaft: string | null;
  cave: string | null;
  placed: boolean;
  small: boolean;
  work: HiroiWork;
}

export interface CaveRollRow {
  rx: number;
  rz: number;
  layer: MineLayerId;
  kind: CaveKind | null;
  land: number;
  placed: boolean;
}

interface RegionPlan {
  rolls: (CaveKind | null)[];
  rooms: (PlacedCave | null)[];
  tries: (HiroiTryRow | null)[];
}

const R = C.region;

/** えらんだ 場所: 箱 と 前半まで 作った 部屋 */
interface Spot {
  box: BuiltRoom['box'];
  stage: RoomStage;
}

/** 出口の 前 4 マスに かかる 床の こぶ（局所の 番号）。根もとの まるが かかる 柱が あれば null（その 場所は やめる） */
function frontHits(l: HiroiLayout, fronts: Set<number>, ox: number, oz: number): { x: number; z: number }[] | null {
  if (fronts.size === 0) return [];
  for (const p of l.pillars) {
    const r = Math.ceil(p.widths[0]! / 2);
    for (let z = p.z - r; z <= p.z + r; z++) for (let x = p.x - r; x <= p.x + r; x++) if (Math.hypot(x - p.x, z - p.z) < p.widths[0]! / 2 && fronts.has(colId(ox + x, oz + z))) return null;
  }
  return l.bumps.filter((b) => fronts.has(colId(ox + b.x, oz + b.z)));
}

/** こぶ（床）を 取りのぞいた 計画 */
function dropBumps(l: HiroiLayout, drop: { x: number; z: number }[]): HiroiLayout {
  const lo = l.lo.slice();
  for (const b of drop) lo[b.z * l.size.x + b.x] = 0;
  return { ...l, lo, bumps: l.bumps.filter((b) => !drop.includes(b)) };
}

export class CaveWorld {
  private readonly regions = new Map<number, RegionPlan>();

  constructor(private readonly host: CaveHost) {}

  private key(rx: number, rz: number): number {
    return (rx + 100000) * 200003 + (rz + 100000);
  }

  /** その 区画・層の 抽選（当たった 種類。はずれは null） */
  rollKind(rx: number, rz: number, layer: MineLayerId): CaveKind | null {
    const table = C.rolls[layer] as Partial<Record<CaveKind, number>>;
    let u = hash01(subSeed(this.host.seed, 931), rx, rz, CAVE_LAYERS.indexOf(layer));
    for (const kind of CAVE_KIND_LIST) {
      const p = table[kind];
      if (p === undefined) continue;
      if (u < p) return kind;
      u -= p;
    }
    return null;
  }

  /** 区画の 陸の わりあい（0〜1） */
  land(rx: number, rz: number): number {
    const n = C.landSamples;
    let land = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (this.host.G.h(rx * R + Math.floor(((i + 0.5) * R) / n), rz * R + Math.floor(((j + 0.5) * R) / n)) > SEA_Y) land++;
      }
    }
    return land / (n * n);
  }

  region(rx: number, rz: number): RegionPlan {
    const key = this.key(rx, rz);
    let p = this.regions.get(key);
    if (p) return p;
    if (this.regions.size >= C.regionCap) this.regions.clear();
    p = { rolls: [], rooms: [], tries: [] };
    const placed: PlacedCave[] = [];
    CAVE_LAYERS.forEach((layer, li) => {
      const kind = this.rollKind(rx, rz, layer);
      p!.rolls.push(kind);
      const room = kind ? this.place(rx, rz, layer, li, kind, placed, p!) : null;
      if (room) placed.push(room);
      p!.rooms.push(room);
      if (p!.tries.length < p!.rooms.length) p!.tries.push(null);
    });
    this.regions.set(key, p);
    return p;
  }

  private place(rx: number, rz: number, layer: MineLayerId, li: number, kind: CaveKind, placed: PlacedCave[], region: RegionPlan): PlacedCave | null {
    const { seed } = this.host;
    const rng = createRng(hashInts(subSeed(seed, 932), rx, rz, li));
    const id = `c${rx}_${rz}_${layer}`;
    if (kind === 'hiroi') return this.placeHiroi(rx, rz, layer, li, id, placed, region, rng);
    const shape = makeShape(kind, rng);
    if (!shape) return null;
    const at = this.spot(rx, rz, layer, shape.sx, shape.sy, shape.sz, rng, placed, (x0, y0, z0) => stageRoom({ G: this.host.G, seed, kind, shape, ox: x0, oy: y0, oz: z0, rng }));
    return at ? this.finish(id, kind, layer, at) : null;
  }

  /** ひろい ほらあな: 計画（局所）を 作り、向きを きめて、場所を さがす。計画は 区画 × 層ごとに 1 つ */
  private placeHiroi(rx: number, rz: number, layer: MineLayerId, li: number, id: string, placed: PlacedCave[], region: RegionPlan, rng: Rng): PlacedCave | null {
    const { seed } = this.host;
    const planSeed = hashInts(subSeed(seed, 933), rx, rz, li);
    const t = tryHiroiPlan(planSeed);
    const row: HiroiTryRow = { rx, rz, layer, shaft: null, cave: null, placed: t.plan !== null, small: t.small, work: t.work };
    region.tries[li] = row;
    if (!t.plan) return null;
    const turn = (hashInts(subSeed(seed, 934), rx, rz, li) & 3) as Turn;
    const cave = this.hiroiAt(rx, rz, layer, id, placed, rng, turnPlan(t.plan, turn), t.work);
    row.cave = cave ? id : null;
    return cave;
  }

  /** 向きの きまった 計画を 場所に ほる。出口の 前に こぶ・柱が かかる 場所は さける（こぶは けずる） */
  private hiroiAt(rx: number, rz: number, layer: MineLayerId, id: string, placed: PlacedCave[], rng: Rng, layout0: HiroiLayout, work: HiroiWork): PlacedCave | null {
    const { G, seed } = this.host;
    const { x: sx, z: sz, h: sy } = layout0.size;
    const build = (x0: number, y0: number, z0: number): { room: RoomStage; layout: HiroiLayout } | null => {
      let layout = layout0;
      for (let pass = 0; pass < 2; pass++) {
        const room = stageRoom({ G, seed, kind: 'hiroi', shape: hiroiShape(layout), ox: x0, oy: y0, oz: z0, rng: createRng(hashInts(subSeed(seed, 935), rx, rz, pass)) });
        const hit = frontHits(layout, room.fronts, x0, z0);
        if (hit === null) return null;
        if (hit.length === 0) return { room, layout };
        layout = dropBumps(layout, hit);
      }
      return null;
    };
    const layouts = new Map<RoomStage, HiroiLayout>();
    const at = this.spot(rx, rz, layer, sx, sy, sz, rng, placed, (x0, y0, z0) => {
      const r = build(x0, y0, z0);
      if (r) layouts.set(r.room, r.layout);
      return r?.room ?? null;
    });
    const layout = at ? layouts.get(at.stage) : undefined;
    if (!at || !layout) return null;
    const cave = this.finish(id, 'hiroi', layer, at);
    cave.hiroi = worldPlan(layout, { x: cave.box.x0, y: cave.box.y0, z: cave.box.z0 }, work);
    return cave;
  }

  /** 場所を さがす: 層の はんい・地面・海・口・古い 列・坑道に ぶつからない 所。出口の ある 場所を 先に さがす */
  private spot(rx: number, rz: number, layer: MineLayerId, sx: number, sy: number, sz: number, rng: Rng, placed: PlacedCave[], make: (x0: number, y0: number, z0: number) => RoomStage | null): Spot | null {
    const { G } = this.host;
    const span = layerSpan(layer);
    let fallback: Spot | null = null;
    for (let t = 0; t < C.placeTries; t++) {
      const x0 = rx * R + C.edge + randInt(rng, 0, R - 2 * C.edge - sx);
      const z0 = rz * R + C.edge + randInt(rng, 0, R - 2 * C.edge - sz);
      let hmin = Infinity;
      for (let z = z0 - 1; z <= z0 + sz; z++) for (let x = x0 - 1; x <= x0 + sx; x++) hmin = Math.min(hmin, G.h(x, z));
      const need = hmin <= SEA_Y - 1 ? C.roof.sea : C.roof.ground;
      // 洞くつの 口の 下の へやより 下に 置く（口と かさならない）
      let mouth = Infinity;
      for (let z = z0 - 3; z <= z0 + sz + 2; z += 3) for (let x = x0 - 3; x <= x0 + sx + 2; x += 3) mouth = Math.min(mouth, G.mouthBottom(x, z, 3) ?? Infinity);
      const lo = Math.max(span.lo, 3);
      const hi = Math.min(span.hi - sy + 1, hmin - need - sy, mouth - 6 - sy);
      if (hi < lo) continue;
      const y0 = lo + Math.floor(rng() * (hi - lo + 1));
      const box = { x0, y0, z0, x1: x0 + sx - 1, y1: y0 + sy - 1, z1: z0 + sz - 1 };
      if (!this.clear(box, placed)) continue;
      const stage = make(x0, y0, z0);
      if (!stage) continue;
      if (stage.openings > 0) return { box, stage };
      fallback ??= { box, stage };
    }
    return fallback;
  }

  /** えらんだ 場所の 部屋を 仕上げる */
  private finish(id: string, kind: CaveKind, layer: MineLayerId, at: Spot): PlacedCave {
    return { id, kind, layer, box: at.box, room: finishRoom(at.stage), shaft: null, hiroi: null };
  }

  /** 口・いけ・古い 列・坑道・同じ 区画の ほかの 部屋と ぶつからないか */
  private clear(b: BuiltRoom['box'], placed: PlacedCave[]): boolean {
    const { G } = this.host;
    const m = C.edge;
    for (let cz = (b.z0 - m) >> 4; cz <= (b.z1 + m) >> 4; cz++) for (let cx = (b.x0 - m) >> 4; cx <= (b.x1 + m) >> 4; cx++) if (this.host.isOldHeya(colKey(cx, cz))) return false;
    for (let z = b.z0 - 3; z <= b.z1 + 3; z += 4) for (let x = b.x0 - 3; x <= b.x1 + 3; x += 4) if (G.special(x, z, 3)) return false;
    const g = C.gap;
    for (const o of placed) if (o.box.x0 - g <= b.x1 && b.x0 <= o.box.x1 + g && o.box.z0 - g <= b.z1 && b.z0 <= o.box.z1 + g && o.box.y0 - g <= b.y1 && b.y0 <= o.box.y1 + g) return false;
    if (this.host.nearShaft(b.x0 - g, b.y0 - g, b.z0 - g, b.x1 + g, b.y1 + g, b.z1 + g)) return false;
    return true;
  }

  /** 範囲の 抽選の 結果 */
  rolls(x0: number, z0: number, x1: number, z1: number): CaveRollRow[] {
    const out: CaveRollRow[] = [];
    for (let rz = Math.floor(z0 / R); rz <= Math.floor(z1 / R); rz++) {
      for (let rx = Math.floor(x0 / R); rx <= Math.floor(x1 / R); rx++) {
        const land = this.land(rx, rz);
        const plan = this.region(rx, rz);
        CAVE_LAYERS.forEach((layer, li) => out.push({ rx, rz, layer, kind: plan.rolls[li]!, land, placed: plan.rooms[li] !== null }));
      }
    }
    return out;
  }

  /** 箱が 範囲に かかる 部屋ぜんぶ（抽選の 部屋） */
  caves(x0: number, z0: number, x1: number, z1: number): PlacedCave[] {
    const out: PlacedCave[] = [];
    for (let rz = Math.floor(z0 / R); rz <= Math.floor(z1 / R); rz++) {
      for (let rx = Math.floor(x0 / R); rx <= Math.floor(x1 / R); rx++) {
        for (const c of this.region(rx, rz).rooms) if (c && c.box.x0 <= x1 && c.box.x1 >= x0 && c.box.z0 <= z1 && c.box.z1 >= z0) out.push(c);
      }
    }
    return out;
  }

  /** 性能の くらべ用の 場面（hiroiScene）。この 世界は 場面の 部屋だけに なる */
  private sceneOps: Map<number, RoomColOps[]> | null = null;

  get inScene(): boolean {
    return this.sceneOps !== null;
  }

  sceneColumn(cx: number, cz: number): RoomColOps[] | null {
    return this.sceneOps?.get(colKey(cx, cz)) ?? null;
  }

  /** 部屋の 乱数 seed の ひろい ほらあなを あさい 層に 1 つ ほる 場面。出口は 南の かべ・立つ 所は 出口から 4 マス（北向き）。plain は 柱・こぶ・鉱石 なし */
  scene(seed: number, plain: boolean): { caveId: string; size: { x: number; z: number }; stand: { x: number; y: number; z: number; facing: 'n' } } {
    const t = tryHiroiPlan(seed);
    if (!t.plan) throw new Error(`部屋の 乱数 ${seed} では 計画が 作れない`);
    const layout = turnPlan(t.plan, 0);
    this.regions.clear();
    for (let n = 0; n < 64; n++) {
      const rx = 24 + (n % 8) * 2;
      const rz = 24 + Math.floor(n / 8) * 2;
      const rng = createRng(hashInts(subSeed(this.host.seed, 936), rx, rz, seed));
      const cave = this.hiroiAt(rx, rz, 'asai', `c${rx}_${rz}_asai`, [], rng, layout, t.work);
      if (!cave) continue;
      const { x0, y0, z0 } = cave.box;
      const room = plain ? buildRoom({ G: this.host.G, seed: this.host.seed, kind: 'hiroi', shape: hiroiShape(plainLayout(layout), true), ox: x0, oy: y0, oz: z0, rng: createRng(1) }) : cave.room;
      const ops = new Map<number, RoomColOps[]>();
      for (const [k, o] of room.ops) ops.set(k, [o]);
      for (const [k, o] of exitOps(layout, x0, y0, z0)) (ops.get(k) ?? ops.set(k, []).get(k)!).push(o);
      this.sceneOps = ops;
      return { caveId: cave.id, size: { x: layout.size.x, z: layout.size.z }, stand: { x: x0 + layout.exit.x, y: y0, z: z0 + layout.exit.z - 4, facing: 'n' } };
    }
    throw new Error('場面を 置ける 場所が ない');
  }

  /**
   * 中心の まわりの 区画の 計画を、あいた 時間に ms 以内だけ すすめる（列を 作る ときに 計画で ひっかからない ため）。近い 区画から。
   * 区画 1 つの 計画は 途中で 止められない ので、時間が のこって いる 間だけ 次の 区画を はじめる
   */
  warm(centers: readonly { x: number; z: number }[], ms: number, reach: number): void {
    const t0 = performance.now();
    const list: { rx: number; rz: number; d: number }[] = [];
    const seen = new Set<number>();
    for (const c of centers) {
      for (let rz = Math.floor((c.z - reach) / R); rz <= Math.floor((c.z + reach) / R); rz++) {
        for (let rx = Math.floor((c.x - reach) / R); rx <= Math.floor((c.x + reach) / R); rx++) {
          const key = this.key(rx, rz);
          if (seen.has(key) || this.regions.has(key)) continue;
          seen.add(key);
          list.push({ rx, rz, d: Math.min(...centers.map((q) => Math.hypot((rx + 0.5) * R - q.x, (rz + 0.5) * R - q.z))) });
        }
      }
    }
    list.sort((a, b) => a.d - b.d);
    for (const r of list) {
      if (performance.now() - t0 >= ms) return;
      this.region(r.rx, r.rz);
    }
  }

  /** 範囲の 区画で ひろい ほらあなの 計画を ためした 記録（置けなかった 物も） */
  hiroiTries(x0: number, z0: number, x1: number, z1: number): HiroiTryRow[] {
    const out: HiroiTryRow[] = [];
    for (let rz = Math.floor(z0 / R); rz <= Math.floor(z1 / R); rz++) {
      for (let rx = Math.floor(x0 / R); rx <= Math.floor(x1 / R); rx++) for (const row of this.region(rx, rz).tries) if (row) out.push({ ...row, work: { ...row.work } });
    }
    return out;
  }

  byId(id: string): PlacedCave | null {
    const m = /^c(-?\d+)_(-?\d+)_(\w+)$/.exec(id);
    if (!m) return null;
    const li = CAVE_LAYERS.indexOf(m[3] as MineLayerId);
    return li < 0 ? null : (this.region(Number(m[1]), Number(m[2])).rooms[li] ?? null);
  }

  /** いちばん 近い 部屋（横の まっすぐの きょり。maxDist まで） */
  find(kind: CaveKind, fx: number, fz: number, maxDist: number): PlacedCave | null {
    const rx0 = Math.floor(fx / R);
    const rz0 = Math.floor(fz / R);
    let best: PlacedCave | null = null;
    let bestD = Infinity;
    const rMax = Math.ceil(maxDist / R) + 1;
    for (let r = 0; r <= rMax; r++) {
      if (best && (r - 1) * R > bestD) break;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (const c of this.region(rx0 + dx, rz0 + dz).rooms) {
            if (!c || c.kind !== kind) continue;
            const d = Math.hypot((c.box.x0 + c.box.x1 + 1) / 2 - fx, (c.box.z0 + c.box.z1 + 1) / 2 - fz);
            if (d <= maxDist && d < bestD) {
              best = c;
              bestD = d;
            }
          }
        }
      }
    }
    return best;
  }

  /** (x, y, z) は どの 部屋の 空気か */
  kindAt(x: number, y: number, z: number): CaveKind | null {
    for (const c of this.region(Math.floor(x / R), Math.floor(z / R)).rooms) if (c && c.room.has(x, y, z)) return c.kind;
    return null;
  }

  /** 列 (cx, cz) に 置く 物 */
  opsFor(cx: number, cz: number): RoomColOps[] | null {
    const k = colKey(cx, cz);
    let out: RoomColOps[] | null = null;
    for (const c of this.region(cx >> 2, cz >> 2).rooms) {
      const o = c?.room.ops.get(k);
      if (o) (out ??= []).push(o);
    }
    return out;
  }

  /** 列に 部屋が かかるか。かかる ときは 見る 区画が 1 つ */
  touches(cx: number, cz: number): boolean {
    return this.region(cx >> 2, cz >> 2).rooms.some((c) => c?.room.ops.has(colKey(cx, cz)));
  }
}
