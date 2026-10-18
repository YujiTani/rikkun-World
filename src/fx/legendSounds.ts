import type { SoundFx, Tone } from './sound';
import { box, hz, noise, shaka, sine, suzu, swish, tri } from './sfxVoices';
import { logSound } from './soundLog';

/**
 * WEAPON-7 §3.5・§2.6 の 音（レジェンダリー武器）。コードで 作る。こわすぎない・急な 大音量に しない（どれも gain 0.6 以下・1.2 秒以内）。
 * 名前は `combat.sounds()` の 名前と 同じ（`lightningFar` は 『lightning』 として きろくする）。
 */
export const LEGEND_SOUNDS = {
  /** ため いっぱい「ピキーン」: 高い 2 音 ＋ 鈴の つぶ（小さく 明るく） */
  chargeReady: [...box(hz('G6'), hz('G6') * 1.01, 0, 0.09, 0.3), ...box(hz('D7'), hz('D7') * 1.01, 0.07, 0.2, 0.28), ...suzu(0.1, 3, 0.04, 0.1)],
  /** 雷「ビシッ… ゴロゴロ ドーン」: 高い ひび割れ ＋ 低い うなり（だんだん 小さく）＋ 低い ドン。うなりは ゆっくり 入る */
  lightning: [
    noise(0, 0.06, 0.22, { type: 'highpass', freq: 3200, q: 0.7 }, 0.003),
    swish(3600, 700, 0, 0.14, 0.2, 1.2),
    noise(0.1, 0.7, 0.3, { type: 'lowpass', freq: 420, freq1: 140, q: 0.8 }, 0.06),
    sine(70, 38, 0.1, 0.55, 0.45, 0.02),
    tri(120, 60, 0.12, 0.3, 0.14, 0.02),
  ],
  /** 空が 見えない ときの 遠くの 雷（小さく・低く） */
  lightningFar: [noise(0.05, 0.6, 0.12, { type: 'lowpass', freq: 300, freq1: 120, q: 0.8 }, 0.1), sine(60, 36, 0.08, 0.5, 0.2, 0.05)],
  /** ふつうの わざに 重ねる「ビシューン」: 上がる シャカ ＋ 小さな ひび割れ（小さく 短く） */
  thunderSlash: [swish(1400, 5200, 0, 0.12, 0.16, 1.5), shaka(0.02, 0.04, 0.1, 6000)],
  /** ヌシが レジェンダリーを おとした「キラキラ…」: 上がる 6 つの オルゴール（花火と ファンファーレに 重なるので 大きく しない） */
  legendDrop: [
    ...box(hz('C6'), hz('C6') * 1.01, 0, 0.12, 0.22),
    ...box(hz('E6'), hz('E6') * 1.01, 0.07, 0.12, 0.22),
    ...box(hz('G6'), hz('G6') * 1.01, 0.14, 0.12, 0.22),
    ...box(hz('C7'), hz('C7') * 1.01, 0.21, 0.14, 0.22),
    ...box(hz('E7'), hz('E7') * 1.0, 0.28, 0.16, 0.2),
    ...box(hz('G7'), hz('G7') * 1.0, 0.35, 0.5, 0.18),
    ...suzu(0.3, 4, 0.05, 0.12),
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type LegendSoundName = keyof typeof LEGEND_SOUNDS;

export function playLegend(sound: Pick<SoundFx, 'playTones'>, name: LegendSoundName): void {
  sound.playTones(LEGEND_SOUNDS[name] as readonly Tone[]);
  logSound(name === 'lightningFar' ? 'lightning' : name);
}
