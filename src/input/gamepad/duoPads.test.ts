import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { AlwaysLook } from './reader';
import { DuoPadRouter } from './duoPads';

/**
 * COOP-1 作業 1（#395）の 先行テスト（赤）。AC1・AC3（ユニット）・AC5（パッド側）・AC16。
 *
 * ---- developer への つなぎ目の 約束 ----
 *   ファイル  src/input/gamepad/duoPads.ts（今は 宣言だけ。書きかえて 実装する）。index.ts から export する。
 *   クラス    DuoPadRouter（形は duoPads.ts の 宣言の とおり）
 *     - 1P = 最初に 使った 1 本（後から 番号の 小さい パッドが 来ても 1P は 変わらない）。2P = 1P でない 番号の 小さい 方。
 *     - 参加前（setJoined(false)）: 2 本目の ＋（start）だけ 見て poll の joinRequested を true に する。2P の ActionState には 何も 書かない。
 *       1 本目の ＋ は これまでどおり 1P の toggleInventory で、joinRequested は false。
 *     - 参加後（setJoined(true)）: 2 本目の 入力が 2P の ActionState(p2) と look2 に だけ 入る。1P の ActionState(p1) には 入らない。
 *     - 2P の パッドが ぬけた（配列の その場所が null か connected = false）: その poll で p2 の 押している Action を ぜんぶ はなし、padLost() = true。
 *       つなぎ直して どれか ボタンを 押すと padLost() = false（押すまでは true のまま）。
 *     - 3 本目以降: 読まない。ignoredPadIndexes() に 番号が 出る。joinRequested にも ならない。文字を 返す 口は 持たない（§10。画面に 何も 出さない）。
 *   1P の 読みは 今の GamepadReader と 同じ（slots.get(0) = Game.input の 参照を そのまま p1 に 渡す）。
 */

function fakePad(index: number, opts: { buttons?: number[]; axes?: number[]; connected?: boolean } = {}): Gamepad {
  const b = Array(16).fill(false);
  for (const i of opts.buttons ?? []) b[i] = true;
  return {
    id: 'Xbox Controller (STANDARD GAMEPAD Vendor: 045e)',
    index,
    connected: opts.connected ?? true,
    mapping: 'standard',
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons: b.map((pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })),
    timestamp: 0,
    vibrationActuator: undefined as unknown as GamepadHapticActuator,
  } as unknown as Gamepad;
}

const START = 9; // ＋
const ZR = 7; // primary
const STICK_UP = [0, -1, 0, 0]; // 左スティック上

function make() {
  const p1 = new ActionState();
  const p2 = new ActionState();
  const look1 = new AlwaysLook();
  const look2 = new AlwaysLook();
  const router = new DuoPadRouter({ p1, p2, look1, look2, storage: null });
  let pads: (Gamepad | null)[] = [];
  router.getPads = () => pads;
  const set = (...p: (Gamepad | null)[]) => {
    pads = p;
  };
  let t = 0;
  const poll = () => router.poll((t += 16));
  return { p1, p2, look1, look2, router, set, poll };
}

const held = (a: ActionState) => (['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'primary', 'secondary', 'toggleInventory'] as const).filter((x) => a.isHeld(x));

describe('AC1: パッドの 割り当て', () => {
  it('1 本目は 1P（slot 0）、2 本目は 2P の 候補', () => {
    const { router, set, poll } = make();
    set(fakePad(0));
    poll();
    expect(router.p1PadIndex()).toBe(0);
    expect(router.p2PadIndex()).toBeNull();
    set(fakePad(0), fakePad(1));
    poll();
    expect(router.p1PadIndex()).toBe(0);
    router.setJoined(true);
    poll();
    expect(router.p2PadIndex()).toBe(1);
  });

  it('最初に 使った 1 本が 1P: 後から 番号の 小さい パッドが 来ても 1P は 変わらない', () => {
    const { router, set, poll } = make();
    set(null, fakePad(1));
    poll();
    expect(router.p1PadIndex()).toBe(1);
    set(fakePad(0), fakePad(1));
    poll();
    expect(router.p1PadIndex()).toBe(1);
    router.setJoined(true);
    poll();
    expect(router.p2PadIndex()).toBe(0);
  });

  it('2 本目の ＋ で joinRequested（参加前だけ）。1 本目の ＋ では ならない', () => {
    const { set, poll, p1, p2 } = make();
    set(fakePad(0), fakePad(1));
    poll();
    set(fakePad(0, { buttons: [START] }), fakePad(1));
    expect(poll().joinRequested).toBe(false);
    expect(p1.isHeld('toggleInventory')).toBe(true); // 1P の ＋ は これまでどおり もちもの
    expect(held(p2)).toEqual([]);
    set(fakePad(0), fakePad(1, { buttons: [START] }));
    expect(poll().joinRequested).toBe(true);
    expect(held(p2)).toEqual([]); // 参加するまで 2P には 何も 入らない
  });

  it('参加前は 2 本目の ＋ 以外の ボタン・スティックは 1P にも 2P にも 入らない', () => {
    const { set, poll, p1, p2 } = make();
    set(fakePad(0), fakePad(1));
    poll();
    set(fakePad(0), fakePad(1, { buttons: [ZR], axes: STICK_UP }));
    expect(poll().joinRequested).toBe(false);
    expect(held(p1)).toEqual([]);
    expect(held(p2)).toEqual([]);
  });

  it('参加したあとの ＋ は joinRequested に ならない', () => {
    const { router, set, poll } = make();
    set(fakePad(0), fakePad(1));
    poll();
    router.setJoined(true);
    set(fakePad(0), fakePad(1, { buttons: [START] }));
    expect(poll().joinRequested).toBe(false);
  });
});

describe('AC3: 2P の パッドで 2P だけが 動く', () => {
  it('2P の 左スティック上 → p2 の moveForward だけ。p1 は そのまま', () => {
    const { router, set, poll, p1, p2 } = make();
    set(fakePad(0), fakePad(1));
    poll();
    router.setJoined(true);
    set(fakePad(0), fakePad(1, { axes: STICK_UP }));
    poll();
    expect(p2.isHeld('moveForward')).toBe(true);
    expect(held(p1)).toEqual([]);
  });

  it('1P の パッド・キーの 入力は p2 に 入らない', () => {
    const { router, set, poll, p1, p2 } = make();
    set(fakePad(0), fakePad(1));
    poll();
    router.setJoined(true);
    p1.press('moveRight'); // キーボード（slot 0 に 直に 入る）
    set(fakePad(0, { buttons: [ZR], axes: STICK_UP }), fakePad(1));
    poll();
    expect(p1.isHeld('primary')).toBe(true);
    expect(p1.isHeld('moveForward')).toBe(true);
    expect(held(p2)).toEqual([]);
  });

  it('2P の 右スティックは look2 だけに 入る', () => {
    const { router, set, poll, look1, look2 } = make();
    set(fakePad(0), fakePad(1));
    poll();
    router.setJoined(true);
    set(fakePad(0), fakePad(1, { axes: [0, 0, 0.8, 0] }));
    poll();
    expect(look2.consume().dx).toBeGreaterThan(0);
    expect(look1.consume().dx).toBe(0);
  });
});

describe('AC5: 2P の パッドが ぬけた', () => {
  function joinedWithHeld() {
    const m = make();
    m.set(fakePad(0), fakePad(1));
    m.poll();
    m.router.setJoined(true);
    m.set(fakePad(0), fakePad(1, { buttons: [ZR], axes: STICK_UP }));
    m.poll();
    return m;
  }

  it('ぬけた その poll で 2P の 入力が ぜんぶ はなれ、padLost が true', () => {
    const { set, poll, p2, router } = joinedWithHeld();
    expect(held(p2)).toEqual(['moveForward', 'primary']);
    set(fakePad(0), null);
    poll();
    expect(held(p2)).toEqual([]);
    expect(router.padLost()).toBe(true);
  });

  it('connected = false の パッドも ぬけた 扱い', () => {
    const { set, poll, p2, router } = joinedWithHeld();
    set(fakePad(0), fakePad(1, { connected: false }));
    poll();
    expect(held(p2)).toEqual([]);
    expect(router.padLost()).toBe(true);
  });

  it('つなぎ直して どれか ボタンを 押すまでは padLost のまま。押すと 続きから', () => {
    const { set, poll, p2, router } = joinedWithHeld();
    set(fakePad(0), null);
    poll();
    set(fakePad(0), fakePad(1)); // つながった だけ
    poll();
    expect(router.padLost()).toBe(true);
    expect(held(p2)).toEqual([]);
    set(fakePad(0), fakePad(1, { buttons: [ZR] }));
    poll();
    expect(router.padLost()).toBe(false);
  });

  it('1P の パッドが ぬけても 2P は 1P に ならない（段階 1）', () => {
    const { set, poll, router } = joinedWithHeld();
    set(null, fakePad(1));
    poll();
    expect(router.p1PadIndex()).toBeNull();
    expect(router.p2PadIndex()).toBe(1);
    expect(router.padLost()).toBe(false);
  });
});

describe('AC16: 3 本目の パッド', () => {
  it('ボタン・スティックを 動かしても 参加も 入力も 起きない。番号は ignoredPadIndexes に 出る', () => {
    const { router, set, poll, p1, p2, look1, look2 } = make();
    set(fakePad(0), fakePad(1), fakePad(2));
    poll();
    router.setJoined(true);
    set(fakePad(0), fakePad(1), fakePad(2, { buttons: [START, ZR, 0], axes: [1, -1, 1, 1] }));
    const r = poll();
    expect(r.joinRequested).toBe(false);
    expect(held(p1)).toEqual([]);
    expect(held(p2)).toEqual([]);
    expect(look1.consume()).toEqual({ dx: 0, dy: 0 });
    expect(look2.consume()).toEqual({ dx: 0, dy: 0 });
    expect(router.ignoredPadIndexes()).toEqual([2]);
    expect(router.padLost()).toBe(false);
  });

  it('参加前でも 3 本目の ＋ では 参加の 求めに ならない', () => {
    const { set, poll, router } = make();
    set(fakePad(0), fakePad(1), fakePad(2, { buttons: [START] }));
    expect(poll().joinRequested).toBe(false);
    expect(router.ignoredPadIndexes()).toEqual([2]);
  });

  it('文字を 返す 口を 持たない（poll の 結果は joinRequested だけ）', () => {
    const { set, poll } = make();
    set(fakePad(0), fakePad(1), fakePad(2, { buttons: [START] }));
    expect(Object.keys(poll())).toEqual(['joinRequested']);
  });
});
