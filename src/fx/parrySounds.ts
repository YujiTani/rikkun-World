import type { SoundFx, Tone } from './sound';
import { bellTone, box, hz, noise, shaka, sine, suzu, swish, wood } from './sfxVoices';
import { logSound } from './soundLog';

/**
 * WEAPON-5 刀のパリィの 音（案 A「木と鈴」。オーナーが選んだ）。コードで 作る やさしい 音。
 * 名前は `combat.sounds()` の 名前と 同じ。高さは ド（C）を 根音として 作る。
 */
export const PARRY_SOUNDS = {
  /** パリィを 始めた「スッ」: 小さい すぶり ＋ 木の 小さい「カ」 */
  parrySwing: [swish(2200, 3800, 0, 0.09, 0.12, 1.2), ...wood(1000, 900, 0.035, 0.03, 0.1)],
  /** 成功「パキィーン！！」: 高い木 ＋ 鈴の 粒 4 つ ＋ C7 の 鐘 ＋ G7 オルゴール */
  parry: [
    ...wood(1500, 1150, 0, 0.035, 0.55),
    noise(0, 0.018, 0.22, { type: 'bandpass', freq: 3500, q: 2 }, 0.002),
    ...bellTone(hz('C7'), hz('C7') * 0.998, 0.012, 1.1, 0.4, 0.12),
    ...box(hz('G7'), hz('G7'), 0.05, 0.6, 0.12),
    ...suzu(0.02, 4, 0.045, 0.16),
  ],
  /** 早すぎ「カツッ」: 木の 2 打 ＋ 小さな オルゴール */
  parryEarly: [...wood(760, 640, 0, 0.045, 0.5), ...wood(1140, 980, 0.035, 0.035, 0.22), ...box(hz('G5'), hz('G5') * 1.02, 0.05, 0.14, 0.14)],
  /** 2 倍が 当たった「ポンッ」: 上がる 音 ＋ 鈴の 粒 2 つ（当たりの 音に 重ねる） */
  staggerBreak: [sine(420, 1100, 0, 0.07, 0.45), shaka(0, 0.035, 0.14, 4500), ...suzu(0.03, 2, 0.035, 0.1)],
} as const satisfies Record<string, readonly Tone[]>;

export type ParrySoundName = keyof typeof PARRY_SOUNDS;

export function isParrySound(name: string): name is ParrySoundName {
  return name in PARRY_SOUNDS;
}

/** 鳴らして、`combat.sounds()` の 名前も 残す */
export function playParry(sound: Pick<SoundFx, 'playTones'>, name: ParrySoundName): void {
  sound.playTones(PARRY_SOUNDS[name] as readonly Tone[]);
  logSound(name);
}
