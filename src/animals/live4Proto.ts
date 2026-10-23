import * as THREE from 'three';
import type { AnimalState, ProtoBone, ProtoPose, Vec3, YokaiKind } from '../contracts';

/**
 * LIVE-4 試作（見た目・うごき の 確認 だけ。本物 の AI・ダメージ・きまり は まだ ない）。
 * アート 案 C「ヒーロー」（`livestock/art/live4/tools/poses.py`）の ポーズ を そのまま 使い、
 * マッチョ が 妖怪 まで はしる → パンチ → 3 回目 は きりあげ（妖怪 が うく）→ ふんっ！ を 順 に 見せる。
 * `window.__rikkun.animals.live4Proto({...})` から 呼ぶ。
 */

type V3 = [number, number, number];
interface BoneSrc {
  rot?: V3;
  rots?: V3[];
  off?: V3;
}
interface PoseSrc {
  root?: { off?: V3; rot?: V3; sc?: V3 };
  [bone: string]: BoneSrc | { off?: V3; rot?: V3; sc?: V3 } | undefined;
}
const L = (rots: V3[], off?: V3): BoneSrc => ({ rots, off });

/** 案 C の ポーズ（単位 1/16 ブロック・度） */
const SRC: Record<string, PoseSrc> = {
  run1: { root: { rot: [-18, 0, 0], off: [0, 2.2, 0] }, legL: { rot: [45, 0, 0] }, legR: { rot: [40, 0, 0] }, wingL: L([[65, 0, 0]]), wingR: L([[65, 0, 0]]), comb: { rot: [25, 0, 0] } },
  run2: { root: { rot: [-10, 0, 0], sc: [1.1, 0.9, 1.1] }, legL: { rot: [-10, 0, 0] }, legR: { rot: [-5, 0, 0] }, wingL: L([[50, 0, 0]]), wingR: L([[50, 0, 0]]), comb: { rot: [10, 0, 0] } },
  p_tame: { root: { rot: [2, -25, 0], sc: [1.04, 0.96, 1.04] }, wingR: L([[45, 0, 0]], [0, 0, 1.2]), wingL: L([[-40, 0, 0]]) },
  p_hit: { root: { rot: [-8, 32, 0], off: [0, 0, -1] }, wingR: L([[-90, 0, 0], [0, 72, 0]], [0, 1, -2]), wingL: L([[45, 0, 0]]), legL: { rot: [-22, 0, 0] }, legR: { rot: [22, 0, 0] } },
  p_back: { root: { rot: [-4, 18, 0] }, wingR: L([[-60, 0, 0], [0, 45, 0]]), wingL: L([[20, 0, 0]]) },
  p_step: { root: { off: [0, 1.0, 0], rot: [-4, 0, 0] }, legL: { rot: [20, 0, 0] }, legR: { rot: [15, 0, 0] }, wingL: L([[-25, 0, 0]]), wingR: L([[-25, 0, 0]]) },
  u_squat: { root: { sc: [1.14, 0.82, 1.14], rot: [-10, -30, 0] }, wingR: L([[0, 0, -70], [40, 0, 0]]), wingL: L([[-40, 0, 0]]) },
  u_hit: { root: { sc: [0.9, 1.14, 0.9], off: [0, 3.0, -0.5], rot: [4, 40, -8] }, wingR: L([[0, 0, 62], [0, -90, 0]], [0, 2, -0.8]), wingL: L([[0, 0, 40]]), legL: { rot: [35, 0, 0] }, legR: { rot: [-5, 0, 0] }, head: { rot: [-14, 0, 0] } },
  u_hold: { root: { sc: [0.94, 1.08, 0.94], off: [0, 2.0, -0.5], rot: [3, 70, -6] }, wingR: L([[0, 0, 55], [0, -90, 0]], [0, 1.6, -0.8]), wingL: L([[0, 0, 35]]), legL: { rot: [25, 0, 0] } },
  u_back: { root: { sc: [1.08, 0.92, 1.08], rot: [0, 10, 0] }, wingL: L([[-25, 0, 0]]), wingR: L([[-25, 0, 0]]) },
  f_chest: { root: { rot: [10, -30, 0], sc: [1.05, 1.0, 1.05] }, wingL: L([[0, 0, 40]]), wingR: L([[0, 0, -40]]) },
  f_flex: { root: { rot: [6, -40, 4] }, wingL: L([[0, 0, -32]], [0, 0.8, 0]), wingR: L([[0, 0, -80]], [0, -0.5, 0]), head: { rot: [-10, 25, 0] } },
};

const BONES = ['legL', 'legR', 'wingL', 'wingR', 'head', 'comb'] as const;
const D = Math.PI / 180;
const qOf = (r: V3): THREE.Quaternion => new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D, 'XYZ'));

function build(src: PoseSrc): ProtoPose {
  const root = (src.root ?? {}) as { off?: V3; rot?: V3; sc?: V3 };
  const bones: Record<string, ProtoBone> = {};
  for (const n of BONES) {
    const b = src[n] as BoneSrc | undefined;
    // art の 合成: Rm = R(rots[k]) … R(rots[0]) R(rot)
    const q = qOf(b?.rot ?? [0, 0, 0]);
    for (const r of b?.rots ?? []) q.premultiply(qOf(r));
    bones[n] = { q: [q.x, q.y, q.z, q.w], off: b?.off ?? [0, 0, 0] };
  }
  return { root: { off: root.off ?? [0, 0, 0], rot: root.rot ?? [0, 0, 0], sc: root.sc ?? [1, 1, 1] }, bones };
}
export const PROTO_POSES: Readonly<Record<string, ProtoPose>> = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, build(v)]));

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function mixPose(a: ProtoPose, b: ProtoPose, t: number): ProtoPose {
  const bones: Record<string, ProtoBone> = {};
  for (const n of BONES) {
    const x = a.bones[n]!;
    const y = b.bones[n]!;
    qa.set(...x.q!);
    qb.set(...y.q!);
    qa.slerp(qb, t);
    bones[n] = { q: [qa.x, qa.y, qa.z, qa.w], off: lerp3(x.off!, y.off!, t) };
  }
  return { root: { off: lerp3(a.root.off, b.root.off, t), rot: lerp3(a.root.rot, b.root.rot, t), sc: lerp3(a.root.sc, b.root.sc, t) }, bones };
}

type Key = [number, string];
const smooth = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** キー（ステップ, ポーズ名）の 列 を なめらかに つなぐ */
export function sample(keys: readonly Key[], t: number): ProtoPose {
  if (t <= keys[0]![0]) return PROTO_POSES[keys[0]![1]]!;
  for (let i = 1; i < keys.length; i++) {
    const [t1, n1] = keys[i]!;
    if (t <= t1) {
      const [t0, n0] = keys[i - 1]!;
      return mixPose(PROTO_POSES[n0]!, PROTO_POSES[n1]!, smooth((t - t0) / Math.max(1e-6, t1 - t0)));
    }
  }
  return PROTO_POSES[keys[keys.length - 1]![1]]!;
}

/** ふつう の パンチ（ため 4 → 当たり 5 → もどり。かまえ の 足ぶみ）。全部 41 ステップ */
export const PUNCH_KEYS: readonly Key[] = [[0, 'p_step'], [4, 'p_tame'], [5, 'p_hit'], [7, 'p_hit'], [16, 'p_back'], [22, 'p_step'], [28, 'p_back'], [34, 'p_step'], [40, 'p_back']];
/** 3 回目 の きりあげ（しゃがむ → 5 で 当たる → のびた まま → もどり）。41 ステップ */
export const UPPER_KEYS: readonly Key[] = [[0, 'p_back'], [3, 'u_squat'], [5, 'u_hit'], [8, 'u_hit'], [16, 'u_hold'], [20, 'u_back'], [40, 'u_back']];
/** かちポーズ（むね を はる 10 → 力こぶ 20）。30 ステップ */
export const FLEX_KEYS: readonly Key[] = [[0, 'u_back'], [10, 'f_chest'], [30, 'f_flex']];
export const PUNCH_TICKS = 41;
export const HIT_TICK = 5;
export const FLEX_TICKS = 30;
/** はしる 速さ（ブロック/秒）。ふつう の なかま の 約 1.25 倍 の 目安 */
const RUN_SPEED = 6.5;
const REACH = 1.5;
const START_DIST = 7;
const TOP: Record<YokaiKind, number> = { karakasa: 1.9, chochin: 1.5, nurikabe: 2.6, rokurokubi: 2.2 };

// ---- ねらい の しるし: マッチョ の かお 14×12 ドット（わ つき。`art/live4/tools/face.py` の 2）
const FACE = ['....##..##....', '...#rr##rr#...', '...#rrrrrr#...', '..##rrrrrr##..', '.##wwwwwwwww#.', '#wbbbwwwwbbbw#', '#wwkkwwwwkkww#', '#wwkkwyywkkww#', '#wwwwyyyywwww#', '#wwwwwrrwwwww#', '.#wwwwrrwwww#.', '..##########..'];
const PAL: Record<string, string> = { '#': '#2A1E14', w: '#F5F1E6', b: '#2E2438', k: '#2E2438', y: '#F2B33D', r: '#E8553D' };

function faceCanvas(s: number): HTMLCanvasElement {
  const pad = 3 * s;
  const n = FACE[0]!.length * s + 2 * pad;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.lineWidth = s;
  g.strokeStyle = '#3D5A9E';
  g.beginPath();
  g.arc(n / 2, n / 2, n / 2 - s / 2, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = Math.max(1, s / 2);
  g.strokeStyle = '#FFFFFF';
  g.beginPath();
  g.arc(n / 2, n / 2, n / 2 - s - g.lineWidth / 2, 0, Math.PI * 2);
  g.stroke();
  FACE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = PAL[row[x]!];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(pad + x * s, pad + s / 2 + y * s, s, s);
    }
  });
  return c;
}

export interface Live4Opts {
  yokai?: YokaiKind;
  /** パンチ の 数（3 回目 が きりあげ）。ふつう 3 */
  hits?: number;
  /** しるし の 大きさ（ドット の 倍率。ふつう 3） */
  markScale?: number;
  /** しるし を 出さない */
  noMark?: boolean;
}

export interface Live4Deps {
  animals: { spawn(x: number, y: number, z: number, o: { friend?: boolean; breed?: 'macho'; stage?: 'adult' }): number | null; protoDrive(id: number, d: { x: number; y: number; z: number; yaw: number; state: AnimalState; stateTicks: number; pose: ProtoPose | null } | null): boolean };
  yokai: {
    spawn(kind: YokaiKind, x: number, y: number, z: number, o: { ai: boolean }): number;
    setHp(id: number, hp: number): boolean;
    damage(id: number, amount: number, from: Vec3, knock?: { dist: number; up: number }): number | void;
    list(): Array<{ id: number; position: Vec3; hp: number }>;
  };
  camera: () => THREE.Camera;
  player: () => Vec3;
}

export interface Live4Info {
  phase: 'run' | 'punch' | 'wait' | 'flex' | 'done' | 'off';
  t: number;
  punch: number;
  yokai: number | null;
  macho: number | null;
  upper: boolean;
}

/** 試作 の 進行役。毎ステップ `update()`（`animals.update()` の あと） */
export class Live4Proto {
  private macho: number | null = null;
  private yokai: number | null = null;
  private opts: Required<Live4Opts> = { yokai: 'karakasa', hits: 3, markScale: 3, noMark: false };
  private phase: Live4Info['phase'] = 'off';
  private t = 0;
  private n = 1;
  private x = 0;
  private z = 0;
  private hx = 0;
  private hz = 0;
  private yaw = 0;
  private y = 0;
  private markEl: HTMLCanvasElement | null = null;
  private sayEl: HTMLDivElement | null = null;

  constructor(private readonly d: Live4Deps) {}

  info(): Live4Info {
    return { phase: this.phase, t: this.t, punch: this.n, yokai: this.yokai, macho: this.macho, upper: this.n % 3 === 0 };
  }

  start(o: Live4Opts = {}): Live4Info {
    this.stop();
    this.opts = { yokai: o.yokai ?? 'karakasa', hits: Math.max(1, o.hits ?? 3), markScale: o.markScale ?? 3, noMark: o.noMark === true };
    const p = this.d.player();
    // カメラ の 前 5 マス に 妖怪。マッチョ は カメラ から 見て 左 へ はしる（遠い うで = 右うで が フック）
    const cam = this.d.camera();
    const f = new THREE.Vector3();
    cam.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const cx = p.x + f.x * 5;
    const cz = p.z + f.z * 5;
    this.y = p.y;
    this.hx = f.z; // 進む 向き = (fz, -fx)
    this.hz = -f.x;
    this.yaw = Math.atan2(f.z, f.x);
    this.x = cx - this.hx * START_DIST;
    this.z = cz - this.hz * START_DIST;
    this.yokai = this.d.yokai.spawn(this.opts.yokai, cx, this.y, cz, { ai: false });
    this.d.yokai.setHp(this.yokai, 99);
    this.macho = this.d.animals.spawn(this.x, this.y, this.z, { friend: true, breed: 'macho', stage: 'adult' });
    this.phase = 'run';
    this.t = 0;
    this.n = 1;
    this.drive(PROTO_POSES.run1!);
    if (!this.opts.noMark) {
      this.markEl = faceCanvas(this.opts.markScale);
      Object.assign(this.markEl.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '5', imageRendering: 'pixelated', willChange: 'transform' });
      document.body.append(this.markEl);
    }
    return this.info();
  }

  stop(): void {
    if (this.macho !== null) this.d.animals.protoDrive(this.macho, null);
    this.macho = null;
    this.yokai = null;
    this.phase = 'off';
    this.markEl?.remove();
    this.sayEl?.remove();
    this.markEl = this.sayEl = null;
  }

  private drive(pose: ProtoPose): void {
    if (this.macho === null) return;
    const state: AnimalState = this.phase === 'run' ? 'follow' : 'idle';
    if (!this.d.animals.protoDrive(this.macho, { x: this.x, y: this.y, z: this.z, yaw: this.yaw, state, stateTicks: this.t, pose })) this.stop();
  }

  private target(): { x: number; y: number; z: number } | null {
    const y = this.yokai === null ? undefined : this.d.yokai.list().find((q) => q.id === this.yokai);
    return y ? y.position : null;
  }

  update(): void {
    if (this.phase === 'off' || this.macho === null) return;
    const tp = this.target();
    if (!tp) return this.stop();
    const t = this.t;
    switch (this.phase) {
      case 'run': {
        const step = RUN_SPEED / 60;
        this.x += this.hx * step;
        this.z += this.hz * step;
        // はねて はしる: 12 ステップ で 1 往復（1 → 2 → 1）
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 12);
        this.drive(mixPose(PROTO_POSES.run1!, PROTO_POSES.run2!, w));
        if (Math.hypot(tp.x - this.x, tp.z - this.z) <= REACH) {
          this.phase = 'punch';
          this.t = 0;
          return;
        }
        break;
      }
      case 'punch': {
        const upper = this.n % 3 === 0;
        this.drive(sample(upper ? UPPER_KEYS : PUNCH_KEYS, t));
        if (t === HIT_TICK && this.yokai !== null) {
          const from = { x: this.x, y: this.y, z: this.z };
          // きりあげ = 刀 の きりあげ と 同じ（押す 1.0・上へ 7）。ふつう = ぼくとう の 押す 0.8
          this.d.yokai.damage(this.yokai, 2, from, upper ? { dist: 1.0, up: 7 } : { dist: 0.8, up: 0 });
        }
        if (t + 1 >= PUNCH_TICKS) {
          this.n++;
          this.t = 0;
          if (this.n > this.opts.hits) this.phase = 'wait';
          return;
        }
        break;
      }
      case 'wait': {
        // 妖怪 が ふわっ と おりて くる まで 見まもる
        this.drive(sample(UPPER_KEYS, 40));
        if (t >= 40) {
          this.phase = 'flex';
          this.t = 0;
          this.say('ふんっ！');
          return;
        }
        break;
      }
      case 'flex': {
        this.drive(sample(FLEX_KEYS, t));
        if (t >= FLEX_TICKS + 60) {
          this.phase = 'done';
          this.t = 0;
          return;
        }
        break;
      }
      case 'done':
        this.drive(PROTO_POSES.f_flex!);
        if (t >= 30) {
          this.sayEl?.remove();
          this.sayEl = null;
        }
        break;
    }
    this.t++;
  }

  private say(text: string): void {
    this.sayEl?.remove();
    const el = document.createElement('div');
    el.textContent = text;
    Object.assign(el.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '5', font: '800 40px sans-serif', color: '#fff', textShadow: '0 0 4px #2a1e14, 0 0 4px #2a1e14, 2px 2px 0 #2a1e14', whiteSpace: 'nowrap' });
    document.body.append(el);
    this.sayEl = el;
  }

  /** しるし・ふんっ！ の 位置（毎フレーム。ワールド → 画面） */
  place(): void {
    if (this.phase === 'off') return;
    const cam = this.d.camera();
    cam.updateMatrixWorld();
    const v = new THREE.Vector3();
    const put = (el: HTMLElement | null, x: number, y: number, z: number): void => {
      if (!el) return;
      v.set(x, y, z).project(cam);
      el.hidden = v.z > 1 || v.z < -1;
      el.style.transform = `translate(${((v.x * 0.5 + 0.5) * window.innerWidth - el.offsetWidth / 2).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * window.innerHeight - el.offsetHeight).toFixed(1)}px)`;
    };
    const tp = this.target();
    // ねらって いる あいだ だけ（かちポーズ に なったら きえる）。体力 の バー の さらに 上
    if (tp && this.markEl) {
      const show = this.phase === 'run' || this.phase === 'punch' || this.phase === 'wait';
      this.markEl.style.display = show ? '' : 'none';
      if (show) put(this.markEl, tp.x, tp.y + TOP[this.opts.yokai] + 0.95, tp.z);
    }
    if (this.sayEl) put(this.sayEl, this.x, this.y + 1.9, this.z);
  }
}
