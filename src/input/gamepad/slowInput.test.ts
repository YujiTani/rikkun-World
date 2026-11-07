import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { DuoPadRouter } from './duoPads';
import { AlwaysLook, GamepadReader } from './reader';
import { fakePad } from './testPad';

/**
 * COOP-1 作業 4d-1（docs/design/COOP-1.md 1.13 §3.6 (a)「ゆっくりの あいだの 操作」・AC101）の 先行テスト（赤）。
 * パリィの ゆっくり（世界が 0.25 倍）の あいだ、実時間の 1 コマでは 固定ステップが 0 回の コマが ある。
 * パッドは 固定ステップごとに 読む（`poll`）ので、ステップと ステップの あいだに 押して はなした ボタン（短い 押し）が 取りこぼされる。
 * 直し: パッドの **ボタンだけ** を 実時間の 毎コマ 読む 口を 足す。ステップごとの `poll` は かえない（スティック・look は 1 ステップ 1 回〔look は 1 poll = 1 ステップの 約束〕のまま）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/input/gamepad/reader.ts   GamepadReader.pollButtons(nowMs: number): void
 *       … 割り当て中の パッドの **ボタンの 押す／はなす だけ** を ActionState に 出す（`poll` の ボタンの 部分と 同じ 道。前の 値〔prev〕は `poll` と 共有〕。
 *         スティック（歩き）・look には さわらない。パッドが なければ 何もしない。何回 呼んでも、同じ 押しは 1 回しか 出ない。
 *       … ボタンの ループは `poll` と **同じ private 1 つ**に まとめて 通す（コピーしない）。だから `holdButtonsUntilReleased`（押しっぱなしを 押した ことに しない）・`setIgnoreStart`・`setMenuOpen`（メニュー中の ふりわけ）・
 *         `setCapturing`・知らない 機種の 暴発よけ も `poll` と **同じ 結果**に なる（下の 「poll と 同じ」）。
 *   src/input/gamepad/duoPads.ts  DuoPadRouter.pollButtons(nowMs: number, active = true): void
 *       … 1P の reader と 2P の reader の `pollButtons`。参加の 求め・パッドの ぬけ・つなぎ直しの 判定には さわらない（それは `poll` だけ）。
 *         **読まない とき**: ① 参加前（`setJoined(false)`）は 1P も 2P も 読まない（1 人の ときの 遊びは かえない。AC113）。② `active = false`（世界が 止まっている あいだ）は 2P を 読まない（1P は 読む）。
 *         ③ 2P の パッドが ぬけて いる（lost）・2P の パッドが きまっていない あいだは 2P を 読まない。④ 止まって いた あと（`poll(…, false)` の あと、`poll(…, true)` で とける まで）は 2P を 読まない
 *         ＝ とけた ときの `holdButtonsUntilReleased` を くずさない（押しっぱなしの ボタンが「今 押した」に ならない）。
 *   src/game/Game.ts              Game.onFrame(fn: (dt: number) => void): void   … 実時間の 毎コマ（固定ステップの 回数が 0 でも）、ステップを 進める **前** に 呼ぶ。
 *   src/game/wire/gamepad.ts      `opts.game.onFrame(() => { if (duo 参加中) router.pollButtons(performance.now(), active) })`。**2 人が 参加している あいだ だけ** 動かす（PO の 決め。1 人の ときは 今までの `poll` だけ。AC113）。
 *   ※ 1P の キー・マウスは ActionState に 直接 入るので 今も 取りこぼさない（`wasPressed` は 次の endFrame まで のこる）。下の「キー」は それを 守る テスト。
 */

const ZR = 7; // primary
const FACE_RIGHT = 1; // run
const SHOULDER_L = 4; // hotbarPrev

function readerRig() {
  const actions = new ActionState();
  const look = new AlwaysLook();
  const reader = new GamepadReader(actions, look, null);
  let pads: (Gamepad | null)[] = [];
  reader.getPads = () => pads;
  const set = (...p: (Gamepad | null)[]) => {
    pads = p;
  };
  let t = 0;
  return { actions, look, reader, set, pollButtons: () => reader.pollButtons((t += 16)), poll: () => reader.poll((t += 16)) };
}

describe('AC101 パッド（1P）: ステップの あいだに 押して はなした ボタンも つぎの ステップで「押した」', () => {
  it('コマ A で ZR を 押し、コマ B で はなす（ステップは 0 回）→ ステップで wasPressed(primary) = true・isHeld = false', () => {
    const r = readerRig();
    r.set(fakePad(0));
    r.poll(); // 前のステップ: 何も 押して いない
    r.actions.endFrame();
    r.set(fakePad(0, { buttons: [ZR] }));
    r.pollButtons(); // コマ A（ステップなし）
    r.set(fakePad(0));
    r.pollButtons(); // コマ B（ステップなし）
    // つぎの 固定ステップ（poll の あと ゲームが 読む）
    r.poll();
    expect(r.actions.wasPressed('primary'), '短い 押しを 取りこぼさない').toBe(true);
    expect(r.actions.isHeld('primary')).toBe(false);
    r.actions.endFrame();
    r.poll();
    expect(r.actions.wasPressed('primary'), '2 回 目の ステップでは もう 押した ことに ならない').toBe(false);
  });

  it('run（右の 面ボタン）を 押しながら ZR の 短い 押し → 同じ ステップで run は 押しっぱなし・primary は 押した（パリィの 入力）', () => {
    const r = readerRig();
    r.set(fakePad(0));
    r.poll();
    r.actions.endFrame();
    r.set(fakePad(0, { buttons: [FACE_RIGHT] }));
    r.pollButtons();
    r.set(fakePad(0, { buttons: [FACE_RIGHT, ZR] }));
    r.pollButtons();
    r.set(fakePad(0, { buttons: [FACE_RIGHT] }));
    r.pollButtons();
    r.poll();
    expect(r.actions.isHeld('run')).toBe(true);
    expect(r.actions.wasPressed('primary')).toBe(true);
  });

  it('押しっぱなしは 二重に 数えない: pollButtons で 押した ボタンが poll でも 押されたまま → 押した のは 1 回、押しっぱなしの まま', () => {
    const r = readerRig();
    r.set(fakePad(0));
    r.poll();
    r.actions.endFrame();
    r.set(fakePad(0, { buttons: [SHOULDER_L] }));
    r.pollButtons();
    r.pollButtons();
    r.poll();
    expect(r.actions.wasPressed('hotbarPrev')).toBe(true);
    expect(r.actions.isHeld('hotbarPrev')).toBe(true);
    r.actions.endFrame();
    r.poll();
    expect(r.actions.wasPressed('hotbarPrev'), '2 つ目の ステップで また 押した ことに ならない').toBe(false);
    expect(r.actions.isHeld('hotbarPrev')).toBe(true);
    // はなすのも 1 回
    r.set(fakePad(0));
    r.pollButtons();
    expect(r.actions.isHeld('hotbarPrev')).toBe(false);
    r.poll();
    expect(r.actions.isHeld('hotbarPrev')).toBe(false);
  });

  it('pollButtons は スティックと look に さわらない（look は 1 poll = 1 ステップ。ゆっくりの あいだに 回る 速さが 倍に ならない）', () => {
    const r = readerRig();
    r.set(fakePad(0));
    r.poll();
    r.set(fakePad(0, { axes: [1, 0, 1, 0] })); // 左スティック 右・右スティック 右
    r.pollButtons();
    r.pollButtons();
    r.pollButtons();
    expect(r.look.consume()).toEqual({ dx: 0, dy: 0 });
    expect(r.actions.isHeld('moveRight'), '歩きは ステップの poll が きめる').toBe(false);
    r.poll();
    expect(r.actions.isHeld('moveRight')).toBe(true);
    expect(r.look.consume().dx).toBeGreaterThan(0);
  });

  it('パッドが ない・ぬけた とき pollButtons は 何も しない（落ちない）', () => {
    const r = readerRig();
    r.set();
    expect(() => r.pollButtons()).not.toThrow();
    r.set(fakePad(0, { connected: false }));
    expect(() => r.pollButtons()).not.toThrow();
    expect(r.actions.isHeld('primary')).toBe(false);
  });
});

function routerRig() {
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
  return { p1, p2, look1, look2, router, set, poll: () => router.poll((t += 16)), pollButtons: () => router.pollButtons((t += 16)) };
}

describe('AC101 パッド（2P）: 2P の パッドでも ステップの あいだの 短い 押しを 取りこぼさない', () => {
  it('参加中: 2P の ZR を コマ A で 押し コマ B で はなす → つぎの ステップで 2P の wasPressed(primary)。1P の ActionState には 入らない', () => {
    const r = routerRig();
    r.set(fakePad(0), fakePad(1));
    r.poll();
    r.router.setJoined(true);
    r.poll();
    r.p1.endFrame();
    r.p2.endFrame();
    r.set(fakePad(0), fakePad(1, { buttons: [FACE_RIGHT, ZR] }));
    r.pollButtons();
    r.set(fakePad(0), fakePad(1, { buttons: [FACE_RIGHT] }));
    r.pollButtons();
    r.set(fakePad(0), fakePad(1));
    r.pollButtons();
    r.poll();
    expect(r.p2.wasPressed('primary'), '2P の 短い 押し').toBe(true);
    expect(r.p2.isHeld('primary')).toBe(false);
    expect(r.p1.wasPressed('primary'), '1P には 入らない').toBe(false);
  });

  it('1P の パッドの 短い 押しも 同じ（router 経由）', () => {
    const r = routerRig();
    r.set(fakePad(0), fakePad(1));
    r.poll();
    r.router.setJoined(true);
    r.poll();
    r.p1.endFrame();
    r.set(fakePad(0, { buttons: [ZR] }), fakePad(1));
    r.pollButtons();
    r.set(fakePad(0), fakePad(1));
    r.pollButtons();
    r.poll();
    expect(r.p1.wasPressed('primary')).toBe(true);
    expect(r.p2.wasPressed('primary')).toBe(false);
  });

  it('参加前: 1P も 2P も 読まない（1 人の ときの 遊びは かえない）。＋ の 参加の 求めも pollButtons では 出さない', () => {
    const r = routerRig();
    r.set(fakePad(0), fakePad(1));
    r.poll();
    r.set(fakePad(0, { buttons: [ZR] }), fakePad(1, { buttons: [ZR, 9] }));
    r.pollButtons();
    expect(r.p1.wasPressed('primary'), '1P も 参加前は pollButtons で 読まない').toBe(false);
    expect(r.p2.wasPressed('primary')).toBe(false);
    expect(r.router.lastPoll().joinRequested, 'joinRequested は poll だけ').toBe(false);
  });

  it('active = false（世界が 止まっている）: 2P は 読まない・1P は 読む', () => {
    const r = routerRig();
    r.set(fakePad(0), fakePad(1));
    r.poll();
    r.router.setJoined(true);
    r.poll();
    r.p1.endFrame();
    r.p2.endFrame();
    r.set(fakePad(0, { buttons: [ZR] }), fakePad(1, { buttons: [ZR] }));
    r.router.pollButtons(1000, false);
    expect(r.p1.wasPressed('primary')).toBe(true);
    expect(r.p2.wasPressed('primary')).toBe(false);
  });

  it('止まって いた あと: とける（poll(active = true)）まで 2P の 押しっぱなしを 押した ことに しない。とけた あとも 押しっぱなしは 押した ことに ならない', () => {
    const r = routerRig();
    r.set(fakePad(0), fakePad(1));
    r.poll();
    r.router.setJoined(true);
    r.poll();
    r.set(fakePad(0), fakePad(1, { buttons: [ZR] })); // 止まっている あいだに 押した
    r.router.poll(2000, false); // 世界が 止まって いる
    r.p2.endFrame();
    r.router.pollButtons(2016, true); // 動きだす 最初の コマ（ステップの poll より 先）
    expect(r.p2.wasPressed('primary'), 'とける まえに 押した ことに しない').toBe(false);
    expect(r.p2.isHeld('primary')).toBe(false);
    r.router.poll(2032, true); // とける
    expect(r.p2.wasPressed('primary')).toBe(false);
    r.router.pollButtons(2048, true);
    expect(r.p2.wasPressed('primary'), 'はなすまで 押した ことに ならない').toBe(false);
    r.set(fakePad(0), fakePad(1));
    r.router.pollButtons(2064, true);
    r.set(fakePad(0), fakePad(1, { buttons: [ZR] }));
    r.router.pollButtons(2080, true);
    expect(r.p2.wasPressed('primary'), 'はなして また 押せば 押した').toBe(true);
  });

  it('2P の パッドが ぬけて いる（lost）あいだは 2P を 読まない。つなぎ直しで 押して いた ボタンも 押した ことに しない', () => {
    const r = routerRig();
    r.set(fakePad(0), fakePad(1));
    r.poll();
    r.router.setJoined(true);
    r.poll();
    r.set(fakePad(0), null);
    r.poll(); // lost
    expect(r.router.padLost()).toBe(true);
    r.p2.endFrame();
    r.set(fakePad(0), fakePad(1, { buttons: [ZR] }));
    r.pollButtons();
    expect(r.p2.wasPressed('primary')).toBe(false);
    expect(r.p2.isHeld('primary')).toBe(false);
  });

  it('2P の パッドが ぬけた とき pollButtons は 落ちず、2P の 押している 物を ふやさない', () => {
    const r = routerRig();
    r.set(fakePad(0), fakePad(1));
    r.poll();
    r.router.setJoined(true);
    r.poll();
    r.set(fakePad(0), null);
    expect(() => r.pollButtons()).not.toThrow();
    expect(r.p2.isHeld('primary')).toBe(false);
  });
});

describe('AC101 pollButtons は poll と 同じ ボタンの ふりわけ（holdButtons・ignoreStart・menuOpen を くずさない）', () => {
  const START = 9;

  it('holdButtonsUntilReleased: 押しっぱなしの ボタンは pollButtons でも 押した ことに ならない。はなして また 押せば 押した', () => {
    const r = readerRig();
    r.set(fakePad(0, { buttons: [ZR] }));
    r.reader.holdButtonsUntilReleased();
    r.pollButtons();
    expect(r.actions.wasPressed('primary')).toBe(false);
    expect(r.actions.isHeld('primary')).toBe(false);
    r.poll();
    expect(r.actions.wasPressed('primary')).toBe(false);
    r.set(fakePad(0));
    r.pollButtons();
    r.set(fakePad(0, { buttons: [ZR] }));
    r.pollButtons();
    expect(r.actions.wasPressed('primary')).toBe(true);
  });

  it('setIgnoreStart(true): ＋ の 押しは pollButtons でも 操作に しない（開始メニューを 開かない）', () => {
    const r = readerRig();
    r.set(fakePad(0));
    r.poll();
    r.reader.setIgnoreStart(true);
    r.set(fakePad(0, { buttons: [START] }));
    r.pollButtons();
    expect(r.actions.wasPressed('openStartMenu')).toBe(false);
    r.reader.setIgnoreStart(false);
    r.set(fakePad(0));
    r.pollButtons();
    r.set(fakePad(0, { buttons: [START] }));
    r.pollButtons();
    expect(r.actions.wasPressed('openStartMenu')).toBe(true);
  });

  it('menuOpen: メニュー中の ふりわけは poll と 同じ（ZR は primary に ならない・下の 面ボタンは confirm）', () => {
    const viaPoll = readerRig();
    const viaButtons = readerRig();
    for (const r of [viaPoll, viaButtons]) {
      r.set(fakePad(0));
      r.poll();
      r.reader.setMenuOpen(true);
    }
    const seq = [fakePad(0, { buttons: [ZR] }), fakePad(0, { buttons: [0] }), fakePad(0)];
    for (const pad of seq) {
      viaPoll.set(pad);
      viaPoll.poll();
      viaButtons.set(pad);
      viaButtons.pollButtons();
    }
    for (const a of ['primary', 'confirm', 'closeMenu'] as const) {
      expect(viaButtons.actions.wasPressed(a), a).toBe(viaPoll.actions.wasPressed(a));
    }
    expect(viaButtons.actions.wasPressed('primary')).toBe(false);
    expect(viaButtons.actions.wasPressed('confirm')).toBe(true);
  });
});

describe('AC101 キー（1P）: ステップの あいだに 押して はなしても、つぎの ステップで 1 回 押した（今の 動きを 守る）', () => {
  it('press → release（endFrame なし）→ wasPressed = true・isHeld = false。endFrame の あとは false', () => {
    const a = new ActionState();
    a.press('primary');
    a.release('primary');
    expect(a.wasPressed('primary')).toBe(true);
    expect(a.isHeld('primary')).toBe(false);
    a.endFrame();
    expect(a.wasPressed('primary')).toBe(false);
  });
});
