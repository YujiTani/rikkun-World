import { describe, expect, it } from 'vitest';
import { createGameModal, type ModalParts } from './modalTick';

/**
 * COOP-1 4a（AC75・AC84 の 直し）: 世界を 止める 画面は 本と 建築士さん（HOUSE-1A）の 2 つ だけ。
 * 2 人で 1P の 全面の もちもの画面が 世界を 止める 道（AC84）は なくなった ので、ModalParts から
 * `duoFrozen`・`padStep`・`inventoryUiTick` を なくす（もちもの画面は 世界を 止めない。updaters が 動くので 画面まわりも 1P の パッドも そこで 回る）。
 * 残る 部品: bookActive／bookTick／bookRender／houseFrozen／houseTick／houseRender／duoModalTick（2P の 側の「ちょっと まってね」などの 1 コマ）。
 */
function make(over: Partial<ModalParts> = {}) {
  const calls: string[] = [];
  const parts: ModalParts = {
    bookActive: () => false,
    bookTick: () => calls.push('book'),
    bookRender: () => calls.push('bookRender'),
    houseFrozen: () => false,
    houseTick: () => calls.push('house'),
    houseRender: () => calls.push('houseRender'),
    duoModalTick: () => calls.push('duo'),
    ...over,
  };
  return { modal: createGameModal(parts), calls };
}

describe('createGameModal（COOP-1 4a。世界を 止めるのは 本・建築士さん だけ）', () => {
  it('どちらも 開いて いなければ modal は 動かない（2 人で もちもの画面を 開いても 止めない）', () => {
    const { modal, calls } = make();
    expect(modal.active()).toBe(false);
    expect(calls).toEqual([]); // Game は active でない modal の tick を 呼ばない
  });

  it('本が 開いている あいだ: active。tick は 本の 1 コマと 2P の 側の 1 コマ', () => {
    const { modal, calls } = make({ bookActive: () => true });
    expect(modal.active()).toBe(true);
    modal.tick(true);
    expect(calls).toEqual(['book', 'duo']);
  });

  it('建築士さんの あいだ: active。tick は 建築士さんの 1 コマと 2P の 側の 1 コマ', () => {
    const { modal, calls } = make({ houseFrozen: () => true });
    expect(modal.active()).toBe(true);
    modal.tick(false);
    expect(calls).toEqual(['house', 'duo']);
  });

  it('もちもの画面まわり・パッドを 読む 道は modal に ない（古い 部品を 残さない）', () => {
    // 古い 部品（duoFrozen）を 渡しても 世界は 止まらない。型でも 落とす: ModalParts に これらは ない
    // @ts-expect-error duoFrozen は 4a で なくなった
    const bad: ModalParts = { bookActive: () => false, bookTick() {}, bookRender() {}, houseFrozen: () => false, houseTick() {}, houseRender() {}, duoFrozen: () => true, duoModalTick() {} };
    expect(createGameModal(bad).active()).toBe(false);
  });
});
