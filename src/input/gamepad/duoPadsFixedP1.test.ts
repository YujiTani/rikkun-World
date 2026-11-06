import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { AlwaysLook } from './reader';
import { DuoPadRouter } from './duoPads';
import { FakeStorage, fakePad } from './testPad';

/** COOP-1 作業 3b（#415）: AC73（参加中の 1P の パッドは 固定・保存なし）・AC74（待ちの あいだに はなした ＋） */
const START = 9;
const STICK_UP = [0, -1, 0, 0];

function make() {
  const p1 = new ActionState();
  const p2 = new ActionState();
  const router = new DuoPadRouter({
    p1,
    p2,
    look1: new AlwaysLook(),
    look2: new AlwaysLook(),
    storage: null,
    choiceStorage: new FakeStorage(),
  });
  let pads: (Gamepad | null)[] = [];
  router.getPads = () => pads;
  let t = 0;
  const opens1: string[] = [];
  const opens2: string[] = [];
  p1.onPress((a) => a === 'openStartMenu' && opens1.push(a));
  p2.onPress((a) => a === 'openStartMenu' && opens2.push(a));
  return { p1, p2, router, opens1, opens2, set: (...p: (Gamepad | null)[]) => void (pads = p), poll: () => router.poll((t += 16)) };
}

describe('AC73: 保存なしで 2P の パッドが 未定の あいだも、参加中の 1P の パッドは 固定', () => {
  it('番号 0 だけで 参加 → 0 を ぬいて 1 を つなぐ: 1P は 1 に ならず、1 で 2P が 動く。0 を つなぎなおすと 1P が 0 に もどる', () => {
    const m = make();
    m.set(fakePad(0));
    m.poll();
    m.router.setJoined(true);
    m.poll();
    expect(m.router.padIndex(1)).toBe(0);
    expect(m.router.padIndex(2)).toBeNull();

    // 番号 0 を ぬいて 番号 1 を つなぐ。左スティックを 前に 倒す
    m.set(null, fakePad(1, { axes: STICK_UP }));
    m.poll();
    m.poll();
    expect(m.router.padIndex(1)).toBeNull();
    expect(m.p1.isHeld('moveForward')).toBe(false);
    expect(m.router.padIndex(2)).toBe(1);
    expect(m.p2.isHeld('moveForward')).toBe(true);

    // 番号 0 を つなぎなおす: 1P が 0 に もどり、2P は 1 の まま
    m.set(fakePad(0, { axes: STICK_UP }), fakePad(1));
    m.poll();
    m.poll();
    expect(m.router.padIndex(1)).toBe(0);
    expect(m.p1.isHeld('moveForward')).toBe(true);
    expect(m.router.padIndex(2)).toBe(1);
  });
});

describe('AC74: 待ちの あいだに はなした ＋', () => {
  it('1P: 押したまま 待ちに 入り、待ちの あいだに はなすと ＋ は 押されていない。待ちの あと 1 回 押すと 開く', () => {
    const m = make();
    m.set(fakePad(0, { buttons: [START] }));
    m.poll();
    expect(m.p1.isHeld('openStartMenu')).toBe(true);
    expect(m.opens1.length).toBe(1);
    m.p1.endFrame();

    m.router.setPicking(0);
    m.set(fakePad(0));
    m.poll();
    expect(m.p1.isHeld('openStartMenu')).toBe(false);

    m.router.setPicking(null);
    m.poll();
    m.set(fakePad(0, { buttons: [START] }));
    m.poll();
    expect(m.opens1.length).toBe(2);
    expect(m.p1.wasPressed('openStartMenu')).toBe(true);
  });

  it('1P: 待ちの あいだに 押した ＋ は、待ちが おわってから はなしても 何も 開かない', () => {
    const m = make();
    m.set(fakePad(0));
    m.poll();
    m.router.setPicking(0);
    m.set(fakePad(0, { buttons: [START] }));
    m.poll();
    m.router.setPicking(null);
    m.poll();
    m.set(fakePad(0));
    m.poll();
    expect(m.opens1.length).toBe(0);
    expect(m.p1.isHeld('openStartMenu')).toBe(false);
  });

  it('2P（参加中）: 押したまま 待ちに 入り、待ちの あいだに はなすと、つぎの 1 回で 2P の スタートが 開く', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setJoined(true);
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    m.poll();
    m.poll();
    // 参加の ＋ は はなすまで 操作に ならない。いったん はなして 押す
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    m.poll();
    expect(m.p2.isHeld('openStartMenu')).toBe(true);
    const before = m.opens2.length;
    m.p2.endFrame();

    m.router.setPicking(1);
    m.set(fakePad(0), fakePad(1));
    m.poll();
    expect(m.p2.isHeld('openStartMenu')).toBe(false);
    m.router.setPicking(null);
    m.poll();
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    m.poll();
    expect(m.opens2.length).toBe(before + 1);
  });
});
