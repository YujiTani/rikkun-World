// COOP-1 作業 3c（#417。docs/design/COOP-1.md §2.4・§3.4・§9.7）: 2P が 参加して 左右に 分かれる 時の「しゅっ」。
// 参加の たびに 1 つ。やめる・距離・動きを 減らす 設定では 鳴らし方を かえない（距離も 設定も 受けとらない）。
import type { SoundFx } from '../fx/sound';

export function createSplitSound(sound: Pick<SoundFx, 'play'>): { onJoined(): void; onLeft(): void } {
  return {
    onJoined: () => sound.play('duoSplit'),
    // やめるの「ぽん」は 別。ここでは 何も 鳴らさない
    onLeft: () => {},
  };
}
