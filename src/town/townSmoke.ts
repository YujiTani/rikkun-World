import { createRng, type Rng } from '../world/gen/random';
import { TOWN } from './townTuning';

/**
 * TOWN-1 1B-2: かじやの えんとつの けむり（つぶの 動き。描くのは src/fx/townSmokeFx.ts）。
 * つぶは いつも 同じ 数（TOWN.perf.smokeMax = 24）を 使い回す。毎フレーム new しない。乱数は シード付き。
 * 近くに いない ときは 新しく 出さない（のこった つぶは そのまま きえる）。
 */
export const SMOKE = {
  /** 1 秒に 出す 数（こ）。life × perSecond が 24 を こえない 値 */
  perSecond: 3.5,
  /** ういて いる 時間（秒） */
  life: 5.5,
  /** 上がる 速さ（マス/秒。ゆっくり） */
  rise: 0.8,
  /** 風で 流れる 速さ（マス/秒。東へ すこし） */
  wind: 0.25,
  /** 出た ときの 大きさ（マス）と きえる ころの 大きさ */
  size0: 0.8,
  size1: 2.2,
  /** えんとつの 口の まわりの ばらつき（マス） */
  spread: 0.5,
  /** この 距離（マス）より 近い ときだけ 出す */
  near: 64,
} as const;

export interface SmokePuff {
  active: boolean;
  x: number;
  y: number;
  z: number;
  age: number;
  life: number;
  /** ドットの かたちを きめる 数（0〜1） */
  seed: number;
}

export class TownSmoke {
  readonly puffs: SmokePuff[];
  private readonly rng: Rng;
  private left = 0;

  constructor(seed: number) {
    this.rng = createRng(seed);
    this.puffs = Array.from({ length: TOWN.perf.smokeMax }, () => ({ active: false, x: 0, y: 0, z: 0, age: 0, life: 1, seed: 0 }));
  }

  /** 1 ステップ（dt は 秒）。spot ＝ えんとつの 口の 上（なければ null）。near ＝ 見る 人が 近いか */
  update(dt: number, spot: { x: number; y: number; z: number } | null, near: boolean): void {
    if (spot !== null && near) {
      this.left += dt * SMOKE.perSecond;
      while (this.left >= 1) {
        this.left -= 1;
        this.spawn(spot);
      }
    } else {
      this.left = 0;
    }
    for (const p of this.puffs) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      p.y += SMOKE.rise * dt;
      p.x += SMOKE.wind * dt;
    }
  }

  private spawn(spot: { x: number; y: number; z: number }): void {
    const p = this.puffs.find((q) => !q.active);
    if (!p) return;
    p.active = true;
    p.x = spot.x + (this.rng() - 0.5) * SMOKE.spread;
    p.y = spot.y;
    p.z = spot.z + (this.rng() - 0.5) * SMOKE.spread;
    p.age = 0;
    p.life = SMOKE.life * (0.85 + this.rng() * 0.3);
    p.seed = this.rng();
  }

  activeCount(): number {
    let n = 0;
    for (const p of this.puffs) if (p.active) n++;
    return n;
  }
}
