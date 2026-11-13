import { CHUNK_SIZE } from '../contracts';
import { CANAL, SURF, at, buildLayout, type Layout } from './townLayout';
import { TOWN, type Facing } from './townTuning';

/**
 * TOWN-1 1B-1: 街の 記録（保存する 数）と、世界の 座標への うつし・`town.info()` の 中身・安全地帯の しらべ。
 * 世界の ブロックを 書く 所は townWrite.ts、置き場所を 決める 所は townPlace.ts。ここは 計算だけ（Three.js・世界を 読まない）。
 */

/** 保存する 街の 記録（世界ごと 1 つ。同じ シードで 同じ 場所に 作りなおせる） */
export interface TownRecord {
  /** 街の 形の 版（TOWN.version） */
  v: number;
  /** 街の はんいの 西北の すみ（ブロック座標。x が 小さい 方・z が 小さい 方） */
  x0: number;
  z0: number;
  /** 門の 正面 */
  facing: Facing;
  /** 街の 地面の ブロックの y（`world.groundHeight` と 同じ） */
  groundY: number;
}

export interface P3 {
  x: number;
  y: number;
  z: number;
}
export interface XZ {
  x: number;
  z: number;
}
export interface Box {
  min: XZ;
  max: XZ;
}

/** `town.info()`（TOWN-1.md §6.1 の 1B-1 の 分。建物・人・やたい・アスレチック・木・ふんすいの 中身は 1B-2 で 入る） */
export interface TownInfo {
  center: P3;
  facing: Facing;
  /** 街の はんい（min・max は ふくむ マス。100 × 100） */
  bounds: Box;
  /** 安全の はんい（116 × 116） */
  safe: Box;
  groundY: number;
  terrace: Box & { y: number };
  plaza: P3;
  fountain: Box;
  gate: { pos: P3; top: P3 };
  lots: Box[];
  canal: {
    bottomY: number;
    water: XZ[];
    walk: XZ[];
    stairs: { bottom: P3; top: P3; light: P3; banner: P3 }[];
    bridges: Box[];
  };
  lights: { kind: 'toro' | 'stair'; pos: P3 }[];
  /** 1B-2 で 入る（いまは 空） */
  buildings: never[];
  npcs: never[];
  stalls: never[];
  trees: never[];
}

const N = TOWN.size;
const layout: Layout = buildLayout();
export const townLayout = (): Layout => layout;

/** ローカル (u, v) → 世界の マスの ずれ（街の 西北の すみから）。向きごとに まわす（うら返しは しない） */
function offsetOf(f: Facing, u: number, v: number): { i: number; j: number } {
  switch (f) {
    case 's':
      return { i: u, j: v };
    case 'n':
      return { i: N - 1 - u, j: N - 1 - v };
    case 'e':
      return { i: v, j: N - 1 - u };
    case 'w':
      return { i: N - 1 - v, j: u };
    default: {
      const never: never = f;
      throw new Error(`facing ${String(never)}`);
    }
  }
}

/** 世界の ずれ (i, j) → ローカル (u, v)（offsetOf の 逆） */
function localOf(f: Facing, i: number, j: number): { u: number; v: number } {
  switch (f) {
    case 's':
      return { u: i, v: j };
    case 'n':
      return { u: N - 1 - i, v: N - 1 - j };
    case 'e':
      return { u: N - 1 - j, v: i };
    case 'w':
      return { u: j, v: N - 1 - i };
    default: {
      const never: never = f;
      throw new Error(`facing ${String(never)}`);
    }
  }
}

/** 門の 正面の 向きの 単位ベクトル（世界の x・z） */
export const FACING_VEC: Readonly<Record<Facing, XZ>> = { n: { x: 0, z: -1 }, e: { x: 1, z: 0 }, s: { x: 0, z: 1 }, w: { x: -1, z: 0 } };

/** 門から スタートへの 見通しの みち: 地面の 上の 木・岩を 消す はば（マス。みちの 中心から） */
const CORRIDOR_HALF = 2.5;
/** スタートの この 近くは 見通しの みちを 作らない（はじまりの たいまつ・広場を まもる。マス） */
const CORRIDOR_SKIP_NEAR_START = 4;

export class TownPlan {
  readonly layout: Layout = layout;
  readonly bottomY: number;
  /** 石どうろうの マス（ローカルの 番号 at(u, v)） */
  readonly toroAt: ReadonlySet<number>;
  /** 石段の 上の 口: あかり（light）と のぼり（banner）の マス */
  readonly stairTopAt: ReadonlyMap<number, 'light' | 'banner'>;
  private readonly infoCache: TownInfo;
  private readonly gateWorld: XZ;

  /** spawn ＝ スタート地点の マス（見通しの みちの はじめ）。なければ みちを 作らない */
  constructor(readonly rec: TownRecord, private readonly spawn: XZ | null = null) {
    this.bottomY = rec.groundY - TOWN.canal.depth;
    this.toroAt = new Set(layout.toro.map((t) => at(t.u, t.v)));
    const tops = new Map<number, 'light' | 'banner'>();
    for (const st of layout.stairs) {
      tops.set(at(st.top.u, st.top.v), 'light');
      tops.set(at(st.top.u + Math.abs(st.dir.dv), st.top.v + Math.abs(st.dir.du)), 'banner');
    }
    this.stairTopAt = tops;
    const g = this.toWorld(layout.gate.u, layout.gate.v);
    this.gateWorld = { x: g.x + 0.5, z: g.z + 0.5 };
    this.infoCache = this.buildInfo();
  }

  /** 見通しの みちの 中か（街・すその 外。スタートの そばは のぞく） */
  inCorridor(x: number, z: number): boolean {
    const s = this.spawn;
    if (s === null || this.inTown(x, z)) return false;
    const ax = s.x + 0.5;
    const az = s.z + 0.5;
    const px = Math.floor(x) + 0.5;
    const pz = Math.floor(z) + 0.5;
    if (Math.hypot(px - ax, pz - az) < CORRIDOR_SKIP_NEAR_START) return false;
    const dx = this.gateWorld.x - ax;
    const dz = this.gateWorld.z - az;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t)) <= CORRIDOR_HALF;
  }

  /** 列 (cx, cz) に 街・すそ・見通しの みちが かかるか（かからなければ 書かない） */
  touchesChunk(cx: number, cz: number): boolean {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const s = TOWN.skirt;
    const r = this.rec;
    if (x0 + CHUNK_SIZE > r.x0 - s && x0 < r.x0 + N + s && z0 + CHUNK_SIZE > r.z0 - s && z0 < r.z0 + N + s) return true;
    const sp = this.spawn;
    if (sp === null) return false;
    const h = CORRIDOR_HALF + 1;
    const minX = Math.min(sp.x, this.gateWorld.x) - h;
    const maxX = Math.max(sp.x, this.gateWorld.x) + h;
    const minZ = Math.min(sp.z, this.gateWorld.z) - h;
    const maxZ = Math.max(sp.z, this.gateWorld.z) + h;
    return x0 + CHUNK_SIZE > minX && x0 < maxX && z0 + CHUNK_SIZE > minZ && z0 < maxZ;
  }

  /** ローカルの マス → 世界の マス（ブロック座標） */
  toWorld(u: number, v: number): XZ {
    const o = offsetOf(this.rec.facing, u, v);
    return { x: this.rec.x0 + o.i, z: this.rec.z0 + o.j };
  }

  /** 世界の マス → ローカル（街の はんいの 外は null） */
  toLocal(x: number, z: number): { u: number; v: number } | null {
    const i = Math.floor(x) - this.rec.x0;
    const j = Math.floor(z) - this.rec.z0;
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    return localOf(this.rec.facing, i, j);
  }

  /** 街の はんいの 中か（高さは 問わない。落ちても いたくない はんい・こわせない はんい） */
  inTown(x: number, z: number): boolean {
    const i = Math.floor(x) - this.rec.x0;
    const j = Math.floor(z) - this.rec.z0;
    return i >= 0 && j >= 0 && i < N && j < N;
  }

  /** 安全の はんいの 中か（街の まわり safeMargin マス ひろげた 四角。高さは 問わない） */
  inSafe(x: number, z: number): boolean {
    const m = TOWN.safeMargin;
    const i = Math.floor(x) - this.rec.x0;
    const j = Math.floor(z) - this.rec.z0;
    return i >= -m && j >= -m && i < N + m && j < N + m;
  }

  /** あきちの 区画の 中か（ほれる・おける 所）。高さは 問わない */
  inLot(x: number, z: number): boolean {
    const p = this.toLocal(x, z);
    return p !== null && layout.surf[at(p.u, p.v)] === SURF.lot;
  }

  /** 街の はんいの 外側 skirt マスの すそ（なだらかに つなぐ 所）か。街の はんいの 中は false */
  inSkirt(x: number, z: number): boolean {
    const s = TOWN.skirt;
    const i = Math.floor(x) - this.rec.x0;
    const j = Math.floor(z) - this.rec.z0;
    if (i >= 0 && j >= 0 && i < N && j < N) return false;
    return i >= -s && j >= -s && i < N + s && j < N + s;
  }

  /** すその 高さ: 街の はんいに 近い ほど 街の 地面、はなれるほど もとの 高さ（natural）。d ＝ 街の はんいの 外へ の 距離（1〜skirt） */
  skirtHeight(natural: number, x: number, z: number): number {
    const i = Math.floor(x) - this.rec.x0;
    const j = Math.floor(z) - this.rec.z0;
    const d = Math.max(-i, i - (N - 1), -j, j - (N - 1));
    const k = Math.max(0, 1 - d / (TOWN.skirt + 1));
    return Math.round(natural + (this.rec.groundY - natural) * k);
  }

  info(): TownInfo {
    return this.infoCache;
  }

  private cell(u: number, v: number, y: number): P3 {
    const w = this.toWorld(u, v);
    return { x: w.x + 0.5, y, z: w.z + 0.5 };
  }

  private box(a: { u: number; v: number }, b: { u: number; v: number }): Box {
    const p = this.toWorld(a.u, a.v);
    const q = this.toWorld(b.u, b.v);
    return { min: { x: Math.min(p.x, q.x), z: Math.min(p.z, q.z) }, max: { x: Math.max(p.x, q.x), z: Math.max(p.z, q.z) } };
  }

  private buildInfo(): TownInfo {
    const L = layout;
    const G = this.rec.groundY;
    const mid = N / 2;
    const m = TOWN.safeMargin;
    const c = this.cell(mid, mid, G + 1);
    const bounds = this.box({ u: 0, v: 0 }, { u: N - 1, v: N - 1 });
    const water: XZ[] = [];
    const walk: XZ[] = [];
    for (let k = 0; k < N * N; k++) {
      if (L.canal[k] === CANAL.none) continue;
      const w = this.toWorld(k % N, Math.floor(k / N));
      (L.canal[k] === CANAL.water ? water : walk).push(w);
    }
    const half = 7;
    const gate = this.cell(L.gate.u, L.gate.v, G + 1);
    const lights: TownInfo['lights'] = [];
    for (const t of L.toro) lights.push({ kind: 'toro', pos: this.cell(t.u, t.v, G + 3.5) });
    const stairs = L.stairs.map((s) => {
      const banner = { u: s.top.u + Math.abs(s.dir.dv), v: s.top.v + Math.abs(s.dir.du) };
      return {
        bottom: this.cell(s.bottom.u, s.bottom.v, this.bottomY + 1),
        top: this.cell(s.top.u, s.top.v, G + 1),
        light: this.cell(s.top.u, s.top.v, G + 3.5),
        banner: this.cell(banner.u, banner.v, G + 2),
      };
    });
    for (const s of stairs) lights.push({ kind: 'stair', pos: s.light });
    return {
      center: c,
      facing: this.rec.facing,
      bounds,
      safe: { min: { x: bounds.min.x - m, z: bounds.min.z - m }, max: { x: bounds.max.x + m, z: bounds.max.z + m } },
      groundY: G,
      terrace: { ...this.box({ u: L.terrace.u0, v: L.terrace.v0 }, { u: L.terrace.u1, v: L.terrace.v1 }), y: G + TOWN.terrace.rise },
      plaza: this.cell(L.plazaStand.u, L.plazaStand.v, G + 1),
      fountain: this.box({ u: mid - half, v: mid - half }, { u: mid + half - 1, v: mid + half - 1 }),
      gate: { pos: gate, top: { x: gate.x, y: G + 1 + TOWN.gateTopHeight, z: gate.z } },
      lots: L.lots.map((r) => this.box({ u: r.u0, v: r.v0 }, { u: r.u1, v: r.v1 })),
      canal: { bottomY: this.bottomY, water, walk, stairs, bridges: L.bridges.map((r) => this.box({ u: r.u0, v: r.v0 }, { u: r.u1, v: r.v1 })) },
      lights,
      buildings: [],
      npcs: [],
      stalls: [],
      trees: [],
    };
  }
}
