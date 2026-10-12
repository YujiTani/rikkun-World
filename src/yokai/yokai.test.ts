import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { YOKAI_ORDER, createYokai } from './index';
import { makeBlinkRows, makePixelTexture } from './common';
import type { YokaiBase } from './common';
import { Chochin, Rokurokubi } from './index';
import { courseState, COURSE } from './models/karakasa';
import { YOKAI_STATS } from './stats';

const STEP = 1 / 60;
function run(y: ReturnType<typeof createYokai>, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) y.update(STEP);
}

describe('妖怪の大きさ（AC2）', () => {
  const expected: Record<string, { w: number; h: number }> = {
    karakasa: { w: 1.5, h: 1.6 },
    chochin: { w: 0.74, h: 1.7 },
    nurikabe: { w: 3.1, h: 3.05 },
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
      y.root.children[0]!.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          expect((m as THREE.MeshBasicMaterial).color.getHex()).toBe(0);
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
  it('たたかれた: 0.1 秒だけ白、0.3 秒で終わる。ぬりかべは下がらない', () => {
    for (const id of YOKAI_ORDER) {
      const y = createYokai(id);
      y.hit();
      run(y, 0.05);
      expect(y.motion).toBe('hit');
      expect(y.displayColors()).toEqual(['#ffffff']);
      run(y, 0.1);
      expect(y.displayColors().length).toBeGreaterThan(1);
      const z = y.root.children[0]!.position.z;
      if (id === 'nurikabe') expect(z).toBe(0);
      else expect(z).toBeGreaterThan(0.3);
      run(y, 0.2);
      expect(y.motion).toBe('wait');
      expect(y.root.children[0]!.position.z).toBe(0);
    }
  });
  it('攻撃中にたたかれても攻撃は止まらない', () => {
    for (const id of YOKAI_ORDER) {
      const y = createYokai(id);
      y.attack();
      run(y, 0.1);
      y.hit();
      run(y, 0.05);
      expect(y.motion).toBe('attack');
      expect(y.displayColors()).toEqual(['#ffffff']);
      run(y, 0.5);
      expect(y.attackPhase()).not.toBeNull();
    }
  });
  it('こうげきの長さ: 1.2 / 0.8 / 4.0 / 1.6 秒', () => {
    const lens: Record<string, number> = { karakasa: 1.2, chochin: 0.8, nurikabe: 4.0, rokurokubi: 1.6 };
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
  it('うごく: からかさは 0.6 秒周期で跳ねる（y = 0.5|sin|）', () => {
    const y = createYokai('karakasa');
    y.setMotion('move');
    let maxY = 0;
    const body = y.root.children[0]!.children[0]!;
    for (let i = 0; i < 36; i++) {
      y.update(STEP);
      maxY = Math.max(maxY, body.position.y);
    }
    expect(maxY).toBeGreaterThan(0.48);
    expect(maxY).toBeLessThanOrEqual(0.5 + 1e-9);
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

/** 攻撃を始めてから当たり判定が出るまでのステップ数 */
function stepsToHit(y: YokaiBase): number {
  const n = y.hitCount;
  y.attack();
  let steps = 0;
  while (y.hitCount === n && steps < 1000) {
    y.update(STEP);
    steps++;
  }
  return steps;
}

describe('攻撃（AC4〜AC7）', () => {
  it('AC4: 当たりまで からかさ・ちょうちん・ろくろくびは 30、ぬりかべは 90 ステップ', () => {
    for (const id of YOKAI_ORDER) {
      const steps = stepsToHit(createYokai(id));
      const want = id === 'nurikabe' ? 90 : 30;
      expect(Math.abs(steps - want)).toBeLessThanOrEqual(1);
    }
  });
  it('攻撃の段階: 合図 → 当たり → すき。強さの表とそろう', () => {
    for (const id of YOKAI_ORDER) {
      const y = createYokai(id);
      y.attack();
      y.update(STEP);
      expect(y.attackPhase()!.phase).toBe('cue');
      expect(y.attackPhase()!.hitAt).toBe(YOKAI_STATS[id].hitSeconds);
      expect(y.attackPhase()!.duration).toBe(YOKAI_STATS[id].attackSeconds);
      while (y.hitCount === 0) y.update(STEP);
      expect(y.attackPhase()!.phase).toBe('hit');
      run(y, 0.2);
      if (id !== 'chochin') expect(y.attackPhase()!.phase).toBe('recover');
    }
  });
  it('当たり判定の箱: からかさ 1.2×1.0×1.2 / ちょうちん 0.5 角 / ぬりかべ 2.6×1.0×3.0 / ろくろくび 0.6 角', () => {
    const want: Record<string, number[]> = {
      karakasa: [1.2, 1, 1.2],
      chochin: [0.5, 0.5, 0.5],
      nurikabe: [2.6, 1, 3],
      rokurokubi: [0.6, 0.6, 0.6],
    };
    for (const id of YOKAI_ORDER) {
      const y = createYokai(id);
      stepsToHit(y);
      const b = y.lastHitBox!;
      expect([b.w, b.h, b.d]).toEqual(want[id]);
    }
  });
  it('からかさ: 着地点は 2.5 ブロック先のねらいの所', () => {
    const y = createYokai('karakasa');
    stepsToHit(y);
    expect(y.lastHitBox!.cz).toBeCloseTo(-2.5, 5);
    expect(y.info().bodyY).toBeLessThan(0.01);
  });
  it('AC5: 火の玉は 1 秒に 3.0 ブロック進み、8 ブロックで消える', () => {
    const y = new Chochin();
    stepsToHit(y);
    expect(y.fireballs.length).toBe(1);
    const f = y.fireballs[0]!;
    const p0 = f.position.clone();
    run(y, 1);
    expect(Math.abs(f.position.distanceTo(p0) - 3.0)).toBeLessThanOrEqual(0.1);
    run(y, 1.6);
    expect(f.alive).toBe(true);
    run(y, 0.15);
    expect(f.alive).toBe(false);
    expect(f.traveled).toBeGreaterThanOrEqual(8 - 1e-3);
  });
  it('AC6: ろくろくびのあたまは 6 ブロック先、からだは動かない、怖い顔は 0〜1.0 秒', () => {
    const y = new Rokurokubi();
    const c = y.headCenter(new THREE.Vector3());
    expect(c.z).toBeCloseTo(0, 5);
    y.attack();
    const faces: string[] = [];
    let maxDist = 0;
    for (let i = 0; i < 100; i++) {
      y.update(STEP);
      faces.push(y.faceState);
      maxDist = Math.max(maxDist, y.info().headDist);
    }
    expect(Math.abs(maxDist - 6.0)).toBeLessThanOrEqual(0.1);
    expect(y.info().bodyZ).toBe(0);
    expect(faces[0]).toBe('scary');
    expect(faces[59]).toBe('scary'); // 1.0 秒
    expect(faces[65]).not.toBe('scary'); // 1.1 秒
    expect(y.faceState).not.toBe('scary');
    // 0.5 秒のあたま: 水平 6.0、高さは足もと +1.3
    const y2 = new Rokurokubi();
    stepsToHit(y2);
    const h = y2.headCenter(new THREE.Vector3());
    expect(Math.abs(Math.hypot(h.x, h.z) - 6)).toBeLessThanOrEqual(0.1);
    expect(h.y).toBeCloseTo(1.3, 1);
  });
  it('AC7: ぬりかべは当たりのあと 2.5 秒（150 ステップ）で元の立ち姿', () => {
    const y = createYokai('nurikabe');
    stepsToHit(y);
    expect(y.info().leanDeg).toBeLessThan(-80);
    for (let i = 0; i < 149; i++) y.update(STEP);
    expect(y.motion).toBe('attack');
    y.update(STEP);
    y.update(STEP);
    expect(y.motion).toBe('wait');
    expect(Math.abs(y.info().leanDeg)).toBeLessThan(0.01);
  });
  it('ぬりかべ: のけぞり +25°（1.1〜1.4 秒）→ 前へ -90°', () => {
    const y = createYokai('nurikabe');
    y.attack();
    run(y, 1.2);
    expect(y.info().leanDeg).toBeCloseTo(25, 1);
    run(y, 0.35);
    expect(y.info().leanDeg).toBeCloseTo(-90, 1);
  });
});

describe('からかさの段（AC8）', () => {
  it('大ジャンプで高さ 2 の段の上に着地する', () => {
    const t0 = 2 * 0.6 + COURSE.bigCrouch;
    let peak = 0;
    for (let t = t0; t < t0 + COURSE.bigAir; t += 1 / 120) peak = Math.max(peak, courseState(t).rise);
    expect(peak).toBeGreaterThan(2.4);
    const land = courseState(t0 + COURSE.bigAir - 1e-6);
    expect(land.rise).toBeCloseTo(2.0, 2);
    expect(land.forward).toBeCloseTo(COURSE.toStep, 2);
    expect(courseState(2 * 0.6 + COURSE.bigCrouch / 2).stage).toBe('crouch');
  });
  it('おりたあとは地面、ポンと消えてもどる', () => {
    const t = COURSE.cycle - COURSE.resetSeconds - 1e-6;
    expect(courseState(t).rise).toBeCloseTo(0, 2);
    expect(courseState(COURSE.cycle - 0.01).forward).toBe(0);
  });
});
