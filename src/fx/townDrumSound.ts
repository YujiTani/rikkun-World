import type { SoundFx, Tone } from './sound';
import { noise, sine } from './sfxVoices';
import { logSound } from './soundLog';

/** TOWN-1 1B-2 §2.15: アスレチックの ゴールの 太鼓「ドン！」（合成。あとで sound 係が かえる。gain 0.5 以下・1 秒 以内） */
const TOWN_DRUM: readonly Tone[] = [sine(150, 70, 0, 0.45, 0.4, 0.004), noise(0, 0.06, 0.12, { type: 'lowpass', freq: 900, q: 0.7 }, 0.003)];

export function playTownDrum(sound: Pick<SoundFx, 'playTones'>): void {
  sound.playTones(TOWN_DRUM);
  logSound('townDrum');
}
