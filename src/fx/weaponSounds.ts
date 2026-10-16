import type { SoundFx, Tone } from './sound';
import { box, hz, mar, noise, powan, swish, wood, xylo } from './sfxVoices';
import { logSound } from './soundLog';

/**
 * WEAPON-2 §3.4 の 音。コードで 作る みじかい やさしい 音（こわい音・大きい音は なし）。
 * 名前は `combat.sounds()` の 名前（AC23）と 同じ。
 */
export const WEAPON_SOUNDS = {
  /** かまえ「チャキッ」: 木の 2 打 */
  stance: [...wood(500, 420, 0, 0.05, 0.3), ...wood(760, 640, 0.06, 0.05, 0.25)],
  /** 突き「シュッ」: シャカ（上がる） */
  thrust: [swish(1800, 2800, 0, 0.07, 0.22)],
  /** 大げさ斬り「ブォン」: 低いシャカ（下がる）＋ ぽわん */
  kesa: [swish(700, 200, 0, 0.35, 0.4, 0.8), powan(260, 110, 0.05, 0.3, 0.25, 0.03)],
  /** 大げさ斬りの 当たり「ズバーン」: 木のポコ ＋ 木琴 1 音 */
  kesaHit: [
    noise(0, 0.045, 0.25, { type: 'bandpass', freq: 2200, q: 1.5 }),
    ...wood(300, 120, 0, 0.22, 0.55),
    ...xylo(hz('C6'), hz('D6'), 0.06, 0.28, 0.3),
  ],
  /** 切り上げ「シュバッ」（下から 上がる） */
  kiriage: [swish(700, 2400, 0, 0.12, 0.28)],
  /** たいきゅう のこり わずか「ピピッ」: オルゴール 2 音 */
  wearLow: [...box(hz('G6'), hz('G6'), 0, 0.07, 0.35), ...box(hz('C7'), hz('C7'), 0.1, 0.1, 0.35)],
  /** こわれた「パキ ポロロン」: 木の「パキ」＋ オルゴールで下がる 3 音（最後ははねて明るく） */
  toolBreak: [
    ...wood(1400, 700, 0, 0.07, 0.35),
    ...box(hz('G5'), hz('G5'), 0.1, 0.12, 0.3),
    ...box(hz('E5'), hz('E5'), 0.22, 0.12, 0.3),
    ...box(hz('C5'), hz('C5'), 0.34, 0.14, 0.3),
    ...box(hz('C6'), hz('C6') * 1.02, 0.5, 0.2, 0.28),
  ],
  /** ゆみを ひく「キリッ」: 段 1・2・3 で ド・ミ・ソ（鳴らすとき 和音の根音・3 度・5 度に動く。段 3 は 少し 長め） */
  drawStage1: mar(hz('C5'), hz('C5') * 1.03, 0, 0.09, 0.4),
  drawStage2: mar(hz('E5'), hz('E5') * 1.03, 0, 0.09, 0.4),
  drawStage3: mar(hz('G5'), hz('G5') * 1.03, 0, 0.16, 0.45),
  /** 段 0 で はなした「ぽよん」 */
  dry: [powan(300, 520, 0, 0.14, 0.4, 0.03)],
  /** とばす「ビュン」（段が 高いほど 大きく） */
  shoot1: [swish(2000, 700, 0, 0.1, 0.2)],
  shoot2: [swish(2200, 700, 0, 0.12, 0.3)],
  shoot3: [swish(2400, 650, 0, 0.14, 0.4)],
  /** や が 妖怪に「コツ」（このあと 「ポコーン」= `hit`） */
  arrowHit: wood(320, 180, 0, 0.06, 0.4),
  /** や が ブロックに ささった「トン」 */
  arrowStick: wood(210, 150, 0, 0.07, 0.45),
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
