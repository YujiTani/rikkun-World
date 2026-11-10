import { describe, expect, it } from 'vitest';
import { fillLeafPuff } from './leafPuff';
import { LOOK_N, LOOK_VOLUME } from './types';

const N = LOOK_N;
const at = (o: Uint8Array, x: number, y: number, z: number): number => o[(y * N + z) * N + x]!;

describe('はっぱの もこもこの 形', () => {
  it('空気に 出た 面が 無ければ ぜんぶ つまる', () => {
    const o = new Uint8Array(LOOK_VOLUME);
    fillLeafPuff(123, 0, o, 7, 'round');
    expect(o.every((v) => v === 7)).toBe(true);
  });

  it('はっぱ・幹に つながる 面の 層は ぜんぶ つまる（まん中。つぎ目に すきまを 作らない）', () => {
    for (const style of ['round', 'pad'] as const) {
      for (let h = 0; h < 40; h++) {
        const o = new Uint8Array(LOOK_VOLUME);
        // 上だけ 空気。下・横は つながる
        fillLeafPuff(h * 7919, 1, o, 3, style);
        for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) expect(at(o, x, 0, z)).toBe(3);
        for (let y = 0; y <= N - 3; y++) for (let z = 0; z < N; z++) expect(at(o, 0, y, z) && at(o, N - 1, y, z)).toBe(3);
      }
    }
  });

  it('空気に 出た 面は まるく へこむ（すみは あく）が、こぶが 面まで とどく', () => {
    let reach = 0;
    for (let h = 0; h < 40; h++) {
      const o = new Uint8Array(LOOK_VOLUME);
      fillLeafPuff(h * 104729, 63, o, 3, 'round');
      expect(at(o, 0, N - 1, 0), '上の すみ').toBe(0);
      expect(at(o, 4, 4, 4), 'まん中').toBe(3);
      let top = 0;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (at(o, x, N - 1, z)) top++;
      if (top > 0) reach++;
    }
    expect(reach).toBeGreaterThan(30);
  });

  it('同じ 数からは 同じ 形', () => {
    const a = new Uint8Array(LOOK_VOLUME);
    const b = new Uint8Array(LOOK_VOLUME);
    fillLeafPuff(42, 21, a, 3, 'pad');
    fillLeafPuff(42, 21, b, 3, 'pad');
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
