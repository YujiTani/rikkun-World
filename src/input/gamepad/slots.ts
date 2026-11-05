import { ActionState } from '../actions';

/**
 * GAMEPAD-1: プレイヤースロット（まずは 1）。2P 時は配列を伸ばす。
 * Phase 0 では slot 0 の ActionState を Game.input と同一参照にする。
 */
export class PlayerInputSlots {
  readonly slots: ActionState[];
  constructor(primary: ActionState, extra = 0) {
    this.slots = [primary];
    for (let i = 0; i < extra; i++) this.slots.push(new ActionState());
  }
  get(i: number): ActionState {
    return this.slots[i] ?? this.slots[0]!;
  }
}
