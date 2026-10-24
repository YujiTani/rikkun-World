import { describe, expect, it } from 'vitest';
import { BANG_POP, BANG_TICKS, FACE_PALETTE, FACE_ROWS, bangScale } from './machoMarks';

/** LIVE-4 の「！」と 顔（docs/design/LIVE-4.md §3.2・§3.3） */
describe('「！」の 大きさ', () => {
  it('20 ステップ だけ 出る: 0〜19 は 見える、20 から 0', () => {
    for (let a = 0; a < BANG_TICKS; a++) expect(bangScale(a)).toBeGreaterThan(0);
    expect(bangScale(BANG_TICKS)).toBe(0);
    expect(bangScale(-1)).toBe(0);
  });
  it('ぽんっ と 出て（6 ステップ）少し 大きく なり、ふつう の 大きさ で のこる。点滅 しない（のこる あいだ 一定）', () => {
    expect(bangScale(0)).toBeLessThan(bangScale(BANG_POP - 1));
    expect(bangScale(BANG_POP)).toBeGreaterThan(1);
    for (let a = BANG_POP + 4; a < BANG_TICKS; a++) expect(bangScale(a)).toBe(1);
  });
});

describe('顔 の ドット', () => {
  it('どの 行 も 同じ はば で、使う 色 が すべて 表 に ある', () => {
    for (const r of FACE_ROWS) {
      expect(r.length).toBe(FACE_ROWS[0]!.length);
      for (const c of r) if (c !== '.') expect(FACE_PALETTE[c], c).toBeTruthy();
    }
  });
});
