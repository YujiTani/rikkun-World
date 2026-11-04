import { noise, sine } from './sfxVoices';
import type { SoundFx, Tone } from './sound';
import { StepCounter, striding, type GetaPlayer } from '../craft/geta';

/**
 * FOOTSTEPS（#50 ①）: 足音。地面の ブロックで 音を かえる（コードで 作る 音。音ファイル なし）。
 * 1 歩の 数え方は 明珍下駄（`src/craft/geta.ts` の striding・StepCounter）と 同じ。下駄で 走る ときは 下駄の 音 だけ（呼ぶ 側で えらぶ）。
 * 空中・止まって いる・水の 中・あそび 以外は 鳴らさない。ほる音より 小さい（gain 0.03〜0.06）。
 */
export const FOOTSTEP_TUNING = {
  /** 1 歩の ステップ数（60 = 1 秒）。歩く 0.4 秒・走る 0.3 秒 */
  walkTicks: 24,
  runTicks: 18,
} as const;

export type FootKind = 'grass' | 'dirt' | 'stone' | 'sand' | 'wood' | 'snow';

/** ブロック id → 足音の 種類（ない id は stone）。直書きの 比べを しない ための 表 */
const KIND_OF: Partial<Record<string, FootKind>> = {
  grass: 'grass', leaves: 'grass', momiji_leaves: 'grass', matsu_leaves: 'grass',
  dirt: 'dirt', farmland: 'dirt', farmland_wet: 'dirt', nendo: 'dirt', geyser_dirt: 'dirt',
  sand: 'sand', snow: 'snow',
  log: 'wood', tansu: 'wood', toriya_box: 'wood', toriya_nest: 'wood',
};

export const footKindOf = (blockId: string): FootKind => KIND_OF[blockId] ?? 'stone';

const VOICES: Record<FootKind, readonly Tone[]> = {
  grass: [noise(0, 0.07, 0.05, { type: 'bandpass', freq: 3200, q: 0.8 })],
  dirt: [noise(0, 0.06, 0.05, { type: 'lowpass', freq: 900 }), sine(140, 90, 0, 0.05, 0.03)],
  stone: [noise(0, 0.04, 0.04, { type: 'bandpass', freq: 1800, q: 2 }), sine(320, 260, 0, 0.04, 0.03)],
  sand: [noise(0, 0.09, 0.05, { type: 'highpass', freq: 2500, q: 0.6 })],
  wood: [sine(260, 200, 0, 0.06, 0.06), noise(0, 0.03, 0.02, { type: 'bandpass', freq: 1200, q: 1.5 })],
  snow: [noise(0, 0.1, 0.05, { type: 'lowpass', freq: 1600, q: 0.7 })],
};

/** 毎ステップ step(state, 足もと)。鳴らした ときは 種類、鳴らさない ときは null */
export function createFootsteps(sound: Pick<SoundFx, 'playTones'>) {
  const c = new StepCounter();
  return {
    step(p: GetaPlayer, groundId: () => string): FootKind | null {
      if (!c.tick(striding(p), p.running ? FOOTSTEP_TUNING.runTicks : FOOTSTEP_TUNING.walkTicks)) return null;
      const kind = footKindOf(groundId());
      sound.playTones(VOICES[kind]);
      return kind;
    },
  };
}
