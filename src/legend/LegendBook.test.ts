import { describe, expect, it } from 'vitest';
import { LegendBook } from './LegendBook';

/** WEAPON-7 AC7: 手に 入れた ことの ある レジェンダリー（`legendGot`） */
describe('LegendBook', () => {
  const isLegend = (i: string) => i === 'raijin_ken' || i === 'crystal_katana';
  it('レジェンダリーを 手に 入れると 入る（同じ物 2 本目でも 1 つ）。そうでない物は 入らない', () => {
    const b = new LegendBook(isLegend);
    expect(b.got()).toEqual([]);
    expect(b.add('katana')).toBeNull();
    expect(b.add('raijin_ken')).toEqual({ first: true, kinds: 1 });
    expect(b.add('raijin_ken')).toEqual({ first: false, kinds: 1 });
    expect(b.add('crystal_katana')).toEqual({ first: true, kinds: 2 });
    expect(b.got()).toEqual(['raijin_ken', 'crystal_katana']);
  });
  it('保存・読みこみで 同じ。前の 保存（ない・こわれた）→ 空', () => {
    const b = new LegendBook(isLegend);
    b.add('raijin_ken');
    const c = new LegendBook(isLegend);
    c.deserialize(JSON.parse(JSON.stringify(b.serialize())));
    expect(c.got()).toEqual(['raijin_ken']);
    for (const bad of [undefined, null, 5, 'x', {}, { got: 3 }, { got: [1, null] }]) {
      const d = new LegendBook(isLegend);
      d.add('raijin_ken');
      d.deserialize(bad);
      expect(d.got(), String(bad)).toEqual([]);
    }
  });
  it('こわれても 消えない（remove は ない）・got() は コピー', () => {
    const b = new LegendBook(isLegend);
    b.add('raijin_ken');
    b.got().push('crystal_katana');
    expect(b.got()).toEqual(['raijin_ken']);
  });
});
