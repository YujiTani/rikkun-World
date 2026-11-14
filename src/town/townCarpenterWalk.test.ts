import { describe, expect, it } from 'vitest';
import { groundNear, walkY, type WalkWorld } from './townCarpenterWalk';

/** 2 次元の ならび（x, y）で 世界を 作る。'#' ＝ かたい・'~' ＝ 水・'.' ＝ 空気。列 z は 1 つ */
function world(rows: string[]): WalkWorld {
  // rows[0] が いちばん 上（y = rows.length − 1）
  const at = (x: number, y: number): string => (y < 0 || y >= rows.length ? '.' : (rows[rows.length - 1 - y]![x] ?? '.'));
  return {
    isLoaded: () => true,
    isSolid: (x, y) => at(x, y) === '#',
    getBlock: (x, y) => (at(x, y) === '~' ? 'water' : at(x, y) === '#' ? 'stone' : 'air'),
  };
}

describe('足場を 立てる 地面（こわれた 高さの 近く。屋根の 上に ならない）', () => {
  it('aroundY の 近くで 足の 下が かたく 上が 空いた いちばん 高い 所。屋根が 上に あっても 近くの 地面を えらぶ', () => {
    const w = world(['###', '...', '...', '###']);
    expect(groundNear(w, 1, 0, 1)).toBe(1);
    expect(groundNear(world(['.', '.', '.', '.']), 0, 0, 1)).toBeNull();
  });
});

describe('街の だいくさんが 歩ける 足もと（屋根の 下・橋の 上も 高さで 見わける）', () => {
  it('いまの 高さの 近くで、足の 下が かたく 体の 2 マスが 空気の いちばん 高い 所', () => {
    //  x: 0 1 2 3
    const w = world(['.#..', '.#..', '###.', '###.']); // 柱は x=1 の 高さ 0〜3、足もと 2 の 床は x=0〜2 の y=0〜1
    expect(walkY(w, 0, 0, 2)).toBe(2); // 床の 上（y=2）
    expect(walkY(w, 3, 0, 2)).toBeNull(); // 地面が ない（落ちすぎ）
  });

  it('屋根の 下を 通る: 屋根が 高さ 3 に あっても 足もと 1 から 歩ける（上に 2 マス 空き）', () => {
    const w = world(['###', '...', '...', '###']); // y=3 屋根、y=0 床
    expect(walkY(w, 1, 0, 1)).toBe(1);
  });

  it('頭が つかえる 所・水の 中・木の みきの 上は 立てない', () => {
    expect(walkY(world(['###', '.#.', '###']), 1, 0, 1)).toBeNull();
    expect(walkY(world(['...', '...', '~~~']), 1, 0, 1)).toBeNull();
  });

  it('1 マス 上までの 段は 上がれる・2 マス おりる 所までは おりられる', () => {
    const stairs = world(['...#', '..##', '####']);
    expect(walkY(stairs, 3, 0, 2)).toBe(3); // 1 段 上がる
    expect(walkY(stairs, 0, 0, 3)).toBe(1); // 2 マス おりる
    expect(walkY(world(['.', '.', '.', '#']), 0, 0, 5)).toBeNull(); // 3 マス 以上 おりる 所は なし
  });
});
