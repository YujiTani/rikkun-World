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

/** パッド: つかんでいる 物が あれば それを、なければ えらんでいる マスを すてる */
describe('DropController パッド', () => {
  const mk = (cursorHeld: boolean, pad: number | null | undefined, pressed: string) => {
    const log: string[] = [];
    const c = new DropController({
      actions: { wasPressed: (a: string) => a === pressed } as never,
      dropper: {
        dropCursor: (all: boolean) => (cursorHeld ? (log.push(`cursor:${all}`), true) : false),
        dropTarget: (t: unknown, all: boolean) => void log.push(`slot:${String(t)}:${all}`),
      } as never,
      playEnabled: () => false,
      inventoryOpen: () => true,
      hover: () => 7,
      padFocus: () => pad,
    });
    c.update();
    return log;
  };
  it('つかんでいる 物を すてる（X = 1 こ、R3 = ぜんぶ）', () => {
    expect(mk(true, 3, 'drop')).toEqual(['cursor:false']);
    expect(mk(true, 3, 'dropStack')).toEqual(['cursor:true']);
  });
  it('なにも つかんでいなければ えらんでいる マス。えらびが なければ 何もしない', () => {
    expect(mk(false, 3, 'drop')).toEqual(['slot:3:false']);
    expect(mk(false, null, 'drop')).toEqual([]);
  });
  it('パッドを つかっていない（undefined）ときは マウスの マス', () => {
    expect(mk(false, undefined, 'drop')).toEqual(['slot:7:false']);
  });
});
