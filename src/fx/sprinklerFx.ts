import { BoxGeometry, Group, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, DynamicDrawUsage } from 'three';
import type { Vec3 } from '../contracts';

/**
 * スプリンクラー の しぶき（M7-2 §3.4）。
 * 120 ステップ ごと に みず の つぶ 16 こ が 上の面 から 16 方向 に 弓なり に とび（横 2 マス まで）、30 ステップ で 消える。
 * ずらし は 場所 から 決める（乱数 を 使わない）。光の しくみ には 入れない（MeshBasicMaterial・夜でも 同じ）。
 */
export const SPRAY_CONFIG = {
  /** 何ステップ ごと か（`farmSprinklerSprayTicks`） */
  period: 120,
  /** 1 回 の つぶ の 数 */
  count: 16,
  /** とぶ ステップ */
  life: 30,
  /** 横 に とぶ 距離（マス） */
  reach: 2,
  /** 弓なり の 高さ（マス） */
  arc: 0.9,
  /** つぶ の 大きさ（マス） */
  size: 0.08,
  /** この 距離（マス）より 遠い スプリンクラー は しぶき を 出さない */
  range: 32,
  /** 同時 に 出る つぶ の 上限 */
  max: 160,
  color: 0x81d4fa,
} as const;

export type SprayConfig = { -readonly [K in keyof typeof SPRAY_CONFIG]: number };

/** 場所 から 決まる ずらし（0 〜 period−1）。同じ 場所 は いつも 同じ。 */
export function sprayPhase(x: number, y: number, z: number, period: number): number {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) % Math.max(1, period);
}

/** この ステップ に しぶき を 出す か */
export function spraysAt(tick: number, x: number, y: number, z: number, period: number): boolean {
  return (tick + sprayPhase(x, y, z, period)) % Math.max(1, period) === 0;
}

/** つぶ 1 こ の 位置（スプリンクラー の 上の面 の まん中 から の ずれ）。i = 0〜count−1、age = 0〜life */
export function sprayOffset(i: number, age: number, cfg: SprayConfig, out: Vec3): Vec3 {
  const t = Math.min(1, Math.max(0, age / cfg.life));
  const a = (i / cfg.count) * Math.PI * 2;
  const r = cfg.reach * t;
  out.x = Math.cos(a) * r;
  out.z = Math.sin(a) * r;
  out.y = 4 * cfg.arc * t * (1 - t) - 0.5 * t * t;
  return out;
}

export interface SprayLog {
  tick: number;
  x: number;
  y: number;
  z: number;
}

/** `farm.fx()` の 形（kind は 'spray' だけ） */
export interface SprayParticle {
  kind: 'spray';
  x: number;
  y: number;
  z: number;
}

export class SprinklerFx {
  readonly group = new Group();
  /** これまで に 出た つぶ の 数（`farm.fxReset()` で 0） */
  total = 0;
  /** しぶき を 出した ステップ（新しい 順に 最大 256） */
  readonly log: SprayLog[] = [];
  private readonly cfg: SprayConfig;
  private readonly mesh: InstancedMesh;
  private readonly bx: Float32Array;
  private readonly by: Float32Array;
  private readonly bz: Float32Array;
  private readonly born: Int32Array;
  private readonly idx: Int16Array;
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  private readonly one = new Vector3(1, 1, 1);
  private readonly off: Vec3 = { x: 0, y: 0, z: 0 };
  private live = 0;

  constructor(cfg: Partial<SprayConfig> = {}) {
    this.cfg = { ...SPRAY_CONFIG, ...cfg };
    const n = this.cfg.max;
    this.bx = new Float32Array(n);
    this.by = new Float32Array(n);
    this.bz = new Float32Array(n);
    this.born = new Int32Array(n).fill(-1);
    this.idx = new Int16Array(n);
    const s = this.cfg.size;
    this.mesh = new InstancedMesh(new BoxGeometry(s, s, s), new MeshBasicMaterial({ color: this.cfg.color, fog: false }), n);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.add(this.mesh);
  }

  /** しぶき の 間隔 を 設定 に 合わせる（`farmSprinklerSprayTicks`） */
  setPeriod(period: number): void {
    this.cfg.period = Math.max(1, Math.floor(period));
  }

  /** 毎ステップ。`sprinklers` は 世界 の スプリンクラー、`eye` は 目の 位置（遠い もの は 出さない） */
  update(tick: number, sprinklers: readonly Vec3[], eye: Vec3 | null): void {
    const c = this.cfg;
    const r2 = c.range * c.range;
    for (const s of sprinklers) {
      if (!spraysAt(tick, s.x, s.y, s.z, c.period)) continue;
      if (eye) {
        const dx = s.x + 0.5 - eye.x;
        const dy = s.y + 0.5 - eye.y;
        const dz = s.z + 0.5 - eye.z;
        if (dx * dx + dy * dy + dz * dz > r2) continue;
      }
      this.spawn(tick, s);
    }
    this.paint(tick);
  }

  private spawn(tick: number, s: Vec3): void {
    const c = this.cfg;
    let made = 0;
    for (let i = 0; i < c.max && made < c.count; i++) {
      if (this.born[i] >= 0 && tick - this.born[i] < c.life) continue;
      this.born[i] = tick;
      this.bx[i] = s.x + 0.5;
      this.by[i] = s.y + 1;
      this.bz[i] = s.z + 0.5;
      this.idx[i] = made;
      made++;
    }
    if (made === 0) return;
    this.total += made;
    this.log.push({ tick, x: s.x, y: s.y, z: s.z });
    if (this.log.length > 256) this.log.shift();
  }

  private paint(tick: number): void {
    const c = this.cfg;
    let n = 0;
    for (let i = 0; i < c.max; i++) {
      const b = this.born[i];
      if (b < 0) continue;
      const age = tick - b;
      if (age >= c.life || age < 0) {
        this.born[i] = -1;
        continue;
      }
      sprayOffset(this.idx[i], age, c, this.off);
      this.v.set(this.bx[i] + this.off.x, this.by[i] + this.off.y, this.bz[i] + this.off.z);
      this.m.compose(this.v, this.q, this.one);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.live = n;
    this.mesh.count = n;
    if (n > 0) this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 今 出ている つぶ の 数 */
  get active(): number {
    return this.live;
  }

  /** 今 出ている つぶ（テスト用の 窓口。毎フレーム 呼ばない） */
  particles(tick: number): SprayParticle[] {
    const out: SprayParticle[] = [];
    for (let i = 0; i < this.cfg.max; i++) {
      const b = this.born[i];
      if (b < 0 || tick - b >= this.cfg.life) continue;
      sprayOffset(this.idx[i], tick - b, this.cfg, this.off);
      out.push({ kind: 'spray', x: this.bx[i] + this.off.x, y: this.by[i] + this.off.y, z: this.bz[i] + this.off.z });
    }
    return out;
  }

  reset(): void {
    this.total = 0;
    this.log.length = 0;
    this.born.fill(-1);
    this.live = 0;
    this.mesh.count = 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.group.removeFromParent();
  }
}
