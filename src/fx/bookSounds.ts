import { box, hz, powan, shaka, sine, swish, wood } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

/**
 * BOOK-1 §3.3: 本の 音（コードで 作る 短い音。やわらかく、くり返しても うるさくない）。
 * 名前は `bookSounds` の 記録と 同じ。blip の 高さは `playBook` で 毎回 すこし ずらす。
 * 試聴の 結果で オーナーが 直す（AC21）。
 */
export const BOOK_SOUNDS = {
  /** ひらく: 木の ふたが ひらく「ぎぃ」＋ オルゴール 2 音 */
  open: [
    swish(260, 700, 0, 0.32, 0.16, 0.6),
    powan(180, 240, 0, 0.3, 0.12, 0.08),
    ...box(hz('G5'), hz('G5'), 0.3, 0.2, 0.2),
    ...box(hz('C6'), hz('C6'), 0.4, 0.3, 0.2),
  ],
  /** めくる: 紙の「さっ」＋ ちいさな 木の ぽん */
  turn: [swish(2600, 1200, 0, 0.1, 0.16, 0.8), shaka(0.02, 0.05, 0.05, 3500), ...wood(520, 440, 0.06, 0.05, 0.1)],
  /** はし: やわらかく はずむ「ぽよん」 */
  bump: [sine(300, 180, 0, 0.1, 0.28), sine(260, 400, 0.1, 0.12, 0.22)],
  /** とじる: 「ぱたん」＋ 下がる オルゴール */
  close: [...wood(200, 120, 0.12, 0.08, 0.35), swish(900, 250, 0, 0.14, 0.14, 0.6), ...box(hz('C6'), hz('C6'), 0.16, 0.14, 0.14), ...box(hz('G5'), hz('G5'), 0.24, 0.22, 0.14)],
} as const satisfies Record<string, readonly Tone[]>;

export type BookSoundName = keyof typeof BOOK_SOUNDS;

/** 毎回 すこし ちがう 高さ（半音。fun.md 1）。決まった 順で まわる（乱数を 使わない） */
const TURN_PITCH = [0, 2, -2, 1, -1] as const;
let turnNo = 0;

export function playBook(sound: Pick<SoundFx, 'playTones'>, name: BookSoundName): void {
  const semis = name === 'turn' ? TURN_PITCH[turnNo++ % TURN_PITCH.length] : name === 'bump' ? [0, 1][turnNo++ % 2] : 0;
  sound.playTones(BOOK_SOUNDS[name] as readonly Tone[], semis);
}
