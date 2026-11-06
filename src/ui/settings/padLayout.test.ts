import { describe, expect, it } from 'vitest';
import { placeSide, sideHeight, type LayoutParams, type SideGroup } from './padLayout';

type Pt = [number, number];

/** 2 本の線分が 1 点でも共有するか（さわるのもだめ） */
function segHit(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt): number => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const on = (p: Pt, q: Pt, r: Pt): boolean =>
    Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b));
}

/** compact=false は 高さを指定しない（つめる）。true は 400px いっぱいにならべる */
const P = (side: 'left' | 'right', compact = false): LayoutParams => ({
  side, edgeX: side === 'left' ? 200 : 800, rowH: 44, rowGap: 2, stackGap: 8, run: 40, span: compact ? 400 : undefined,
});

function check(groups: SideGroup[], p: LayoutParams): void {
  const placed = placeSide(groups, p);
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i]!;
    expect(a.top).toBeGreaterThanOrEqual(0);
    if (i > 0) expect(a.top).toBeGreaterThanOrEqual(placed[i - 1]!.top + placed[i - 1]!.height + p.stackGap - 0.01);
    expect(a.points.length).toBeLessThanOrEqual(3);
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j]!;
      for (let s = 0; s + 1 < a.points.length; s++) {
        for (let t = 0; t + 1 < b.points.length; t++) {
          expect(segHit(a.points[s]!, a.points[s + 1]!, b.points[t]!, b.points[t + 1]!), `${a.id} × ${b.id}`).toBe(false);
        }
      }
    }
  }
}

describe('札の置き場所と線', () => {
  const right: SideGroup[] = [
    { id: 'zr', boxX: 600, boxY: 60, rows: 2 },
    { id: 'plus', boxX: 520, boxY: 110, rows: 1 },
    { id: 'abxy', boxX: 640, boxY: 150, rows: 4 },
    { id: 'stickR', boxX: 560, boxY: 250, rows: 2 },
  ];
  const left: SideGroup[] = [
    { id: 'zl', boxX: 300, boxY: 60, rows: 2 },
    { id: 'minus', boxX: 330, boxY: 110, rows: 1 },
    { id: 'stickL', boxX: 250, boxY: 170, rows: 1 },
    { id: 'dpad', boxX: 280, boxY: 250, rows: 1 },
  ];

  it('右・左とも、線がたがいに交わらない（つめる・そろえる両方）', () => {
    check(right, P('right', true));
    check(right, P('right'));
    check(left, P('left'));
    check(left, P('left', true));
  });

  it('四角の順と札の順が同じ・札が重ならない', () => {
    const placed = placeSide(right, P('right'));
    expect(placed.map((g) => g.id)).toEqual(['zr', 'plus', 'abxy', 'stickR']);
  });

  it('いろいろな高さでも交わらない', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 200; n++) {
      const groups: SideGroup[] = Array.from({ length: 4 }, (_, i) => ({
        id: `g${i}`, boxX: 300 + rnd() * 80, boxY: i * 70 + rnd() * 40, rows: 1 + Math.floor(rnd() * 4),
      }));
      check(groups, P('left', rnd() < 0.5));
      check(groups, P('right', rnd() < 0.5));
    }
  });

  it('高さをそろえるとき、最初は上のはし・最後は下のはし', () => {
    const placed = placeSide(right, { ...P('right'), span: 500 });
    expect(placed[0]!.top).toBe(0);
    const last = placed[placed.length - 1]!;
    expect(last.top + last.height).toBeCloseTo(500);
  });

  it('札が 0 まいのまとまりは出さない', () => {
    expect(placeSide([{ id: 'a', boxX: 1, boxY: 1, rows: 0 }], P('left'))).toEqual([]);
    expect(sideHeight([2, 0, 1], P('left'))).toBe(2 * 44 + 2 + 44 + 8);
  });
});
