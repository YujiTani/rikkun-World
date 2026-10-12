import { describe, expect, it } from 'vitest';
import { chunkNearDistance, isChunkInRange } from './visibility';

describe('チャンクの距離', () => {
  it('中にいれば 0、横なら 1 方向の差、斜めならピタゴラス', () => {
    expect(chunkNearDistance(2, 2, 40, 40, 16)).toBe(0);
    expect(chunkNearDistance(0, 0, 36, 8, 16)).toBe(20);
    expect(chunkNearDistance(0, 0, 19, 20, 16)).toBe(5);
  });
  it('88 ちょうどは描く、88 より遠いは描かない', () => {
    expect(isChunkInRange(0, 0, 16 + 88, 8, 16)).toBe(true);
    expect(isChunkInRange(0, 0, 16 + 88.01, 8, 16)).toBe(false);
  });
  it('スタート (64,64) からは 8×8 の 64 個ぜんぶ描く', () => {
    let n = 0;
    for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) if (isChunkInRange(cx, cz, 64, 64, 16)) n++;
    expect(n).toBe(64);
  });
  it('世界のかどからは、反対側のかどのチャンクを描かない', () => {
    expect(isChunkInRange(7, 7, 0.5, 0.5, 16)).toBe(false);
    expect(isChunkInRange(0, 0, 0.5, 0.5, 16)).toBe(true);
  });
});
