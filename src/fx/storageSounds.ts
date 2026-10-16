import { noise, swish, wood } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

/** M6 の音（すてる「ポイッ」・たんす の ひきだし）。コードで作る短い音（案 B） */
export const STORAGE_SOUNDS = {
  /** すてる「ポイッ」: シャカ ＋ 木 */
  throw: [swish(1400, 500, 0, 0.1, 0.25), ...wood(300, 200, 0.02, 0.06, 0.2)],
  /** ひきだしを あける: 木がすべる音（ノイズ）＋ 木の「コト」 */
  drawerOpen: [noise(0, 0.1, 0.18, { type: 'lowpass', freq: 500, freq1: 900, q: 0.7 }, 0.02), ...wood(520, 640, 0.08, 0.07, 0.25)],
  /** ひきだしを しめる */
  drawerClose: [noise(0, 0.09, 0.18, { type: 'lowpass', freq: 900, freq1: 400, q: 0.7 }, 0.02), ...wood(260, 150, 0.07, 0.08, 0.4)],
} as const satisfies Record<string, readonly Tone[]>;

export type StorageSoundName = keyof typeof STORAGE_SOUNDS;

export function playStorage(sound: Pick<SoundFx, 'playTones'>, name: StorageSoundName): void {
  sound.playTones(STORAGE_SOUNDS[name] as readonly Tone[]);
}
