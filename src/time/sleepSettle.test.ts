import { describe, expect, it } from 'vitest';
import { ActionState } from '../input/actions';
import { createWaitWake } from '../duo/p2Gadgets';
import { createTimeSettings } from './config';
import { SleepSystem } from './sleep';
import { TimeOfDayImpl } from './TimeOfDay';

/** COOP-1 5e（レビューの 直し）: settle()＝ 2P が やめた ステップに すぐ ねむり。もちもの画面の 間は 待ちを 起こさない */
const S = createTimeSettings();
const NIGHT = S.dayTicks + S.duskTicks + 500;

function rig(ready = 2) {
  const time = new TimeOfDayImpl();
  time.set(NIGHT);
  const state = { ready };
  const starts: number[] = [];
  const sleep = new SleepSystem(time, { ready: () => state.ready, onStart: () => void starts.push(1) });
  return { time, sleep, state, starts };
}

describe('settle', () => {
  it('まち中に ready が 1 に なったら settle で すぐ ねむり（update を またない）。音は 1 回', () => {
    const r = rig();
    r.sleep.use(1);
    r.state.ready = 1;
    r.sleep.settle();
    expect(r.sleep.sleeping()).toBe(true);
    expect(r.sleep.waiting()).toBeNull();
    expect(r.starts).toHaveLength(1);
    r.sleep.settle(); // ねむり中は 何も しない
    expect(r.starts).toHaveLength(1);
  });
  it('待って いなければ 何も しない／ready が 2 の ままなら まち', () => {
    const r = rig();
    r.sleep.settle();
    expect(r.sleep.sleeping()).toBe(false);
    r.sleep.use(2);
    r.sleep.settle();
    expect(r.sleep.waiting()).toBe(2);
  });
});

describe('createWaitWake の paused（もちもの画面）', () => {
  it('開いて いる 間は 歩く 入力でも 起きない。とじて はなして 押しなおせば 起きる', () => {
    const r = rig();
    const actions = new ActionState();
    let open = false;
    const wake = createWaitWake({ who: 1, sleep: r.sleep, actions, combat: { flinching: () => false }, paused: () => open });
    const tick = (): void => {
      wake.step();
      actions.endFrame();
    };
    r.sleep.use(1);
    tick();
    open = true;
    actions.press('moveForward');
    tick();
    tick();
    expect(r.sleep.waiting()).toBe(1);
    open = false;
    tick(); // 押しっぱなしの まま とじた
    expect(r.sleep.waiting()).toBe(1);
    actions.release('moveForward');
    tick();
    actions.press('moveForward');
    tick();
    expect(r.sleep.waiting()).toBeNull();
  });
});
