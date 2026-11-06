import { BLOCK_INDEX } from '../blocks/blockTypes';
import { keyOf, keyX, keyY, keyZ } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import { planShaft, type ShaftPlan } from './mineShaftPlan';
import { geoFor, regionHit, regionLand, regionOf, regionSites, startSites, type Geo } from './mineShaftSite';
import type { PathCell, Shaft, ShaftRoll } from './mineShaftTypes';
import { colKey } from '../stream/ring';

/**
 * 坑道の 世界（MINE-1C。docs/design/MINE-1.md §4.5・§4.8・§6.1）。シード（と 古い 列の 一覧）から、はじまりの 坑道と 区画ごとの 坑道を 決める。
 * 計画は 区画ごとに 1 回 作って おぼえる。列を 作る ときは 列に かかる 計画の「置く 物」だけを 読む（ほかの 列の ブロックは 読まない。C10）。
 */

/** 古い 列の 一覧（colKey の 集まり。仕様 §4.8） */
export interface OldCols {
  kodo: ReadonlySet<number>;
  heya: ReadonlySet<number>;
}

/** 列に 置く 物。ring → air → put の 順に 1 マスずつ 置く */
export interface ColOps {
  /** かならず 固く する マス（もとが 固く なければ 石） */
  ring: Int32Array;
  air: Int32Array;
  put: Int32Array;
}

/** パック: block | y << 8 | lz << 17 | lx << 21 */
const pack = (block: number, y: number, lz: number, lx: number): number => block | (y << 8) | (lz << 17) | (lx << 21);

const REACH = 12;
const AIR_BLOCK = BLOCK_INDEX.air;
const STONE_BLOCK = BLOCK_INDEX.stone;

function buildOps(plan: ShaftPlan): Map<number, ColOps> {
  const lists = new Map<number, { ring: number[]; air: number[]; put: number[] }>();
  const slot = (k: number): { ring: number[]; air: number[]; put: number[] } => {
    const ck = colKey(keyX(k) >> 4, keyZ(k) >> 4);
    let l = lists.get(ck);
    if (!l) lists.set(ck, (l = { ring: [], air: [], put: [] }));
    return l;
  };
  const p = (k: number, block: number): number => pack(block, keyY(k), keyZ(k) & 15, keyX(k) & 15);
  for (const k of plan.b.ring) slot(k).ring.push(p(k, STONE_BLOCK));
  for (const k of plan.b.air) slot(k).air.push(p(k, AIR_BLOCK));
  for (const [k, block] of plan.b.put) slot(k).put.push(p(k, block));
  const out = new Map<number, ColOps>();
  for (const [ck, l] of lists) out.set(ck, { ring: Int32Array.from(l.ring), air: Int32Array.from(l.air), put: Int32Array.from(l.put) });
  return out;
}

interface Planned {
  plan: ShaftPlan;
  ops: Map<number, ColOps> | null;
}

/** 区画の 番号 → 計画（なければ null）。数の 上限 */
const REGION_CAP = 400;

export class ShaftWorld {
  readonly G: Geo;
  private startPlanned: Planned | null | undefined;
  private readonly regions = new Map<number, Planned | null>();
  constructor(
    readonly seed: number,
    readonly oldCols: OldCols | undefined,
  ) {
    this.G = geoFor(seed);
  }

  isOld = (k: number): boolean => this.oldCols?.kodo.has(k) === true;

  /** はじまりの 坑道 */
  start(): Planned {
    if (this.startPlanned === undefined) {
      this.startPlanned = null;
      for (const site of startSites(this.G)) {
        for (let a = 0; a < S.planTries; a++) {
          const plan = planShaft(this.G, site, 'start', true, this.isOld, a);
          if (plan) {
            this.startPlanned = { plan, ops: null };
            break;
          }
        }
        if (this.startPlanned) break;
      }
    }
    if (!this.startPlanned) throw new Error('はじまりの 坑道を おけない');
    return this.startPlanned;
  }

  private startBox(): { x0: number; z0: number; x1: number; z1: number } {
    return this.start().plan.shaft.box;
  }

  /** 区画 (rx, rz) に ほかの 坑道を おけない 理由が あるか（スタートの 区画・はじまりの 坑道の 箱と かさなる 区画） */
  private blocked(rx: number, rz: number): boolean {
    const sp = this.G.T.spawn();
    if (regionOf(sp.x) === rx && regionOf(sp.z) === rz) return true;
    const b = this.startBox();
    return rx >= regionOf(b.x0) && rx <= regionOf(b.x1) && rz >= regionOf(b.z0) && rz <= regionOf(b.z1);
  }

  region(rx: number, rz: number): Planned | null {
    const key = (rx + 100000) * 200003 + (rz + 100000);
    const hit = this.regions.get(key);
    if (hit !== undefined) return hit;
    let planned: Planned | null = null;
    if (regionHit(this.seed, rx, rz) && !this.blocked(rx, rz) && regionLand(this.G, rx, rz) >= S.minLand) {
      let budget = 60;
      outer: for (const site of regionSites(this.G, rx, rz)) {
        for (let a = 0; a < S.planTries && budget-- > 0; a++) {
          const plan = planShaft(this.G, site, `r${rx}_${rz}`, false, this.isOld, a);
          if (plan) {
            planned = { plan, ops: null };
            break outer;
          }
        }
        if (budget <= 0) break;
      }
    }
    if (this.regions.size >= REGION_CAP) this.regions.clear();
    this.regions.set(key, planned);
    return planned;
  }

  /** 区画の 抽選の 結果 */
  rolls(x0: number, z0: number, x1: number, z1: number): ShaftRoll[] {
    const out: ShaftRoll[] = [];
    for (let rz = regionOf(z0); rz <= regionOf(z1); rz++) {
      for (let rx = regionOf(x0); rx <= regionOf(x1); rx++) {
        const hit = regionHit(this.seed, rx, rz);
        out.push({ rx, rz, hit, land: regionLand(this.G, rx, rz), placed: hit && this.region(rx, rz) !== null });
      }
    }
    return out;
  }

  /** 箱が 範囲に かかる 坑道ぜんぶ（はじまりの 坑道 ＋ 区画の 坑道） */
  shafts(x0: number, z0: number, x1: number, z1: number): Shaft[] {
    const out: Shaft[] = [];
    const hit = (b: Shaft['box']): boolean => b.x0 <= x1 && b.x1 >= x0 && b.z0 <= z1 && b.z1 >= z0;
    const s = this.start().plan.shaft;
    if (hit(s.box)) out.push(s);
    for (let rz = regionOf(z0); rz <= regionOf(z1); rz++) {
      for (let rx = regionOf(x0); rx <= regionOf(x1); rx++) {
        const p = this.region(rx, rz);
        if (p && hit(p.plan.shaft.box)) out.push(p.plan.shaft);
      }
    }
    return out;
  }

  planById(id: string): ShaftPlan | null {
    if (id === 'start') return this.start().plan;
    const m = /^r(-?\d+)_(-?\d+)$/.exec(id);
    if (!m) return null;
    return this.region(Number(m[1]), Number(m[2]))?.plan ?? null;
  }

  path(id: string): PathCell[] {
    return this.planById(id)?.path.map((c) => ({ ...c })) ?? [];
  }

  /** 列に かかる 計画（箱を REACH 広げた 四角が 列に かかる もの） */
  plansNear(cx: number, cz: number): ShaftPlan[] {
    const x0 = cx * 16 - REACH;
    const z0 = cz * 16 - REACH;
    const x1 = cx * 16 + 15 + REACH;
    const z1 = cz * 16 + 15 + REACH;
    const out: ShaftPlan[] = [];
    const near = (b: Shaft['box']): boolean => b.x0 <= x1 && b.x1 >= x0 && b.z0 <= z1 && b.z1 >= z0;
    const s = this.start().plan;
    if (near(s.shaft.box)) out.push(s);
    for (let rz = regionOf(z0); rz <= regionOf(z1); rz++) {
      for (let rx = regionOf(x0); rx <= regionOf(x1); rx++) {
        const p = this.region(rx, rz);
        if (p && near(p.plan.shaft.box)) out.push(p.plan);
      }
    }
    return out;
  }

  /** 列 (cx, cz) に 置く 物。なければ null */
  opsFor(cx: number, cz: number): ColOps[] | null {
    const ck = colKey(cx, cz);
    let out: ColOps[] | null = null;
    for (const plan of this.plansNear(cx, cz)) {
      const planned = plan === this.start().plan ? this.start() : this.region(regionOf(plan.shaft.box.x0), regionOf(plan.shaft.box.z0))!;
      planned.ops ??= buildOps(plan);
      const o = planned.ops.get(ck);
      if (o) (out ??= []).push(o);
    }
    return out;
  }

  /** 木・草花を おかない 四角（列に かかる 計画の もの） */
  zones(cx: number, cz: number): { trees: [number, number, number, number][]; plants: [number, number, number, number][] } | null {
    let trees: [number, number, number, number][] | null = null;
    let plants: [number, number, number, number][] | null = null;
    for (const plan of this.plansNear(cx, cz)) {
      if (plan.noTrees.length > 0) (trees ??= []).push(...plan.noTrees);
      if (plan.noPlants.length > 0) (plants ??= []).push(...plan.noPlants);
    }
    return trees || plants ? { trees: trees ?? [], plants: plants ?? [] } : null;
  }

  /** 列に 坑道が かかるか（古い 列の しらべ・鉱石の「ふつうの 列」の しらべ） */
  touches(cx: number, cz: number): boolean {
    const ck = colKey(cx, cz);
    return this.plansNear(cx, cz).some((p) => p.cols.has(ck));
  }

  /** 列 1 つで 見る 区画の 数 */
  regionCount(cx: number, cz: number): number {
    const xs = [cx * 16 - REACH, cx * 16 + 15 + REACH];
    const zs = [cz * 16 - REACH, cz * 16 + 15 + REACH];
    const set = new Set<number>();
    for (const x of xs) for (const z of zs) set.add(regionOf(x) * 100003 + regionOf(z));
    return set.size;
  }

  /** (x, y, z) は いちばん 下の へやの 中か（実績「いちばん したに ついた」） */
  inBottom(x: number, y: number, z: number): boolean {
    for (const s of this.shafts(x, z, x, z)) {
      const r = s.room;
      if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y >= r.y && y <= r.y + 4) return true;
    }
    return false;
  }

  /** (x, y, z) は 坑道の 空気か */
  inside(x: number, y: number, z: number): boolean {
    const k = keyOf(x, y, z);
    for (const plan of this.plansNear(x >> 4, z >> 4)) if (plan.b.air.has(k)) return true;
    return false;
  }
}

// ------------------------------------------------------------------ シードごとに おぼえる

const worlds = new Map<number, { plain: ShaftWorld; byOld: WeakMap<OldCols, ShaftWorld> }>();

export function shaftWorldFor(seed: number, oldCols?: OldCols): ShaftWorld {
  let e = worlds.get(seed);
  if (!e) {
    if (worlds.size > 6) worlds.clear();
    e = { plain: new ShaftWorld(seed, undefined), byOld: new WeakMap() };
    worlds.set(seed, e);
  }
  if (!oldCols) return e.plain;
  let w = e.byOld.get(oldCols);
  if (!w) e.byOld.set(oldCols, (w = new ShaftWorld(seed, oldCols)));
  return w;
}
