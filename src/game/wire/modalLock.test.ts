import { afterEach, describe, expect, it, vi } from 'vitest';
import { LockController } from '../../input/lockController';
import { modalLock } from './modalLock';

/**
 * COOP-1 5d（docs/design/COOP-1.md 1.15 §3.7 (e)「とじる とき」・§10【5d】・AC171）: 2P が パッドの B で 本・建築士さんを とじた あとの 1P の マウスの 錠。
 * 実装の 前に 書いた 赤の テスト。本物の LockController を 使い、ポインターロックの 要求は 数える 偽物に する。
 *
 * ---- 開発への つなぎ目の 約束（`src/game/wire/modalLock.ts` を 直す。名前は 開発が かえて よい。かえたら 依頼文と 仕様に 書く）----
 *   interface ModalLockDeps に 足す（省いても よい。省くと 今まで どおり）:
 *     inGesture?: () => boolean;  // いま ユーザーの 操作〔クリック・キー〕の 中か。省くと `navigator.userActivation?.isActive`（userActivation の ない ブラウザは true）。
 *                                 〔本は 閉じる 動きが 30 コマ あり visibleHook(false) が step の 中で 来る ため、「閉じる 操作の 元」では 決められない。パッドの 入力では isActive が 立たない〕
 *   close(opener: 1 | 2 = 1): void  … 開いた 人。1（省いた とき も）は 今の まま すぐ かけなおす。
 *       2 の とき: inGesture() が true（マウスの ✕ などで とじた）なら 今の まま かけなおす。
 *       false（2P の パッドの B・2P が やめた・パッドが ぬけた）なら かけなおさない:
 *         pointerLock.request() を 呼ばない・案内画面〔lock.overlayVisible()〕を 出さない・lock.realtimeAllowed() は true（2P は 遊べる）。
 *         1P が キーボード＋マウスなら lock.playInputEnabled() は false〔次の 操作で 錠が かかる まで 1P の 遊びの 入力は 止まる〕。
 *         1P が パッド〔lock.isPadActive()〕なら 錠が いらない ので 今の まま（案内画面は 出ず、1P の 遊びの 入力も 通る）。
 *         テストの 擬似ロック〔lock.isSimulated()〕は 今の まま すぐ 戻す。
 *   relockPending(): boolean … 「かけなおし待ち」の あいだ true（1P の 半分に `duo-relock-p1`「ゲームに 戻る」〔字は INPUT_CONFIG.textResume・ふりがな つき〕を 出す 目印。DuoNotices.setRelockHint は duoNotice.wait.test.ts）
 *   onGesture(): void        … ユーザーの 操作〔クリック・キー〕が 来た。待ちの あいだなら その 場で pointerLock.request() を 1 回 呼び、待ちを おわる。待ちで なければ 何も しない
 *   5c の 2P の とりごやの メニューは modalLock を 使わない（開いても とじても 1P の 錠に さわらない）。
 */

function make(opts: { gesture?: boolean; pad?: boolean; simulated?: boolean } = {}) {
  const lock = new LockController();
  const calls = { request: 0, release: 0, releaseAll: 0 };
  const gesture = { on: opts.gesture ?? false };
  if (opts.simulated) lock.simulate(true);
  else lock.setReal(true);
  if (opts.pad) lock.setPadActive(true);
  const modal = modalLock({
    game: { input: { releaseAll: () => void calls.releaseAll++ } },
    lock,
    pointerLock: {
      request: () => void calls.request++,
      release: () => {
        calls.release++;
        if (!lock.isSimulated()) lock.setReal(false); // ブラウザは 錠を はなす
      },
    },
    inGesture: () => gesture.on,
  });
  return { lock, modal, calls, gesture };
}

describe('AC171 2P が パッドで とじた あとの 1P の 錠（キーボード＋マウス）', () => {
  it('開くと 1P の 錠は はなれ、画面は 出ない（マウスが 使える）', () => {
    const { lock, modal, calls } = make();
    modal.open();
    expect(calls.release).toBe(1);
    expect(lock.locked()).toBe(false);
    expect(lock.overlayVisible()).toBe(false);
  });

  it('2P が パッドの B で とじた ステップ: requestPointerLock は 呼ばれず、案内画面は 出ず、realtimeAllowed は true、1P の 遊びの 入力は 止まる', () => {
    const { lock, modal, calls } = make({ gesture: false });
    modal.open();
    modal.close(2);
    expect(calls.request).toBe(0);
    expect(lock.overlayVisible()).toBe(false);
    expect(lock.realtimeAllowed()).toBe(true);
    expect(lock.playInputEnabled()).toBe(false);
    expect(modal.relockPending()).toBe(true);
  });

  it('待ちの あいだは 時間が たっても 案内画面が 出ない（返事を 待つ 保険の 時計も 動かさない）', () => {
    const { lock, modal, calls } = make({ gesture: false });
    modal.open();
    modal.close(2);
    for (let i = 0; i < 10; i++) {
      expect(lock.overlayVisible()).toBe(false);
      expect(lock.realtimeAllowed()).toBe(true);
    }
    expect(calls.request).toBe(0);
  });

  it('1P の 次の クリック（か キー）で その 操作の 中で 錠を 1 回 かける。待ちは おわる', () => {
    const { lock, modal, calls } = make({ gesture: false });
    modal.open();
    modal.close(2);
    modal.onGesture();
    expect(calls.request).toBe(1);
    expect(modal.relockPending()).toBe(false);
    lock.setReal(true); // ブラウザが 錠を かけた
    expect(lock.playInputEnabled()).toBe(true);
    modal.onGesture();
    expect(calls.request, '2 回目の 操作では もう 求めない').toBe(1);
  });

  it('待ちで ない ときの 操作は 何も しない（ふだんの クリックで 錠を 求めない）', () => {
    const { modal, calls } = make();
    modal.onGesture();
    expect(calls.request).toBe(0);
    expect(modal.relockPending()).toBe(false);
  });

  it('2P が マウスの ✕ で とじた（クリックの 中）: 今の まま その場で かけなおす', () => {
    const { lock, modal, calls } = make({ gesture: true });
    modal.open();
    modal.close(2);
    expect(calls.request).toBe(1);
    expect(modal.relockPending()).toBe(false);
    expect(lock.overlayVisible()).toBe(false);
  });

  it('1P が 開いて 1P が とじた（省いても 同じ）: 今の まま その場で かけなおす', () => {
    const a = make({ gesture: false });
    a.modal.open();
    a.modal.close(1);
    expect(a.calls.request).toBe(1);
    expect(a.modal.relockPending()).toBe(false);
    const b = make({ gesture: false });
    b.modal.open();
    b.modal.close();
    expect(b.calls.request).toBe(1);
  });
});

describe('AC171 1P が パッド・テストの 擬似ロック', () => {
  it('1P が パッド: 錠は いらない。案内画面は 出ず、1P の 遊びの 入力も 通り、待ちに ならない', () => {
    const { lock, modal } = make({ gesture: false, pad: true });
    modal.open();
    modal.close(2);
    expect(lock.overlayVisible()).toBe(false);
    expect(lock.realtimeAllowed()).toBe(true);
    expect(lock.playInputEnabled()).toBe(true);
    expect(modal.relockPending()).toBe(false);
  });

  it('擬似ロック（E2E）: 2P が パッドで とじても 今の まま すぐ 戻す（遊びの 入力が 通る・待ちに ならない・錠を 求めない）', () => {
    const { lock, modal, calls } = make({ gesture: false, simulated: true });
    modal.open();
    expect(lock.locked()).toBe(false);
    modal.close(2);
    expect(lock.locked()).toBe(true);
    expect(lock.playInputEnabled()).toBe(true);
    expect(modal.relockPending()).toBe(false);
    expect(calls.request).toBe(0);
  });
});

describe('AC171 かけなおし待ちの あいだに 1P が パッドに 持ちかえた', () => {
  it('待ちを とき、1P の 遊びの 入力が もどる（錠は いらない）', () => {
    const { lock, modal } = make({ gesture: false });
    modal.open();
    modal.close(2);
    expect(modal.relockPending()).toBe(true);
    lock.setPadActive(true);
    expect(modal.relockPending()).toBe(false);
    expect(lock.playInputEnabled()).toBe(true);
  });
});

describe('AC142・AC146 1 人の とき（inGesture を 渡さない・opener を 渡さない）は 今の まま', () => {
  it('open → close() で 錠を 1 回 かけなおし、入力は はなす', () => {
    const lock = new LockController();
    lock.setReal(true);
    const calls = { request: 0, releaseAll: 0 };
    const modal = modalLock({
      game: { input: { releaseAll: () => void calls.releaseAll++ } },
      lock,
      pointerLock: { request: () => void calls.request++, release: () => lock.setReal(false) },
    });
    modal.open();
    const before = calls.releaseAll;
    modal.close();
    expect(calls.request).toBe(1);
    expect(calls.releaseAll).toBeGreaterThan(before);
    expect(lock.overlayVisible()).toBe(false);
  });
});

describe('AC171 inGesture を 省いた とき（navigator.userActivation で 決める）', () => {
  afterEach(() => vi.unstubAllGlobals());
  function makeDefault() {
    const lock = new LockController();
    lock.setReal(true);
    const calls = { request: 0 };
    const modal = modalLock({
      game: { input: { releaseAll: () => {} } },
      lock,
      pointerLock: { request: () => void calls.request++, release: () => lock.setReal(false) },
    });
    return { lock, modal, calls };
  }
  it('userActivation.isActive が false（パッドの B・ステップの 中）: かけなおし待ち', () => {
    vi.stubGlobal('navigator', { userActivation: { isActive: false } });
    const { modal, calls } = makeDefault();
    modal.open();
    modal.close(2);
    expect(calls.request).toBe(0);
    expect(modal.relockPending()).toBe(true);
  });
  it('userActivation.isActive が true（マウスの ✕ の クリック）: その場で かける', () => {
    vi.stubGlobal('navigator', { userActivation: { isActive: true } });
    const { modal, calls } = makeDefault();
    modal.open();
    modal.close(2);
    expect(calls.request).toBe(1);
    expect(modal.relockPending()).toBe(false);
  });
  it('userActivation の ない ブラウザは true あつかい: その場で かける', () => {
    vi.stubGlobal('navigator', {});
    const { modal, calls } = makeDefault();
    modal.open();
    modal.close(2);
    expect(calls.request).toBe(1);
  });
});
