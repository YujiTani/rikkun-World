import { describe, expect, it } from 'vitest';
import { ALL_RECIPES } from '../craft/recipes';
import { INVENTORY_SIZE, ITEM_TYPES, itemType } from '../inventory/items';
import { sampleStacks } from './sample';

describe('COOP-1 4a: duo.sample の 見本の もちもの', () => {
  const stacks = sampleStacks(ITEM_TYPES, ALL_RECIPES, INVENTORY_SIZE);

  it('もちもの 9×3 と ホットバー 9（36 マス）が ぜんぶ うまる。数は その 物の マスの 上限', () => {
    expect(stacks).toHaveLength(INVENTORY_SIZE);
    for (const s of stacks) expect(s.count).toBe(itemType(s.item)!.maxStack);
    expect(stacks.some((s) => s.count === 64)).toBe(true); // 2 けたの いちばん 長い 数
  });
  it('同じ 物は 1 マス ずつ（決まった 順）。同じ 版なら いつも 同じ 中身', () => {
    expect(new Set(stacks.map((s) => s.item)).size).toBe(stacks.length);
    expect(sampleStacks(ITEM_TYPES, ALL_RECIPES, INVENTORY_SIZE)).toEqual(stacks);
  });
  it('名前の いちばん 長い 物が 入る（ホットバーの 先頭）', () => {
    const longest = Math.max(...ITEM_TYPES.filter((t) => t.maxStack > 0).map((t) => t.name.length));
    expect(itemType(stacks[0]!.item)!.name.length).toBe(longest);
  });
  it('材料が 4 しゅるいの レシピの 材料が ぜんぶ 入る', () => {
    const r = ALL_RECIPES.find((x) => new Set(x.inputs.map((s) => s.item)).size >= 4);
    expect(r, '登録表に 材料が 4 しゅるいの レシピが ある').toBeDefined();
    const have = new Set(stacks.map((s) => s.item));
    for (const inp of r!.inputs) expect(have.has(inp.item)).toBe(true);
  });
  it('小さい もちものでも あふれない', () => {
    expect(sampleStacks(ITEM_TYPES, ALL_RECIPES, 9)).toHaveLength(9);
  });
});
