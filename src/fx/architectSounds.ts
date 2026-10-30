import { hz, powan, xylo } from './sfxVoices';
import type { SoundFx, Tone } from './sound';

/**
 * 建築士さんの 声「ぽぽぽ」（HOUSE-1A。docs/design/HOUSE-1.md §3.1。音の 方向 B「木の おもちゃと オルゴール」）。
 * 【仮の 音】開発が 作った 1 案。あとで サウンド係が 3 案を 作り、yuzu が 選ぶ（HOUSE-1.md §3.5）。選ばれたら この 表を 差しかえる。
 * 言葉では ない やわらかい 丸い 音 3 つ。話しかける たびに 鳴るので 小さく 短く（くり返しても うるさく ない）。
 */
export const ARCHITECT_SOUNDS = {
  /** 声「ぽぽぽ」: 丸い 3 つ（ソ・ラ・ソ）。さいごに 木琴の ごく 小さな ひかり */
  architect_voice: [
    powan(hz('G4'), hz('G4') * 1.01, 0, 0.1, 0.2, 0.012),
    powan(hz('A4'), hz('A4') * 1.01, 0.12, 0.1, 0.2, 0.012),
    powan(hz('G4'), hz('G4') * 0.99, 0.24, 0.14, 0.18, 0.012),
    ...xylo(hz('G6'), hz('G6') * 1.01, 0.26, 0.1, 0.05),
  ],
} as const satisfies Record<string, readonly Tone[]>;

export type ArchitectSoundName = keyof typeof ARCHITECT_SOUNDS;

/** 毎回 すこし ちがう 高さ（半音。fun.md 1「高さを 少しずつ 変える」）。決まった 順で まわる（乱数を 使わない） */
const PITCH = [0, 2, -2, 1, -1] as const;
let no = 0;

export function playArchitect(sound: Pick<SoundFx, 'playTones'>, name: ArchitectSoundName): void {
  sound.playTones(ARCHITECT_SOUNDS[name] as readonly Tone[], PITCH[no++ % PITCH.length]);
}
