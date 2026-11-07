/**
 * MINE-1E 仕様 §3.8: かびた パンを たべて「ぶるっ」。人形（BlockDoll）を まるごと つぶして、こしを 中心に ±3 度 ふるわせる。
 * 動きの 数は ここ 1 か所（60 コマ = 1 秒）。A「ぶるっ」と B「いやいや」を こうごに（`docs/fun.md` 4「前と ちがう 物」）。
 *   A: 0〜6 つぶす（2 コマ目で 半分）/ 6〜18 左右 ±3 度 × 3 回 / 18〜24 もどる
 *   B: 0〜8 つぶす（頭を 下げる 代わり）/ 8〜20 左右 ±3 度 × 2 回 ゆっくり / 20〜26 もどる
 * つぶしは たて −5%・よこ +3%（体積を たもつ。MOTION 12）。はじめは じわっと せず、2 コマ目で つぶしの 半分（MOTION 3）。
 * 歩きだしたら やめて よい（`cancel`）。「うごきを へらす」ときは 呼ばない（ログと 音だけ）。
 */

/** 動きの 数（コマ・倍率・度） */
export const SHIVER = {
  /** A「ぶるっ」: つぶす・ふるえる・もどる（コマ）と ふるえる 回数 */
  A: { squash: 6, shake: 12, back: 6, cycles: 3 },
  /** B「いやいや」 */
  B: { squash: 8, shake: 12, back: 6, cycles: 2 },
  /** たての 倍率（−5%） */
  squashY: 0.95,
  /** よこの 倍率（+3%） */
  squashX: 1.03,
  /** 左右に 回る はば（度） */
  rollDeg: 3,
  /** つぶす とき 2 コマ目で とどく 割合 */
  halfAt: 2,
} as const;

export type ShiverVariant = 'A' | 'B';

/** 人形に かける 形: よこ・たての 倍率と、こしを 中心に した ひねり（度。からだの 前後軸のまわり） */
export interface ShiverPose {
  sx: number;
  sy: number;
  rollDeg: number;
}

/** コマ f（小数も 可）の 形。つぶし s は 0 → 1 → 0 */
export function shiverFrame(v: ShiverVariant, f: number): ShiverPose {
  const d = SHIVER[v];
  let s: number;
  let roll = 0;
  if (f <= 0) s = 0;
  else if (f < d.squash) {
    // 2 コマ目で 半分、そのあと のこりの 半分を ならして 満タンへ
    s = f <= SHIVER.halfAt ? (0.5 * f) / SHIVER.halfAt : 0.5 + (0.5 * (f - SHIVER.halfAt)) / (d.squash - SHIVER.halfAt);
  } else if (f < d.squash + d.shake) {
    s = 1;
    roll = SHIVER.rollDeg * Math.sin((2 * Math.PI * d.cycles * (f - d.squash)) / d.shake);
  } else if (f < d.squash + d.shake + d.back) {
    s = 1 - (f - d.squash - d.shake) / d.back;
  } else s = 0;
  return { sx: 1 + (SHIVER.squashX - 1) * s, sy: 1 + (SHIVER.squashY - 1) * s, rollDeg: roll };
}

/** ぶるっの 進み方（時間で 数える）。start のたびに A と B を こうごに */
export class ShiverAnim {
  private frame = -1;
  private next: ShiverVariant = 'A';
  private v: ShiverVariant = 'A';
  private readonly out: ShiverPose = { sx: 1, sy: 1, rollDeg: 0 };

  start(): void {
    this.v = this.next;
    this.next = this.next === 'A' ? 'B' : 'A';
    this.frame = 0;
  }

  cancel(): void {
    this.frame = -1;
  }

  active(): boolean {
    return this.frame >= 0;
  }

  variant(): ShiverVariant {
    return this.v;
  }

  /** dt 秒 すすめる */
  advance(dt: number): void {
    if (this.frame < 0) return;
    this.frame += dt * 60;
    const d = SHIVER[this.v];
    if (this.frame >= d.squash + d.shake + d.back) this.frame = -1;
  }

  /** 今の 形（毎回 同じ 入れ物を 書きかえて 返す） */
  pose(): ShiverPose {
    const p = this.frame < 0 ? { sx: 1, sy: 1, rollDeg: 0 } : shiverFrame(this.v, this.frame);
    this.out.sx = p.sx;
    this.out.sy = p.sy;
    this.out.rollDeg = p.rollDeg;
    return this.out;
  }
}
