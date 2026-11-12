import { SEA_Y } from '../../contracts';
import { GEN_CONFIG as C } from './config';

const SHORE = C.biome.mountain.shore;

/** 水ぎわの さがし: (dx, dz, きょり) を ちかい 順に（きょり 0 は 自分）。SHORE.reach まで */
const RING: readonly (readonly [number, number, number])[] = (() => {
  const r = SHORE.reach;
  const out: [number, number, number][] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dz) <= r) out.push([dx, dz, Math.hypot(dx, dz)]);
  return out.sort((a, b) => a[2] - b[2]);
})();

/** 山を かける 前の 高さ baseAt を 見て、いちばん ちかい 水（海面 −1 以下）までの きょりを 出す。64×64 の まとまりごと・8×8 の 区画ごとに 覚える */
export class ShoreWater {
  private readonly tiles = new Map<number, { c: Uint8Array; b: Uint8Array }>();

  constructor(private readonly baseAt: (x: number, z: number) => number) {}

  private tile(x: number, z: number): { c: Uint8Array; b: Uint8Array } {
    const key = ((x >> 6) + 4096) * 8192 + ((z >> 6) + 4096);
    let t = this.tiles.get(key);
    if (!t) {
      if (this.tiles.size >= 512) this.tiles.clear();
      t = { c: new Uint8Array(64 * 64), b: new Uint8Array(64) };
      this.tiles.set(key, t);
    }
    return t;
  }

  /** (x,z) が 水か（1: 水・2: 陸 を 覚える） */
  private isWet(x: number, z: number): boolean {
    const t = this.tile(x, z);
    const i = (z & 63) * 64 + (x & 63);
    let v = t.c[i]!;
    if (v === 0) {
      v = this.baseAt(x, z) <= SEA_Y - 1 ? 1 : 2;
      t.c[i] = v;
    }
    return v === 1;
  }

  /** 8×8 の 区画に 水が 1 つでも あるか（水が 遠い 所の さがしを はぶく） */
  private blockWet(x: number, z: number): boolean {
    const t = this.tile(x, z);
    const bi = ((z & 63) >> 3) * 8 + ((x & 63) >> 3);
    let v = t.b[bi]!;
    if (v === 0) {
      const x0 = x & ~7;
      const z0 = z & ~7;
      v = 2;
      for (let dz = 0; dz < 8 && v === 2; dz++) for (let dx = 0; dx < 8; dx++) if (this.isWet(x0 + dx, z0 + dz)) { v = 1; break; }
      t.b[bi] = v;
    }
    return v === 1;
  }

  /** (x,z) から いちばん ちかい 水までの きょり（SHORE.reach まで。なければ Infinity） */
  dist(x: number, z: number): number {
    const R = SHORE.reach;
    let any = false;
    for (let bz = (z - R) >> 3; bz <= (z + R) >> 3 && !any; bz++) for (let bx = (x - R) >> 3; bx <= (x + R) >> 3; bx++) if (this.blockWet(bx << 3, bz << 3)) { any = true; break; }
    if (!any) return Infinity;
    for (const o of RING) if (this.isWet(x + o[0]!, z + o[1]!)) return o[2]!;
    return Infinity;
  }
}
