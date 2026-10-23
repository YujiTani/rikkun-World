import { describe, expect, it } from 'vitest';
import { createWorkHook } from './workHook';

const make = () => {
  let tick = 5;
  const target = { getBlock: (_x: number, _y: number, _z: number) => 'air' as string };
  const orig = target.getBlock;
  const hook = createWorkHook(() => tick, target);
  return { hook, target, orig, advance: (n: number) => (tick += n) };
};

describe('work 窓口（#255）', () => {
  it('start のあと getBlock を 3 回 呼ぶと read が 3', () => {
    const { hook, target } = make();
    hook.start();
    for (let i = 0; i < 3; i++) target.getBlock(i, 0, 0);
    expect(hook.read().getBlock).toBe(3);
    hook.stop();
  });

  it('steps は start からの tick の ふえ', () => {
    const { hook, advance } = make();
    hook.start();
    advance(7);
    expect(hook.read().steps).toBe(7);
    hook.stop();
  });

  it('start し直すと 0 にもどる', () => {
    const { hook, target, advance } = make();
    hook.start();
    target.getBlock(0, 0, 0);
    advance(2);
    hook.start();
    expect(hook.read()).toEqual({ steps: 0, getBlock: 0 });
    target.getBlock(0, 0, 0);
    expect(hook.read().getBlock).toBe(1);
    hook.stop();
  });

  it('stop のあとは 数えず、元の関数に もどる', () => {
    const { hook, target, orig } = make();
    expect(target.getBlock).toBe(orig);
    hook.start();
    expect(target.getBlock).not.toBe(orig);
    target.getBlock(0, 0, 0);
    hook.stop();
    expect(target.getBlock).toBe(orig);
    target.getBlock(0, 0, 0);
    expect(hook.read().getBlock).toBe(1);
  });

  it('start を 2 回 しても 包みが 重ならず、stop で 元にもどる', () => {
    const { hook, target, orig } = make();
    hook.start();
    hook.start();
    target.getBlock(0, 0, 0);
    expect(hook.read().getBlock).toBe(1);
    hook.stop();
    expect(target.getBlock).toBe(orig);
  });

  it('呼んだ結果は そのまま 返す', () => {
    const { hook, target } = make();
    hook.start();
    expect(target.getBlock(1, 2, 3)).toBe('air');
    hook.stop();
  });
});

describe('work 窓口: クラスの メソッド', () => {
  it('stop のあと 自分の持ち物が 残らない', () => {
    class W {
      getBlock(_x: number, _y: number, _z: number): string {
        return 'air';
      }
    }
    const w = new W();
    const hook = createWorkHook(() => 0, w);
    hook.start();
    w.getBlock(0, 0, 0);
    hook.stop();
    expect(Object.prototype.hasOwnProperty.call(w, 'getBlock')).toBe(false);
  });
});
