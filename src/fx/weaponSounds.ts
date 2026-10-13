import type { SoundFx, Tone } from './sound';
import { logSound } from './soundLog';

/**
 * WEAPON-2 §3.4 の 音。コードで 作る みじかい やさしい 音（こわい音・大きい音は なし）。
 * 名前は `combat.sounds()` の 名前（AC23）と 同じ。
 */
const T = (type: Tone['type'], f0: number, f1: number, delay: number, dur: number, gain: number): Tone => ({ type, f0, f1, delay, dur, gain });

export const WEAPON_SOUNDS = {
  /** かまえ「チャキッ」 */
  stance: [T('square', 2400, 2000, 0, 0.04, 0.16), T('triangle', 3200, 2800, 0.05, 0.06, 0.2)],
  /** 突き「シュッ」 */
  thrust: [T('triangle', 1800, 2600, 0, 0.07, 0.22)],
  /** 大げさ斬り「ブォン」 */
  kesa: [T('triangle', 500, 160, 0, 0.35, 0.4), T('sine', 260, 110, 0.05, 0.3, 0.3)],
  /** 大げさ斬りの 当たり「ズバーン」 */
  kesaHit: [T('sine', 300, 120, 0, 0.22, 0.6), T('triangle', 900, 1400, 0.04, 0.3, 0.3), T('sine', 1760, 1760, 0.1, 0.3, 0.15)],
  /** 切り上げ「シュバッ」（下から 上がる） */
  kiriage: [T('triangle', 700, 2200, 0, 0.12, 0.28)],
  /** たいきゅう のこり わずか「ピピッ」 */
  wearLow: [T('sine', 1568, 1568, 0, 0.07, 0.35), T('sine', 1976, 1976, 0.1, 0.09, 0.35)],
  /** こわれた「パキーン ポロロン」 */
  toolBreak: [
    T('square', 2200, 900, 0, 0.08, 0.2),
    T('sine', 1568, 1500, 0.02, 0.1, 0.3),
    T('sine', 784, 780, 0.18, 0.12, 0.3),
    T('sine', 659, 655, 0.3, 0.12, 0.3),
    T('sine', 523, 520, 0.42, 0.2, 0.3),
  ],
  /** ゆみを ひく「キリッ」: 段 1・2・3 で ド・ミ・ソ（段 3 は 少し 長め） */
  drawStage1: [T('triangle', 523, 540, 0, 0.09, 0.4)],
  drawStage2: [T('triangle', 659, 680, 0, 0.09, 0.4)],
  drawStage3: [T('triangle', 784, 810, 0, 0.16, 0.45)],
  /** 段 0 で はなした「ぽよん」 */
  dry: [T('sine', 300, 520, 0, 0.14, 0.4)],
  /** とばす「ビュン」（段が 高いほど 大きく） */
  shoot1: [T('triangle', 900, 400, 0, 0.1, 0.2)],
  shoot2: [T('triangle', 1000, 400, 0, 0.12, 0.3)],
  shoot3: [T('triangle', 1100, 380, 0, 0.14, 0.4)],
  /** や が 妖怪に「トスッ」（このあと 「ポコーン」= `hit`） */
  arrowHit: [T('triangle', 260, 140, 0, 0.06, 0.4)],
  /** や が ブロックに ささった「トン」 */
  arrowStick: [T('sine', 220, 150, 0, 0.07, 0.45)],
} as const satisfies Record<string, readonly Tone[]>;

export type WeaponSoundName = keyof typeof WEAPON_SOUNDS;

/** `combat.sounds()` に のせる 名前（`shoot1`〜`shoot3` は `shoot`、`kesaHit` と `arrowHit` は `hit` も） */
export function weaponSoundLogNames(name: WeaponSoundName): string[] {
  if (name === 'shoot1' || name === 'shoot2' || name === 'shoot3') return ['shoot'];
  if (name === 'kesaHit' || name === 'arrowHit') return [name, 'hit'];
  return [name];
}

export function playWeapon(sound: Pick<SoundFx, 'playTones'>, name: WeaponSoundName): void {
  sound.playTones(WEAPON_SOUNDS[name] as readonly Tone[]);
  logSound(...weaponSoundLogNames(name));
}
