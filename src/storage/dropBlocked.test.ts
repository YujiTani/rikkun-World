import { describe, expect, it } from 'vitest';
import { DropController } from './ItemDropper';

/** WEAPON-9: シャイニング中は Q（すてる）も 出せない */
describe('DropController blocked', () => {
  const mk = (blocked: boolean) => {
    let n = 0;
    const c = new DropController({
      actions: { wasPressed: (a: string) => a === 'drop' } as never,
      dropper: { dropHeld: () => void n++, dropTarget: () => void n++ } as never,
      playEnabled: () => true,
      inventoryOpen: () => false,
      hover: () => null,
      blocked: () => blocked,
    });
    return { c, count: () => n };
  };
  it('blocked の 間は すてない・そうでなければ すてる', () => {
    const a = mk(true);
    a.c.update();
    expect(a.count()).toBe(0);
    const b = mk(false);
    b.c.update();
    expect(b.count()).toBe(1);
  });
});
