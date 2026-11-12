import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from './blockTypes';
import { canCrushBlock } from './crushable';

describe('canCrushBlock', () => {
  it('こわせない 物（breakable: false。とうろう など）は 消せない', () => {
    const fixed = BLOCK_TYPES.filter((b) => !b.breakable).map((b) => b.id);
    expect(fixed).toContain('touro');
    for (const id of fixed) expect(canCrushBlock(id), id).toBe(false);
  });
  it('ふつうの ブロックは 消せる・空気は 消せない', () => {
    expect(canCrushBlock('stone')).toBe(true);
    expect(canCrushBlock('air')).toBe(false);
  });
});
