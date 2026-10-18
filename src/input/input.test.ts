import { describe, expect, it } from 'vitest';
import { ActionState } from './actions';
import { INPUT_CONFIG } from './config';
import { createInputHook, createLockHook } from './hook';
import { LockController, MouseLook } from './lockController';
import { WheelAccumulator } from './wheel';
import { buildOverlayHtml } from '../ui/playOverlay';
import { findUnrubiedKanji } from '../ui/text';

function setup() {
  const lock = new LockController();
  const look = new MouseLook(lock);
  const actions = new ActionState();
  // pointerLock.ts と同じ配線
  lock.onChange(() => {
    actions.releaseAll();
    look.reset();
  });
  const wheel = new WheelAccumulator(actions, () => lock.playInputEnabled());
  return { lock, look, actions, lockHook: createLockHook(lock), inputHook: createInputHook(actions, look, wheel) };
}

describe('LockController', () => {
  it('開いた直後はロックなしで案内画面が出て、時間・遊びの入力は止まる', () => {
    const { lockHook, lock } = setup();
    expect(lockHook.get()).toEqual({ locked: false, overlayVisible: true, overlayText: 'クリックして あそぼう！' });
    expect(lock.realtimeAllowed()).toBe(false);
    expect(lock.playInputEnabled()).toBe(false);
  });

  it('simulate(true) で案内が消え、判定がすべて true になる', () => {
    const { lockHook, lock } = setup();
    lockHook.simulate(true);
    expect(lockHook.get().overlayVisible).toBe(false);
    expect(lock.locked() && lock.realtimeAllowed() && lock.playInputEnabled()).toBe(true);
  });

  it('外れると「つづきを」の文字になり、押していた Action がはなされる', () => {
    const { lockHook, inputHook } = setup();
    lockHook.simulate(true);
    inputHook.press('moveForward');
    expect(inputHook.held()).toEqual(['moveForward']);
    lockHook.simulate(false);
    expect(inputHook.held()).toEqual([]);
    expect(lockHook.get()).toEqual({
      locked: false,
      overlayVisible: true,
      overlayText: 'クリックして つづきを あそぼう！',
    });
  });

  it('simulate は本物のロックより優先される', () => {
    const { lock } = setup();
    lock.setReal(true);
    lock.simulate(false);
    expect(lock.locked()).toBe(false);
    lock.setReal(true);
    expect(lock.locked()).toBe(false);
    lock.simulate(true);
    lock.setReal(false);
    expect(lock.locked()).toBe(true);
  });

  it('本物のロックの変化でも onChange が呼ばれ releaseAll される', () => {
    const { lock, actions } = setup();
    lock.setReal(true);
    actions.press('jump');
    lock.setReal(false);
    expect(actions.isHeld('jump')).toBe(false);
  });

  it('同じ状態を重ねて伝えても onChange は 1 回だけ', () => {
    const { lock } = setup();
    let n = 0;
    lock.onChange(() => n++);
    lock.simulate(true);
    lock.simulate(true);
    expect(n).toBe(1);
  });
});

describe('MouseLook', () => {
  it('ロックなしでは動かしても consume は 0', () => {
    const { inputHook, look } = setup();
    inputHook.look(100, 50);
    expect(look.consume()).toEqual({ dx: 0, dy: 0 });
  });

  it('ロック中はたまり、consume で返して 0 に戻る', () => {
    const { lockHook, inputHook, look } = setup();
    lockHook.simulate(true);
    inputHook.look(10, 5);
    inputHook.look(-3, 2);
    expect(look.consume()).toEqual({ dx: 7, dy: 7 });
    expect(look.consume()).toEqual({ dx: 0, dy: 0 });
  });

  it('ロックが外れると、たまっていた分はすてられる', () => {
    const { lockHook, inputHook, look } = setup();
    lockHook.simulate(true);
    inputHook.look(10, 10);
    lockHook.simulate(false);
    lockHook.simulate(true);
    expect(look.consume()).toEqual({ dx: 0, dy: 0 });
  });

  it('数でない値は無視する', () => {
    const { lockHook, inputHook, look } = setup();
    lockHook.simulate(true);
    inputHook.look(Number.NaN, 1);
    expect(look.consume()).toEqual({ dx: 0, dy: 0 });
  });
});

describe('input フック', () => {
  it('press/release/held/releaseAll', () => {
    const { inputHook } = setup();
    inputHook.press('moveForward');
    inputHook.press('jump');
    expect(inputHook.held()).toEqual(['moveForward', 'jump']);
    inputHook.release('jump');
    expect(inputHook.held()).toEqual(['moveForward']);
    inputHook.releaseAll();
    expect(inputHook.held()).toEqual([]);
  });

  it('知らない Action はエラー', () => {
    const { inputHook } = setup();
    expect(() => inputHook.press('fly')).toThrow();
  });
});

describe('案内画面の HTML', () => {
  it('漢字がない（ふりがなのない漢字も残らない）', () => {
    for (const t of [INPUT_CONFIG.textFirst, INPUT_CONFIG.textResume]) {
      expect(findUnrubiedKanji(buildOverlayHtml(t))).toEqual([]);
    }
  });

  it('ボタンの文字と「あそびかたの ほん」ボタンが入る（操作の説明は 本の中。BOOK-1）', () => {
    const html = buildOverlayHtml(INPUT_CONFIG.textFirst);
    expect(html).toContain('クリックして あそぼう！');
    expect(html).toContain('あそびかたの ほん');
    expect(html).toContain('data-book-open');
  });

  it('大きさの設定が仕様どおり（512 / 96 / 32 / 20）', () => {
    expect(INPUT_CONFIG.buttonMinWidthPx).toBeGreaterThanOrEqual(512);
    expect(INPUT_CONFIG.buttonMinHeightPx).toBeGreaterThanOrEqual(96);
    expect(INPUT_CONFIG.buttonFontPx).toBeGreaterThanOrEqual(32);
    expect(INPUT_CONFIG.captionFontPx).toBeGreaterThanOrEqual(20);
  });
});
