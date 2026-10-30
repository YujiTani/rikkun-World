// HOUSE-1B 試作: 見本の 見る 向き（まわす・見おろす 角度）。three なし。
//   ふれる 前 ＝ ゆっくり 自動で 回る / ドラッグ ＝ 自分で 向きを きめる（はなした 向きで 止まり、形が かわっても その まま）/
//   窓が かわった とき ＝ その かべが 見える 向きへ なめらかに 回る（回りおわる まで 自動の 回りは 止める）。
import { PREVIEW, WALL_YAW_DEG, WALLS, type Wall } from './tuning';

const rad = (deg: number): number => (deg * Math.PI) / 180;
const wrap = (deg: number): number => ((deg % 360) + 360) % 360;
/** a → b の みじかい ほうの 差（度。−180〜180） */
const diff = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smooth = (t: number): number => {
  const k = clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
};

/** かべの 外向きの 向き（x, z） */
export const OUTWARD: Readonly<Record<Wall, readonly [number, number]>> = { front: [0, 1], right: [1, 0], back: [0, -1], left: [-1, 0] };

/** 向き yaw（度）の カメラが、かべ wall を どれだけ 正面から 見るか（1 ＝ 正面、0 以下 ＝ 見えない） */
export function facing(yawDeg: number, wall: Wall): number {
  const y = rad(yawDeg);
  return Math.sin(y) * OUTWARD[wall][0] + Math.cos(y) * OUTWARD[wall][1];
}

export interface ViewTarget {
  wall: Wall;
  /** 見せたい おもさ（ふえた 窓 ＝ 1、へった 窓 ＝ 小さめ） */
  weight: number;
}

/** 「見える」と みなす 目安: いちばん 見える 向きの 点の この わり（0.85 ＝ 正面から 約 32° まで） */
const GOOD_SHARE = 0.85;
/** 向きの 候補の きざみ（度） */
const STEP_DEG = 5;

/**
 * 見せたい かべが 見える 向き・見おろす 角度を えらぶ。いまの 向きで もう 見えて いれば そのまま（回らない）、
 * 見えて いなければ「見える 向き」の うち いまに いちばん ちかい 向き（＝ いちばん 少なく 回る）。
 * 見おろす 角度は 上限（cueElevMaxDeg）より 高ければ 下げる。
 */
export function pickView(cur: { yaw: number; elev: number }, targets: readonly ViewTarget[]): { yaw: number; elev: number } {
  const elev = Math.min(cur.elev, PREVIEW.cueElevMaxDeg);
  if (targets.length === 0) return { yaw: cur.yaw, elev };
  const score = (yaw: number): number => targets.reduce((n, t) => n + t.weight * Math.max(0, facing(yaw, t.wall)), 0);
  let best = 0;
  for (let yaw = 0; yaw < 360; yaw += STEP_DEG) best = Math.max(best, score(yaw));
  for (const w of WALLS) best = Math.max(best, score(WALL_YAW_DEG[w]));
  const good = best * GOOD_SHARE;
  if (score(cur.yaw) >= good) return { yaw: cur.yaw, elev };
  let pick = cur.yaw;
  let far = Infinity;
  for (let yaw = 0; yaw < 360; yaw += STEP_DEG) {
    if (score(yaw) < good) continue;
    const d = Math.abs(diff(cur.yaw, yaw));
    if (d < far) {
      far = d;
      pick = yaw;
    }
  }
  return { yaw: pick, elev };
}

interface Turn {
  yaw0: number;
  elev0: number;
  dYaw: number;
  elev1: number;
  frames: number;
  t: number;
}

/** 見本 1 つの 見る 向き。1 ステップ ＝ 1/60 秒 */
export class ViewCtl {
  yaw: number = PREVIEW.stillYawDeg;
  elev: number;
  /** ドラッグで さわった（自動の 回りを やめて、はなした 向きの まま） */
  touched = false;
  private turn: Turn | null = null;
  /** この コマ数の 間は 自動で 回らない（窓を 見せて いる 間） */
  private hold = 0;

  constructor(private readonly elev0: number) {
    this.elev = elev0;
  }

  /** はじめの 向き（まえ から ＝ 戸が 見える。ゆっくり 回りはじめる） */
  reset(): void {
    this.yaw = PREVIEW.stillYawDeg;
    this.elev = this.elev0;
    this.touched = false;
    this.turn = null;
    this.hold = 0;
  }

  /** 1 コマ。spin ＝ 自動で 回って よいか（動きを へらす 設定では false） */
  step(spin: boolean): void {
    if (this.turn) {
      const k = this.turn;
      k.t++;
      const e = smooth(k.t / k.frames);
      this.yaw = wrap(k.yaw0 + k.dYaw * e);
      this.elev = k.elev0 + (k.elev1 - k.elev0) * e;
      if (k.t >= k.frames) this.turn = null;
      if (this.hold > 0) this.hold--;
      return;
    }
    if (this.hold > 0) {
      this.hold--;
      return;
    }
    if (!this.touched && spin) this.yaw = wrap(this.yaw + 360 / PREVIEW.lapFrames);
  }

  /** ドラッグ（px）: よこ ＝ 家の まわりを まわる、たて ＝ 見おろす 角度（下へ ひく ほど 上から 見る）。はなした 向きで 止まる */
  drag(dx: number, dy: number): void {
    this.touched = true;
    this.turn = null;
    this.hold = 0;
    this.yaw = wrap(this.yaw - dx * PREVIEW.dragYawPerPx);
    this.elev = clamp(this.elev + dy * PREVIEW.dragElevPerPx, PREVIEW.elevMinDeg, PREVIEW.elevMaxDeg);
  }

  /** なめらかに 向きを かえる（frames コマ）。hold コマの 間は 自動で 回らない。frames が 1 なら すぐ かわる */
  turnTo(yaw: number, elev: number, frames: number, hold: number): void {
    this.hold = hold;
    const dYaw = diff(this.yaw, yaw);
    if (frames <= 1 || (Math.abs(dYaw) < 0.01 && Math.abs(elev - this.elev) < 0.01)) {
      this.turn = null;
      this.yaw = wrap(this.yaw + dYaw);
      this.elev = elev;
      return;
    }
    this.turn = { yaw0: this.yaw, elev0: this.elev, dYaw, elev1: elev, frames, t: 0 };
  }

  get turning(): boolean {
    return this.turn !== null;
  }
}
