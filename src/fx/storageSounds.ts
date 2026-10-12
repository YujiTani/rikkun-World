import type { SoundFx, Tone } from './sound';

/** M6 の音（すてる「ポイッ」・たんす の ひきだし）。コードで作る短い音 */
export const STORAGE_SOUNDS = {
  throw: [{ type: 'sine', f0: 700, f1: 380, delay: 0, dur: 0.1, gain: 0.35 }],
  drawerOpen: [
    { type: 'triangle', f0: 180, f1: 260, delay: 0, dur: 0.1, gain: 0.4 },
    { type: 'sine', f0: 520, f1: 640, delay: 0.08, dur: 0.07, gain: 0.2 },
  ],
  drawerClose: [
    { type: 'triangle', f0: 260, f1: 150, delay: 0, dur: 0.09, gain: 0.4 },
    { type: 'triangle', f0: 140, f1: 100, delay: 0.08, dur: 0.06, gain: 0.3 },
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type StorageSoundName = keyof typeof STORAGE_SOUNDS;

export function playStorage(sound: Pick<SoundFx, 'playTones'>, name: StorageSoundName): void {
  sound.playTones(STORAGE_SOUNDS[name] as readonly Tone[]);
}
