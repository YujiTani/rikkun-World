import type { SoundFx, Tone } from './sound';
import { box, hz, noise, powan, sine, swish, tri, xylo } from './sfxVoices';
import { logSound } from './soundLog';

/**
 * M3 の音（M3 §3.7）。コードで作る短い音。大きい音・こわい音は使わない。
 * 妖怪の合図の音（ぐぐっ・どしん など）は妖怪の担当。
 */
export const COMBAT_SOUNDS = {
  /** パンチ「ぶんっ」: 低めのシャカの ひゅっ（下がる） */
  punch: [swish(900, 420, 0, 0.09, 0.3)],
  /** 当たった「ぽこっ」: 木のポコ */
  hit: [
    noise(0, 0.045, 0.3, { type: 'bandpass', freq: 2200, q: 1.5 }),
    tri(500, 250, 0, 0.06, 0.15),
    sine(180, 90, 0, 0.08, 0.35),
  ],
  /** からぶり「スカッ」: 軽いシャカ（下がる） */
  miss: [swish(1500, 700, 0, 0.07, 0.18)],
  /** たおした「ポン！」: 木琴 3 音（上がる） */
  defeat: [
    ...xylo(hz('C5'), hz('C5') * 1.03, 0, 0.12, 0.5),
    ...xylo(hz('E5'), hz('E5') * 1.03, 0.07, 0.12, 0.5),
    ...xylo(hz('G5'), hz('G5') * 1.03, 0.14, 0.18, 0.5),
  ],
  /** ようかいだまが入った「ピッ」: オルゴール 1 音 */
  orb: [...box(hz('C6'), hz('C6') * 1.02, 0.05, 0.1, 0.4)],
  /** ダメージ「ぼふっ」: やわらかい低い木（こわくない） */
  hurt: [sine(190, 95, 0, 0.16, 0.7), noise(0, 0.1, 0.12, { type: 'lowpass', freq: 450 })],
  /** やられた「ぽわわん」: オルゴールで下がる 3 音。おわりに 1 つはねる（明るく） */
  faint: [
    ...box(hz('G5'), hz('G5') * 0.98, 0, 0.22, 0.45),
    ...box(hz('E5'), hz('E5') * 0.98, 0.2, 0.22, 0.45),
    ...box(hz('C5'), hz('C5') * 0.98, 0.4, 0.26, 0.42),
    ...box(hz('C6'), hz('C6') * 1.02, 0.62, 0.22, 0.4),
  ],
  /** 復活「ぴろん」: 上がる 2 音 */
  respawn: [...box(hz('G5'), hz('G5') * 1.02, 0, 0.1, 0.45), ...box(hz('D6'), hz('D6') * 1.02, 0.1, 0.18, 0.45)],
  /** 出現「ぽわん」: ゆっくり入る */
  spawn: [powan(240, 480, 0, 0.22, 0.35, 0.07)],
  /** ゆうがたの始め「ゴーン」: オルゴールの低い長い音 ＋ 倍音 ×2.76 */
  bell: [
    sine(hz('G4'), hz('G4') * 0.99, 0, 0.9, 0.35, 0.01),
    sine(hz('G4') * 2.76, hz('G4') * 2.76, 0, 0.6, 0.1, 0.01),
    sine(hz('G4') * 2, hz('G4') * 2, 0, 0.7, 0.08, 0.01),
  ],
  /** あさの始め「チュンチュン」: 高い sine のさえずり */
  birds: [
    sine(2600, 3200, 0, 0.07, 0.2),
    sine(2800, 3400, 0.12, 0.07, 0.2),
    sine(2600, 3200, 0.4, 0.07, 0.2),
    sine(2800, 3400, 0.52, 0.07, 0.2),
  ],
  /** 落とし物の着地「ポン」（ふつう）: オルゴール 1 音 */
  dropCommon: [...box(hz('C5'), hz('C5') * 0.95, 0, 0.12, 0.4)],
  /** すこし めずらしい「ポロン」: 2 音 */
  dropUncommon: [...box(hz('G5'), hz('G5') * 0.99, 0, 0.1, 0.38), ...box(hz('C6'), hz('C6') * 0.99, 0.07, 0.16, 0.34)],
  /** めずらしい「キラリン」: 3 音 */
  dropRare: [
    ...box(hz('D6'), hz('D6') * 1.02, 0, 0.09, 0.3),
    ...box(hz('G6'), hz('G6') * 1.01, 0.07, 0.11, 0.3),
    ...box(hz('C7'), hz('C7') * 1.0, 0.14, 0.22, 0.26),
  ],
  /** とても めずらしい「シャララーン」: のぼる音を 6 つ */
  dropSuperRare: [
    ...box(hz('G5'), hz('G5') * 1.02, 0, 0.12, 0.28),
    ...box(hz('B5'), hz('B5') * 1.02, 0.07, 0.12, 0.28),
    ...box(hz('D6'), hz('D6') * 1.02, 0.14, 0.12, 0.28),
    ...box(hz('G6'), hz('G6') * 1.01, 0.21, 0.14, 0.26),
    ...box(hz('B6'), hz('B6') * 1.01, 0.28, 0.16, 0.24),
    ...box(hz('E7'), hz('E7') * 1.0, 0.35, 0.5, 0.2),
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type CombatSoundName = keyof typeof COMBAT_SOUNDS;

export function playCombat(sound: Pick<SoundFx, 'playTones'>, name: CombatSoundName, semitones = 0): void {
  sound.playTones(COMBAT_SOUNDS[name] as readonly Tone[], semitones);
  logSound(name);
}
