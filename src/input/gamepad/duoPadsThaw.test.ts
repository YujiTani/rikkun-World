import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { AlwaysLook } from './reader';
import { DuoPadRouter } from './duoPads';
import { FakeStorage, fakePad } from './testPad';

/** #424 コードレビューの 直し（3・5）。 */
const FACE_LEFT = 2; // Y（標準の ボタン 2）= もちもの
const START = 9;

function make() {
  const p1 = new ActionState();
  const p2 = new ActionState();
  const router = new DuoPadRouter({ p1, p2, look1: new AlwaysLook(), look2: new AlwaysLook(), storage: null, choiceStorage: new FakeStorage({}) });
  let pads: (Gamepad | null)[] = [];
  let calls = 0;
  router.getPads = () => {
    calls++;
    return pads;
  };
  let t = 0;
  return {
    p2,
    router,
    set: (...p: (Gamepad | null)[]) => void (pads = p),
    poll: (active = true) => router.poll((t += 16), active),
    calls: () => calls,
  };
}

describe('直し 5: 止まっている あいだ 押しっぱなしだった 2P の ボタンは、とけた 最初の ステップで「今 押した」に ならない', () => {
  it('Y を 押しっぱなしで とけても 開かない。はなして 押しなおすと 開く', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setJoined(true);
    m.poll();
    // 止まっている あいだ（active = false）に 2P が Y を 押す（2P は 読まない）
    m.set(fakePad(0), fakePad(1, { buttons: [FACE_LEFT] }));
    m.poll(false);
    m.poll(false);
    // とけた 最初の ステップ
    m.poll(true);
    expect(m.p2.wasPressed('toggleInventory')).toBe(false);
    m.poll(true);
    expect(m.p2.wasPressed('toggleInventory')).toBe(false);
    // はなして 押しなおす
    m.set(fakePad(0), fakePad(1));
    m.poll(true);
    m.set(fakePad(0), fakePad(1, { buttons: [FACE_LEFT] }));
    m.poll(true);
    expect(m.p2.wasPressed('toggleInventory')).toBe(true);
  });

  it('止まらなかった ときは ふつうに 押した ことに なる', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setJoined(true);
    m.poll();
    m.set(fakePad(0), fakePad(1, { buttons: [FACE_LEFT] }));
    m.poll(true);
    expect(m.p2.wasPressed('toggleInventory')).toBe(true);
  });
});

describe('直し 3: 候補の 番号と「何か 押している」は poll の 結果から 読める（1 ステップに パッドの 一覧は 1 回）', () => {
  it('2 本目が いれば candidate = その 番号。ボタンを 押すと candidatePressed', () => {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    let r = m.poll(false);
    expect(r.candidate).toBe(1);
    expect(r.candidatePressed).toBe(false);
    m.set(fakePad(0), fakePad(1, { buttons: [START] }));
    r = m.poll(true);
    expect(r.candidate).toBe(1);
    expect(r.candidatePressed).toBe(true);
    expect(r.joinRequested).toBe(true);
  });

  it('1 本だけなら candidate = -1。poll 1 回で getPads は 1 回', () => {
    const m = make();
    m.set(fakePad(0));
    const before = m.calls();
    const r = m.poll();
    expect(r.candidate).toBe(-1);
    expect(r.candidatePressed).toBe(false);
    expect(m.calls() - before).toBe(1);
  });
});
