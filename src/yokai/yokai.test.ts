import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { YOKAI_ORDER, createYokai } from './index';
import { makeBlinkRows, makePixelTexture } from './common';

const STEP = 1 / 60;
function run(y: ReturnType<typeof createYokai>, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) y.update(STEP);
}

describe('妖怪の大きさ（AC2）', () => {
  const expected: Record<string, { w: number; h: number }> = {
    karakasa: { w: 1.5, h: 1.6 },
    chochin: { w: 0.74, h: 1.7 },
    nurikabe: { w: 2.2, h: 2.35 },
    rokurokubi: { w: 1.1, h: 2.9 },
  };
  for (const id of YOKAI_ORDER) {
    it(`${id} は表の大きさ ±0.05`, () => {
      const y = createYokai(id);
      expect(Math.abs(y.size.width - expected[id]!.w)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(y.size.height - expected[id]!.h)).toBeLessThanOrEqual(0.05);
    });
  }
  it('ちょうちんは浮いていて、下のはしが y=0.5±0.1', () => {
    const y = createYokai('chochin');
    expect(Math.abs(y.size.minY - 0.5)).toBeLessThanOrEqual(0.1);
  });
  it('ほかの 3 体は足もとが地面', () => {
    for (const id of ['karakasa', 'nurikabe', 'rokurokubi'] as const) {
      expect(Math.abs(createYokai(id).size.minY)).toBeLessThan(0.01);
    }
  });
});

describe('かげ（AC3）', () => {
  it('かげで全部の箱が #000000、いろで元の色', () => {
    for (const id of YOKAI_ORDER) {
      const y = createYokai(id);
      const before = y.meshColors();
      y.setSilhouette(true);
      expect(y.meshColors().every((c) => c === 0)).toBe(true);
      y.root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (o.parent !== y.root.children[1]) expect((m as THREE.MeshBasicMaterial).color.getHex()).toBe(0);
        }
      });
      y.setSilhouette(false);
      expect(y.meshColors()).toEqual(before);
    }
  });
});

describe('動き（AC4）', () => {
  it('たおれる: 0.6 秒で大きさ 0、1.1 秒でけむりも終わり', () => {
    const y = createYokai('karakasa');
    y.die();
    run(y, 0.3);
    expect(y.scale).toBe(1);
    run(y, 0.3 + STEP / 2);
    expect(y.scale).toBe(0);
    run(y, 0.5);
    expect(y.dead).toBe(true);
  });
  it('たおれる: 0.5 秒で大きさは 1 と 0 の間', () => {
    const y = createYokai('nurikabe');
    y.die();
    run(y, 0.5);
    expect(y.scale).toBeGreaterThan(0);
    expect(y.scale).toBeLessThan(1);
  });
  it('たたかれた: 0.1 秒だけ白、0.3 秒で待つに戻る。ぬりかべは下がらない', () => {
    for (const id of YOKAI_ORDER) {
      const y = createYokai(id);
      y.hit();
      run(y, 0.05);
      expect(y.motion).toBe('hit');
      expect(y.displayColors()).toEqual(['#ffffff']);
      run(y, 0.1);
      expect(y.displayColors().length).toBeGreaterThan(1);
      // 0.15 秒あたりが一番下がる
      const z = y.root.children[0]!.position.z;
      if (id === 'nurikabe') expect(z).toBe(0);
      else expect(z).toBeGreaterThan(0.3);
      run(y, 0.2);
      expect(y.motion).toBe('wait');
      expect(y.root.children[0]!.position.z).toBe(0);
    }
  });
  it('こうげきの長さ: 1.0 / 1.0 / 2.2 / 1.45 秒', () => {
    const lens: Record<string, number> = { karakasa: 1.0, chochin: 1.0, nurikabe: 2.2, rokurokubi: 1.45 };
    for (const id of YOKAI_ORDER) {
      const y = createYokai(id);
      y.attack();
      run(y, lens[id]! - 0.05);
      expect(y.motion).toBe('attack');
      run(y, 0.1);
      expect(y.motion).toBe('wait');
    }
  });
  it('たおれたあとに revive すると元の大きさ', () => {
    const y = createYokai('rokurokubi');
    y.die();
    run(y, 1.2);
    y.revive();
    expect(y.scale).toBe(1);
    expect(y.motion).toBe('wait');
  });
  it('うごく: からかさは 0.6 秒周期で跳ねる（y = 0.4|sin|）', () => {
    const y = createYokai('karakasa');
    y.setMotion('move');
    let maxY = 0;
    const body = y.root.children[0]!.children[0]!;
    for (let i = 0; i < 36; i++) {
      y.update(STEP);
      maxY = Math.max(maxY, body.position.y);
    }
    expect(maxY).toBeGreaterThan(0.38);
    expect(maxY).toBeLessThanOrEqual(0.4 + 1e-9);
  });
});

describe('まばたき', () => {
  it('3 秒に 1 回、0.15 秒だけとじる', () => {
    const y = createYokai('chochin');
    let closedFrames = 0;
    run(y, 2.9);
    expect(y.blinking).toBe(false);
    for (let i = 0; i < 20; i++) {
      y.update(STEP);
      if (y.blinking) closedFrames++;
    }
    expect(closedFrames).toBeGreaterThanOrEqual(8);
    expect(closedFrames).toBeLessThanOrEqual(10);
    expect(y.blinking).toBe(false);
  });
});

describe('ドット絵', () => {
  it('16x16 で NearestFilter', () => {
    const t = makePixelTexture(['W.', '.K']);
    expect(t.magFilter).toBe(THREE.NearestFilter);
    expect(t.minFilter).toBe(THREE.NearestFilter);
    expect(t.image.width).toBe(2);
  });
  it('目をとじた絵は目の行が横線 1 本になる', () => {
    const rows = ['.WW.', '.KK.', '.WW.', '....'];
    expect(makeBlinkRows(rows, [0, 1, 2], 1, '.', 'WK')).toEqual(['....', '.KK.', '....', '....']);
  });
});
