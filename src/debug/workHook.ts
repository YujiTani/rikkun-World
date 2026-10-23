/**
 * #255: 重さを「仕事の数」で見る窓口 `__rikkun.work`（docs/tickets/PERF-255.md）。
 * start したときだけ ワールドの getBlock を包んで数え、stop で 元の関数にもどす。
 * ふだんの遊びの道には 何も足さない。
 */
export interface WorkCount {
  steps: number;
  getBlock: number;
}

export interface WorkHook {
  start(): void;
  read(): WorkCount;
  stop(): void;
}

type GetBlock = (x: number, y: number, z: number) => string;

export function createWorkHook(tick: () => number, target: { getBlock: GetBlock }): WorkHook {
  let original: GetBlock | null = null;
  let wasOwn = false;
  let tick0 = 0;
  let calls = 0;
  const stop = (): void => {
    if (original) {
      // クラスの メソッドだった（自分の持ち物でない）なら、包みを 消すだけで 元にもどる
      if (wasOwn) target.getBlock = original;
      else delete (target as Partial<typeof target>).getBlock;
      original = null;
    }
  };
  return {
    start() {
      stop();
      const orig = target.getBlock;
      original = orig;
      wasOwn = Object.prototype.hasOwnProperty.call(target, 'getBlock');
      tick0 = tick();
      calls = 0;
      target.getBlock = function (this: unknown, x, y, z) {
        calls++;
        return orig.call(target, x, y, z);
      };
    },
    read: () => ({ steps: tick() - tick0, getBlock: calls }),
    stop,
  };
}
