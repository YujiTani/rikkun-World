import { describe, expect, it } from 'vitest';
import { ActionState } from '../input/actions';
import { LockController } from '../input/lockController';
import { createScreenSettings } from './config';
import { ScreenController } from './ScreenController';

function setup() {
  const lock = new LockController();
  const actions = new ActionState();
  const log: string[] = [];
  const platform = {
    request: () => log.push('request'),
    release: () => {
      log.push('release');
      // 本物: 外れたことがあとから届く
      lock.setReal(false);
    },
  };
  const inventory = { returnCursor: () => log.push('returnCursor') };
  const screen = new ScreenController(lock, inventory, actions, createScreenSettings(), platform);
  return { lock, actions, screen, log };
}

const tap = (a: ActionState, name: 'toggleInventory' | 'closeMenu') => {
  a.press(name);
  a.release(name);
};

describe('ScreenController（テスト用の擬似ロック）', () => {
  it('ロックなしでは案内（時間 0）。E は無視する', () => {
    const { screen, actions, lock } = setup();
    expect(screen.mode()).toBe('guide');
    expect(screen.timeScale()).toBe(0);
    tap(actions, 'toggleInventory');
    expect(screen.inventoryOpen()).toBe(false);
    expect(lock.overlayVisible()).toBe(true);
  });

  it('E で開く: 案内は出ず、ロックは外れ、時間は 1/4。もう一度 E で閉じてロック中に戻る', () => {
    const { screen, actions, lock } = setup();
    lock.simulate(true);
    expect(screen.mode()).toBe('play');
    expect(screen.timeScale()).toBe(1);
    tap(actions, 'toggleInventory');
    expect(screen.inventoryOpen()).toBe(true);
    expect(screen.mode()).toBe('inventory');
    expect(screen.timeScale()).toBe(0.25);
    expect(lock.locked()).toBe(false);
    expect(lock.overlayVisible()).toBe(false);
    expect(lock.playInputEnabled()).toBe(false);
    expect(lock.realtimeAllowed()).toBe(true);
    tap(actions, 'toggleInventory');
    expect(screen.inventoryOpen()).toBe(false);
    expect(lock.locked()).toBe(true);
    expect(lock.overlayVisible()).toBe(false);
    expect(screen.timeScale()).toBe(1);
  });

  it('Esc で閉じると案内（つづき）が出て時間は止まる', () => {
    const { screen, actions, lock } = setup();
    lock.simulate(true);
    tap(actions, 'toggleInventory');
    tap(actions, 'closeMenu');
    expect(screen.inventoryOpen()).toBe(false);
    expect(lock.locked()).toBe(false);
    expect(lock.overlayVisible()).toBe(true);
    expect(lock.overlayText()).toBe('クリックして つづきを あそぼう！');
    expect(lock.realtimeAllowed()).toBe(false);
    expect(screen.timeScale()).toBe(0);
  });

  it('Esc は画面が閉じているときは何もしない', () => {
    const { screen, actions, lock } = setup();
    lock.simulate(true);
    tap(actions, 'closeMenu');
    expect(screen.mode()).toBe('play');
  });

  it('開いているあいだ押していた Action ははなされ、閉じるときカーソルが戻る', () => {
    const { actions, lock, log } = setup();
    lock.simulate(true);
    actions.press('primary');
    tap(actions, 'toggleInventory');
    expect(actions.isHeld('primary')).toBe(false);
    tap(actions, 'toggleInventory');
    expect(log).toContain('returnCursor');
  });

  it('閉じたことを知らせる（自動セーブ用）', () => {
    const { actions, lock, screen } = setup();
    let n = 0;
    screen.onClose(() => n++);
    lock.simulate(true);
    tap(actions, 'toggleInventory');
    tap(actions, 'toggleInventory');
    expect(n).toBe(1);
  });
});

describe('ScreenController（本物のロック）', () => {
  it('開くときロックを外し、閉じるとかけ直す。返事が来るまで案内は出さない', () => {
    const { screen, actions, lock, log } = setup();
    lock.setReal(true);
    tap(actions, 'toggleInventory');
    expect(log).toEqual(['release']);
    expect(lock.overlayVisible()).toBe(false);
    tap(actions, 'toggleInventory');
    expect(log).toEqual(['release', 'returnCursor', 'request']);
    expect(lock.overlayVisible()).toBe(false);
    expect(screen.timeScale()).toBe(1);
    lock.setReal(true);
    expect(lock.playInputEnabled()).toBe(true);
  });

  it('かけ直しがだめだったら案内（つづき）を出して時間を止める', () => {
    const { screen, actions, lock } = setup();
    lock.setReal(true);
    tap(actions, 'toggleInventory');
    tap(actions, 'toggleInventory');
    lock.endRelock();
    expect(lock.overlayVisible()).toBe(true);
    expect(screen.timeScale()).toBe(0);
  });

  it('Esc で閉じるとかけ直さず案内を出す', () => {
    const { actions, lock, log } = setup();
    lock.setReal(true);
    tap(actions, 'toggleInventory');
    tap(actions, 'closeMenu');
    expect(log).not.toContain('request');
    expect(lock.overlayVisible()).toBe(true);
  });
});

describe('おめでとう画面の止まる状態（M6）', () => {
  it('出すと 時間 0・ロックが外れる・案内は出ない。キーは無視。閉じるとロックをかけ直す', () => {
    const { screen, actions, lock, log } = setup();
    lock.simulate(true);
    screen.openModal();
    expect(screen.modalOpen()).toBe(true);
    expect(screen.mode()).toBe('celebrate');
    expect(screen.timeScale()).toBe(0);
    expect(lock.locked()).toBe(false);
    expect(lock.overlayVisible()).toBe(false);
    expect(lock.playInputEnabled()).toBe(false);
    tap(actions, 'toggleInventory');
    tap(actions, 'closeMenu');
    expect(screen.inventoryOpen()).toBe(false);
    expect(screen.mode()).toBe('celebrate');
    screen.toggle();
    screen.closeToGuide();
    expect(screen.mode()).toBe('celebrate');
    expect(log).toContain('release');
    screen.closeModal();
    expect(screen.modalOpen()).toBe(false);
    expect(screen.mode()).toBe('play');
    expect(screen.timeScale()).toBe(1);
    expect(lock.locked()).toBe(true);
  });

  it('もちもの画面が開いていたら 閉じたあと もちもの画面にもどる（ロックはかけない）', () => {
    const { screen, actions, lock } = setup();
    lock.simulate(true);
    tap(actions, 'toggleInventory');
    expect(screen.mode()).toBe('inventory');
    screen.openModal();
    expect(screen.mode()).toBe('celebrate');
    expect(screen.timeScale()).toBe(0);
    screen.closeModal();
    expect(screen.mode()).toBe('inventory');
    expect(screen.inventoryOpen()).toBe(true);
    expect(screen.timeScale()).toBe(0.25);
    expect(lock.locked()).toBe(false);
    expect(lock.overlayVisible()).toBe(false);
  });

  it('本物のロックがことわられたら lockDenied（札用）。relock でかけ直す', () => {
    const lock = new LockController();
    const actions = new ActionState();
    const log: string[] = [];
    const platform = {
      request: () => log.push('request'),
      release: () => lock.setReal(false),
    };
    const screen = new ScreenController(lock, { returnCursor: () => undefined }, actions, createScreenSettings(), platform);
    lock.setReal(true);
    screen.openModal();
    screen.closeModal();
    expect(log).toContain('request');
    expect(screen.lockDenied()).toBe(false); // 返事待ちのあいだは 札を出さない
    lock.endRelock(); // ことわられた
    expect(screen.lockDenied()).toBe(true);
    screen.relock();
    lock.setReal(true);
    expect(screen.lockDenied()).toBe(false);
    expect(screen.mode()).toBe('play');
  });
});
