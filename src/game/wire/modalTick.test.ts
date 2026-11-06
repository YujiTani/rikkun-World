import { describe, expect, it } from 'vitest';
import { createGameModal, type ModalParts } from './modalTick';

function make(over: Partial<ModalParts> = {}) {
  const calls: string[] = [];
  const parts: ModalParts = {
    bookActive: () => false,
    bookTick: () => calls.push('book'),
    bookRender: () => calls.push('bookRender'),
    houseFrozen: () => false,
    houseTick: () => calls.push('house'),
    houseRender: () => calls.push('houseRender'),
    duoFrozen: () => true,
    padStep: () => calls.push('pad'),
    inventoryUiTick: () => calls.push('inv'),
    duoModalTick: () => calls.push('duo'),
    ...over,
  };
  return { modal: createGameModal(parts), calls };
}

describe('createGameModal（COOP-1 AC84・2 人で 1P の 全面の もちもの画面）', () => {
  it('modal の tick から もちもの画面まわりが 1 コマに 1 回 呼ばれる（開いた コマにも）', () => {
    const { modal, calls } = make();
    modal.tick(true);
    expect(calls.filter((c) => c === 'inv')).toHaveLength(1);
    modal.tick(true);
    expect(calls.filter((c) => c === 'inv')).toHaveLength(2);
  });

  it('1 人の ときは modal が 動かない（active が false）ので updaters からだけ', () => {
    const { modal, calls } = make({ duoFrozen: () => false });
    expect(modal.active()).toBe(false);
    expect(calls).toEqual([]); // Game は active でない modal の tick を 呼ばない
  });

  it('本・建築士さんの あいだは もちもの画面まわりを 呼ばない', () => {
    const a = make({ bookActive: () => true });
    a.modal.tick(true);
    expect(a.calls).toEqual(['book', 'duo']);
    const b = make({ houseFrozen: () => true });
    b.modal.tick(false);
    expect(b.calls).toEqual(['house', 'duo']);
  });

  it('実時間の コマ（inFrame）では パッドを 読まない（idle が 1 回 読む）。step() の 道では 毎 tick 読む', () => {
    const { modal, calls } = make();
    modal.tick(true);
    modal.tick(true);
    modal.tick(true);
    expect(calls.filter((c) => c === 'pad')).toHaveLength(0);
    modal.tick();
    modal.tick(false);
    expect(calls.filter((c) => c === 'pad')).toHaveLength(2);
  });
});
