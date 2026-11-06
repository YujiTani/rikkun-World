import { SEA_Y } from '../../contracts';
import { colKey } from '../stream/ring';
import { CAVE_CONFIG as C, CAVE_LAYERS, CAVE_KIND_LIST, type CaveKind } from './mineCaveConfig';
import { buildRoom, type BuiltRoom, type RoomColOps } from './mineCaveRoom';
import { makeShape } from './mineCaveShape';
import { layerSpan } from './mineLayers';
import type { MineLayerId } from './mineConfig';
import type { Geo } from './mineShaftSite';
import { createRng, hash01, hashInts, randInt, subSeed } from './random';

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
}

const R = C.region;

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
    p = { rolls: [], rooms: [] };
    const placed: PlacedCave[] = [];
    CAVE_LAYERS.forEach((layer, li) => {
      const kind = this.rollKind(rx, rz, layer);
      p!.rolls.push(kind);
      const room = kind ? this.place(rx, rz, layer, li, kind, placed) : null;
      if (room) placed.push(room);
      p!.rooms.push(room);
    });
    this.regions.set(key, p);
    return p;
  }

  private place(rx: number, rz: number, layer: MineLayerId, li: number, kind: CaveKind, placed: PlacedCave[]): PlacedCave | null {
    const { G, seed } = this.host;
    const rng = createRng(hashInts(subSeed(seed, 932), rx, rz, li));
    const shape = makeShape(kind, rng);
    if (!shape) return null;
    const { sx, sy, sz } = shape;
    const span = layerSpan(layer);
    let fallback: PlacedCave | null = null;
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
      const room = buildRoom({ G, seed, kind, shape, ox: x0, oy: y0, oz: z0, rng });
      const cave: PlacedCave = { id: `c${rx}_${rz}_${layer}`, kind, layer, box, room, shaft: null };
      if (room.stats.openings > 0) return cave;
      fallback ??= cave;
    }
    return fallback;
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
