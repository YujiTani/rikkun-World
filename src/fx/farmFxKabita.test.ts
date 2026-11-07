import { describe, expect, it } from 'vitest';
import type { FarmEvent, ItemId } from '../contracts';
import { FarmFx } from './farmFx';

const eat = (item: string): FarmEvent => ({ type: 'eat', tick: 0, x: 0, y: 0, z: 0, item: item as ItemId, heal: 2 });

describe('MINE-1E: かびた パンを たべた とき だけ 一言と ぶるっ', () => {
  const rig = () => {
    const said: string[] = [];
    let shivers = 0;
    const fx = new FarmFx({ sound: { playTones: () => undefined }, say: (t) => said.push(t), shiver: () => shivers++ });
    return { fx, said, shivers: () => shivers };
  };

  it('かびた パン → ログ「うぇ〜 かびてる…」と ぶるっ 1 回・音は いつもの eat', () => {
    const r = rig();
    r.fx.feed([eat('kabita_pan')]);
    expect(r.said).toEqual(['うぇ〜 かびてる…']);
    expect(r.shivers()).toBe(1);
    expect(r.fx.played).toContain('eat');
  });

  it('ほかの たべものでは 何も 出さない', () => {
    const r = rig();
    r.fx.feed([eat('tomato'), eat('egg'), eat('momo_yaki')]);
    expect(r.said).toEqual([]);
    expect(r.shivers()).toBe(0);
  });

  it('つなぎが なくても こわれない', () => {
    const fx = new FarmFx({ sound: { playTones: () => undefined } });
    expect(() => fx.feed([eat('kabita_pan')])).not.toThrow();
  });
});
