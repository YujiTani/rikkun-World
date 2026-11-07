import type { PathCell, PathPart } from './mineShaftTypes';

/**
 * 坑道の 計画を ためる 入れもの（MINE-1C。docs/design/MINE-1.md §4.5）。
 * 世界の ブロックには さわらない。「ここは 空気」「ここは かならず 固く する〔かべ・床・天井〕」「ここに この ブロック」を 集めて、
 * あとで 列を 作る ときに（mineShaftCarve.ts）1 マス ずつ 置く。
 */

export interface Pt3 {
  x: number;
  y: number;
  z: number;
}

const OFF = 1_048_576;
const ZS = 512;
const XS = 1_073_741_824;
/** (x, y, z) → 1 つの 数。x・z は ±100 万 まで */
export const keyOf = (x: number, y: number, z: number): number => (x + OFF) * XS + (z + OFF) * ZS + y;
export const keyY = (k: number): number => k % ZS;
export const keyZ = (k: number): number => (Math.floor(k / ZS) % 2_097_152) - OFF;
export const keyX = (k: number): number => Math.floor(k / XS) - OFF;

const SIX: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** 道の 足の マス 1 つの 上に 空気に する 高さ（マス）。へやは 5 */
export const airHeightOf = (part: PathPart): number => (part === 'room' ? 5 : part === 'hibi' ? 2 : 4);

/** `ShaftBuilder.snapshot` の 中身 */
export interface BuilderSnap {
  air: Set<number>;
  ring: Set<number>;
  put: Map<number, number>;
  pathKeys: Set<number>;
  exempt: Set<number>;
  path: PathCell[];
  reserved: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }[];
}

export class ShaftBuilder {
  /** 空気に する マス */
  readonly air = new Set<number>();
  /** 空気では ない 時、固く する マス〔かべ・床・天井。もとから 固い 所は そのまま〕 */
  readonly ring = new Set<number>();
  /** おく ブロック〔たいまつ・鉱石・わく・宝箱・山〕 */
  readonly put = new Map<number, number>();
  readonly path: PathCell[] = [];
  readonly pathKeys = new Set<number>();
  /** 坑道の へや〔1D〕の 箱。ほかの 横穴は ここに かからない */
  readonly reserved: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }[] = [];

  /** 道の 足の マスを 足す（空気・かべ・床・天井は まとめて あとで `commitRing`） */
  addCell(p: Pt3, part: PathPart): void {
    this.path.push({ x: p.x, y: p.y, z: p.z, part });
    this.pathKeys.add(keyOf(p.x, p.y, p.z));
    const h = airHeightOf(part);
    for (let k = 0; k < h; k++) this.air.add(keyOf(p.x, p.y + k, p.z));
  }

  /** かべに しない マス〔外に ひらく 面〕 */
  readonly exempt = new Set<number>();

  /** 今の 状態を 写しておく〔横穴を 1C の 形と へやの 形で ためして もどす ため〕 */
  snapshot(): BuilderSnap {
    return {
      air: new Set(this.air),
      ring: new Set(this.ring),
      put: new Map(this.put),
      pathKeys: new Set(this.pathKeys),
      exempt: new Set(this.exempt),
      path: this.path.slice(),
      reserved: this.reserved.slice(),
    };
  }

  /** `snapshot` の 状態に もどす */
  restore(s: BuilderSnap): void {
    this.air.clear();
    for (const k of s.air) this.air.add(k);
    this.ring.clear();
    for (const k of s.ring) this.ring.add(k);
    this.put.clear();
    for (const [k, v] of s.put) this.put.set(k, v);
    this.pathKeys.clear();
    for (const k of s.pathKeys) this.pathKeys.add(k);
    this.exempt.clear();
    for (const k of s.exempt) this.exempt.add(k);
    this.path.length = 0;
    for (const c of s.path) this.path.push(c);
    this.reserved.length = 0;
    for (const r of s.reserved) this.reserved.push(r);
  }

  /**
   * 道の 足の マスを まとめて 足し、ring は 足した 分だけ 差分で 直す〔`buildRing` と 同じ 結果。全体を 作りなおさない ので 大きい 坑道でも 軽い〕。
   * `exempt` に 入れた マスは かべに しない
   */
  addCellsInc(cells: readonly PathCell[], exempt: Iterable<number> = []): void {
    const fresh: number[] = [];
    for (const c of cells) {
      this.path.push(c);
      this.pathKeys.add(keyOf(c.x, c.y, c.z));
      const h = airHeightOf(c.part);
      for (let k = 0; k < h; k++) {
        const key = keyOf(c.x, c.y + k, c.z);
        if (!this.air.has(key)) {
          this.air.add(key);
          fresh.push(key);
        }
      }
    }
    for (const k of exempt) {
      this.exempt.add(k);
      this.ring.delete(k);
    }
    for (const k of fresh) this.ring.delete(k);
    for (const k of fresh) {
      const x = keyX(k);
      const y = keyY(k);
      const z = keyZ(k);
      for (const [dx, dy, dz] of SIX) {
        const n = keyOf(x + dx, y + dy, z + dz);
        if (!this.air.has(n) && !this.exempt.has(n)) this.ring.add(n);
      }
    }
    for (const c of cells) {
      const n = keyOf(c.x, c.y - 2, c.z);
      if (!this.air.has(n) && !this.exempt.has(n)) this.ring.add(n);
    }
  }

  /** air から ring を 作りなおす */
  buildRing(): void {
    this.ring.clear();
    ringFor(this.air, this.path, this.exempt, this.ring);
  }
}

/** 空気の となり 6 方向 ＋ 道の 足の 下 2 マス〔空気と skip を のぞく〕を out に 入れる */
export function ringFor(air: ReadonlySet<number>, path: readonly Pt3[], skip: ReadonlySet<number>, out: Set<number>): void {
  for (const k of air) {
    const x = keyX(k);
    const y = keyY(k);
    const z = keyZ(k);
    for (const [dx, dy, dz] of SIX) {
      const n = keyOf(x + dx, y + dy, z + dz);
      if (!air.has(n) && !skip.has(n)) out.add(n);
    }
  }
  for (const c of path) {
    const n = keyOf(c.x, c.y - 2, c.z);
    if (!air.has(n) && !skip.has(n)) out.add(n);
  }
}

/** 向き 0＝北〔z−〕・1＝東・2＝南・3＝西 の ベクトル */
export const DV: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
export const COMPASS = ['n', 'e', 's', 'w'] as const;

/** 入口を 原点に した 座標 */
export class Frame {
  readonly ux: number;
  readonly uz: number;
  readonly lx: number;
  readonly lz: number;
  constructor(readonly ex: number, readonly ez: number, dir: 0 | 1 | 2 | 3) {
    this.ux = -DV[dir]![0];
    this.uz = -DV[dir]![1];
    this.lx = -this.uz;
    this.lz = this.ux;
  }
  x(u: number, v: number): number {
    return this.ex + this.ux * u + this.lx * v;
  }
  z(u: number, v: number): number {
    return this.ez + this.uz * u + this.lz * v;
  }
  pt(u: number, v: number, y: number): Pt3 {
    return { x: this.x(u, v), y, z: this.z(u, v) };
  }
}

