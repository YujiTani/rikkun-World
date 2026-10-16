/**
 * テストの窓口 `window.__rikkun.audio`（SOUND.md §8）。「何を鳴らすと決めたか」をゲームに聞く。
 * つなぎ込み（testHook.ts）が createAudioHook を呼んで TestHook に足す。効果音の記録は SoundFx から借りる。
 */
import type { AudioSettings } from '../audioConfig';
import type { AudioMixer, MixerContextState } from '../audioMixer';
import type { BgmChord, BgmPlayer, BgmSong } from './BgmPlayer';
import type { BgmSceneTracker } from './scene';

export interface AudioState {
  context: MixerContextState;
  scene: BgmSong;
  song: BgmSong | null;
  songs: number;
  screenLevel: number;
  ducking: boolean;
  chord: string;
  master: number;
  bgm: number;
  fx: number;
  muted: boolean;
}

export interface AudioHook {
  state(): AudioState;
  chord(): BgmChord;
  /** 鳴らした効果音の記録（読むと空） */
  sfx(): unknown[];
  voices(): { sfx: number; bgm: number };
}

export interface AudioHookDeps {
  mixer: AudioMixer;
  bgm: BgmPlayer;
  tracker: BgmSceneTracker;
  audio: AudioSettings;
  fx: { fxVolume: number };
  /** SoundFx.drainRecords */
  sfx: () => unknown[];
  /** SoundFx.activeVoices */
  sfxVoices: () => number;
}

export function createAudioHook(d: AudioHookDeps): AudioHook {
  return {
    state: () => ({
      context: d.mixer.contextState(),
      scene: d.tracker.scene(),
      song: d.bgm.current(),
      songs: d.bgm.songCount(),
      screenLevel: d.mixer.screenLevel(),
      ducking: d.mixer.ducking(),
      chord: d.bgm.chord().name,
      master: d.audio.masterVolume,
      bgm: d.audio.bgmVolume,
      fx: d.fx.fxVolume,
      muted: d.audio.audioMuted,
    }),
    chord: () => d.bgm.chord(),
    sfx: () => d.sfx(),
    voices: () => ({ sfx: d.sfxVoices(), bgm: d.bgm.voices() }),
  };
}
