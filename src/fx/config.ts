/**
 * 演出（見た目と音）の数値を 1 か所に。ドパゲー風の「手ごたえ」。
 * 6 歳向けの安全: 画面全体の点滅はしない。ゆれはごく弱く、`fxShake` で切れる。音は小さめ。
 * settings.get/set には `fxShake`（0/1）・`fxVolume` などの名前で出す（つなぎ込み担当）。
 */
export interface FxSettings {
  /** 画面のゆれ 1 = 入、0 = 切 */
  fxShake: number;
  /** 全体の音量 0〜1（0 = 無音） */
  fxVolume: number;
  /** こわれたときにはじける四角の数 */
  particleCount: number;
  /** はじける四角の大きさ（ブロック） */
  particleSize: number;
  /** はじける勢い（ブロック/秒） */
  particleSpeed: number;
  /** はじける四角が消えるまで（秒） */
  particleLife: number;
  /** 画面のゆれの強さ（ラジアン。0.004 ≒ 0.23 度）と長さ（秒） */
  shakeStrength: number;
  shakeSeconds: number;
  /** こわれる直前のふくらみ倍率と長さ（秒） */
  puffScale: number;
  puffSeconds: number;
  /** 置いたときのぽよん（倍率・秒） */
  placeScale: number;
  placeSeconds: number;
  /** ひびの段階が上がったときのブロックのゆれ（ブロック・秒） */
  crackWobble: number;
  crackWobbleSeconds: number;
  /** 同じものを続けて取ったとき、1 回ごとに上がる音の高さ（半音）と上限 */
  comboSemitones: number;
  comboMax: number;
  /** この秒数あくと連続ボーナスが元に戻る */
  comboResetSeconds: number;
  /** 取ったアイテムが飛ぶ・「+1」が出る秒 */
  flySeconds: number;
  /** マスの「ぽよん」（秒・倍率） */
  slotPopSeconds: number;
  slotPopScale: number;
  /** ほっているときの「コツ」の間隔（秒） */
  digSoundInterval: number;
  /** ねらいの枠が赤くなる秒 */
  redSeconds: number;
  /** 「いま押して！」: ふちの光のゆっくりの明滅（秒。1 秒に 3 回未満）とブロックのふるえ（ブロック） */
  readyPulseSeconds: number;
  readyTremble: number;
  /** 合図のアイコン・名前を出す秒 */
  signalSeconds: number;
  nameSeconds: number;
}

export const FX_SETTINGS: FxSettings = {
  fxShake: 1,
  fxVolume: 0.5,
  particleCount: 18,
  particleSize: 0.15,
  particleSpeed: 3.2,
  particleLife: 0.5,
  shakeStrength: 0.004,
  shakeSeconds: 0.1,
  puffScale: 1.18,
  puffSeconds: 0.07,
  placeScale: 1.15,
  placeSeconds: 0.18,
  crackWobble: 0.03,
  crackWobbleSeconds: 0.1,
  comboSemitones: 1,
  comboMax: 12,
  comboResetSeconds: 2.5,
  flySeconds: 0.45,
  slotPopSeconds: 0.25,
  slotPopScale: 1.3,
  digSoundInterval: 0.25,
  redSeconds: 0.5,
  readyPulseSeconds: 0.9,
  readyTremble: 0.012,
  signalSeconds: 1,
  nameSeconds: 1.5,
};

export const OUTLINE_COLOR = 0x000000;
export const OUTLINE_OPACITY = 0.6;
export const OUTLINE_READY = 0xffd54f;
export const OUTLINE_RED = 0xe53935;
