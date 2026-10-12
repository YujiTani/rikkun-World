import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { DigEvent, DigState, DigSystem, TargetInfo } from '../contracts';
import { ComboTracker } from './combo';
import { blockColor } from './color';
import { FX_SETTINGS, type FxSettings } from './config';
import { crackDotCount } from './crack';
import { DigFx } from './DigFx';
import { SoundFx, type AudioLike } from './sound';

const DT = 1 / 60;

describe('ひび', () => {
  it('だんかいが上がるほど線がふえる（3 だんかい）', () => {
    expect(crackDotCount(1)).toBeGreaterThan(3);
    expect(crackDotCount(2)).toBeGreaterThan(crackDotCount(1));
    expect(crackDotCount(3)).toBeGreaterThan(crackDotCount(2));
    expect(crackDotCount(9)).toBe(crackDotCount(3));
  });
});

describe('連続ボーナス', () => {
  const mk = () =>
    new ComboTracker(
      () => 1,
      () => 12,
      () => 2.5,
    );
  it('同じものを続けると 1 回ごとに高くなり、ちがうものでは元に戻る', () => {
    const c = mk();
    expect(c.hit('dirt')).toBe(0);
    expect(c.hit('dirt')).toBe(1);
    expect(c.hit('dirt')).toBe(2);
    expect(c.hit('stone')).toBe(0);
  });
  it('上限と、時間がたつと元に戻る', () => {
    const c = mk();
    for (let i = 0; i < 30; i++) c.hit('dirt');
    expect(c.hit('dirt')).toBe(12);
    c.update(3);
    expect(c.hit('dirt')).toBe(0);
  });
});

describe('色', () => {
  it('ブロックごとにちがう色', () => {
    expect(blockColor('dirt')).not.toBe(blockColor('stone'));
    expect(blockColor('dirt')).toBe(blockColor('dirt'));
  });
});

function fakeAudio() {
  const freqs: number[] = [];
  const peaks: number[] = [];
  const ctx: AudioLike = {
    currentTime: 0,
    destination: {},
    createOscillator: () => ({
      type: 'sine',
      frequency: {
        value: 0,
        setValueAtTime: (v: number) => void freqs.push(v),
        exponentialRampToValueAtTime: () => undefined,
      },
      connect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
    }),
    createGain: () => ({
      gain: {
        value: 0,
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: (v: number) => void peaks.push(v),
        exponentialRampToValueAtTime: () => undefined,
      },
      connect: () => undefined,
    }),
  };
  return { ctx, freqs, peaks };
}

describe('音', () => {
  it('音量 0 なら鳴らさない・音量を上げると大きくなる', () => {
    const a = fakeAudio();
    const s: FxSettings = { ...FX_SETTINGS, fxVolume: 0 };
    const snd = new SoundFx(() => a.ctx, s);
    snd.play('break');
    expect(snd.played).toBe(0);
    s.fxVolume = 0.2;
    snd.play('place');
    const small = a.peaks[0];
    s.fxVolume = 1;
    snd.play('place');
    expect(a.peaks[1]).toBeGreaterThan(small);
    expect(a.peaks[1]).toBeLessThanOrEqual(0.3); // 大きすぎない
  });
  it('半音ぶん高くなる', () => {
    const a = fakeAudio();
    const snd = new SoundFx(() => a.ctx, { ...FX_SETTINGS });
    snd.play('pickup', 0);
    snd.play('pickup', 12);
    expect(a.freqs[2] / a.freqs[0]).toBeCloseTo(2, 5);
  });
  it('AudioContext が無くてもこわれない', () => {
    const snd = new SoundFx(() => null, { ...FX_SETTINGS });
    expect(() => snd.play('break')).not.toThrow();
  });
});

class FakeDig implements DigSystem {
  tgt: TargetInfo | null = null;
  st: DigState = { active: false, block: null, progress: 0, crackStage: 0, ready: false, blockedReason: null };
  events: DigEvent[] = [];
  target() {
    return this.tgt;
  }
  state() {
    return this.st;
  }
  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  peekEvents() {
    return this.events;
  }
}

function setup(over: Partial<FxSettings> = {}) {
  const dig = new FakeDig();
  const names: string[] = [];
  const sound = new SoundFx(() => null, { ...FX_SETTINGS });
  sound.play = (n) => void names.push(n);
  const signals: string[] = [];
  const shakes: Array<[number, number]> = [];
  const picks: string[] = [];
  const swings = { n: 0 };
  const fx = new DigFx({
    scene: new THREE.Scene(),
    dig,
    sound,
    doll: { swing: () => swings.n++, setDigging: () => undefined },
    view: { setShake: (y, p) => shakes.push([y, p]) },
    notice: { showSignal: (k) => void signals.push(k) },
    onPickup: (i) => void picks.push(i),
    settings: { ...FX_SETTINGS, ...over },
  });
  return { dig, fx, names, signals, shakes, picks, swings };
}

const B = { x: 4, y: 10, z: 6 };
const TGT: TargetInfo = {
  block: B,
  id: 'dirt',
  face: { x: -1, y: 0, z: 0 },
  place: { x: 3, y: 10, z: 6 },
  distance: 1.5,
};

describe('DigFx', () => {
  it('こわれる: ぷくっ → はじける四角、ゆれ、音、アイテムが入った', () => {
    const t = setup();
    t.dig.events.push({ type: 'break', tick: 1, block: B, id: 'dirt', gotItem: true });
    t.fx.update(DT);
    expect(t.names).toContain('break');
    expect(t.names).toContain('pickup');
    expect(t.picks).toEqual(['dirt']);
    expect(t.fx.puffs.activeCount()).toBe(1);
    expect(t.fx.particles.liveCount()).toBe(0);
    for (let i = 0; i < 6; i++) t.fx.update(DT);
    expect(t.fx.particles.liveCount()).toBe(FX_SETTINGS.particleCount);
    expect(t.shakes.some(([y, p]) => y !== 0 || p !== 0)).toBe(true);
    for (let i = 0; i < 40; i++) t.fx.update(DT);
    expect(t.fx.particles.liveCount()).toBe(0);
    expect(t.shakes[t.shakes.length - 1]).toEqual([0, 0]);
  });
  it('fxShake を切ると画面がゆれない', () => {
    const t = setup({ fxShake: 0 });
    t.dig.events.push({ type: 'break', tick: 1, block: B, id: 'dirt', gotItem: true });
    for (let i = 0; i < 10; i++) t.fx.update(DT);
    expect(t.shakes.every(([y, p]) => y === 0 && p === 0)).toBe(true);
  });
  it('連続で取ると音が高くなる', () => {
    const t = setup();
    const sem: number[] = [];
    const orig = t.fx.combo.hit.bind(t.fx.combo);
    t.fx.combo.hit = (i) => {
      const r = orig(i);
      sem.push(r);
      return r;
    };
    for (let k = 0; k < 3; k++) {
      t.dig.events.push({ type: 'break', tick: k, block: B, id: 'dirt', gotItem: true });
      t.fx.update(DT);
    }
    expect(sem).toEqual([0, 1, 2]);
  });
  it('いっぱい: 合図と赤い枠が 0.5 秒', () => {
    const t = setup();
    t.dig.events.push({ type: 'break', tick: 1, block: B, id: 'dirt', gotItem: false });
    t.fx.update(DT);
    expect(t.signals).toEqual(['full']);
    expect(t.fx.outline.isRed).toBe(true);
    for (let i = 0; i < 29; i++) t.fx.update(DT);
    expect(t.fx.outline.isRed).toBe(true);
    for (let i = 0; i < 3; i++) t.fx.update(DT);
    expect(t.fx.outline.isRed).toBe(false);
  });
  it('ほれない: カチンと合図', () => {
    const t = setup();
    t.dig.events.push({ type: 'blocked', tick: 1, block: B, id: 'iron_ore', reason: 'needTool' });
    t.fx.update(DT);
    expect(t.names).toEqual(['clink']);
    expect(t.signals).toEqual(['needTool']);
  });
  it('置く: とん、うでを振る', () => {
    const t = setup();
    t.dig.events.push({ type: 'place', tick: 1, block: B, id: 'dirt' });
    t.fx.update(DT);
    expect(t.names).toEqual(['place']);
    expect(t.swings.n).toBe(1);
  });
  it('ひび: 上がるとカッ（最後は強い）、下がるときは鳴らさない', () => {
    const t = setup();
    t.dig.tgt = TGT;
    t.dig.st = { active: true, block: B, progress: 0.1, crackStage: 1, ready: false, blockedReason: null };
    t.fx.update(DT);
    expect(t.names).toEqual(['crack']);
    expect(t.fx.crack.currentStage).toBe(1);
    t.names.length = 0;
    t.dig.st = { ...t.dig.st, crackStage: 3, ready: true };
    t.fx.update(DT);
    expect(t.names).toEqual(['crackFinal']);
    t.names.length = 0;
    t.dig.st = { active: false, block: B, progress: 0.4, crackStage: 2, ready: false, blockedReason: null };
    t.fx.update(DT);
    expect(t.names).toEqual([]);
    expect(t.fx.crack.currentStage).toBe(2);
    t.dig.st = { active: false, block: null, progress: 0, crackStage: 0, ready: false, blockedReason: null };
    t.fx.update(DT);
    expect(t.fx.crack.mesh.visible).toBe(false);
  });
  it('ready: キラッと音、ふちが光る・ふるえる。おわると元にもどる', () => {
    const t = setup();
    t.dig.tgt = TGT;
    t.dig.st = { active: false, block: B, progress: 1, crackStage: 3, ready: true, blockedReason: null };
    t.dig.events.push({ type: 'ready', tick: 1, block: B, id: 'dirt' });
    t.fx.update(DT);
    expect(t.names).toContain('ready');
    const base = new THREE.Vector3(B.x + 0.5, B.y + 0.5, B.z + 0.5);
    let moved = 0;
    for (let i = 0; i < 20; i++) {
      t.fx.update(DT);
      if (t.fx.crack.mesh.position.distanceTo(base) > 0) moved++;
    }
    expect(moved).toBeGreaterThan(10);
    expect(t.fx.crack.mesh.position.distanceTo(base)).toBeLessThan(0.1);
    const mat = t.fx.outline.mesh.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0xffd54f);
    t.dig.st = { active: false, block: B, progress: 0.5, crackStage: 2, ready: false, blockedReason: null };
    t.fx.update(DT);
    expect(mat.color.getHex()).toBe(0x000000);
    expect(t.fx.crack.mesh.position.distanceTo(base)).toBeLessThan(1e-6);
  });
  it('ねらいの枠はねらいがあるときだけ', () => {
    const t = setup();
    t.fx.update(DT);
    expect(t.fx.outline.mesh.visible).toBe(false);
    t.dig.tgt = TGT;
    t.fx.update(DT);
    expect(t.fx.outline.mesh.visible).toBe(true);
    expect(t.fx.outline.mesh.position.x).toBeCloseTo(4.5);
  });
});
