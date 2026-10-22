import { describe, expect, it } from 'vitest';
import { createLiveSettings } from '../contracts';
import { createRng } from '../world/gen/random';
import { rollBreed } from './hatch';

describe('AC17 しゅるいの くじ', () => {
  const s = createLiveSettings();
  it('egg: machoChance 0 で 19 回 normal・20 回目 かならず macho・0 に もどる', () => {
    const t = createLiveSettings();
    t.machoChance = 0;
    const rng = createRng(3);
    const st = { machoMiss: 0 };
    const out: string[] = [];
    for (let i = 0; i < 20; i++) out.push(rollBreed('egg', t, st, rng));
    expect(out.slice(0, 19)).toEqual(Array(19).fill('normal'));
    expect(out[19]).toBe('macho');
    expect(st.machoMiss).toBe(0);
  });
  it('egg: machoChance 1 なら いつも macho', () => {
    const t = createLiveSettings();
    t.machoChance = 1;
    const st = { machoMiss: 4 };
    expect(rollBreed('egg', t, st, createRng(1))).toBe('macho');
    expect(st.machoMiss).toBe(0);
  });
  it('kin_tamago（gold）は かならず macho で machoMiss を かえない・乱数を つかわない', () => {
    const t = createLiveSettings();
    t.machoChance = 0;
    const a = createRng(9);
    const b = createRng(9);
    const st = { machoMiss: 5 };
    expect(rollBreed('gold', t, st, a)).toBe('macho');
    expect(rollBreed('kin_tamago', t, st, a)).toBe('macho');
    expect(st.machoMiss).toBe(5);
    expect(a()).toBe(b());
  });
  it("1,000 回 ひいて 'gold' は 出ない・macho は 約 1/13〜1/20", () => {
    const rng = createRng(11);
    const st = { machoMiss: 0 };
    let macho = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const b = rollBreed('egg', s, st, rng);
      seen.add(b);
      if (b === 'macho') macho++;
    }
    expect([...seen].sort()).toEqual(['macho', 'normal']);
    expect(macho).toBeGreaterThan(40);
    expect(macho).toBeLessThan(110);
  });
  it('同じ シードで 同じ', () => {
    const run = (seed: number) => {
      const rng = createRng(seed);
      const st = { machoMiss: 0 };
      return Array.from({ length: 200 }, () => rollBreed('egg', s, st, rng));
    };
    expect(run(2)).toEqual(run(2));
  });
});
