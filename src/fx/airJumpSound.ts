import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { LEGEND4_SOUNDS } from './legend4Sounds';
import type { SoundFx, Tone } from './sound';
import { logSound } from './soundLog';

/**
 * 空中ジャンプ・羽ばたき「パァ」（LEGEND-4 天使の弓。オーナー 2026-11-12）: 光が 広がる 高い 音 ＋ 羽の シャカ（`legend4Sounds.ts`）。小さく 短い。音名は `airJump`。
 * 1・2・3 回目は `LEGEND4_TUNING.tenshi.jumpPitch` の 半音ぶん 少し 高く。着地で 1 回目に もどる（のこりが もどる ため 自然に そう なる）。
 * `LEGEND4_SOUNDS` の 表に 入って いる（名前つき）ので、同じ 音が 重なる 数の 上限（3 まで）が きく。
 */
const AIR_JUMP_TONES: readonly Tone[] = LEGEND4_SOUNDS.airJump;

/** nth = 1・2・3 回目 */
export function playAirJump(sound: Pick<SoundFx, 'playTones'>, nth: number): void {
  const pitch = LEGEND4_TUNING.tenshi.jumpPitch;
  sound.playTones(AIR_JUMP_TONES, pitch[Math.min(pitch.length, Math.max(1, nth)) - 1] ?? 0);
  logSound('airJump');
}
