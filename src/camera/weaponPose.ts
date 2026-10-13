import type { BladeStance, BladeState, BladeTech, BowPose } from '../contracts';

/**
 * 刀のかまえ・わざ、弓のしなりの「形」を決める計算（WEAPON-2 §3.1〜§3.3）。
 * three.js は使わない（テストしやすいように）。角度は度、画面の位置は 0〜1（左上が (0,0)）。
 */

/** 刀の 1 つ分の形（数字だけ。間をなめらかにつなぐ） */
interface K {
  /** 両うでの rx・rz */
  rx: number;
  rz: number;
  /** 刀の向き（水平から上が正） */
  sp: number;
  /** からだのひねり */
  tw: number;
  /** 前にかがむ（度） */
  lean: number;
  /** からだがしずむ量 */
  sink: number;
  /** 足の前後（もも。前が正） */
  legR: number;
  legL: number;
  knee: number;
  /** 一人称: つかの位置・剣先の位置 */
  hx: number;
  hy: number;
  tx: number;
  ty: number;
}

export interface BladePose {
  rx: number;
  rz: number;
  lx: number;
  lz: number;
  swordPitch: number;
  twist: number;
  legFront: { right: number; left: number };
  knee: number;
  /** からだがしずむ量・前にかがむ角度 */
  sink: number;
  lean: number;
  /** 一人称: 両手（つか）と剣先の画面の位置 */
  hand: { x: number; y: number };
  tip: { x: number; y: number };
}

export function newBladePose(): BladePose {
  return {
    rx: 0, rz: 0, lx: 0, lz: 0, swordPitch: 0, twist: 0,
    legFront: { right: 0, left: 0 }, knee: 0, sink: 0, lean: 0,
    hand: { x: 0, y: 0 }, tip: { x: 0, y: 0 },
  };
}

const CHUDAN: K = { rx: 50, rz: -8, sp: 15, tw: 0, lean: 0, sink: 0, legR: 15, legL: -15, knee: 10, hx: 0.62, hy: 0.95, tx: 0.54, ty: 0.56 };
const JODAN: K = { rx: 165, rz: -5, sp: 135, tw: -10, lean: 0, sink: 0, legR: -15, legL: 15, knee: 10, hx: 0.72, hy: 0.06, tx: 0.8, ty: -0.35 };
const GEDAN: K = { rx: 25, rz: -8, sp: -30, tw: 0, lean: 10, sink: 0, legR: 15, legL: -15, knee: 20, hx: 0.6, hy: 1.0, tx: 0.5, ty: 0.84 };

export const STANCE_K: Readonly<Record<BladeStance, Readonly<K>>> = { chudan: CHUDAN, jodan: JODAN, gedan: GEDAN };

/** わざの長さ（F。§4.2） */
export const TECH_FRAMES: Readonly<Record<BladeTech, number>> = { thrust: 14, kesa: 72, kiriage: 53 };
/** かまえ変えの長さ（F。設定 stanceSwitchTicks の初期値） */
export const SWITCH_FRAMES = 8;

// 突き（中段から）
const T1: K = { ...CHUDAN, rx: 42, sp: 5, hx: 0.66, hy: 0.98, tx: 0.58, ty: 0.62 };
const T2: K = { ...CHUDAN, rx: 88, sp: 0, legR: 25, lean: 15, hx: 0.58, hy: 0.8, tx: 0.5, ty: 0.5 };
// 大げさ斬り（上段から）
const K1: K = { ...JODAN, rx: 178, rz: 20, sp: 160, tw: -25, hx: 0.78, hy: 0.04, tx: 0.88, ty: -0.05 };
const K2: K = { ...JODAN, rx: 40, rz: -35, sp: -40, tw: 30, sink: 0.08, hx: 0.36, hy: 0.85, tx: 0.15, ty: 1.05 };
// 切り上げ（下段から）
const G1: K = { ...GEDAN, rx: 15, rz: -30, sp: -55, tw: 20, lean: 10, knee: 25, hx: 0.45, hy: 1.0, tx: 0.22, ty: 1.05 };
const G2: K = { ...GEDAN, rx: 150, rz: 25, sp: 110, tw: -20, lean: 0, knee: 5, hx: 0.7, hy: 0.35, tx: 0.86, ty: 0.02 };

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

const scratch: K = { ...CHUDAN };

function mix(a: K, b: K, t: number, out: K): K {
  const u = clamp01(t);
  out.rx = a.rx + (b.rx - a.rx) * u;
  out.rz = a.rz + (b.rz - a.rz) * u;
  out.sp = a.sp + (b.sp - a.sp) * u;
  out.tw = a.tw + (b.tw - a.tw) * u;
  out.lean = a.lean + (b.lean - a.lean) * u;
  out.sink = a.sink + (b.sink - a.sink) * u;
  out.legR = a.legR + (b.legR - a.legR) * u;
  out.legL = a.legL + (b.legL - a.legL) * u;
  out.knee = a.knee + (b.knee - a.knee) * u;
  out.hx = a.hx + (b.hx - a.hx) * u;
  out.hy = a.hy + (b.hy - a.hy) * u;
  out.tx = a.tx + (b.tx - a.tx) * u;
  out.ty = a.ty + (b.ty - a.ty) * u;
  return out;
}

/** わざの f フレーム目（1〜）の形 */
function techK(tech: BladeTech, f: number, out: K): K {
  switch (tech) {
    case 'thrust':
      if (f <= 4) return mix(CHUDAN, T1, f / 4, out);
      if (f <= 6) return mix(T1, T2, ease((f - 4) / 1.5), out);
      return mix(T2, CHUDAN, ease((f - 6) / 8), out);
    case 'kesa':
      // 大げさ斬り: 28 / 6 / 48 F。ふりかぶり 0〜18、ふりおろし 19.4〜24（あたり 29〜34 の すこし前）、もどり 56〜72
      if (f <= 18) return mix(JODAN, K1, f / 18, out);
      if (f <= 24) return mix(K1, K2, (f - 19.4) / 4.6, out);
      if (f <= 56) return mix(K2, K2, 0, out);
      return mix(K2, JODAN, ease((f - 56) / 16), out);
    case 'kiriage':
      // 切り上げ: 15 / 5 / 33 F。ふりかぶり 0〜15、ふりあげ 16〜20（あたり）、もどり 20〜53
      if (f <= 15) return mix(GEDAN, G1, f / 15, out);
      if (f <= 20) return mix(G1, G2, (f - 16) / 4, out);
      return mix(G2, GEDAN, ease((f - 20) / 33), out);
  }
}

/** 今の刀の状態から K を出す */
function stateK(s: BladeState, out: K): K {
  if (s.tech !== null && s.frame >= 1 && s.frame <= TECH_FRAMES[s.tech]) {
    return techK(s.tech, s.frame, out);
  }
  if (s.phase === 'switch' && s.switchFrom !== null && s.switchFrom !== s.stance) {
    return mix(STANCE_K[s.switchFrom], STANCE_K[s.stance], ease(s.frame / SWITCH_FRAMES), out);
  }
  return mix(STANCE_K[s.stance], STANCE_K[s.stance], 0, out);
}

/** 刀の状態から、人形の形を出す。刀を持っていなければ null */
export function bladePoseAt(s: BladeState, out: BladePose): BladePose | null {
  if (s.item === null) return null;
  const k = stateK(s, scratch);
  out.rx = out.lx = k.rx;
  out.rz = out.lz = k.rz;
  out.swordPitch = k.sp;
  out.twist = k.tw;
  out.legFront.right = k.legR;
  out.legFront.left = k.legL;
  out.knee = k.knee;
  out.sink = k.sink;
  out.lean = k.lean;
  out.hand.x = k.hx;
  out.hand.y = k.hy;
  out.tip.x = k.tx;
  out.tip.y = k.ty;
  return out;
}

// ---------------------------------------------------------------- 弓

export interface BowDollPose {
  rx: number;
  rz: number;
  lx: number;
  lz: number;
  twist: number;
}

const BOW_RZ: readonly (readonly [number, number])[] = [[0, 0], [0.4, 15], [0.7, 25], [1, 35]];
/** 引き手の画面の位置（つるを引く量 → x, y）。段 3 は画面の外（x > 1） */
const BOW_HAND: readonly (readonly [number, number, number])[] = [
  [0, 0.48, 0.7],
  [0.4, 0.62, 0.72],
  [0.7, 0.8, 0.74],
  [1, 1.15, 0.76],
];
/** 弓を持つ左手の画面の位置 */
export const BOW_LEFT_HAND = { x: 0.4, y: 0.7 } as const;
/** 段 3 のとき や の先の画面の位置（照準のすぐ下） */
export const BOW_ARROW_TIP_FULL = { x: 0.5, y: 0.56 } as const;

function table1(t: readonly (readonly [number, number])[], x: number): number {
  const u = clamp01(x);
  for (let i = 1; i < t.length; i++) {
    if (u <= t[i]![0]) {
      const a = t[i - 1]!;
      const b = t[i]!;
      return a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0]);
    }
  }
  return t[t.length - 1]![1];
}

/** 弓をひいているか（ひく前・ひいていないときは通常の形） */
export function bowActive(p: BowPose): boolean {
  return p.stage > 0 || p.pull > 0.001;
}

/** 三人称の人形の形（§3.3 の表。つるの引き量になめらかについていく） */
export function bowDollAt(p: BowPose, out: BowDollPose): BowDollPose {
  out.lx = 90;
  out.lz = 0;
  out.rx = 90;
  out.rz = table1(BOW_RZ, p.pull);
  out.twist = -10 * ease((p.pull - 0.7) / 0.3);
  return out;
}

/** 一人称の引き手の画面の位置 */
export function bowHandAt(p: BowPose, out: { x: number; y: number }): { x: number; y: number } {
  const u = clamp01(p.pull);
  for (let i = 1; i < BOW_HAND.length; i++) {
    const a = BOW_HAND[i - 1]!;
    const b = BOW_HAND[i]!;
    if (u <= b[0]) {
      const k = (u - a[0]) / (b[0] - a[0]);
      out.x = a[1] + (b[1] - a[1]) * k;
      out.y = a[2] + (b[2] - a[2]) * k;
      return out;
    }
  }
  const last = BOW_HAND[BOW_HAND.length - 1]!;
  out.x = last[1];
  out.y = last[2];
  return out;
}
