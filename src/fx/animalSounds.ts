import { box, boxRun, hz, mar, noise, powan, shaka, wood, xylo } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

/**
 * LIVE-1（にわとり）の 音（仕様 §3.6。`docs/audio/SOUND.md` 案 B「木のおもちゃと オルゴール」）。
 * コードで作る 短い音。大きい音・こわい音は 使わない。くり返す 音は 小さく。
 */
export const ANIMAL_SOUNDS = {
  /** やせいの 声「コッコッ」: 小さな 木の 2 打（見つける 手がかり。くり返すので 小さく） */
  cluck: [...wood(720, 520, 0, 0.05, 0.2), ...wood(780, 560, 0.09, 0.05, 0.17)],
  /** あげる「コツコツコツ」: 木の ついばみ 3 回（間は 少し ふぞろい） */
  feed: [...wood(300, 200, 0, 0.06, 0.34), ...wood(310, 205, 0.1, 0.06, 0.3), ...wood(290, 195, 0.21, 0.07, 0.34)],
  /** なでる「コッ♪」: オルゴール 1 音 ＋ 小さな 鳴き声 */
  petAnimal: [...box(hz('C6'), hz('C6') * 1.02, 0, 0.18, 0.28), ...wood(700, 520, 0.03, 0.05, 0.2)],
  /** やせいを なでた・合図「おしい」: 明るく はねる（`craftFail` と 同じ 考え） */
  animalHint: [...wood(440, 330, 0, 0.08, 0.3), ...xylo(330, 620, 0.09, 0.13, 0.28), ...xylo(660, 880, 0.1, 0.1, 0.08)],
  /** たまご「ポン」: 木の 玉 */
  egg: [...wood(420, 820, 0, 0.12, 0.5), ...xylo(hz('G6'), hz('G6') * 1.01, 0.08, 0.1, 0.12)],
  /** なかま（2 わ目 から）: オルゴール 3 音 上がる */
  friend: boxRun([hz('C6'), hz('E6'), hz('G6')], 0.1, 0.16, 0.28),
  /** なかま（はじめて）: 短い ファンファーレ（BGM を 一時 もりあげる のは つなぎ込み） */
  friendFirst: [
    ...boxRun([hz('C5'), hz('E5'), hz('G5')], 0.14, 0.14, 0.34),
    ...box(hz('C6'), hz('C6'), 0.42, 0.5, 0.36, true),
    ...mar(hz('C5'), hz('C5'), 0.42, 0.5, 0.28),
    ...mar(hz('G5'), hz('G5'), 0.42, 0.42, 0.18),
  ],
  /** ワープ「ポフ」: やわらかい 1 音 ＋ 小さな 息 */
  warp: [powan(300, 170, 0, 0.1, 0.28, 0.01), noise(0, 0.09, 0.08, { type: 'lowpass', freq: 1800, freq1: 600, q: 0.6 }, 0.01), shaka(0.02, 0.05, 0.05, 4500)],
} as const satisfies Record<string, readonly Tone[]>;

export type AnimalSoundName = keyof typeof ANIMAL_SOUNDS;

export function playAnimal(sound: Pick<SoundFx, 'playTones'>, name: AnimalSoundName): void {
  sound.playTones(ANIMAL_SOUNDS[name] as readonly Tone[]);
}
