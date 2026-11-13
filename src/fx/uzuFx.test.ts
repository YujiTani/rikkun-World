import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BlockId } from '../contracts';
import { UzuFx } from './uzuFx';
import { UZU, type UzuPoint } from './uzuModel';

/** getBlock の 回数を 数える。(0,0,0) の となりに わきどころを 1 つ 置く */
function make() {
  const st = { calls: 0, version: 0, foci: [{ x: 0.5, y: 0.5, z: 0.5 }] as UzuPoint[] };
  const fx = new UzuFx(new THREE.Group(), {
    seed: 1,
    getBlock: (x, y, z) => {
      st.calls++;
      return (x === 2 && y === 0 && z === 0 ? 'wakimizu' : 'air') as BlockId;
    },
    foci: () => st.foci,
    blockVersion: () => st.version,
  });
  /** UZU.refresh を ちょうど 1 回 こえる 時間 */
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) fx.update(UZU.refresh + 0.001);
  };
  return { st, fx, tick };
}

describe('UzuFx の 走査', () => {
  it('はじめては 走査する。じっとして いれば 2 回目から getBlock は 0 回', () => {
    const { st, fx, tick } = make();
    tick();
    expect(st.calls).toBeGreaterThan(0);
    expect(fx.spots).toBeGreaterThan(0);
    st.calls = 0;
    tick(20);
    expect(st.calls).toBe(0);
  });

  it('同じ マスの 中で 動いても 走査しない。1 マス 動くと 1 回だけ 走査する', () => {
    const { st, tick } = make();
    tick();
    st.calls = 0;
    st.foci = [{ x: 0.9, y: 0.5, z: 0.1 }];
    tick();
    expect(st.calls).toBe(0);
    st.foci = [{ x: 1.2, y: 0.5, z: 0.1 }];
    tick();
    const one = st.calls;
    expect(one).toBeGreaterThan(0);
    tick(5);
    expect(st.calls).toBe(one);
  });

  it('ブロックが かわったら 走査する。画面を もつ 人の 数が かわっても', () => {
    const { st, tick } = make();
    tick();
    st.calls = 0;
    st.version++;
    tick();
    const one = st.calls;
    expect(one).toBeGreaterThan(0);
    tick(3);
    expect(st.calls).toBe(one);
    st.foci = [...st.foci, { x: 0.5, y: 0.5, z: 0.5 }];
    tick();
    expect(st.calls).toBeGreaterThan(one);
  });

  it('off の 間は 何も 出さず getBlock も 0 回。もどすと また 出る', () => {
    const { st, fx, tick } = make();
    fx.off = true;
    tick(3);
    expect(st.calls).toBe(0);
    expect(fx.shown).toBe(0);
    fx.off = false;
    tick();
    expect(fx.spots).toBeGreaterThan(0);
  });
});
