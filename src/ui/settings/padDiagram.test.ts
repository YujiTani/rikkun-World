import { describe, expect, it } from 'vitest';
import { padSvg } from './padDiagram';
import { PAD_GROUPS } from './padGroups';

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

  it('まとまりごとに四角があり、四角どうしが重ならない', () => {
    for (const g of PAD_GROUPS) expect(svg).toContain(`data-pad-box="${g.id}"`);
    for (const a of PAD_GROUPS) {
      for (const b of PAD_GROUPS) {
        if (a.id >= b.id) continue;
        const apart =
          a.box.x + a.box.w <= b.box.x || b.box.x + b.box.w <= a.box.x ||
          a.box.y + a.box.h <= b.box.y || b.box.y + b.box.h <= a.box.y;
        expect(apart, `${a.id} と ${b.id}`).toBe(true);
      }
    }
  });

  it('他社の名前やロゴを入れない', () => {
    expect(svg.toLowerCase()).not.toMatch(/nintendo|xbox|sony|任天堂/);
  });
});
