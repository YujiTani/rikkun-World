import type { SoundFx, Tone } from './sound';
import { LEGEND4_SOUNDS } from './legend4Sounds';
import { noise, sine, swish } from './sfxVoices';
import { logSound } from './soundLog';

/**
 * LEGEND-4 大地のハンマーの 音（合成。あとで sound 係が ファイルに かえる。SOUND の 上限: gain 0.5 以下・1 秒 以内・急な 大音量なし）。
 * 名前は `combat.sounds()` に のこる（E2E は hammerSlam を 見る）。
 */
const HAMMER_SOUNDS = {
  /** 重い 風きり（ふりかぶり） */
  hammerSwing: [swish(300, 160, 0, 0.35, 0.14, 1.2)],
  /** ゴォン: 大きな 鉄の 玉が 落ちた 音（`legend4Sounds.ts`。こわれた ブロックの 音は これ 1 つに まとめる） */
  hammerSlam: LEGEND4_SOUNDS.hammerSlam,
  /** 失敗の ゴン（明るい 軽い 音） */
  hammerBonk: [sine(220, 150, 0, 0.14, 0.22, 0.005), noise(0, 0.08, 0.08, { type: 'lowpass', freq: 1500, q: 0.7 }, 0.004)],
  /** 急降下の ヒュゴォー: 重い ものが 空気を さく 風きり（`legend4Sounds.ts`） */
  hammerDive: LEGEND4_SOUNDS.hammerDive,
} as const satisfies Record<string, readonly Tone[]>;

export { HAMMER_SOUNDS };
export type HammerSoundName = keyof typeof HAMMER_SOUNDS;

export function playHammer(sound: Pick<SoundFx, 'playTones'>, name: HammerSoundName): void {
  sound.playTones(HAMMER_SOUNDS[name]);
  logSound(name);
}
