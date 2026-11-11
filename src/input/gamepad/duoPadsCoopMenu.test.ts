import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { AlwaysLook } from './reader';
import { DuoPadRouter } from './duoPads';
import { FakeStorage, fakePad } from './testPad';

/** COOP-1 作業 5c レビュー: 2P の とりごやメニューが 開いている 間、2P の A は 決定（confirm）で、ジャンプに ならない */

const A = 0;

function make() {
  const p1 = new ActionState();
  const p2 = new ActionState();
  const router = new DuoPadRouter({ p1, p2, look1: new AlwaysLook(), look2: new AlwaysLook(), storage: null, choiceStorage: new FakeStorage({}) });
  let pads: (Gamepad | null)[] = [];
  router.getPads = () => pads;
  let t = 0;
  const poll = () => router.poll((t += 16), true);
  const set = (...p: (Gamepad | null)[]) => {
    pads = p;
  };
  return { p1, p2, router, set, poll };
}

describe('2P の メニュー中の A', () => {
  it('メニューが 開いている 間は A が confirm（jump に ならない）。閉じると jump に もどる', () => {
    const { p2, router, set, poll } = make();
    set(fakePad(0), fakePad(1));
    poll();
    router.setJoined(true);
    poll();

    router.setMenuOpen2(true);
    set(fakePad(0), fakePad(1, { buttons: [A] }));
    poll();
    expect(p2.isHeld('confirm')).toBe(true);
    expect(p2.isHeld('jump')).toBe(false);

    set(fakePad(0), fakePad(1));
    poll();
    router.setMenuOpen2(false);
    set(fakePad(0), fakePad(1, { buttons: [A] }));
    poll();
    expect(p2.isHeld('jump')).toBe(true);
    expect(p2.isHeld('confirm')).toBe(false);
  });
});
