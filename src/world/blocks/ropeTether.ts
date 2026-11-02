import type { BlockId } from '../../contracts/world';
import { ROPE_TUNING } from './rope';
import { springAccel } from './ropeSpring';

/** 版 5: プレイヤー がわの つなぎの ようす（PlayerController が もつ） */
export interface TetherBody {
  /** ゆれが おさまって ぶら下がって いる（重力 なし。Shift+スペース・Shift+C で のぼり おり） */
  hanging: boolean;
  /** ゴムで ゆれて いる */
  bouncing: boolean;
  /** しずかな ステップの かず（20 で ぶら下がりへ） */
  calm: number;
  /** ぶら下がった ときの くいからの きょり */
  hangLen: number;
}

/**
 * ROPE-1 版 3（つなぎ）: たいらな ところで ロープを つかうと、足もとに くいを うって 体と つなぐ。
 * 版 4: くい（アンカー）の まん中から 体の こし（足もと + 0.9）までの まっすぐな きょり（3D）が 半径 10 マス（ROPE_TUNING.tetherRadius。本数に よらない）より 先へは 行けない。
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

  tie(a: TetherAnchor): void {
    this.anchor = { ...a };
    this.len = ROPE_TUNING.tetherRadius;
  }

  /** 版 4: こわした さく の マスの 数（10 マス ごとに 1 本 もどす。1 マス目で 1 本） */
  private fenceBroken = 0;
  /** さく 1 マスを こわした: もどす 本数（0 か 1） */
  fenceRefund(): number {
    return this.fenceBroken++ % ROPE_TUNING.perRope === 0 ? 1 : 0;
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
  clampStep(c: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }, v: { x: number; z: number }, my: number, dt: number, len = this.len): number {
    const rx = p.x - c.x;
    const ry = p.y - c.y;
    const rz = p.z - c.z;
    const d = Math.hypot(rx, ry, rz);
    if (d > len + ROPE_TUNING.springMaxStretch + SNAP_SLACK) {
      this.clear();
      return my;
    }
    const nx = rx + v.x * dt;
    const ny = ry + my;
    const nz = rz + v.z * dt;
    if (d < 1e-6 || Math.hypot(nx, ny, nz) <= len) return my;
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
    const over = Math.hypot(rx + v.x * dt, ry + vy2 * dt, rz + v.z * dt) - len;
    if (over > 0) {
      v.x -= (over / dt) * ux;
      v.z -= (over / dt) * uz;
      vy2 -= (over / dt) * uy;
    }
    return vy2 * dt;
  }

  /**
   * 版 5: 1 ステップの つなぎの うごき。たいら・地面では 半径で しばる（clampStep）。
   * くいより 1 マス 以上 下で 半径を こえたら ゴム（ばね-ダンパー。ROPE_TUNING.spring*）で ひっぱり かえし、ゆれが おさまったら ぶら下がり（重力 なし）。
   * ぶら下がり・ゆれの 間は くいの 高さ（足もと）より 上へは 行かない。v.y は 新しい 縦の 速さ。かえすのは 縦の うごき。
   */
  step(c: { x: number; y: number; z: number }, p: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, my: number, dt: number, body: TetherBody, feetY: number): number {
    const T = ROPE_TUNING;
    const rx = p.x - c.x;
    const ry = p.y - c.y;
    const rz = p.z - c.z;
    const d = Math.hypot(rx, ry, rz);
    let out = my;
    if (body.hanging) {
      out = this.clampStep(c, p, v, my, dt, body.hangLen);
    } else if (ry < -1 && d > this.len && d > 1e-6) {
      // ゴム: のびた ぶん ext・外むきの 速さ vr。a = -k ext - c vr を 外むきの 向きに たす（半陰 オイラー）
      const ux = rx / d;
      const uy = ry / d;
      const uz = rz / d;
      const ext = d - this.len;
      const vr = v.x * ux + v.y * uy + v.z * uz;
      const dv = springAccel(ext, vr, T.springStiffness, T.springDamping) * dt;
      v.x += dv * ux;
      v.y += dv * uy;
      v.z += dv * uz;
      out = v.y * dt;
      if (ext + (vr + dv) * dt > T.springMaxStretch) out = this.clampStep(c, p, v, out, dt, this.len + T.springMaxStretch);
      body.bouncing = true;
      body.calm = Math.abs(vr + dv) < 0.3 && Math.abs(v.x) + Math.abs(v.z) < 0.5 ? body.calm + 1 : 0;
      if (body.calm >= 20) {
        body.hanging = true;
        body.bouncing = false;
        body.hangLen = d;
        v.x = v.y = v.z = 0;
        out = 0;
      }
    } else {
      out = this.clampStep(c, p, v, my, dt);
      if (!body.bouncing) body.calm = 0;
    }
    // くいの 高さ（足もと）より 上へは 行かない（ぶら下がり・ゆれの 間）
    if ((body.hanging || body.bouncing) && feetY + out > c.y - 0.5) {
      out = Math.min(out, Math.max(0, c.y - 0.5 - feetY));
      if (v.y > 0) v.y = 0;
    }
    return out;
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
