import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from '../blocks/blockTypes';
import { MAX_BLOCK_KINDS } from '../blocks/maxBlockKinds';
import { EMIT, OPAQ, TRIV, spreadLight } from './lightSpread';
import { UNKNOWN_BLOCK } from './WorldLight';

// BLOCK-ID16 AC4（表の 部分）。番号 256 以上で 表の 外を 読まない。

describe('BLOCK-ID16 AC4: 光の 表は 1024 まで ある', () => {
  it('OPAQ / EMIT / TRIV の 長さは MAX_BLOCK_KINDS（MAX_BLOCK_KINDS）以上', () => {
    expect(OPAQ.length).toBeGreaterThanOrEqual(MAX_BLOCK_KINDS);
    expect(EMIT.length).toBeGreaterThanOrEqual(MAX_BLOCK_KINDS);
    expect(TRIV.length).toBeGreaterThanOrEqual(MAX_BLOCK_KINDS);
  });

  it('登録のない 番号（256 以上・255）は 光を通さない（OPAQ 15）・光らない・TRIV 0', () => {
    for (const b of [BLOCK_TYPES.length, BLOCK_TYPES.length + 1, 500, 600, MAX_BLOCK_KINDS - 1, UNKNOWN_BLOCK]) {
      expect(OPAQ[b], `OPAQ[${b}]`).toBe(15);
      expect(EMIT[b], `EMIT[${b}]`).toBe(0);
      expect(TRIV[b], `TRIV[${b}]`).toBe(0);
    }
  });

  it('spreadLight: 番号 300 の 壁（Uint16Array）には 光が 広がらない。空気（0）には 広がる', () => {
    // 横一列 5 マス: [光 15][空気][300][空気][空気]
    const blk = Uint16Array.of(0, 0, 300, 0, 0);
    const arr = Uint8Array.of(15, 0, 0, 0, 0);
    const q = [0];
    spreadLight(arr, q, blk, 5, 1, 1);
    expect(arr[1]).toBe(14);
    expect(arr[2], '番号 300 は 不透明').toBe(0);
    expect(arr[3], '壁の むこう').toBe(0);
    expect(arr[4]).toBe(0);
  });

  it('spreadLight: 番号 255 の 壁も 光を 通さない（表の 外あつかい でも 同じ）', () => {
    const blk = Uint16Array.of(0, BLOCK_TYPES.length + 1, 0);
    const arr = Uint8Array.of(15, 0, 0);
    spreadLight(arr, [0], blk, 3, 1, 1);
    expect(arr[1]).toBe(0);
    expect(arr[2]).toBe(0);
  });
});

describe('BLOCK-ID16 AC4: UNKNOWN_BLOCK（読みこんでいない マス）', () => {
  it('UNKNOWN_BLOCK は 番号と ぶつからない（>= MAX_BLOCK_KINDS）', () => {
    expect(UNKNOWN_BLOCK).toBe(0xffff);
    expect(UNKNOWN_BLOCK).toBeGreaterThanOrEqual(MAX_BLOCK_KINDS);
  });

  it('OPAQ[UNKNOWN_BLOCK] === 15（表は 0x10000 まで あって、Uint16 の どの値でも 表の 中を 読む）', () => {
    expect(OPAQ.length).toBe(0x10000);
    expect(OPAQ[UNKNOWN_BLOCK]).toBe(15);
    expect(EMIT[UNKNOWN_BLOCK]).toBe(0);
    expect(TRIV[UNKNOWN_BLOCK]).toBe(0);
  });

  it('spreadLight は UNKNOWN_BLOCK の マスに 光を 広げない', () => {
    const blk = Uint16Array.of(0, UNKNOWN_BLOCK, 0);
    const arr = Uint8Array.of(15, 0, 0);
    spreadLight(arr, [0], blk, 3, 1, 1);
    expect(arr[1]).toBe(0);
    expect(arr[2]).toBe(0);
  });
});
