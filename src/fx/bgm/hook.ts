/**
 * テストの窓口 `window.__rikkun.audio`（SOUND.md §8）。「何を鳴らすと決めたか」をゲームに聞く。
 * つなぎ込み（testHook.ts）が createAudioHook を呼んで TestHook に足す。効果音の記録は SoundFx から借りる。
 */
import type { AudioSettings } from '../audioConfig';
import type { AudioMixer, MixerContextState } from '../audioMixer';
import type { BgmChord, BgmPlayer, BgmSong } from './BgmPlayer';
import type { BgmSceneTracker } from './scene';
import type { YakataScene, YakataSceneState } from './yakataScene';

/** やかたの 場面が 鳴って いる 間の 和音〔Dm。D = 2〕。鳴って いなければ null */
export function yakataChordOf(s: Pick<YakataSceneState, 'chord'>): BgmChord | null {
  return s.chord === 'Dm' ? { name: 'Dm', root: 2, minor: true } : null;
}

export interface AudioState {
  context: MixerContextState;
  scene: BgmSong;
  song: BgmSong | null;
  songs: number;
  screenLevel: number;
  ducking: boolean;
  chord: string;
  /** MINE-1F: やかたの 場面〔none・ambience・waiting・challenge〕とループ・たたかいの 曲・BGM を 小さくして いるか */
  yakataScene?: YakataSceneState['scene'];
  yakataLoops?: YakataSceneState['fileLoops'];
  yakataBattleMusic?: boolean;
  yakataBgmDuck?: boolean;
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
  /** MINE-1F: やかたの 場面の 係 */
  yakata?: YakataScene;
  /** SoundFx.drainRecords */
  sfx: () => unknown[];
  /** SoundFx.activeVoices */
  sfxVoices: () => number;
}

const NO_YAKATA: YakataSceneState = { scene: 'none', fileLoops: [], chord: null, battleMusic: true, bgmDuck: false };

export function createAudioHook(d: AudioHookDeps): AudioHook {
  const ys = (): YakataSceneState => d.yakata?.state() ?? NO_YAKATA;
  return {
    state: () => ({
      context: d.mixer.contextState(),
      scene: d.tracker.scene(),
      song: d.bgm.current(),
      songs: d.bgm.songCount(),
      screenLevel: d.mixer.screenLevel(),
      ducking: d.mixer.ducking(),
      chord: (yakataChordOf(ys()) ?? d.bgm.chord()).name,
      ...(d.yakata ? { yakataScene: ys().scene, yakataLoops: ys().fileLoops.map((l) => ({ ...l })), yakataBattleMusic: ys().battleMusic, yakataBgmDuck: ys().bgmDuck } : {}),
      master: d.audio.masterVolume,
      bgm: d.audio.bgmVolume,
      fx: d.fx.fxVolume,
      muted: d.audio.audioMuted,
    }),
    chord: () => yakataChordOf(ys()) ?? d.bgm.chord(),
    sfx: () => d.sfx(),
    voices: () => ({ sfx: d.sfxVoices(), bgm: d.bgm.voices() }),
  };
}
