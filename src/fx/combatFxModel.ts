/** 戦いの演出の数値と、DOM・three.js なしで確かめられる計算（M3 §3.3・§3.5） */
export const COMBAT_FX = {
  /** ダメージのふちのピンク #FF7A9A: いちばん濃いとき 0.25、0.4 秒で消える */
  edgeColor: '#FF7A9A',
  edgeMaxOpacity: 0.25,
  edgeSeconds: 0.4,
  /** ダメージのときの画面のゆれ（秒）。強さは FX_SETTINGS.shakeStrength の半分 */
  hurtShakeSeconds: 0.1,
  /** むてき中の人形: 16 ステップ（約 0.27 秒）ごとにうすい ⇔ ふつう（1 秒に 2 回弱。3 回未満のゆっくりした点滅。人形だけ） */
  invincibleBlinkTicks: 16,
  invincibleThinAlpha: 0.25,
  /** やられて横にたおれるまで（秒） */
  fallSeconds: 0.3,
  /** おとしもの ぶくろ */
  bag: {
    bodyColor: 0x8b5a2b,
    ropeColor: 0xf2c14e,
    glowColor: 0xffe14d,
    bodySize: 0.5,
    ropeSize: [0.3, 0.1, 0.3],
    glowSize: 0.7,
    /** 落ちたアイテムの板の大きさ・かさねる間かく・かさねる数の上限 */
    iconSize: 0.45,
    stackGap: 0.06,
    stackMax: 3,
    /** 光の柱をまとめる（水平の）はば */
    clusterRadius: 6,
    glowOpacity: 0.35,
    pillarSize: [0.12, 10, 0.12],
    pillarOpacity: 0.3,
    /** 地面からの高さ（ふくろの中心） */
    lift: 0.35,
    bobAmount: 0.1,
    bobSeconds: 2,
    spinSeconds: 4,
    /** のこりがこのステップ以下になると光がゆっくり強弱する（30 秒）・周期（秒） */
    blinkTicks: 1800,
    blinkSeconds: 1,
  },
} as const;

/** ふちのピンクの濃さ（t 秒目）。ふわっと色づいて消える（1 回だけ） */
export function edgeOpacity(t: number): number {
  const C = COMBAT_FX;
  if (t < 0 || t >= C.edgeSeconds) return 0;
  return C.edgeMaxOpacity * Math.sin((Math.PI * t) / C.edgeSeconds);
}

/** むてき中の人形の不透明度（のこりステップから） */
export function invincibleAlpha(invincibleTicks: number): number {
  const C = COMBAT_FX;
  if (invincibleTicks <= 0) return 1;
  // むてきの はじまり（のこり最大）はうすい所から始まる
  return Math.floor((invincibleTicks - 1) / C.invincibleBlinkTicks) % 2 === 1 ? C.invincibleThinAlpha : 1;
}

export interface BagPose {
  /** ふくろの中心の高さ（足もとから） */
  y: number;
  /** 回転（ラジアン） */
  spin: number;
  /** 光の強さの倍率 0〜1 */
  glow: number;
}

/** ふくろの動き。time = 秒、ticksLeft = 消えるまでのステップ */
export function bagPose(time: number, ticksLeft: number): BagPose {
  const B = COMBAT_FX.bag;
  const blink =
    ticksLeft <= B.blinkTicks ? 0.65 + 0.35 * Math.sin((2 * Math.PI * time) / B.blinkSeconds) : 1;
  return {
    y: B.lift + B.bobAmount * Math.sin((2 * Math.PI * time) / B.bobSeconds),
    spin: (2 * Math.PI * time) / B.spinSeconds,
    glow: blink,
  };
}
