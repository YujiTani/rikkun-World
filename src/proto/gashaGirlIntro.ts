/**
 * #293 少女の 登場の 流れ(FIX-BRIEF-2 §4、オーナー 2026-10-24 15:08・15:11)。
 * 大きな 姿が 固まった あと: 笑い声(少女は まだ 見えない)→ プレイヤーの まわりを 高速で ワープして 飛びまわる(warps 回)→ 正面に 止まって 決めポーズ → おわり。
 * ここは 時間の 進みだけの 純粋な 部分(3D も 音も 知らない)。見た目・音は gashaGirl.ts が イベントを 受けて つける。数は gashaGirlTuning.ts の intro。
 */
export type IntroPhase = 'laugh' | 'orbit' | 'pose' | 'done';
export interface IntroEvent {
  /** laugh = 笑い声の はじまり / warp = index 回目の ワープ(0 はじまり) / pose = 正面で 決めポーズ / done = おわり */
  kind: 'laugh' | 'warp' | 'pose' | 'done';
  index: number;
}
export interface IntroCfg {
  laughSec: number;
  warps: number;
  warpSec: number;
  poseSec: number;
}

/** index 回目の ワープ先の 角度(度。プレイヤーの 正面が 0、時計まわり)。index が warps なら 正面(ポーズ) */
export function introAngleDeg(index: number, warps: number): number {
  if (index >= warps) return 0;
  return (360 / (warps + 1)) * (index + 1);
}

/** プレイヤーから 角度 angleDeg(正面 0°、右まわり)・距離 dist の 地面の 場所 */
export function introSpot(p: { x: number; z: number; yawDeg: number }, angleDeg: number, dist: number): { x: number; z: number } {
  const y = (p.yawDeg * Math.PI) / 180, a = (angleDeg * Math.PI) / 180;
  const fx = Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = Math.sin(y);
  return { x: p.x + (fx * Math.cos(a) + rx * Math.sin(a)) * dist, z: p.z + (fz * Math.cos(a) + rz * Math.sin(a)) * dist };
}

export class IntroSeq {
  phase: IntroPhase = 'laugh';
  /** 次の 出来事までの のこり(秒) */
  private left: number;
  private warpNo = 0;

  constructor(private readonly cfg: IntroCfg) {
    this.left = cfg.laughSec;
  }

  /** はじめる。最初の イベント(笑い声)を 返す */
  start(): IntroEvent[] {
    this.phase = 'laugh';
    this.left = this.cfg.laughSec;
    this.warpNo = 0;
    return [{ kind: 'laugh', index: 0 }];
  }

  /** やめる(以後 イベントは 出ない) */
  cancel(): void {
    this.phase = 'done';
  }

  /** 時間を すすめる。この間に 起きた イベントを 順番に 返す */
  update(dt: number): IntroEvent[] {
    const out: IntroEvent[] = [];
    if (this.phase === 'done') return out;
    this.left -= dt;
    while (this.left <= 1e-9 && this.phase !== 'done') {
      const over = -this.left;
      if (this.phase === 'laugh') {
        if (this.cfg.warps > 0) { this.phase = 'orbit'; out.push({ kind: 'warp', index: 0 }); this.warpNo = 1; this.left = this.cfg.warpSec - over; }
        else { this.phase = 'pose'; out.push({ kind: 'pose', index: 0 }); this.left = this.cfg.poseSec - over; }
      } else if (this.phase === 'orbit') {
        if (this.warpNo < this.cfg.warps) { out.push({ kind: 'warp', index: this.warpNo }); this.warpNo++; this.left = this.cfg.warpSec - over; }
        else { this.phase = 'pose'; out.push({ kind: 'pose', index: 0 }); this.left = this.cfg.poseSec - over; }
      } else {
        this.phase = 'done'; out.push({ kind: 'done', index: 0 });
      }
    }
    return out;
  }
}
