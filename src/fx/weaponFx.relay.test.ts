import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { BowEvent } from '../contracts';
import { EventRelay } from './eventRelay';
import { WeaponFx } from './weaponFx';

const P = { x: 0, y: 1, z: 0 };
const EVENTS: BowEvent[] = [
  { type: 'arrowShot', tick: 1, stage: 2, speed: 10, position: P, velocity: P },
  { type: 'arrowHit', tick: 2, yokaiId: 1, damage: 2, position: P },
  { type: 'pickup', tick: 3 },
];

/** 弓の出来事の入れ物（1 回 drain すると空になる。本物の BowSystem と同じ） */
function bowSource() {
  let q: BowEvent[] = [];
  return {
    push: (e: BowEvent[]) => void q.push(...e),
    drainEvents: () => {
      const r = q;
      q = [];
      return r;
    },
  };
}

function makeFx(bow: { drainEvents(): readonly BowEvent[] }) {
  const sounds: string[] = [];
  const calls = { pickup: 0 };
  const fx = new WeaponFx({
    scene: new THREE.Scene(),
    sound: { play: (n: string) => void sounds.push(n), playTones: () => void sounds.push('tones') } as never,
    blade: { drainEvents: () => [], state: () => ({}), shape: () => ({}) } as never,
    bow: bow as never,
    inventory: { drainWearEvents: () => [] },
    armor: { drainWearEvents: () => [] },
    bladeHud: { update: () => {}, techStarted: () => {}, stanceChanged: () => {} },
    notice: { low: () => {}, broken: () => {} },
    nameOf: () => '',
    handPos: () => P,
    onArrowPickup: () => void calls.pickup++,
  });
  return { fx, sounds, calls };
}

describe('弓の出来事を 1 か所で drain して weaponFx にも配る', () => {
  it('main が先に drain しても relay 経由なら 音と や を拾った表示が出る', () => {
    const src = bowSource();
    const relay = new EventRelay<BowEvent>();
    const { fx, sounds, calls } = makeFx({ drainEvents: () => relay.take() });
    src.push(EVENTS);
    const mine = src.drainEvents(); // main が 1 回だけ drain
    expect(mine).toHaveLength(3);
    relay.give(mine);
    fx.step();
    expect(sounds.length).toBeGreaterThanOrEqual(3);
    expect(calls.pickup).toBe(1);
    // 次のステップには 持ちこさない
    const n = sounds.length;
    fx.step();
    expect(sounds.length).toBe(n);
    expect(calls.pickup).toBe(1);
  });
  it('（直す前の配線）同じ列を 2 か所で drain すると weaponFx には何も来ない', () => {
    const src = bowSource();
    const { fx, sounds, calls } = makeFx(src);
    src.push(EVENTS);
    src.drainEvents();
    fx.step();
    expect(sounds).toEqual([]);
    expect(calls.pickup).toBe(0);
  });
});
