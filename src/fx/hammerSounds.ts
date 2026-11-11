import type { SoundFx, Tone } from './sound';
import { noise, sine, swish, tri } from './sfxVoices';
import { logSound } from './soundLog';

/**
 * LEGEND-4 大地のハンマーの 音（合成。あとで sound 係が ファイルに かえる。SOUND の 上限: gain 0.5 以下・1 秒 以内・急な 大音量なし）。
 * 名前は `combat.sounds()` に のこる（E2E は hammerSlam を 見る）。
 */
const HAMMER_SOUNDS = {
  /** 重い 風きり（ふりかぶり） */
  hammerSwing: [swish(300, 160, 0, 0.35, 0.14, 1.2)],
  /** ドゴン: 低い ドン ＋ 土の くずれる 音（こわれた ブロックの 音は これ 1 つに まとめる） */
  hammerSlam: [sine(90, 40, 0, 0.45, 0.42, 0.01), tri(150, 70, 0, 0.2, 0.2, 0.01), noise(0.02, 0.4, 0.22, { type: 'lowpass', freq: 900, freq1: 250, q: 0.8 }, 0.01)],
  /** 失敗の ゴン（明るい 軽い 音） */
  hammerBonk: [sine(220, 150, 0, 0.14, 0.22, 0.005), noise(0, 0.08, 0.08, { type: 'lowpass', freq: 1500, q: 0.7 }, 0.004)],
  /** 急降下の ヒュー（短く） */
  hammerDive: [swish(1400, 500, 0, 0.3, 0.12, 1.3)],
} as const satisfies Record<string, readonly Tone[]>;

export type HammerSoundName = keyof typeof HAMMER_SOUNDS;

export function playHammer(sound: Pick<SoundFx, 'playTones'>, name: HammerSoundName): void {
  sound.playTones(HAMMER_SOUNDS[name]);
  logSound(name);
}
