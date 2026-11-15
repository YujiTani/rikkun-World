import { describe, expect, it } from 'vitest';
import examples from './repairFinal.examples.json';
import { scaffoldBoxes, type ScaffoldBox } from './townScaffold';

/** 設計の 例の 箱を この 形に そろえる（brace は [from, to, 太さ, 絵]） */
function norm(b: [string, unknown]): ScaffoldBox {
  if (b[0] === 'brace') {
    const [from, to, thick, tex] = b[1] as [number[], number[], number, string];
    return { kind: 'brace', from: from as [number, number, number], to: to as [number, number, number], thick, tex };
  }
  const a = b[1] as [number, number, number, number, number, number, string];
  return { kind: b[0] as ScaffoldBox['kind'], box: [a[0], a[1], a[2], a[3], a[4], a[5]], tex: a[6] };
}

describe('足場の 箱（設計 JSON の 例と 同じ）', () => {
  for (const [name, ex] of Object.entries(examples) as unknown as [string, { info: { w: number; d: number; h: number; P: number; tiers: number[]; posts: number; boxes: number }; tris_max: number; boxes: [string, unknown][] }][]) {
    it(name, () => {
      const r = scaffoldBoxes(ex.info.w, ex.info.d, ex.info.h);
      expect(r.info.P).toBe(ex.info.P);
      expect(r.info.tiers).toEqual(ex.info.tiers);
      expect(r.info.posts).toBe(ex.info.posts);
      expect(r.boxes.length).toBe(ex.info.boxes);
      expect(r.boxes).toEqual(ex.boxes.map(norm));
    });
  }

  it('1 まとまり 240 こ まで（こえる 大きさでは むすび目を かどの 柱 だけ）', () => {
    const r = scaffoldBoxes(80, 80, 3);
    expect(r.boxes.length).toBeLessThanOrEqual(240);
  });

  it('のぼりは かど 4 つの うち 指定の かどに 1 本', () => {
    const r = scaffoldBoxes(4, 3, 2, { x: 1, z: 0 });
    const poles = r.boxes.filter((b) => b.kind === 'nobori_pole');
    expect(poles).toHaveLength(1);
    expect((poles[0] as { box: number[] }).box[0]).toBe(96 - 1);
  });
});
