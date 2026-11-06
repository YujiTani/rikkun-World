import { describe, expect, it } from 'vitest';
import { ActionState } from '../actions';
import { applyDeadZone } from './binds';
import { detectMappingKind, faceTable } from './mapping';
import { AlwaysLook, GamepadReader } from './reader';

function fakePad(opts: {
  id?: string;
  mapping?: GamepadMappingType;
  buttons?: boolean[];
  axes?: number[];
  index?: number;
}): Gamepad {
  const buttons = (opts.buttons ?? Array(16).fill(false)).map((pressed) => ({
    pressed,
    touched: pressed,
    value: pressed ? 1 : 0,
  }));
  return {
    id: opts.id ?? 'Xbox Controller (STANDARD GAMEPAD Vendor: 045e)',
    index: opts.index ?? 0,
    connected: true,
    mapping: opts.mapping ?? 'standard',
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons: buttons as Gamepad['buttons'],
    timestamp: 0,
    vibrationActuator: undefined as unknown as GamepadHapticActuator,
  } as unknown as Gamepad;
}

describe('applyDeadZone', () => {
  it('デッドゾーン内は 0', () => {
    expect(applyDeadZone(0.1, 0.24)).toBe(0);
    expect(applyDeadZone(-0.2, 0.24)).toBe(0);
  });
  it('外は伸ばす', () => {
    expect(applyDeadZone(1, 0.24)).toBeCloseTo(1);
    expect(applyDeadZone(0.62, 0.24)).toBeGreaterThan(0.4);
  });
});

describe('detectMappingKind', () => {
  it('standard', () => {
    expect(detectMappingKind({ id: 'x', mapping: 'standard' })).toBe('standard');
  });
  it('Switch 風 id', () => {
    expect(detectMappingKind({ id: 'Pro Controller (Vendor: 057e Product: 2009)', mapping: '' })).toBe('switch');
    expect(detectMappingKind({ id: 'Wireless Gamepad', mapping: '' })).toBe('switch');
  });
  it('予備', () => {
    expect(detectMappingKind({ id: 'Unknown Thing', mapping: '' })).toBe('fallback');
  });
});

describe('GamepadReader', () => {
  it('standard: ZR で primary', () => {
    const actions = new ActionState();
    const look = new AlwaysLook();
    const reader = new GamepadReader(actions, look, null);
    let pad = fakePad({ buttons: Array(16).fill(false) });
    reader.getPads = () => [pad];
    reader.bootstrap();
    reader.poll(0);
    expect(actions.isHeld('primary')).toBe(false);
    const btns = Array(16).fill(false);
    btns[7] = true; // RT/ZR
    pad = fakePad({ buttons: btns });
    reader.getPads = () => [pad];
    reader.poll(16);
    expect(actions.isHeld('primary')).toBe(true);
  });

  it('Switch 風 mapping 空でも面ボタンが届く', () => {
    const actions = new ActionState();
    const look = new AlwaysLook();
    const reader = new GamepadReader(actions, look, null);
    const btns = Array(16).fill(false);
    btns[0] = true; // faceBottom → jump
    const pad = fakePad({
      id: 'Pro Controller (Vendor: 057e Product: 2009)',
      mapping: '',
      buttons: btns,
    });
    reader.getPads = () => [pad];
    reader.bootstrap();
    expect(detectMappingKind(pad)).toBe('switch');
    expect(faceTable('switch')[0]).toBe('faceBottom');
    reader.poll(0);
    // first poll sees pressed without prev → press
    expect(actions.isHeld('jump')).toBe(true);
  });

  it('デッドゾーン内スティックは動かない', () => {
    const actions = new ActionState();
    const look = new AlwaysLook();
    const reader = new GamepadReader(actions, look, null);
    const pad = fakePad({ axes: [0.1, -0.1, 0, 0] });
    reader.getPads = () => [pad];
    reader.bootstrap();
    reader.poll(0);
    expect(actions.isHeld('moveForward')).toBe(false);
    expect(actions.isHeld('moveRight')).toBe(false);
  });

  it('ななめは正規化（両方向同時でも暴発しない程度に動く）', () => {
    const actions = new ActionState();
    const look = new AlwaysLook();
    const reader = new GamepadReader(actions, look, null);
    const pad = fakePad({ axes: [0.9, -0.9, 0, 0] });
    reader.getPads = () => [pad];
    reader.bootstrap();
    reader.poll(0);
    expect(actions.isHeld('moveForward')).toBe(true);
    expect(actions.isHeld('moveRight')).toBe(true);
  });

  it('抜くと release', () => {
    const actions = new ActionState();
    const look = new AlwaysLook();
    const reader = new GamepadReader(actions, look, null);
    const btns = Array(16).fill(false);
    btns[7] = true;
    let pad: Gamepad | null = fakePad({ buttons: btns });
    reader.getPads = () => [pad];
    reader.bootstrap();
    reader.poll(0);
    expect(actions.isHeld('primary')).toBe(true);
    pad = null;
    reader.getPads = () => [null];
    reader.poll(20);
    expect(actions.isHeld('primary')).toBe(false);
  });

  it('右スティックで look', () => {
    const actions = new ActionState();
    const look = new AlwaysLook();
    const reader = new GamepadReader(actions, look, null);
    const pad = fakePad({ axes: [0, 0, 0.8, 0] });
    reader.getPads = () => [pad];
    reader.bootstrap();
    reader.poll(0);
    const c = look.consume();
    expect(c.dx).toBeGreaterThan(0);
  });
});

describe('GamepadReader: 後追いの直し', () => {
  function setup(opts: { id?: string; mapping?: GamepadMappingType; storage?: Storage | null } = {}) {
    const actions = new ActionState();
    const look = new AlwaysLook();
    const reader = new GamepadReader(actions, look, opts.storage ?? null);
    const mk = (btn: number[] = [], axes = [0, 0, 0, 0]) => {
      const b = Array(16).fill(false);
      for (const i of btn) b[i] = true;
      return fakePad({ id: opts.id, mapping: opts.mapping, buttons: b, axes });
    };
    const set = (pad: Gamepad) => {
      reader.getPads = () => [pad];
    };
    set(mk());
    reader.bootstrap();
    reader.poll(0);
    return { actions, look, reader, mk, set };
  }

  it('押したときの Action をはなす（途中でメニューが開いても）', () => {
    const { actions, reader, mk, set } = setup();
    set(mk([1])); // faceRight → run
    reader.poll(16);
    expect(actions.isHeld('run')).toBe(true);
    reader.setMenuOpen(true);
    set(mk([]));
    reader.poll(32);
    expect(actions.isHeld('run')).toBe(false);
    expect(actions.isHeld('closeMenu')).toBe(false);
  });

  it('hanging が途中で変わっても ropeDown が残らない / releaseAll でも', () => {
    const { actions, reader, mk, set } = setup();
    reader.setHanging(true);
    set(mk([1]));
    reader.poll(16);
    expect(actions.isHeld('ropeDown')).toBe(true);
    reader.setHanging(false);
    reader.releaseAllPadActions();
    expect(actions.isHeld('ropeDown')).toBe(false);
  });

  it('知らない機種(予備)で割り当て前は、面・肩ボタンは出さず、スティックだけ有効', () => {
    const { actions, look, reader, mk, set } = setup({ id: 'Generic USB Joystick', mapping: '' });
    set(mk([0, 7], [0.9, 0, 0.9, 0]));
    reader.poll(16);
    expect(actions.isHeld('jump')).toBe(false);
    expect(actions.isHeld('primary')).toBe(false);
    expect(actions.isHeld('moveRight')).toBe(true);
    expect(look.consume().dx).toBeGreaterThan(0);
  });

  it('知らない機種でも、割り当て直し(保存)したあとは面ボタンが使える', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    const first = setup({ id: 'Generic USB Joystick', mapping: '', storage });
    first.reader.setBind('faceBottom', 'jump');
    first.reader.persistBinds();
    const again = setup({ id: 'Generic USB Joystick', mapping: '', storage });
    again.set(again.mk([0]));
    again.reader.poll(16);
    expect(again.actions.isHeld('jump')).toBe(true);
  });
});

