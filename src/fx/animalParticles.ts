import { TILE } from './animalFxConfig';

const CAP = 256;
const DT = 1 / 60;

type Kind = 1 | 2 | 3 | 4 | 5 | 6; // 1 ハート 2 紙ふぶき 3 けむり 4 キラッ 5 はっぱ 6 から の かけら

/** つぶの 一覧（struct of arrays のリング）。時間で 消える */
export class AnimalParticles {
  readonly cap = CAP;
  private readonly kind = new Uint8Array(CAP);
  private readonly px = new Float32Array(CAP);
  private readonly py = new Float32Array(CAP);
  private readonly pz = new Float32Array(CAP);
  private readonly vx = new Float32Array(CAP);
  private readonly vy = new Float32Array(CAP);
  private readonly vz = new Float32Array(CAP);
  private readonly age = new Int16Array(CAP);
  private readonly life = new Int16Array(CAP); // 0 = 使っていない
  private readonly size = new Float32Array(CAP);
  private readonly rgb = new Uint32Array(CAP);
  private cursor = 0;

  spawn(kind: Kind, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, rgb: number): void {
    let slot = -1;
    for (let k = 0; k < CAP; k++) {
      const i = (this.cursor + k) % CAP;
      if (this.life[i] === 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) slot = this.cursor; // いっぱい: いちばん 古い 所に 上書き
    this.cursor = (slot + 1) % CAP;
    this.kind[slot] = kind;
    this.px[slot] = x;
    this.py[slot] = y;
    this.pz[slot] = z;
    this.vx[slot] = vx;
    this.vy[slot] = vy;
    this.vz[slot] = vz;
    this.age[slot] = 0;
    this.life[slot] = life;
    this.size[slot] = size;
    this.rgb[slot] = rgb;
  }

  /** 1 ステップ */
  step(): void {
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] === 0) continue;
      if (++this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        continue;
      }
      const k = this.kind[i];
      if (k === 2) this.vy[i] -= 7 * DT; // 紙ふぶき: 落ちる
      if (k === 5) this.vy[i] -= 4 * DT; // はっぱ: ひらひら 落ちる
      if (k === 6) this.vy[i] -= 9 * DT; // から の かけら: ころんと 落ちる
      if (k === 2 || k === 1 || k === 5 || k === 6) {
        const d = k === 2 ? 0.985 : k === 5 ? 0.95 : k === 6 ? 0.93 : 0.97; // 空気の ていこう
        this.vx[i] *= d;
        this.vz[i] *= d;
      }
      if (k === 1) this.vy[i] *= 0.985;
      this.px[i] += this.vx[i] * DT;
      this.py[i] += this.vy[i] * DT;
      this.pz[i] += this.vz[i] * DT;
    }
  }

  active(kind?: Kind): number {
    let n = 0;
    for (let i = 0; i < CAP; i++) if (this.life[i] !== 0 && (kind === undefined || this.kind[i] === kind)) n++;
    return n;
  }

  clear(): void {
    this.life.fill(0);
  }

  /** `out` に 書く。戻り値 = 書いた 数 */
  write(out: ParticleOut, start: number, cap: number): number {
    let n = start;
    for (let i = 0; i < CAP && n < cap; i++) {
      if (this.life[i] === 0) continue;
      const t = this.age[i] / this.life[i];
      const k = this.kind[i];
      let s = this.size[i];
      let tile: number = TILE.dot;
      if (k === 1) {
        tile = TILE.heartFull;
        if (t > 0.6) s *= 1 - (t - 0.6) / 0.4;
      } else if (k === 2) {
        if (t > 0.75) s *= 1 - (t - 0.75) / 0.25;
      } else if (k === 3) {
        s *= 0.6 + 1.2 * Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.1));
      } else if (k === 5 || k === 6) {
        if (t > 0.6) s *= 1 - (t - 0.6) / 0.4;
      } else {
        tile = TILE.star;
        if (t > 0.5) s *= 1 - (t - 0.5) / 0.5;
      }
      const j = n * 3;
      out.pos[j] = this.px[i];
      out.pos[j + 1] = this.py[i];
      out.pos[j + 2] = this.pz[i];
      const c = this.rgb[i];
      out.col[j] = ((c >> 16) & 255) / 255;
      out.col[j + 1] = ((c >> 8) & 255) / 255;
      out.col[j + 2] = (c & 255) / 255;
      out.size[n] = s;
      out.tile[n] = tile;
      n++;
    }
    return n;
  }
}

/** 描く 配列（`Points` の 属性 に そのまま 合う） */
export interface ParticleOut {
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  tile: Float32Array;
}
