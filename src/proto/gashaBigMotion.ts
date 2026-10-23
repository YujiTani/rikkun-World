/**
 * #293 試作: Meshy の 人型の モーション（骨の 回転）を、箱の 関節（gashaBig の Group）へ うつす しくみ。
 * このファイルは Three.js の Quaternion だけ 使う（画面・DOM には さわらない）ので、ユニットテストで 確かめられる。
 *
 * うつし方（骨の 軸が 箱と ちがうので、局所の 回転を そのまま 入れない）:
 *   1. Meshy 側で FK して、各 骨の「世界の 回転」W(t) を 出す（W = 親の W × その 骨の local 回転）。
 *   2. 基準の コマ（最初 / 平均 / コマ番号）の W(ref) からの 差  D(t) = W(t) · W(ref)⁻¹  を 作る（世界の 軸まわりの 回転）。
 *      → 箱の 休みの 姿勢 = クリップの 基準の 姿勢。動きの「ゆれ」だけが うつる。
 *   3. 差 D に「たて → 前」の 回し P（x 軸まわり pitchDeg）を 共役で かける: D' = P · D · P⁻¹
 *      （かべを 登る 動きを 地面を はう 動きに する。地面の 上の クリップは pitchDeg = 0）。
 *   4. ミラー（左右 入れかえ）: 源の 骨を Left ↔ Right に 入れかえ、回転は x 軸の 鏡（x, -y, -z, w）。
 *   5. 箱は 休みの 姿勢で 世界の 回転が ぜんぶ 単位（identity）なので、箱の 世界の 回転 = D'。親の 世界の 回転で わって local にする:
 *      local = 親の D'⁻¹ · 自分の D'。関節ごとの 強さ s は この local に かける（local の 角度 × s。0 = 動かない、1 = そのまま、1.5 = 大きめ）。
 * 座標は glTF（キャラは +z を 向き、+x が キャラの 左、+y が 上）。箱も おなじ。
 */
import { Quaternion, Vector3 } from 'three';

export interface ClipJson {
  name?: string;
  fps: number;
  frames: number;
  duration: number;
  /** 骨の 名前 → 休みの local 回転 [x,y,z,w] */
  rest?: Record<string, number[]>;
  /** 骨の 名前 → 毎コマの local 回転を 平らに 並べた 配列（xyzw × frames） */
  rot: Record<string, number[]>;
  hipsPos?: number[];
}

/** 関節の 親子。names は 親が 先に 来る 並び */
export interface Skeleton {
  names: readonly string[];
  parent: Readonly<Record<string, string | null>>;
}

export interface RetargetOpts {
  /** 「たて → 前」の 回し（x 軸まわり、度）。かべ登り = 90、地面の 動き = 0 */
  pitchDeg: number;
  /** 基準の コマ: 'first' = 最初、'mean' = ぜんぶの コマの 平均、数 = その コマ番号 */
  ref: 'first' | 'mean' | number;
  /** 左右 入れかえ */
  mirror: boolean;
  /** 関節ごとの 強さ（0〜1.5。書いて ない 関節は 0 = 動かない） */
  strength: Readonly<Record<string, number>>;
}

export interface BakedClip {
  name: string;
  fps: number;
  frames: number;
  duration: number;
  joints: readonly string[];
  /** 箱の 関節の local 回転。[frame][joint][xyzw] の 順で 平らに 並べる */
  q: Float32Array;
}

const swapLR = (n: string): string => (n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n);

/** q の s 乗（角度を s 倍。最短の 向き） */
export function qpow(q: Quaternion, s: number, out: Quaternion): Quaternion {
  let { x, y, z, w } = q;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const sh = Math.hypot(x, y, z);
  if (sh < 1e-9) return out.set(0, 0, 0, 1);
  const ang = 2 * Math.atan2(sh, w) * s;
  const k = Math.sin(ang / 2) / sh;
  return out.set(x * k, y * k, z * k, Math.cos(ang / 2));
}

/** クリップの 世界の 回転（FK）。戻り値は [frame][joint][xyzw] */
function worldRotations(clip: ClipJson, sk: Skeleton): Float64Array {
  const n = sk.names.length, F = clip.frames;
  const W = new Float64Array(F * n * 4);
  const idx = new Map(sk.names.map((nm, i) => [nm, i] as const));
  const a = new Quaternion(), b = new Quaternion();
  for (let f = 0; f < F; f++) {
    for (let j = 0; j < n; j++) {
      const nm = sk.names[j]!;
      const r = clip.rot[nm];
      if (r) a.set(r[4 * f]!, r[4 * f + 1]!, r[4 * f + 2]!, r[4 * f + 3]!).normalize(); else a.set(0, 0, 0, 1);
      const p = sk.parent[nm];
      if (p) {
        const pi = idx.get(p)!, o = (f * n + pi) * 4;
        b.set(W[o]!, W[o + 1]!, W[o + 2]!, W[o + 3]!);
        a.premultiply(b);
      }
      const o = (f * n + j) * 4;
      W[o] = a.x; W[o + 1] = a.y; W[o + 2] = a.z; W[o + 3] = a.w;
    }
  }
  return W;
}

/** 基準の 世界の 回転（joint ごと） */
function referenceRotations(W: Float64Array, F: number, n: number, ref: RetargetOpts['ref']): Quaternion[] {
  const out: Quaternion[] = [];
  for (let j = 0; j < n; j++) {
    if (ref === 'mean') {
      const first = new Quaternion(W[j * 4]!, W[j * 4 + 1]!, W[j * 4 + 2]!, W[j * 4 + 3]!);
      let x = 0, y = 0, z = 0, w = 0;
      for (let f = 0; f < F; f++) {
        const o = (f * n + j) * 4;
        const s = W[o]! * first.x + W[o + 1]! * first.y + W[o + 2]! * first.z + W[o + 3]! * first.w < 0 ? -1 : 1;
        x += s * W[o]!; y += s * W[o + 1]!; z += s * W[o + 2]!; w += s * W[o + 3]!;
      }
      out.push(new Quaternion(x, y, z, w).normalize());
    } else {
      const f = ref === 'first' ? 0 : Math.max(0, Math.min(F - 1, Math.round(ref)));
      const o = (f * n + j) * 4;
      out.push(new Quaternion(W[o]!, W[o + 1]!, W[o + 2]!, W[o + 3]!).normalize());
    }
  }
  return out;
}

/** クリップを 箱の 関節の local 回転に うつして 全コマ 作る */
export function bakeClip(clip: ClipJson, o: RetargetOpts, sk: Skeleton): BakedClip {
  const n = sk.names.length, F = clip.frames;
  const idx = new Map(sk.names.map((nm, i) => [nm, i] as const));
  const W = worldRotations(clip, sk);
  const R = referenceRotations(W, F, n, o.ref);
  const P = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (o.pitchDeg * Math.PI) / 180);
  const Pinv = P.clone().invert();
  const q = new Float32Array(F * n * 4);
  const D: Quaternion[] = sk.names.map(() => new Quaternion());
  const Wb: Quaternion[] = sk.names.map(() => new Quaternion());
  const tmp = new Quaternion(), loc = new Quaternion(), sc = new Quaternion();
  for (let f = 0; f < F; f++) {
    // 源の 骨ごとの 差 D（世界の 軸まわり）
    for (let j = 0; j < n; j++) {
      const oo = (f * n + j) * 4;
      D[j]!.set(W[oo]!, W[oo + 1]!, W[oo + 2]!, W[oo + 3]!).multiply(tmp.copy(R[j]!).invert());
    }
    // 箱の 関節ごとの 世界の 回転 Wb = P · D' · P⁻¹（ミラーの ときは 左右の 源を 入れかえて 鏡うつし）
    for (let j = 0; j < n; j++) {
      const s = o.mirror ? D[idx.get(swapLR(sk.names[j]!))!]! : D[j]!;
      tmp.copy(s);
      if (o.mirror) tmp.set(tmp.x, -tmp.y, -tmp.z, tmp.w);
      Wb[j]!.copy(P).multiply(tmp).multiply(Pinv);
    }
    for (let j = 0; j < n; j++) {
      const nm = sk.names[j]!;
      const p = sk.parent[nm];
      loc.copy(Wb[j]!);
      if (p) loc.premultiply(tmp.copy(Wb[idx.get(p)!]!).invert());
      qpow(loc, o.strength[nm] ?? 0, sc);
      const oo = (f * n + j) * 4;
      q[oo] = sc.x; q[oo + 1] = sc.y; q[oo + 2] = sc.z; q[oo + 3] = sc.w;
    }
  }
  return { name: clip.name ?? 'clip', fps: clip.fps, frames: F, duration: clip.duration, joints: sk.names, q };
}

/** 時刻 t（秒）の 姿勢を out（関節ごとの Quaternion）に 入れる。loop = 最後の コマから 最初へ つなぐ */
export function sampleClip(b: BakedClip, t: number, loop: boolean, out: Quaternion[]): void {
  const n = b.joints.length;
  let f = t * b.fps;
  let i0: number, i1: number, a: number;
  if (loop) {
    const span = b.frames;
    f = ((f % span) + span) % span;
    i0 = Math.floor(f); a = f - i0; i1 = (i0 + 1) % b.frames;
  } else {
    f = Math.max(0, Math.min(b.frames - 1, f));
    i0 = Math.floor(f); a = f - i0; i1 = Math.min(b.frames - 1, i0 + 1);
  }
  for (let j = 0; j < n; j++) {
    const o0 = (i0 * n + j) * 4, o1 = (i1 * n + j) * 4;
    const qq = out[j]!;
    qq.set(b.q[o0]!, b.q[o0 + 1]!, b.q[o0 + 2]!, b.q[o0 + 3]!);
    if (a > 0) {
      // 1 コマ ぶんの 小さい 差なので 正規化した 線形補間（slerp より 軽い）
      const x = b.q[o1]!, y = b.q[o1 + 1]!, z = b.q[o1 + 2]!, w = b.q[o1 + 3]!;
      const dot = qq.x * x + qq.y * y + qq.z * z + qq.w * w;
      const s = dot < 0 ? -a : a;
      qq.set(qq.x * (1 - a) + x * s, qq.y * (1 - a) + y * s, qq.z * (1 - a) + z * s, qq.w * (1 - a) + w * s).normalize();
    }
  }
}

export interface PlayOpts {
  /** クロスフェードの 秒 */
  fade?: number;
  /** 再生の 速さ（1 = もとの 速さ） */
  rate?: number;
  loop?: boolean;
  /** はじまりの 秒 */
  t0?: number;
}

interface Track { clip: BakedClip | null; t: number; rate: number; loop: boolean }

/** クリップを 1 つ 流して、かえる ときは クロスフェードで つなぐ。clip = null は 休みの 姿勢（ぜんぶ 単位）へ */
export class MotionPlayer {
  readonly pose: Quaternion[];
  /** 1 回の update で した 補間の 数（仕事の 数の 目安） */
  work = 0;
  private cur: Track = { clip: null, t: 0, rate: 1, loop: false };
  private prev: Track | null = null;
  private fadeT = 0;
  private fadeDur = 0;
  private readonly a: Quaternion[];
  constructor(private readonly n: number) {
    const mk = () => Array.from({ length: n }, () => new Quaternion());
    this.pose = mk(); this.a = mk();
  }

  get clip(): BakedClip | null { return this.cur.clip; }
  get time(): number { return this.cur.t; }
  /** いまの クリップの のこり（秒、実時間。ループは Infinity、休みは 0） */
  timeLeft(): number {
    const c = this.cur;
    if (!c.clip) return 0;
    if (c.loop) return Infinity;
    return Math.max(0, (c.clip.duration - c.t) / c.rate);
  }
  setRate(rate: number): void { this.cur.rate = rate; }
  fading(): boolean { return this.prev !== null; }

  play(clip: BakedClip | null, o: PlayOpts = {}): void {
    const fade = o.fade ?? 0.2;
    if (fade > 0 && (this.cur.clip || clip)) { this.prev = this.cur; this.fadeT = 0; this.fadeDur = fade; } else this.prev = null;
    this.cur = { clip, t: o.t0 ?? 0, rate: o.rate ?? 1, loop: o.loop ?? false };
  }

  private sample(tr: Track, out: Quaternion[]): void {
    if (tr.clip) sampleClip(tr.clip, tr.t, tr.loop, out);
    else for (const q of out) q.set(0, 0, 0, 1);
    this.work += tr.clip ? this.n : 0;
  }

  update(dt: number): void {
    this.work = 0;
    this.cur.t += dt * this.cur.rate;
    if (this.prev) {
      this.prev.t += dt * this.prev.rate;
      this.fadeT += dt;
      if (this.fadeT >= this.fadeDur) this.prev = null;
    }
    this.sample(this.cur, this.pose);
    if (this.prev) {
      this.sample(this.prev, this.a);
      const k = Math.min(1, this.fadeT / this.fadeDur);
      const s = k * k * (3 - 2 * k); // なめらかな 切りかえ
      for (let j = 0; j < this.n; j++) {
        const A = this.a[j]!, B = this.pose[j]!;
        const sg = A.x * B.x + A.y * B.y + A.z * B.z + A.w * B.w < 0 ? -1 : 1;
        B.set(A.x * (1 - s) * sg + B.x * s, A.y * (1 - s) * sg + B.y * s, A.z * (1 - s) * sg + B.z * s, A.w * (1 - s) * sg + B.w * s).normalize();
      }
      this.work += this.n;
    }
  }
}
