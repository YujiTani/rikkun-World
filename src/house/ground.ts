import { surfaceY, type AnimalWorld } from '../animals/terrain';
import { cellInWall } from '../world/wall';

/**
 * 建築士さんが 立てる 地面の しらべ方（読みこんだ 世界の 実際の ブロックを 見る）。
 * 木の みき・たけの 上、水の 中、はっぱ・木の 下（頭が つかえる）には 立てない。
 */

/** 建築士さんの 体（ブロック）: 半径・高さ・登れる 段差・おりられる 段差 */
export const ARCHITECT_BODY = { radius: 0.3, height: 1.7, stepUp: 1, stepDown: 2 } as const;
/** 頭の 上まで あける マス数（足もとを ふくむ） */
const ROOM_CELLS = 2;
/** 立つ 地面に しない ブロック */
const NOT_GROUND = new Set<string>(['log', 'bamboo', 'water']);

/** 世界の 窓口（`AnimalWorld` が 合う） */
export type HouseWorld = AnimalWorld;

/**
 * 列 (ix, iz) で 立てる 足もとの y（地面の 上面）。立てない（読みこみ前・世界の 外・水・木・上が つまる）なら null。
 */
export function standY(world: HouseWorld, ix: number, iz: number): number | null {
  if (!cellInWall(ix, iz) || !world.isLoaded(ix, iz)) return null;
  const top = surfaceY(world, ix, iz);
  if (top === null) return null;
  if (NOT_GROUND.has(String(world.getBlock(ix, top, iz)))) return null;
  const y = top + 1;
  for (let k = 0; k < ROOM_CELLS; k++) {
    if (world.isSolid(ix, y + k, iz) || String(world.getBlock(ix, y + k, iz)) === 'water') return null;
  }
  return y;
}

/** いまの 高さ fromY から、いちばん 高い 足もと hi へ 登れて、いちばん 低い 足もと lo へ おりられる か（四すみの 段差の きまりは この 2 つで 決まる） */
function stepOk(lo: number, hi: number, fromY: number): boolean {
  return !(hi - fromY > ARCHITECT_BODY.stepUp + 1e-6) && !(fromY - lo > ARCHITECT_BODY.stepDown + 1e-6);
}

/**
 * (x, z) に 足を おけるか。体の 四すみの 列が ぜんぶ 立てて、いまの 高さ fromY から 登れる・おりられる 段差 なら、足もとの y を 返す（四すみの いちばん 高い 地面）。
 * だめなら null。毎回 世界を 読む（建築士さんの 毎ステップの しらべは `Footing` を 使う）
 */
export function canStand(world: HouseWorld, x: number, z: number, fromY: number): number | null {
  const r = ARCHITECT_BODY.radius;
  const ax = Math.floor(x - r);
  const az = Math.floor(z - r);
  // 四すみが またがる 列の 数 - 1（0 か 1）。位置が 数でない（NaN・無限）と NaN に なり、列を 1 つも 読まない
  const nx = Math.floor(x + r) - ax;
  const nz = Math.floor(z + r) - az;
  let lo = Infinity;
  let hi = -Infinity;
  for (let dz = 0; dz <= nz; dz++) {
    for (let dx = 0; dx <= nx; dx++) {
      const y = standY(world, ax + dx, az + dz);
      if (y === null) return null;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
  }
  if (hi === -Infinity) return null; // 体の はんいに 列が ない（位置が 数でない）= 立てない
  return stepOk(lo, hi, fromY) ? hi : null;
}

/** 列の おぼえ: まだ 知らない / 読みこみずみだが 立てない（木・水など）。0 以上は 立てる 足もとの y（`standY` は 1 以上） */
const UNKNOWN = -1;
const BLOCKED = -2;

/**
 * `canStand` と 同じ 答えを、世界を 読まずに 返す（建築士さん 1 人に 1 つ）。
 * 立って いる・歩いて いる 建築士さんが 毎ステップ 世界を 読むと 人数ぶん 仕事が ふえる ため（live4-perf AC20・live3-perf AC17）。
 *  - ぶらぶらする はんいの まわり（窓。列 x0〜x1・z0〜z1）の「列ごとの 立てる 足もと」を おぼえる。高さに よらないので、いまの 高さからの 段差は 毎回 たしかめる
 *  - 世界が かわったら `touch` で 知らせる（ブロックを 置く・ほる）。次の `stand` で、かわった 列だけ まとめて 読みなおす。知らせの ない かわりは 見えない
 *  - 読みこみ前の 列は おぼえない（読みこまれたら すぐ 立てる）。窓の 外に かかる ときは おぼえず `canStand` と 同じに 読む
 */
export class Footing {
  private world: HouseWorld | null = null;
  /** おぼえた 列が かわった（読みなおしが いる） */
  private stale = true;
  private readonly w: number;
  private readonly h: number;
  private readonly ys: Int16Array;

  constructor(
    private readonly x0: number,
    private readonly z0: number,
    x1: number,
    z1: number,
  ) {
    this.w = x1 - x0 + 1;
    this.h = z1 - z0 + 1;
    this.ys = new Int16Array(this.w * this.h).fill(UNKNOWN);
  }

  stand(world: HouseWorld, x: number, z: number, fromY: number): number | null {
    const r = ARCHITECT_BODY.radius;
    const ax = Math.floor(x - r);
    const bx = Math.floor(x + r);
    const az = Math.floor(z - r);
    const bz = Math.floor(z + r);
    if (ax < this.x0 || az < this.z0 || bx >= this.x0 + this.w || bz >= this.z0 + this.h) return canStand(world, x, z, fromY);
    if (this.world !== world) {
      this.world = world;
      this.ys.fill(UNKNOWN);
      this.stale = true;
    }
    if (this.stale) this.refresh(world);
    let lo = Infinity;
    let hi = -Infinity;
    for (let dz = 0; dz <= bz - az; dz++) {
      for (let dx = 0; dx <= bx - ax; dx++) {
        const y = this.column(world, ax + dx, az + dz);
        if (y === null) return null;
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
    if (hi === -Infinity) return null; // 体の はんいに 列が ない（位置が 数でない）= 立てない
    return stepOk(lo, hi, fromY) ? hi : null;
  }

  /** 列 (x0, z0)〜(x1, z1) の 箱の 中が かわった。窓と かさなる 列は 次の `stand` で 読みなおす */
  touch(x0: number, z0: number, x1 = x0, z1 = z0): void {
    const ax = Math.max(x0, this.x0);
    const bx = Math.min(x1, this.x0 + this.w - 1);
    const az = Math.max(z0, this.z0);
    const bz = Math.min(z1, this.z0 + this.h - 1);
    for (let iz = az; iz <= bz; iz++) {
      for (let ix = ax; ix <= bx; ix++) {
        const i = (iz - this.z0) * this.w + (ix - this.x0);
        if (this.ys[i] !== UNKNOWN) {
          this.ys[i] = UNKNOWN;
          this.stale = true;
        }
      }
    }
  }

  /** 窓の 中で まだ 知らない 列を まとめて 読む（行き先を えらぶ とき、歩く とき に 読まなくて すむ ように） */
  private refresh(world: HouseWorld): void {
    this.stale = false;
    for (let i = 0; i < this.ys.length; i++) {
      if (this.ys[i] === UNKNOWN) this.column(world, this.x0 + (i % this.w), this.z0 + Math.floor(i / this.w));
    }
  }

  /** 窓の 中の 列 (ix, iz) の 立てる 足もと。おぼえて いなければ 読んで おぼえる（読みこみ前は おぼえない） */
  private column(world: HouseWorld, ix: number, iz: number): number | null {
    const i = (iz - this.z0) * this.w + (ix - this.x0);
    const v = this.ys[i]!;
    if (v >= 0) return v;
    if (v === BLOCKED) return null;
    const y = standY(world, ix, iz);
    if (y !== null) {
      this.ys[i] = y;
      return y;
    }
    if (world.isLoaded(ix, iz)) this.ys[i] = BLOCKED;
    return null;
  }
}
