import { SEA_Y } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import type { Geo } from './mineShaftSite';
import { ShaftBuilder, keyOf } from './mineShaftBuild';
import type { Pt } from './mineShaftTypes';

const TORCH = BLOCK_INDEX.torch;
const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];


/** 計画中の 世界を 計算で 答える（ブロックは 作らない）。ほらあなの 空気は mineCaveAir、坑道の 計画は 重ねる */
export class Virt {
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
