// HOUSE-1B 見本の 見る 向き（まわす・見おろす 角度）。three なし。仕様 docs/design/HOUSE-1.md §2.5（新 19・新 23）。
//   さわる 前 ＝ ゆっくり 自動で 回る / ドラッグ・wheel ＝ 自分で 向きを きめる（さわったら 止まり、はなして 600 コマ たつと
//   その 向き・見おろす 角度の まま また 回り出す）/ 窓を かえた ＝ 135／225 へ なめらかに 回る（光って いる 間は 自動の 回りを 止める）。
import type { Wall } from '../editor/tuning';
import { PREVIEW } from './tuning';

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

/** 向きの ちがい（度。近い ほうの まわりで 0〜180） */
export function yawGap(a: number, b: number): number {
  return Math.abs(diff(a, b));
}

/** 同じ きょりと みなす ちがい（度。ちょうど 180° の ときの 計算の ずれを のみこむ） */
const TIE_DEG = 1e-6;

/** 窓を 見せに 回る 行き先（度）: 今の 向きから 近い ほう。同じ きょりなら さきの（135） */
export function cueTarget(yawDeg: number): number {
  let best: number = PREVIEW.cueYawDeg[0];
  for (const t of PREVIEW.cueYawDeg) if (yawGap(yawDeg, t) < yawGap(yawDeg, best) - TIE_DEG) best = t;
  return best;
}

interface Turn {
  yaw0: number;
  dYaw: number;
  frames: number;
  t: number;
}

/** 見る 向きの 範囲: 見おろす 角度の 下の はし・上の はし（度） */
export interface ElevRange {
  min: number;
  max: number;
}

/** 見本 1 つの 見る 向き。1 ステップ ＝ 1/60 秒 */
export class ViewCtl {
  yaw: number = PREVIEW.stillYawDeg;
  elev: number;
  /** 手で さわった（また 回り出しても true のまま。はじめに もどす まで） */
  touched = false;
  /** さわった あと また 回り出す までの のこりの コマ。null ＝ 回って いる（さわる 前・回り出した 後・動きを へらす 設定） */
  wait: number | null = null;
  /** 押している 間（動かさなくても さわって いる。wait は 600 の まま すすまない） */
  private held = false;
  private turn: Turn | null = null;

  /** spins ＝ 自動で 回って よいか（動きを へらす 設定では false。毎回 たずねる） */
  constructor(
    private readonly elev0: number,
    private readonly range: ElevRange,
    private readonly spins: () => boolean,
  ) {
    this.elev = elev0;
  }

  /** はじめの 向き（まえ ＋28°。戸が 見える ななめ 前。ゆっくり 回りはじめる） */
  reset(): void {
    this.yaw = PREVIEW.stillYawDeg;
    this.elev = this.elev0;
    this.touched = false;
    this.wait = null;
    this.held = false;
    this.turn = null;
  }

  /** 見えるように なった: まだ さわって いなければ はじめの 向きから。さわった 後は その 向きの まま */
  enter(): void {
    if (!this.touched) this.reset();
  }

  /** 手を おいた / はなした あとの のこり（10 秒。動きを へらす 設定では 数えない） */
  private rest(): void {
    this.wait = this.spins() ? PREVIEW.resumeFrames : null;
  }

  /** マウスを 押した（動かさなくても さわった ことに なる。窓を 見せに 回って いたら そこで 止まる） */
  press(): void {
    this.held = true;
    this.touched = true;
    this.turn = null;
    this.rest();
  }

  /** マウスを はなした: ここから 600 コマ */
  release(): void {
    this.held = false;
    this.rest();
  }

  /** ドラッグ（px）: よこ ＝ 家の まわりを まわる（右へ ひくと angle は へる）、たて ＝ 見おろす 角度（下へ ひく ほど ふえる）。はなした 向きで 止まる */
  drag(dx: number, dy: number): void {
    this.touched = true;
    this.turn = null;
    this.yaw = wrap(this.yaw - dx * PREVIEW.degPerPx);
    this.elev = clamp(this.elev + dy * PREVIEW.degPerPx, this.range.min, this.range.max);
    this.rest();
  }

  /** wheel（2 本ゆびの スクロール）: (dx ＋ dy) px を よこの ドラッグと 同じに。見おろす 角度は かえない。1 回ごとに 600 に もどる */
  wheel(dx: number, dy: number): void {
    this.drag(dx + dy, 0);
  }

  /** frames コマで yaw の 向きへ なめらかに 回る（短い ほうの まわり）。frames が 1 いかなら すぐ。見おろす 角度は かえない */
  turnTo(yaw: number, frames: number): void {
    const dYaw = diff(this.yaw, yaw);
    if (frames <= 1 || Math.abs(dYaw) < 0.01) {
      this.turn = null;
      this.yaw = wrap(this.yaw + dYaw);
      return;
    }
    this.turn = { yaw0: this.yaw, dYaw, frames, t: 0 };
  }

  get turning(): boolean {
    return this.turn !== null;
  }

  /**
   * 1 コマ。frozen ＝ 自動で 回っては いけない（窓が 光って いる 間）。wait は frozen でも へる。
   * wait が 1 → null に なる コマ（はなして 600 コマ目）から 回る ＝ その コマで 0.3° 動く。frozen の 間に null に なったら 回るのは frozen が おわって から。
   */
  step(frozen: boolean): void {
    if (this.wait !== null && !this.held && --this.wait <= 0) this.wait = null;
    const k = this.turn;
    if (k) {
      k.t++;
      this.yaw = wrap(k.yaw0 + k.dYaw * smooth(k.t / k.frames));
      if (k.t >= k.frames) this.turn = null;
      return;
    }
    if (!frozen && !this.held && this.wait === null && this.spins()) this.yaw = wrap(this.yaw + 360 / PREVIEW.lapFrames);
  }
}
