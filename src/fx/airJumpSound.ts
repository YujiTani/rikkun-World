import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { sine, swish } from './sfxVoices';
import type { SoundFx, Tone } from './sound';
import { logSound } from './soundLog';

/**
 * 空中ジャンプ「ふわっ」（LEGEND-4 天使の弓 §3.5）: やわらかい 上がる 音 ＋ 羽の シャカ。小さく 短い（0.2 秒・音量 0.3 まで）。音名は `airJump`。
 * 1・2・3 回目は `LEGEND4_TUNING.tenshi.jumpPitch` の 半音ぶん 少し 高く。着地で 1 回目に もどる（のこりが もどる ため 自然に そう なる）。
 * 音の 表（SOUNDS など）には 入れず、ここから 直接 `playTones` する（連打で うるさく しない ため 同じ 音を 重ねない のは ミキサーの 上限に まかせる）。
 */
const AIR_JUMP_TONES: readonly Tone[] = [sine(420, 720, 0, 0.18, 0.3, 0.03), swish(2400, 3600, 0, 0.12, 0.08)];

/** nth = 1・2・3 回目 */
export function playAirJump(sound: Pick<SoundFx, 'playTones'>, nth: number): void {
  const pitch = LEGEND4_TUNING.tenshi.jumpPitch;
  sound.playTones(AIR_JUMP_TONES, pitch[Math.min(pitch.length, Math.max(1, nth)) - 1] ?? 0);
  logSound('airJump');
}
