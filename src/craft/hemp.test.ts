import { describe, expect, it } from 'vitest';
import { CRAFT_RECIPES, HEMP_PER_STRING, groupRecipes, hempCount } from './recipes';
import { HEMP_DROP } from '../dig/config';
import { hash01 } from '../world/gen/random';

/** ROPE-1 AC16〜AC18（docs/design/ROPE-1.md）: あさの 足した 作り方（いと × 2.5、切り上げ） */
describe('あさの 足した 作り方', () => {
  it('切り上げ: 1→3・2→5・3→8', () => {
    expect(HEMP_PER_STRING).toBe(2.5);
    expect([1, 2, 3].map(hempCount)).toEqual([3, 5, 8]);
  });
  it('ゆみ・むしとりあみ・ロープ だけに ある（ほかの いとの 作り方には ない）', () => {
    const alts = CRAFT_RECIPES.filter((r) => r.inputs.some((i) => i.item === 'hemp'));
    expect(alts.map((r) => [r.id, r.output, r.inputs])).toEqual([
      ['yumi_hemp', { item: 'yumi', count: 1 }, [{ item: 'log', count: 3 }, { item: 'hemp', count: 8 }]],
      ['mushi_ami_hemp', { item: 'mushi_ami', count: 1 }, [{ item: 'log', count: 1 }, { item: 'hemp', count: 5 }]],
      ['rope_hemp', { item: 'rope', count: 4 }, [{ item: 'hemp', count: 8 }]],
    ]);
  });
  it('もとの カードに まとまる（カードは ふえない）', () => {
    const g = groupRecipes(CRAFT_RECIPES);
    expect(g.get('yumi')).toEqual(['yumi', 'yumi_hemp']);
    expect(g.get('mushi_ami')).toEqual(['mushi_ami', 'mushi_ami_hemp']);
    expect(g.get('rope')).toEqual(['rope', 'rope_hemp']);
  });
  it('あさの くじは だいたい 1/3（1 万 マスで 30〜37%）', () => {
    let n = 0;
    for (let i = 0; i < 10000; i++) if (hash01(HEMP_DROP.seed, i % 100, 10, Math.floor(i / 100), i * 7) < HEMP_DROP.chance) n++;
    expect(n / 10000).toBeGreaterThan(0.3);
    expect(n / 10000).toBeLessThan(0.37);
  });
});
