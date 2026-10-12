import { describe, expect, it } from 'vitest';
import { ActionState, DEFAULT_KEY_BINDINGS } from './actions';
import { WheelAccumulator } from './wheel';

function setup(enabled = true) {
  const actions = new ActionState();
  const presses: string[] = [];
  actions.onPress((a) => presses.push(a));
  const gate = { on: enabled };
  const wheel = new WheelAccumulator(actions, () => gate.on);
  return { actions, presses, wheel, gate };
}

describe('WheelAccumulator', () => {
  it('50 ごとに 1 マス。下 = hotbarNext、上 = hotbarPrev', () => {
    const { wheel, presses } = setup();
    wheel.push(50);
    wheel.push(-50);
    expect(presses).toEqual(['hotbarNext', 'hotbarPrev']);
  });

  it('20 を 2 回では動かず、3 回目で 1 つ進む', () => {
    const { wheel, presses } = setup();
    wheel.push(20);
    wheel.push(20);
    expect(presses).toEqual([]);
    wheel.push(20);
    expect(presses).toEqual(['hotbarNext']);
  });

  it('大きく回すと何マスも動く（トラックパッドの小さな動きでは飛ばない）', () => {
    const { wheel, presses } = setup();
    wheel.push(160);
    expect(presses).toHaveLength(3);
    wheel.push(1);
    wheel.push(1);
    expect(presses).toHaveLength(3);
  });

  it('向きが変わったらためた量を捨てる', () => {
    const { wheel, presses } = setup();
    wheel.push(40);
    wheel.push(-40);
    expect(presses).toEqual([]);
  });

  it('行単位は 1 行 = 1 マス、ロックなしのあいだは無視してためた量も捨てる', () => {
    const { wheel, presses, gate } = setup();
    wheel.pushEvent(1, 1);
    expect(presses).toEqual(['hotbarNext']);
    wheel.push(40);
    gate.on = false;
    wheel.push(500);
    gate.on = true;
    wheel.push(40);
    expect(presses).toEqual(['hotbarNext']);
  });

  it('押したあとは離れているので、押しっぱなしにならない', () => {
    const { wheel, actions } = setup();
    wheel.push(50);
    expect(actions.wasPressed('hotbarNext')).toBe(true);
    expect(actions.isHeld('hotbarNext')).toBe(false);
  });
});

describe('M2 のキー', () => {
  it('数字キー 1〜9・E・Esc が Action に結びついている', () => {
    for (let n = 1; n <= 9; n++) expect(DEFAULT_KEY_BINDINGS[`Digit${n}`]).toBe(`hotbar${n}`);
    expect(DEFAULT_KEY_BINDINGS.KeyE).toBe('toggleInventory');
    expect(DEFAULT_KEY_BINDINGS.Escape).toBe('closeMenu');
  });
});
