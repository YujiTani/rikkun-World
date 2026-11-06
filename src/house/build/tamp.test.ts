import { describe, expect, it } from 'vitest';
import { makeFakeWorld } from '../fakeWorld';
import { Dozuki } from './tamp';

/** AC17（ユニット 2）: どうづき。20 ステップ・3×3・石と 段差は そのまま・かためた つちは 小さい 音だけ */
function rig() {
  const w = makeFakeWorld({ height: () => 10 });
  return { w, d: new Dozuki(w) };
}
const around = (w: ReturnType<typeof makeFakeWorld>, x: number, y: number, z: number): string[] => {
  const out: string[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) out.push(w.getBlock(x + dx, y, z + dz) as string);
  return out;
};

describe('どうづき', () => {
  it('平らな 草地: 3×3 の 9 こが かためた つち。まわりは そのまま', () => {
    const { w, d } = rig();
    expect(d.tap(5, 10, 5, 100)).toEqual({ kind: 'tamp', changed: 9 });
    expect(around(w, 5, 10, 5)).toEqual(Array(9).fill('katame_tsuchi'));
    expect(w.getBlock(7, 10, 5)).toBe('grass');
  });
  it('20 ステップの 間かく: 19 では 何も おきず、20 で 効く', () => {
    const { w, d } = rig();
    expect(d.tap(5, 10, 5, 100).kind).toBe('tamp');
    w.set(20, 10, 20, 'dirt');
    expect(d.tap(20, 10, 20, 119)).toEqual({ kind: 'cooling' });
    expect(w.getBlock(20, 10, 20)).toBe('dirt');
    expect(d.tap(20, 10, 20, 120).kind).toBe('tamp');
    expect(w.getBlock(20, 10, 20)).toBe('katame_tsuchi');
  });
  it('石・段差（上が 空気でない）・水は かわらない。消える 草花は どけて かためる', () => {
    const { w, d } = rig();
    w.set(6, 10, 4, 'stone');
    w.set(4, 11, 6, 'dirt'); // 1 高い 列: 下の 10 も 上が 空気でない
    w.set(5, 11, 5, 'kusa'); // 草
    expect(d.tap(5, 10, 5, 0)).toEqual({ kind: 'tamp', changed: 7 });
    expect(w.getBlock(6, 10, 4)).toBe('stone');
    expect(w.getBlock(4, 10, 6)).toBe('grass');
    expect(w.getBlock(5, 11, 5)).toBe('air');
    expect(w.getBlock(5, 10, 5)).toBe('katame_tsuchi');
  });
  it('すな・ゆき・つち も かためる', () => {
    const { w, d } = rig();
    w.set(5, 10, 5, 'sand');
    w.set(6, 10, 5, 'snow');
    w.set(4, 10, 5, 'dirt');
    d.tap(5, 10, 5, 0);
    expect(['sand', 'snow', 'dirt'].map((_, i) => w.getBlock(5 + [0, 1, -1][i]!, 10, 5))).toEqual(['katame_tsuchi', 'katame_tsuchi', 'katame_tsuchi']);
  });
  it('かためた つちを たたく: 小さい 音（soft）だけで 何も かわらない（間かくは 始まる）', () => {
    const { w, d } = rig();
    d.tap(5, 10, 5, 0);
    expect(d.tap(5, 10, 5, 20)).toEqual({ kind: 'soft' });
    expect(around(w, 5, 10, 5)).toEqual(Array(9).fill('katame_tsuchi'));
    expect(d.tap(5, 10, 5, 30)).toEqual({ kind: 'cooling' });
  });
  it('消える 草花は くさ・のばな・はな 3 しゅ・すすき（HOUSE-1 §4.7）。はっぱなどは 消えず その列は そのまま', () => {
    const { w, d } = rig();
    const flora = ['kusa', 'nobana', 'flower_y', 'flower_o', 'flower_p', 'susuki'] as const;
    flora.forEach((id, i) => w.set(4 + (i % 3), 11, 4 + Math.floor(i / 3), id));
    w.set(6, 11, 6, 'leaves'); // 消える 草花では ない
    expect(d.tap(5, 10, 5, 0)).toEqual({ kind: 'tamp', changed: 8 });
    for (let i = 0; i < flora.length; i++) expect(w.getBlock(4 + (i % 3), 11, 4 + Math.floor(i / 3)), flora[i]).toBe('air');
    expect(w.getBlock(6, 10, 6)).toBe('grass');
  });
});
