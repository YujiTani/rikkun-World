import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { AlwaysLook } from './reader';
import { DuoPadRouter } from './duoPads';
import { PAD_CHOICE_KEY } from './padChoice';
import { FakeStorage, fakePad } from './testPad';

/** #401 コードレビューの 直し（1・2・4）。 */
const START = 9;
const STICK_UP = [0, -1, 0, 0];

function make(init: Record<string, string> = {}) {
  const p1 = new ActionState();
  const p2 = new ActionState();
  const storage = new FakeStorage(init);
  const router = new DuoPadRouter({ p1, p2, look1: new AlwaysLook(), look2: new AlwaysLook(), storage: null, choiceStorage: storage });
  let pads: (Gamepad | null)[] = [];
  router.getPads = () => pads;
  let t = 0;
  return { p1, p2, router, set: (...p: (Gamepad | null)[]) => void (pads = p), poll: () => router.poll((t += 16)) };
}

describe('直し 1: 1 本の かわりの 最中に 決めた ＋ は スタートメニューを 開かない', () => {
  it('保存 {p1:0,p2:1}・[null, b]。待ちの あいだ 押した ＋ を 押したまま 1P に 決めても 開かない。はなして 押しなおすと 開く', () => {
    const m = make({ [PAD_CHOICE_KEY]: JSON.stringify({ p1: 0, p2: 1 }) });
    m.set(null, fakePad(1));
    m.poll();
    expect(m.router.padIndex(1)).toBe(1);
    m.router.setPicking(1);
    m.set(null, fakePad(1, { buttons: [START] }));
    m.poll();
    m.router.setPicking(null);
    expect(m.router.setChoice({ p1: 1, p2: null })).toBe(true);
    m.poll();
    m.poll();
    expect(m.p1.isHeld('openStartMenu')).toBe(false);
    m.set(null, fakePad(1));
    m.poll();
    m.set(null, fakePad(1, { buttons: [START] }));
    m.poll();
    expect(m.p1.isHeld('openStartMenu')).toBe(true);
  });

  it('2P も 同じ: 参加中、待ちの あいだに 押した ＋ を 押したまま 決めても 2P の スタートは 動かない', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setJoined(true);
    m.router.setPicking(1);
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    m.poll();
    m.router.setPicking(null);
    m.poll();
    expect(m.p2.isHeld('openStartMenu')).toBe(false);
  });
});

describe('直し 2: 1P の パッドが かわっても hasPad が ちらつかない', () => {
  it('setChoice の 直後から つながっている 新しい パッドで hasPad() が true', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    expect(m.router.reader1.hasPad()).toBe(true);
    m.router.setChoice({ p1: 1, p2: 0 });
    expect(m.router.reader1.hasPad()).toBe(true);
    expect(m.router.reader1.assignedPadIndex()).toBe(1);
    m.set(fakePad(0), fakePad(1, { axes: STICK_UP }));
    m.poll();
    expect(m.p1.isHeld('moveForward')).toBe(true);
  });
});

describe('直し 4: 2P が パッドなしで 参加中は 候補を 選びなおさない', () => {
  it('保存 {p1:0,p2:null}・参加・3 本: 2P は 1 番に 固定。1 番が ぬけても 2 番に 移らず padLost', () => {
    const m = make({ [PAD_CHOICE_KEY]: JSON.stringify({ p1: 0, p2: null }) });
    m.set(fakePad(0), fakePad(1), fakePad(2));
    m.poll();
    m.router.setJoined(true);
    m.poll();
    expect(m.router.padIndex(2)).toBe(1);
    m.set(fakePad(0), null, fakePad(2, { axes: STICK_UP, buttons: [START] }));
    m.poll();
    expect(m.router.padIndex(2)).toBeNull();
    expect(m.router.padLost()).toBe(true);
    expect(m.p2.isHeld('moveForward')).toBe(false);
  });

  it('保存なし・パッドなしで 参加 → あとから 2 本 つながる: 先に 決まった 方で 固定', () => {
    const m = make();
    m.set(fakePad(0));
    m.poll();
    m.router.setJoined(true);
    m.set(fakePad(0), fakePad(1), fakePad(2));
    m.poll();
    expect(m.router.padIndex(2)).toBe(1);
    m.set(fakePad(0), null, fakePad(2));
    m.poll();
    expect(m.router.padIndex(2)).toBeNull();
    expect(m.router.padLost()).toBe(true);
  });
});
