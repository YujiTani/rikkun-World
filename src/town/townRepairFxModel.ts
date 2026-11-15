import { hashInts } from '../world/gen/random';
import data from './repairFinal.json';

/**
 * TOWN-1 1.4 §2.16 の 12・設計 fx: ブロックが もどる たびに ぽん 箱（1.18 → 1.0 の 写し）・木くず・ほこり。計算だけ（three なし）。
 * 数は repairFinal.json の fx から 読む。固定の 入れ物を 使いまわす（毎フレーム new しない）。乱数は ブロックの 位置から（シード付き）。
 * 単位: 点 ＝ 1/16 ブロック、1 ステップ ＝ 1/60 秒。
 */
const F = data.fx;
const U = 1 / 16;

/** 同時に 出せる 上限（こえたら 古い 物から けす） */
export const FX_CAP = { pop: 8, chip: 64, dust: 16 } as const;

const POP_LIFE = F.pop_scale.length; // コマ 数（t=0〜5）。t=6 で きえる
const CHIP_LIFE = F.chips.life;
const DUST_LIFE = F.dust.life;

/** 固定の 入れ物（つぶの ならび）。age < 0 ＝ あきの 場所 */
class Pool {
  count = 0;
  readonly age: Int16Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  /** ぽん 箱: 大きさ（そのまま 使う）／木くず・ほこり: 1 辺（ブロック） */
  readonly scale: Float32Array;
  /** 木くず・ほこり: 0 ＝ kuzu、1 ＝ kuzu_kage、2 ＝ hokori */
  readonly kind: Uint8Array;
  /** ぽん 箱: ブロックの id（そのまま 持つ） */
  readonly id: string[];
  /** 木くず: 横の むき（dx, dz）と はやさ（点／ステップ） */
  readonly dx: Float32Array;
  readonly dz: Float32Array;
  readonly sh: Float32Array;
  readonly sy: Float32Array;
  readonly x0: Float32Array;
  readonly z0: Float32Array;
  readonly y0: Float32Array;
  readonly w: Float32Array;
  readonly h: Float32Array;

  constructor(readonly cap: number) {
    this.age = new Int16Array(cap).fill(-1);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.z = new Float32Array(cap);
    this.scale = new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.id = new Array<string>(cap).fill('');
    this.dx = new Float32Array(cap);
    this.dz = new Float32Array(cap);
    this.sh = new Float32Array(cap);
    this.sy = new Float32Array(cap);
    this.x0 = new Float32Array(cap);
    this.z0 = new Float32Array(cap);
    this.y0 = new Float32Array(cap);
    this.w = new Float32Array(cap);
    this.h = new Float32Array(cap);
  }

  /** あいた 場所（なければ いちばん 古い 物） */
  take(): number {
    let oldest = 0;
    let oldAge = -1;
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i]! < 0) {
        this.count++;
        this.age[i] = 0;
        return i;
      }
      if (this.age[i]! > oldAge) {
        oldAge = this.age[i]!;
        oldest = i;
      }
    }
    this.age[oldest] = 0;
    return oldest;
  }
}

export class RepairFx {
  readonly pops = new Pool(FX_CAP.pop);
  readonly chips = new Pool(FX_CAP.chip);
  readonly dusts = new Pool(FX_CAP.dust);

  active(): boolean {
    return this.pops.count + this.chips.count + this.dusts.count > 0;
  }

  /** ブロック (x, y, z) が もどった（id ＝ もどった ブロック）。ぽん 箱 1・木くず 4・ほこり 2 */
  spawn(x: number, y: number, z: number, id: string): void {
    const p = this.pops;
    const i = p.take();
    p.x[i] = x + 0.5;
    p.y[i] = y + 0.5;
    p.z[i] = z + 0.5;
    p.scale[i] = F.pop_scale[0]!;
    p.id[i] = id;
    const rot = hashInts(x, y, z, 0x70b5) & 3; // 向きの 組を 90° ずつ まわす
    const ch = F.chips;
    for (let k = 0; k < ch.count; k++) {
      const j = this.chips.take();
      const c = this.chips;
      let dx = ch.dirs[k]![0]!;
      let dz = ch.dirs[k]![1]!;
      for (let r = 0; r < rot; r++) [dx, dz] = [-dz, dx];
      c.dx[j] = dx;
      c.dz[j] = dz;
      c.sh[j] = ch.speed_h[k]!;
      c.sy[j] = ch.speed_y[k]!;
      c.x0[j] = x + 0.5 + dx * 7 * U;
      c.z0[j] = z + 0.5 + dz * 7 * U;
      c.y0[j] = y + 1;
      c.w[j] = ch.sizes[k]![0]! * U;
      c.h[j] = ch.sizes[k]![1]! * U;
      c.kind[j] = ch.colors[k] === 'kuzu' ? 0 : 1;
      this.placeChip(j, 0);
    }
    for (let k = 0; k < F.dust.count; k++) {
      const j = this.dusts.take();
      const d = this.dusts;
      d.x[j] = x + 0.5 + F.dust.offset[k]![0]! * U;
      d.z[j] = z + 0.5 + F.dust.offset[k]![1]! * U;
      d.y[j] = y + 1;
      d.scale[j] = 2 * U;
      d.kind[j] = 2;
    }
  }

  /** 1 ステップ */
  step(): void {
    this.stepPops();
    this.stepChips();
    this.stepDust();
  }

  private placeChip(j: number, t: number): void {
    const c = this.chips;
    c.x[j] = c.x0[j]! + c.dx[j]! * c.sh[j]! * t * U;
    c.z[j] = c.z0[j]! + c.dz[j]! * c.sh[j]! * t * U;
    c.y[j] = c.y0[j]! + (2 + c.sy[j]! * t - F.chips.gravity * t * t) * U;
  }

  private stepPops(): void {
    const p = this.pops;
    for (let i = 0; i < p.cap; i++) {
      if (p.age[i]! < 0) continue;
      const a = ++p.age[i]!;
      if (a >= POP_LIFE) {
        p.age[i] = -1;
        p.count--;
      } else p.scale[i] = F.pop_scale[a]!;
    }
  }

  private stepChips(): void {
    const c = this.chips;
    for (let i = 0; i < c.cap; i++) {
      if (c.age[i]! < 0) continue;
      const a = ++c.age[i]!;
      this.placeChip(i, a);
      // 地面より 下で きえる（出た 高さ − 0 の 下）
      if (a >= CHIP_LIFE || c.y[i]! < c.y0[i]! - 0.01) {
        c.age[i] = -1;
        c.count--;
      }
    }
  }

  private stepDust(): void {
    const d = this.dusts;
    for (let i = 0; i < d.cap; i++) {
      if (d.age[i]! < 0) continue;
      const a = ++d.age[i]!;
      if (a >= DUST_LIFE) {
        d.age[i] = -1;
        d.count--;
      } else d.scale[i] = (2 + Math.floor(a / 3)) * U;
    }
  }
}
