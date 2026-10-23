import type { AnimalState } from '../../contracts';
import type { AnimalModelKind } from './chickenModel';
import { CHICKEN_BONES, CHICKEN_SCALE } from './chickenSpec';

/**
 * にわとり の うごき（LIVE-1 §3.5 の 区間 と コマ数、DESIGN 16.3 の 角度）。Three.js なし の 純粋な 計算。
 * 入力 = 状態 と その 経過ステップ、出力 = 骨ごとの 動き（`PoseBuf`）。骨の 動きは 「ふだんの 位置 から の 差」。
 *  - off = 位置の 差（1/16 ブロック）／ rot = 回転（度。x → y → z）／ sc = 骨の 拡大（かけ算）
 *  - rigY = からだ 全体の 上がり（ブロック）／ scale = からだ 全体の 拡大（つぶし・のばし。体積を 保つ）
 */
export interface PoseInput {
  state: AnimalState;
  /** その 状態に なってから の ステップ数 */
  stateTicks: number;
  /** 頭の 向きと 体の 向きの 差（ラジアン）。`wrap(headYaw − yaw)`。体の 向きを 基準に した 頭の ひねり */
  headRelYaw: number;
  /** 「動きの 強さ」0〜1。0 で ジャンプの 高さ と とさかの ゆれを 止める（頭の 向き・つつく・目を とじる は のこす） */
  motion: number;
  // ---- 版 3.2（§2.9・§3.5）
  /** パタパタ おりて いる（空中 で 下 へ。どの 状態 の 上にも 重なる） */
  fluttering?: boolean;
  /** パタパタ を 始めて から の ステップ（羽ばたき 8 ステップ で 1 往復） */
  flutterT?: number;
  /** 着地 して から の ステップ（0〜5 の 間 ぽよん。なければ・負 なら なし） */
  landT?: number;
  // ---- LIVE-2（§3.5）
  /** 形 の 種類。マッチョ は 羽 が うで（上へ たつ）なので 「ひろげる」の むきが 逆。なければ ふつう の 大人 */
  kind?: AnimalModelKind;
  /** 'hatch' 動き の 経過 0〜1（なければ `stateTicks` から。ふつう 60・マッチョ 80 ステップ） */
  hatchT?: number;
  /** 'grow' 動き の 経過 0〜1（なければ `stateTicks` から。60 ステップ） */
  growT?: number;
  /** 'grow' の とちゅう で 大人 の 形 に かわった とき、ひよこ の 形 の 見た目 の 倍率（つなぎめ を そろえる） */
  growFromScale?: number;
  /** ひよこ の コロン（着地）の 経過 0〜1（12 ステップ。なければ・負 なら なし） */
  rollT?: number;
}

export interface PoseBuf {
  rigY: number;
  scale: [number, number, number];
  off: Float32Array;
  rot: Float32Array;
  sc: Float32Array;
}

const NB = CHICKEN_BONES.length;
const D2 = (name: string): number => CHICKEN_BONES.indexOf(name as (typeof CHICKEN_BONES)[number]);

/** 骨の 番号 */
export function boneIndex(name: (typeof CHICKEN_BONES)[number]): number {
  return D2(name);
}

export function createPose(base: number = CHICKEN_SCALE): PoseBuf {
  return { rigY: 0, scale: [base, base, base], off: new Float32Array(NB * 3), rot: new Float32Array(NB * 3), sc: new Float32Array(NB * 3).fill(1) };
}

const I = {
  body: D2('body'),
  legL: D2('legL'),
  legR: D2('legR'),
  neck: D2('neck'),
  head: D2('head'),
  comb: D2('comb'),
  eyes: D2('eyes'),
  wingL: D2('wingL'),
  wingR: D2('wingR'),
  tail: D2('tail'),
  brow: D2('brow'),
};

/** 頭の ひねりの 上限（度） */
export const HEAD_YAW_MAX = 80;

export const APPEAR_TICKS = 30;
export const PECK_TICKS = 30;
export const PET_TICKS = 30;
export const LAY_TICKS = 30;
export const JUMP_TICKS = 20;
export const WALK_STEP_TICKS = 12;
/** 版 3.2 */
export const FULL_TICKS = 20;
export const CARRY_LIFT_TICKS = 16;
export const PUT_DOWN_TICKS = 20;
export const FLUTTER_TICKS = 8;
export const LAND_TICKS = 6;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export function poseChicken(out: PoseBuf, inp: PoseInput, base: number = CHICKEN_SCALE): void {
  const K = base;
  const kind = inp.kind ?? 'chicken';
  const macho = kind === 'macho' || kind === 'machoChick';
  const adultForm = kind === 'chicken' || kind === 'macho';
  out.off.fill(0);
  out.rot.fill(0);
  out.sc.fill(1);
  out.rigY = 0;
  out.scale[0] = out.scale[1] = out.scale[2] = K;
  const calm = inp.motion > 0 ? 1 : 0; // 動きの 強さ 0 → とさかの ゆれ・ジャンプの 高さは 止める
  const t = inp.stateTicks < 0 ? 0 : inp.stateTicks;

  const off = (b: number, x: number, y: number, z: number): void => {
    if (b < 0) return; // この 形に 無い 骨（ひよこ の 首・とさか・しっぽ）
    out.off[b * 3] += x;
    out.off[b * 3 + 1] += y;
    out.off[b * 3 + 2] += z;
  };
  const rot = (b: number, x: number, y = 0, z = 0): void => {
    if (b < 0) return;
    out.rot[b * 3] += x;
    out.rot[b * 3 + 1] += y;
    out.rot[b * 3 + 2] += z;
  };
  // マッチョ の うで は 上へ たつので 「ひろげる」は 逆 まわり（外へ・上へ ひらく）
  const wsign = macho ? -1 : 1;
  const wing = (deg: number): void => {
    rot(I.wingL, 0, 0, -deg * wsign);
    rot(I.wingR, 0, 0, deg * wsign);
  };
  const legs = (deg: number): void => {
    rot(I.legL, deg);
    rot(I.legR, -deg);
  };
  const setScale = (x: number, y: number, z: number): void => {
    out.scale[0] = x * K;
    out.scale[1] = y * K;
    out.scale[2] = z * K;
  };
  const eyes = (c: number): void => {
    out.sc[I.eyes * 3 + 1] = 1 - 0.75 * c;
  };

  // 頭の 向き（体の 向きに たいする ひねり。ゲームの 向きは −yaw なので 符号を 逆に する）
  const relDeg = Math.max(-HEAD_YAW_MAX, Math.min(HEAD_YAW_MAX, (inp.headRelYaw * 180) / Math.PI));
  rot(I.head, 0, -relDeg, 0);

  /** つつく の 強さ。c = かがみ（0..1）、s = 前へ のびる（0..1） */
  const peckAt = (c: number, s: number): void => {
    rot(I.body, -18 * c);
    rot(I.tail, -12 * c);
    off(I.neck, 0, -0.6 * s, -1.4 * s);
    rot(I.neck, -12 * s);
    off(I.head, 0, -0.6 * s, -1.4 * s);
    rot(I.head, -8 * c - 22 * s);
    rot(I.comb, 22 * s * calm); // とさかは おくれて うしろへ
    wing(6 * c);
  };
  const petAt = (c: number, w: number): void => {
    eyes(c);
    off(I.neck, 0, 0.5 * c, 0);
    off(I.head, 0, 0.7 * c, 0.3 * c);
    rot(I.head, 10 * c, 0, (14 + w) * c);
    rot(I.neck, 0, 0, 4 * c);
    rot(I.comb, 0, 0, -(10 + 1.6 * w) * c * calm);
    wing(14 * c);
    rot(I.tail, 0, 0, -w * c);
    setScale(1 + 0.05 * c, 1 - 0.05 * c, 1 + 0.05 * c);
  };
  /** 首を かしげる（頭 → 体 の 順）。向きの ひねりは `headRelYaw` で 来る */
  const lookAt = (h: number, bd: number): void => {
    rot(I.head, 0, 0, 22 * h);
    rot(I.neck, 0, 10 * h, 0);
    rot(I.comb, 0, 0, -10 * h * calm);
    rot(I.body, 0, 8 * bd, 0);
  };

  switch (inp.state as AnimalState | 'thrown') {
    case 'appear': {
      const e = smooth(t / APPEAR_TICKS);
      const s = Math.max(e, 0.001);
      setScale(s, s, s);
      break;
    }
    case 'meat': {
      // LIVE-3: ねぐら へ とことこ（55 ステップ）→ じっと。落ちついた 立ち姿
      if (t < 55) {
        const ph = (2 * Math.PI * t) / WALK_STEP_TICKS;
        off(I.head, 0, 0, -1.0 * Math.sin(ph));
        off(I.neck, 0, 0, -0.5 * Math.sin(ph));
        legs(28 * Math.sin(ph / 2));
        rot(I.body, 0, 0, 2 * Math.sin(ph / 2));
      } else rot(I.head, 0, 10, 4);
      break;
    }
    case 'wander':
    case 'follow': {
      // 歩く: 1 歩 12 ステップ。頭を 前後 に ふる、足を ふる
      const ph = (2 * Math.PI * t) / WALK_STEP_TICKS;
      off(I.head, 0, 0, -1.0 * Math.sin(ph));
      off(I.neck, 0, 0, -0.5 * Math.sin(ph));
      if (!inp.fluttering) legs(28 * Math.sin(ph / 2)); // 空中 では 歩かない
      rot(I.body, 0, 0, 2 * Math.sin(ph / 2));
      break;
    }
    case 'rest':
    case 'idle':
      rot(I.head, 0, 10, 4); // 左右 対称に しない
      break;
    case 'look': {
      const h = Math.min(1, t / 8);
      const e = 1 - (1 - h) * (1 - h);
      const bd = t < 10 ? 0 : Math.min(1, (t - 10) / 10);
      lookAt(e, bd);
      break;
    }
    case 'eat': {
      // かがむ 6 → つつく 6×3（2 コマで 一気に 出て 4 コマで もどる）→ もどる 6
      let c = 0;
      let s = 0;
      if (t < 6) {
        c = t / 6;
        s = 0.35 * c;
      } else if (t < 24) {
        c = 1;
        const f = (t - 6) % 6;
        s = f < 2 ? 0.35 + 0.65 * (f / 2) : 1 - 0.65 * ((f - 2) / 4);
      } else {
        c = Math.max(0, 1 - (t - 24) / 6);
        s = 0.35 * c;
      }
      peckAt(c, s);
      break;
    }
    case 'pet': {
      // 目を ほそめる 4 → ふるふる 22 → もどる 4
      let c = 0;
      let w = 0;
      if (t < 4) c = t / 4;
      else if (t < 26) {
        c = 1;
        w = 6 * Math.sin((2 * Math.PI * (t - 4)) / 5.5);
      } else c = Math.max(0, 1 - (t - 26) / 4);
      petAt(c, w);
      break;
    }
    case 'lay': {
      // しゃがむ 8 → ふるふる 16 → ポンと 立つ 6（たて に つぶれ 横 に ひろがる。体積は ほぼ 同じ）
      if (t < 8) {
        const c = smooth(t / 8);
        setScale(1 + 0.18 * c, 1 - 0.26 * c, 1 + 0.18 * c);
        eyes(c);
        wing(6 * c);
      } else if (t < 24) {
        setScale(1.18, 0.74, 1.18);
        eyes(1);
        wing(6);
        rot(I.body, 0, 0, 3 * Math.sin((2 * Math.PI * (t - 8)) / 4));
      } else {
        const k = clamp01((t - 24) / 6);
        if (k < 0.5) {
          const u = k / 0.5;
          setScale(1.18 + (0.92 - 1.18) * u, 0.74 + (1.12 - 0.74) * u, 1.18 + (0.92 - 1.18) * u);
        } else {
          const u = (k - 0.5) / 0.5;
          setScale(0.92 + 0.08 * u, 1.12 - 0.12 * u, 0.92 + 0.08 * u);
        }
        out.rigY = 0.1 * Math.sin(Math.PI * k) * calm;
        eyes(Math.max(0, 1 - k * 3));
        wing(20 * Math.sin(Math.PI * k));
      }
      break;
    }
    case 'cheer': {
      // ジャンプ 20 コマ（ためる 4・とぶ 10・着地 6）。くり返すと 2 回目
      const tt = t % JUMP_TICKS;
      if (tt < 4) {
        const k = tt / 4;
        setScale(1 + 0.15 * k, 1 - 0.25 * k, 1 + 0.15 * k);
        wing(-4 * k);
      } else if (tt < 14) {
        const k = (tt - 4) / 10;
        const arc = Math.sin(Math.PI * k);
        out.rigY = 0.4 * arc * calm;
        const st = 1 + 0.12 * arc;
        setScale(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
        wing(75 * Math.sin(Math.PI * Math.min(1, k * 1.6)));
        legs(-20 * arc);
        off(I.head, 0, 0.6 * arc, 0);
        off(I.neck, 0, 0.3 * arc, 0);
        rot(I.tail, -20 * arc);
        rot(I.comb, -15 * arc * calm);
      } else {
        const k = (tt - 14) / 6;
        const q = Math.sin(Math.PI * k);
        setScale(1 + 0.12 * q, 1 - 0.2 * q, 1 + 0.12 * q);
      }
      break;
    }
    case 'full': {
      // おなかいっぱい 20 コマ: おなかを ふくらます 6 → 首を ふる 10 → もどる 4（「ぷうっ」）
      let k = 0;
      if (t < 6) k = smooth(t / 6);
      else if (t < 16) k = 1;
      else if (t < 20) k = 1 - (t - 16) / 4;
      const b = I.body;
      const sx = 1 + 0.22 * k;
      const sy = 1 + 0.06 * k;
      const sz = 1 + 0.2 * k;
      out.sc[b * 3] = sx;
      out.sc[b * 3 + 1] = sy;
      out.sc[b * 3 + 2] = sz;
      // 体の 子（首・羽・しっぽ）は 自分の 大きさを まもる（ふくらむ のは おなか だけ）
      for (const c of [I.neck, I.wingL, I.wingR, I.tail]) {
        if (c < 0) continue;
        out.sc[c * 3] = 1 / sx;
        out.sc[c * 3 + 1] = 1 / sy;
        out.sc[c * 3 + 2] = 1 / sz;
      }
      wing(8 * k);
      if (t >= 6 && t < 16) {
        const env = Math.min(1, (t - 6) / 1.5, (16 - t) / 1.5);
        rot(I.head, 0, 18 * Math.sin((2 * Math.PI * (t - 6)) / 5) * Math.max(0, env), 0);
      }
      break;
    }
    case 'carried': {
      // だっこ: 足を ちぢめる 6 → もちあがる 10 → あとは 目を ほそめて すこし ゆれる
      const k = smooth(t / 6);
      for (const l of [I.legL, I.legR]) rot(l, 45 * k);
      eyes(0.7 * k);
      out.rigY = 0.04 * smooth((t - 6) / 10);
      rot(I.body, 0, 0, 3 * Math.sin((2 * Math.PI * t) / 50) * smooth((t - 10) / 10));
      rot(I.head, 0, 0, 4 * k);
      break;
    }
    case 'sleep': {
      // ねる: すわる 10 → 目を とじる → ゆっくり いきを する（すやすや。うごきの 強さ 0 でも のこす）
      const k = smooth(t / 10);
      setScale(1 + 0.12 * k, 1 - 0.22 * k, 1 + 0.12 * k);
      eyes(0.9 * k);
      wing(6 * k);
      rot(I.head, 6 * k, 0, 5 * k);
      out.scale[1] += 0.015 * k * Math.sin((2 * Math.PI * t) / 90) * K;
      break;
    }
    case 'hatch': {
      // かえる: ピキッ 20（かの なかで ぷるぷる）→ ぽんっ 20（とび出す）→ ぷるぷる 20（から を ぬぐ）。マッチョ は ＋20 で 力こぶ
      const total = macho ? 80 : 60;
      const tt = inp.hatchT !== undefined ? inp.hatchT * total : t;
      if (tt < 20) {
        const k = clamp01(tt / 20);
        setScale(0.55, 0.55 + 0.04 * Math.sin(tt * 0.9), 0.55);
        rot(I.body, 0, 0, 8 * k * Math.sin(tt * 1.3));
        eyes(1);
      } else if (tt < 40) {
        const k = (tt - 20) / 20;
        const pop = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; // 行きすぎて もどる（easeOutBack）
        const s = 0.55 + 0.45 * pop;
        const st = 1 + 0.18 * Math.sin(Math.PI * Math.min(1, k * 1.3));
        setScale(s / Math.sqrt(st), s * st, s / Math.sqrt(st));
        out.rigY = 0.5 * Math.sin(Math.PI * k) * calm;
        wing(50 * Math.sin(Math.PI * k));
        legs(-18 * Math.sin(Math.PI * k));
        eyes(Math.max(0, 1 - k * 4));
      } else if (tt < 60) {
        const u = (tt - 40) / 20;
        rot(I.body, 0, 0, 7 * (1 - u) * Math.sin(u * Math.PI * 6));
        const q = Math.sin(Math.PI * u);
        setScale(1 + 0.05 * q, 1 - 0.07 * q, 1 + 0.05 * q);
        wing(10 * (1 - u));
      } else {
        // マッチョ だけ: 力こぶ の ポーズ（うで を もう 15° 上げて とめる）
        const u = clamp01((tt - 60) / 20);
        const hold = smooth(Math.min(1, u * 2));
        setScale(1 + 0.04 * hold, 1 + 0.02 * hold, 1 + 0.04 * hold);
        wing(15 * hold);
      }
      break;
    }
    case 'grow': {
      // 大人 に なる: ぷるぷる 20 → 光 20 → ばさっ 20。とちゅう（30）で 大人 の 形 に かわる（描く 側）
      const tt = inp.growT !== undefined ? inp.growT * 60 : t;
      if (!adultForm) {
        if (tt < 20) {
          rot(I.body, 0, 0, 6 * (tt / 20) * Math.sin(tt * 1.5));
          wing(6 * (tt / 20));
        } else {
          const u = clamp01((tt - 20) / 10);
          const g = 1 + 0.25 * smooth(u);
          setScale(g, g, g);
          eyes(0.8 * u);
          wing(12 * u);
        }
      } else {
        const u = clamp01((tt - 30) / 30);
        const from = ((inp.growFromScale ?? K) * 1.25) / K;
        const m = from + (1 - from) * smooth(Math.min(1, u * 1.3)) + 0.06 * Math.sin(Math.PI * u);
        setScale(m, m, m);
        if (macho) wing(25 * Math.sin(Math.PI * Math.min(1, u * 1.5)));
        else wing(85 * Math.sin(Math.PI * Math.min(1, u * 1.6))); // ばさっ
        eyes(Math.max(0, 1 - u * 3));
      }
      break;
    }
    case 'thrown': {
      // LIVE-2.1: なげられて いる 子。羽 を ひろげて 目 を まるく（たのしい 顔）、足 は ちぢめる。山なり の あいだ ずっと
      const k = smooth(t / 4);
      wing(34 + 42 * k + 6 * Math.sin((2 * Math.PI * t) / 10) * calm);
      legs(24);
      rot(I.tail, -16);
      rot(I.head, -6, 0, 0);
      if (I.eyes >= 0) out.sc[I.eyes * 3 + 1] = 1.12;
      break;
    }
    case 'putDown': {
      // おろされる 20 コマ: かがむ 8 → はなす 6 → 羽を ふる 6（「そっと」）
      let c = 0;
      if (t < 8) c = smooth(t / 8);
      else if (t < 14) c = 1 - smooth((t - 8) / 6);
      setScale(1 + 0.12 * c, 1 - 0.18 * c, 1 + 0.12 * c);
      eyes(0.6 * c);
      const tuck = 45 * (1 - smooth(t / 14)); // だっこの ちぢめた 足が のびる
      for (const l of [I.legL, I.legR]) rot(l, tuck);
      if (t >= 14 && t < 20) wing(40 * Math.sin((Math.PI * (t - 14)) / 6));
      break;
    }
  }

  // ---- 重ねる もの（どの 状態の 上にも）
  if (inp.fluttering) {
    // パタパタ: 羽を 横に ひろげて 8 ステップ で 1 往復。足は ぶらさがって 小さく ふれる
    const ft = inp.flutterT ?? 0;
    const ph = (2 * Math.PI * ft) / FLUTTER_TICKS;
    wing(62 + 28 * Math.sin(ph));
    legs(16 * Math.sin(ph));
    rot(I.tail, -22);
    rot(I.body, 6);
    off(I.head, 0, 0.4 * Math.sin(ph + 1.5), 0);
  }
  const rollT = inp.rollT;
  if (rollT !== undefined && rollT >= 0 && rollT < 1) {
    // コロン: 前 に 1 回 ころがって 起きる（12 ステップ。いたく ない・笑える）
    const q = Math.sin(Math.PI * rollT);
    rot(I.body, -360 * smooth(rollT));
    legs(32 * q);
    wing(38 * q);
    eyes(0.7 * q);
    out.rigY += 0.05 * q * calm;
  }
  const landT = inp.landT;
  if (landT !== undefined && landT >= 0 && landT < LAND_TICKS) {
    // 着地 ぽよん 6 ステップ: たて に つぶれ 横 に ひろがる（体積 ほぼ そのまま）
    const q = Math.sin((Math.PI * landT) / LAND_TICKS);
    out.scale[0] *= 1 + 0.18 * q;
    out.scale[1] *= 1 - 0.25 * q;
    out.scale[2] *= 1 + 0.18 * q;
  }
  // ひよこ は 小さい ので とぶ・はねる 高さ も 小さく
  out.rigY *= K / CHICKEN_SCALE;
}
