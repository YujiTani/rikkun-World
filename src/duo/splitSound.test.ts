import { describe, expect, it } from 'vitest';
import { createSplitSound } from './splitSound';

/**
 * COOP-1 作業 3c（#417）の 先行テスト（赤）。AC69 のうち「いつ 鳴らすか」（仕様 1.8 の §2.4・§3.4・§9.7）。音そのものの 表は src/fx/duoSplitSound.test.ts。
 * 1.8 では 2P が いる あいだ ずっと 左右に 分かれる ので、分割への 切りかえは 2P が 参加した 時だけ。画面の ようす（DuoViewMachine・switched・view）には 頼らない
 * （3e で DuoViewMachine が かわっても この テストは かわらない）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/splitSound.ts   createSplitSound(sound: Pick<SoundFx, 'play'>): { onJoined(): void; onLeft(): void }
 *     - onJoined()  … 2P の 参加が 成功して 左右に 分かれた ステップに 1 回 呼ぶ。`sound.play('duoSplit')` を ちょうど 1 回。
 *     - onLeft()    … 2P が やめた（長押し・ぬけて 60 秒・タイトルへ もどる など）ときに 呼んで よい。何も 鳴らさない（やめるの「ぽん」は 別）。
 *     - 距離・画面の ようす・動きを 減らす 設定を 受けとらない（距離では 鳴らない。動きを 減らす 設定でも 同じに 鳴る）。待ちの 数え（1 秒など）も 持たない。
 *   `SoundName` に 'duoSplit' が 入る（SOUNDS に 表を 足す。表は duoSplitSound.test.ts）。
 *   配線（テストの 外）: wire/duo.ts の join() で `session.join()` が true の とき だけ onJoined()、session の onLeft の 中で onLeft()。
 *     参加できなかった（すでに 参加中・2 人まで）ときは 呼ばない。
 *
 * 画面ごとの 動きの 見せ方（0.4 秒の 線・ふくらみ）は このテストの 対象外（UI 検査）。
 */

function rig() {
  const names: string[] = [];
  const s = createSplitSound({ play: (name: string) => void names.push(name) });
  return { s, names };
}

describe('AC69: 参加して 左右に 分かれる 時だけ 1 つ', () => {
  it('onJoined() で duoSplit が 1 つ（呼ぶ 前は 鳴らない）', () => {
    const { s, names } = rig();
    expect(names).toEqual([]);
    s.onJoined();
    expect(names).toEqual(['duoSplit']);
  });

  it('やめる（onLeft）では 鳴らさない', () => {
    const { s, names } = rig();
    s.onJoined();
    s.onLeft();
    s.onLeft();
    expect(names).toEqual(['duoSplit']);
  });

  it('やめる → もう 一度 参加 → もう 1 つ（参加の たびに 1 つ）', () => {
    const { s, names } = rig();
    s.onJoined();
    s.onLeft();
    s.onJoined();
    s.onLeft();
    expect(names).toEqual(['duoSplit', 'duoSplit']);
  });

  it('onLeft だけでは 何も 鳴らない', () => {
    const { s, names } = rig();
    s.onLeft();
    expect(names).toEqual([]);
  });

  it('距離・動きを 減らす 設定を 受けとらない（引数は 音の 口だけ = 距離では 鳴らず、動きを 減らす 設定でも 同じに 鳴る）', () => {
    expect(createSplitSound.length).toBe(1);
  });
});
