import { describe, expect, it } from 'vitest';
import { actionHintLines } from './actionHintModel';

describe('やかたの 宝箱の しるし（世界を 毎ステップ 読まない）', () => {
  it('宝箱を ねらって いない ときは yakataChest を 読まない', () => {
    let reads = 0;
    const ctx = {
      held: null,
      heldIsPickaxe: false,
      heldIsBlade: false,
      get yakataChest() {
        reads++;
        return true;
      },
    };
    actionHintLines({ kind: 'till' } as never, null, ctx);
    expect(reads).toBe(0);
    const r = actionHintLines({ kind: 'chest' } as never, null, ctx);
    expect(reads).toBe(1);
    expect(r.right?.badge).toBe(true);
  });
});
