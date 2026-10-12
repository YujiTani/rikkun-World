import { describe, expect, it } from 'vitest';
import { findNeckRoute, routeLength, type P3 } from './neckRoute';

function worldWith(solid: Array<[number, number, number]>): (x: number, y: number, z: number) => boolean {
  const set = new Set(solid.map((s) => s.join(',')));
  return (x, y, z) => y < 0 || set.has(`${x},${y},${z}`);
}
const wall = (x0: number, x1: number, y0: number, y1: number, z: number): Array<[number, number, number]> => {
  const out: Array<[number, number, number]> = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y, z]);
  return out;
};

describe('ろくろくびの首の道すじ', () => {
  const from: P3 = { x: 5.5, y: 10, z: 3.5 };
  const to: P3 = { x: 5.5, y: 10.3, z: 8.5 };

  it('間に何もなければ まっすぐ（曲がり 0）', () => {
    expect(findNeckRoute(worldWith([]), from, to)).toEqual([]);
  });

  it('射程 8 をこえたら かみつかない', () => {
    expect(findNeckRoute(worldWith([]), from, { x: 5.5, y: 10, z: 12.5 })).toBeNull();
  });

  it('低い壁は、上を回りこむ（曲がり 2 回まで・長さ 8 まで）', () => {
    const solid = worldWith(wall(2, 9, 8, 10, 6));
    const r = findNeckRoute(solid, from, to);
    expect(r).not.toBeNull();
    expect(r!.length).toBeGreaterThanOrEqual(1);
    expect(r!.length).toBeLessThanOrEqual(2);
    expect(routeLength(from, r!, to)).toBeLessThanOrEqual(8 + 1e-6);
    // 曲がり角はぜんぶ空気のマス
    for (const c of r!) expect(solid(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z))).toBe(false);
  });

  it('ふさがっていて回れなければ null（道が無い）', () => {
    const solid = worldWith(wall(-20, 30, 0, 30, 6));
    expect(findNeckRoute(solid, from, to)).toBeNull();
  });

  it('回りこむ道が 8 より長ければ null', () => {
    // 高い壁（上へ回ると長さが 8 をこえる）
    const solid = worldWith(wall(-20, 30, 0, 14, 6));
    expect(findNeckRoute(solid, from, to)).toBeNull();
  });
});
