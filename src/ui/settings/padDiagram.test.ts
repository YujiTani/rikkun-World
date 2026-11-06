import { describe, expect, it } from 'vitest';
import { padSvg } from './padDiagram';

function letter(svg: string, face: string): string | undefined {
  const re = new RegExp(`data-pad-face="${face}"[\\s\\S]*?<text[^>]*>([^<]+)`);
  return svg.match(re)?.[1];
}

describe('ゲームパッドの図', () => {
  const svg = padSvg();

  it('Switch の位置（B 下・A 右・Y 左・X 上）', () => {
    expect(letter(svg, 'faceBottom')).toBe('B');
    expect(letter(svg, 'faceRight')).toBe('A');
    expect(letter(svg, 'faceLeft')).toBe('Y');
    expect(letter(svg, 'faceTop')).toBe('X');
    expect(letter(svg, 'l1')).toBe('L');
    expect(letter(svg, 'r1')).toBe('R');
    expect(letter(svg, 'l2')).toBe('ZL');
    expect(letter(svg, 'r2')).toBe('ZR');
    expect(letter(svg, 'start')).toBe('＋');
    expect(letter(svg, 'select')).toBe('−');
  });

  it('他社の名前やロゴを入れない', () => {
    expect(svg.toLowerCase()).not.toMatch(/nintendo|xbox|sony|任天堂/);
  });
});
