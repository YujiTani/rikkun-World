import type { BlockId } from '../../contracts/world';
import { ROPE_TUNING } from './rope';

/**
 * ROPE-1 版 3（つなぎ）: たいらな ところで ロープを つかうと、足もとに くいを うって 体と つなぐ。
 * くい（アンカー）から ロープの 長さ（もって いた 本数 × 10 マス）より 先へは 行けない。
 * 世界 1 つに つなぎは 1 本。くいが なくなる・とても 遠くへ 飛ぶ（リスポーン など）と きれる。
 */
export interface TetherAnchor {
  x: number;
  y: number;
  z: number;
}

/** これ以上 はなれたら（ワープ・リスポーン）つなぎを きる。長さに たす 余白 */
const SNAP_SLACK = 3;

export class RopeTether {
  anchor: TetherAnchor | null = null;
  len = 0;

  tie(a: TetherAnchor, ropes: number): void {
    this.anchor = { ...a };
    this.len = ropes * ROPE_TUNING.perRope;
  }

  clear(): void {
    this.anchor = null;
    this.len = 0;
  }

  /** つなぎが 生きて いれば アンカーの 中心（くいの 根もと 少し上）。くいが きえて いたら きる */
  live(getBlock: (x: number, y: number, z: number) => string, stake: BlockId): { x: number; y: number; z: number } | null {
    const a = this.anchor;
    if (!a) return null;
    if (getBlock(a.x, a.y, a.z) !== stake) {
      this.clear();
      return null;
    }
    return { x: a.x + 0.5, y: a.y + 0.5, z: a.z + 0.5 };
  }

  /**
   * 1 ステップの うごき（vx・my・vz）を ロープの 長さで しばる。体の 点 p（こしの 高さ）が
   * 長さの 外へ 出る うごきから、アンカーから 遠ざかる 向きの ぶんを けす。けした あとの my を かえす。
   * もう 長さ + 余白 より 遠ければ きる。
   */
  clampStep(c: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }, v: { x: number; z: number }, my: number, dt: number): number {
    const rx = p.x - c.x;
    const ry = p.y - c.y;
    const rz = p.z - c.z;
    const d = Math.hypot(rx, ry, rz);
    if (d > this.len + SNAP_SLACK) {
      this.clear();
      return my;
    }
    const nx = rx + v.x * dt;
    const ny = ry + my;
    const nz = rz + v.z * dt;
    if (d < 1e-6 || Math.hypot(nx, ny, nz) <= this.len) return my;
    const ux = rx / d;
    const uy = ry / d;
    const uz = rz / d;
    const vy = my / dt;
    const out = v.x * ux + vy * uy + v.z * uz;
    let vy2 = vy;
    if (out > 0) {
      v.x -= out * ux;
      v.z -= out * uz;
      vy2 -= out * uy;
    }
    // まがりで 少しずつ はみ出す ぶんは 内がわへ もどす
    const over = Math.hypot(rx + v.x * dt, ry + vy2 * dt, rz + v.z * dt) - this.len;
    if (over > 0) {
      v.x -= (over / dt) * ux;
      v.z -= (over / dt) * uz;
      vy2 -= (over / dt) * uy;
    }
    return vy2 * dt;
  }

  /** p が くいより 1 マス 以上 下で、ロープの 長さ いっぱい（ぶら下がり の 判定。たいらで ジャンプ した ときは 入らない） */
  taut(c: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }): boolean {
    return p.y < c.y - 1 && Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z) >= this.len - 0.15;
  }
}

const TETHERS = new WeakMap<object, RopeTether>();
/** 世界ごとの つなぎ（プレイヤー と ブロック置き が 同じ ものを 見る） */
export function tetherOf(world: object): RopeTether {
  let t = TETHERS.get(world);
  if (!t) {
    t = new RopeTether();
    TETHERS.set(world, t);
  }
  return t;
}
