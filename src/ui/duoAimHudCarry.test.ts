import { describe, expect, it } from 'vitest';
import type { ActionHintCtx } from './actionHintModel';
import { actionHintView, fillHintCtx, type DuoHintInput } from './duoAimHud';

/** 5f-1 × 5c: 2P が にわとりを だっこ して いる とき の ヒント（1P の step.ts の 形と そろえる） */
const base = (): DuoHintInput => ({
  who: 2, duo: true, hintOn: true, playing: true, crosshairVisible: true, down: false,
  open: { inventory: false, coopMenu: false, book: false }, right: { kind: 'putDown', item: null }, left: 'dig',
  ctx: { held: null, heldIsPickaxe: false, heldIsBlade: false }, padIndex: 1, lastInput: 'gamepad',
});
const hand = { item: null, kind: 'none' };

describe('2P の だっこ中の ヒント（fillHintCtx）', () => {
  it('だっこ中は ヒントの 左に「ほる」が 出ず、だっこの わ（progress）が 渡る', () => {
    const i = base();
    fillHintCtx(i.ctx, hand, 0.5, true);
    const v = actionHintView(i)!;
    expect(v.left).toBeUndefined();
    expect(v.right).toEqual({ icon: 'carry', word: 'だっこ' });
    expect(v.progress).toBeCloseTo(0.5);
  });

  it('だっこして いなければ 左に「ほる」が 出る（わ なし）', () => {
    const i = base();
    fillHintCtx(i.ctx, hand, 0, false);
    const v = actionHintView(i)!;
    expect(v.left?.word).toBe('ほる');
    expect(v.progress).toBeUndefined();
  });

  it('同じ 入れものを 毎ステップ 書きかえる（だっこを おろした ら 前の 値が のこらない）', () => {
    const ctx: ActionHintCtx = { held: null, heldIsPickaxe: false, heldIsBlade: false };
    fillHintCtx(ctx, { item: 'wood_pickaxe', kind: 'pickaxe' }, 0.3, true);
    expect(ctx).toMatchObject({ held: 'wood_pickaxe', heldIsPickaxe: true, heldIsBlade: false, carryProgress: 0.3, carrying: true });
    fillHintCtx(ctx, hand, 0, false);
    expect(ctx).toMatchObject({ held: null, heldIsPickaxe: false, carryProgress: 0, carrying: false });
  });
});
