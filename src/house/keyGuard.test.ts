import { describe, expect, it, vi } from 'vitest';
import { houseKeyGuard, type KeyLike } from './keyGuard';

/** HOUSE-1 §2.6・AC14: 字を えらぶ 画面〔エディター・なまえを かえる の 名前の 画面〕では Esc いがいの キーを ゲームに とどけない */

function key(k: string, o: Partial<KeyLike> = {}) {
  const e = { key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, stopImmediatePropagation: vi.fn(), preventDefault: vi.fn(), ...o };
  return e;
}
function make(typing: boolean) {
  const house = { typing: () => typing, escape: vi.fn(), press: vi.fn() };
  return { house, guard: houseKeyGuard(house) };
}

describe('houseKeyGuard', () => {
  it('字を えらぶ 画面の 間: W・E・Q・数字などは ゲームに とどけない（止める）。Esc は 画面の 順で とじ、Backspace は 1 もじ けす', () => {
    const { house, guard } = make(true);
    for (const k of ['w', 'e', 'q', '1', ' ', 'Enter']) {
      const e = key(k);
      guard(e);
      expect(e.stopImmediatePropagation, k).toHaveBeenCalled();
      expect(e.preventDefault, k).toHaveBeenCalled();
    }
    expect(house.escape).not.toHaveBeenCalled();
    expect(house.press).not.toHaveBeenCalled();
    const esc = key('Escape');
    guard(esc);
    expect(house.escape).toHaveBeenCalledTimes(1);
    expect(esc.stopImmediatePropagation).toHaveBeenCalled();
    guard(key('Backspace'));
    expect(house.press).toHaveBeenCalledWith('erase');
  });

  it('押しっぱなし（repeat）の Esc・Backspace は 1 回しか 働かない（止めは する）', () => {
    const { house, guard } = make(true);
    const e = key('Backspace', { repeat: true });
    guard(e);
    expect(house.press).not.toHaveBeenCalled();
    expect(e.stopImmediatePropagation).toHaveBeenCalled();
  });

  it('Ctrl・Cmd・Alt の 組み合わせと F1〜F12 は そのまま 通す', () => {
    const { guard } = make(true);
    for (const e of [key('r', { ctrlKey: true }), key('r', { metaKey: true }), key('Tab', { altKey: true }), key('F3'), key('F12')]) {
      guard(e);
      expect(e.stopImmediatePropagation, e.key).not.toHaveBeenCalled();
    }
  });

  it('画面が 開いて いない 間は 何も しない', () => {
    const { house, guard } = make(false);
    const e = key('Escape');
    guard(e);
    expect(e.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(house.escape).not.toHaveBeenCalled();
  });

  it('上空の 視点: Enter は 決定（ゲームに とどけない）。矢印・WASD・Esc は 通す。押しっぱなしは 1 回だけ', () => {
    const skyDecide = vi.fn();
    const guard = houseKeyGuard({ typing: () => false, escape: vi.fn(), press: vi.fn(), skying: () => true, skyDecide });
    const enter = key('Enter', { code: 'Enter' } as Partial<KeyLike>);
    guard(enter);
    expect(skyDecide).toHaveBeenCalledTimes(1);
    expect(enter.stopImmediatePropagation).toHaveBeenCalled();
    guard(key('Enter', { code: 'NumpadEnter', repeat: true } as Partial<KeyLike>));
    expect(skyDecide).toHaveBeenCalledTimes(1);
    for (const k of ['ArrowLeft', 'w', 'Escape']) {
      const e = key(k);
      guard(e);
      expect(e.stopImmediatePropagation, k).not.toHaveBeenCalled();
    }
  });

  it('上空の 視点で ない ときの Enter は さわらない', () => {
    const skyDecide = vi.fn();
    const guard = houseKeyGuard({ typing: () => false, escape: vi.fn(), press: vi.fn(), skying: () => false, skyDecide });
    const e = key('Enter', { code: 'Enter' } as Partial<KeyLike>);
    guard(e);
    expect(skyDecide).not.toHaveBeenCalled();
    expect(e.stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
