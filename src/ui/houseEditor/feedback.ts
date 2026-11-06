// HOUSE-1B ボタンを 押した ときの ぴょこん（CSS の .is-boing）と 小さな 木の 音。
// 1 つしか ない ボタン（まどの しゅるい・やね）でも 押した 手ごたえが 出る ように、ボタンぜんぶに 同じ 道具を 使う（仕様 §4 の 音と ぴょこん）。
import { wood } from '../../fx/sfxVoices';
import type { SoundFx, Tone } from '../../fx/sound';
import { PRESS_PITCH, PRESS_SOUND } from './tuning';

export type PressKind = keyof typeof PRESS_SOUND;

const TONES: Readonly<Record<PressKind, readonly Tone[]>> = {
  press: wood(PRESS_SOUND.press.f0, PRESS_SOUND.press.f1, 0, PRESS_SOUND.press.sec, PRESS_SOUND.press.gain),
  take: wood(PRESS_SOUND.take.f0, PRESS_SOUND.take.f1, 0, PRESS_SOUND.take.sec, PRESS_SOUND.take.gain),
  turn: wood(PRESS_SOUND.turn.f0, PRESS_SOUND.turn.f1, 0, PRESS_SOUND.turn.sec, PRESS_SOUND.turn.gain),
};

export class PressFx {
  private n = 0;
  private readonly bound = new WeakSet<HTMLElement>();

  /** sound ＝ ゲームの SoundFx（ない ときは 音なし） */
  constructor(private readonly sound: Pick<SoundFx, 'playTones'> | null) {}

  /** 音だけ（方眼の マスを 押した・右クリックで とった とき） */
  play(kind: PressKind = 'press'): void {
    this.sound?.playTones(TONES[kind], PRESS_PITCH[this.n++ % PRESS_PITCH.length]!);
  }

  /** ボタン b を ぴょこんと させて 音を 出す */
  press(b: HTMLElement, kind: PressKind = 'press'): void {
    if (!this.bound.has(b)) {
      this.bound.add(b);
      // おわったら 外す（ボタンが 隠れて また 出た ときに もう 1 回 ぴょこんと しない ように）
      b.addEventListener('animationend', (e) => {
        if (e.target === b) b.classList.remove('is-boing');
      });
    }
    b.classList.remove('is-boing');
    void b.offsetWidth; // 同じ ボタンを 続けて 押しても 毎回 ぴょこん
    b.classList.add('is-boing');
    this.play(kind);
  }
}
