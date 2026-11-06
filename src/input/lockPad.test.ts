import { describe, expect, it } from 'vitest';
import { LockController } from './lockController';

describe('GAMEPAD-1: padActive', () => {
  it('パッド中はロック無しでも時間と遊び入力が許可され案内は出ない', () => {
    const lock = new LockController();
    expect(lock.overlayVisible()).toBe(true);
    expect(lock.realtimeAllowed()).toBe(false);
    expect(lock.playInputEnabled()).toBe(false);
    lock.setPadActive(true);
    expect(lock.overlayVisible()).toBe(false);
    expect(lock.realtimeAllowed()).toBe(true);
    expect(lock.playInputEnabled()).toBe(true);
    lock.setInventoryOpen(true);
    expect(lock.playInputEnabled()).toBe(false);
    expect(lock.realtimeAllowed()).toBe(true);
  });

  it('スタートメニューはパッド中でも案内を出して遊びと時間を止める', () => {
    const lock = new LockController();
    lock.setPadActive(true);
    lock.setPauseMenu(true);
    expect(lock.overlayVisible()).toBe(true);
    expect(lock.playInputEnabled()).toBe(false);
    expect(lock.realtimeAllowed()).toBe(false);
    lock.setPauseMenu(false);
    expect(lock.overlayVisible()).toBe(false);
    expect(lock.playInputEnabled()).toBe(true);
  });
});
