import { describe, expect, it } from 'vitest';
import { placeSide, placeTop, type LayoutParams, type SideGroup } from './padLayout';

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

const P = (side: 'left' | 'right'): LayoutParams => ({
  side, edgeX: side === 'left' ? 200 : 800, rowH: 44, rowGap: 2, stackGap: 8, run: 40,
});

function check(groups: SideGroup[], p: LayoutParams): void {
  const placed = placeSide(groups, p);
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i]!;
    expect(a.top).toBeGreaterThanOrEqual(0);
    expect(a.points.length).toBeLessThanOrEqual(3);
    if (i > 0) expect(a.top).toBeGreaterThanOrEqual(placed[i - 1]!.top + placed[i - 1]!.height + p.stackGap - 0.01);
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

describe('札のかたまりの置き場所と線', () => {
  const right: SideGroup[] = [
    { id: 'zr', boxX: 600, boxY: 60, rows: 2 },
    { id: 'abxy', boxX: 640, boxY: 190, rows: 4 },
    { id: 'stickR', boxX: 560, boxY: 300, rows: 2 },
  ];
  const left: SideGroup[] = [
    { id: 'zl', boxX: 300, boxY: 60, rows: 2 },
    { id: 'dpad', boxX: 280, boxY: 200, rows: 1 },
    { id: 'stickL', boxX: 250, boxY: 300, rows: 1 },
  ];

  it('右・左とも、線がたがいに交わらない', () => {
    check(right, P('right'));
    check(left, P('left'));
  });

  it('じゃまがなければ、四角の高さにそのまま置く（線はまっすぐ）', () => {
    const [d] = placeSide([{ id: 'd', boxX: 280, boxY: 200, rows: 1 }], P('left'));
    expect(d!.top + d!.height / 2).toBe(200);
    expect(d!.points).toHaveLength(2);
  });

  it('四角の順と札の順が同じ・重ならない', () => {
    expect(placeSide(right, P('right')).map((g) => g.id)).toEqual(['zr', 'abxy', 'stickR']);
  });

  it('いろいろな高さでも交わらない・重ならない', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let n = 0; n < 300; n++) {
      const groups: SideGroup[] = Array.from({ length: 4 }, (_, i) => ({
        id: `g${i}`, boxX: 300 + rnd() * 80, boxY: i * 70 + rnd() * 40, rows: 1 + Math.floor(rnd() * 4),
      }));
      check(groups, P('left'));
      check(groups, P('right'));
    }
  });

  it('札が 0 まいのまとまりは出さない', () => {
    expect(placeSide([{ id: 'a', boxX: 1, boxY: 1, rows: 0 }], P('left'))).toEqual([]);
  });

  it('上の札: 左は中央線の左・右は右。線は札のはばの中のまっすぐな 1 本', () => {
    const p = { centerX: 500, width: 190, gap: 6, bottomY: 44, rowH: 44 };
    const placed = placeTop([
      { id: 'minus', boxX: 470, boxY: 90, half: 'topLeft' },
      { id: 'plus', boxX: 530, boxY: 90, half: 'topRight' },
    ], p);
    expect(placed[0]!.left + placed[0]!.width).toBe(494);
    expect(placed[1]!.left).toBe(506);
    for (const t of placed) {
      expect(t.points[0]![0]).toBe(t.points[1]![0]);
      expect(t.points[0]![0]).toBeGreaterThanOrEqual(t.left);
      expect(t.points[0]![0]).toBeLessThanOrEqual(t.left + t.width);
    }
  });
});
