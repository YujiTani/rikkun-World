import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { CoreBarrier } from './gashaBigBarrier';
import { TUNE as T } from './gashaBigTuning';

const B = T.freeze.barrier;

describe('CoreBarrier（コアを まもる 虹色の バリア）', () => {
  it('はじめは 出ていない。張ると 球が 見える。消すと 波紋も 消える', () => {
    const scene = new Scene();
    const b = new CoreBarrier(scene);
    const mesh = scene.getObjectByName('coreBarrier')!;
    expect(b.info()).toEqual({ on: false, ripples: 0, radius: B.radius });
    expect(mesh.visible).toBe(false);
    b.setOn(true);
    b.setCenter(1, 2, 3);
    b.update(1 / 60);
    expect(mesh.visible).toBe(true);
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.scale.x).toBeCloseTo(B.radius, 5);
    b.ripple(1, 2, 10);
    expect(b.info().ripples).toBe(1);
    b.setOn(false);
    expect(mesh.visible).toBe(false);
    expect(b.info().ripples).toBe(0);
  });

  it('張って いない 間は たたかれても 波紋は 出ない', () => {
    const b = new CoreBarrier(new Scene());
    b.ripple(0, 1, 0);
    expect(b.info().ripples).toBe(0);
  });

  it('波紋は rippleSec で 消え、同時の 数は rippleMax まで。たたかれた 直後は 少し ふくらむ', () => {
    const scene = new Scene();
    const b = new CoreBarrier(scene);
    const mesh = scene.getObjectByName('coreBarrier')!;
    b.setOn(true);
    for (let i = 0; i < B.rippleMax + 3; i++) b.ripple(Math.cos(i), 0, Math.sin(i));
    expect(b.info().ripples).toBe(B.rippleMax);
    b.update(1 / 60);
    expect(mesh.scale.x).toBeGreaterThan(B.radius);
    for (let i = 0; i < Math.ceil(B.rippleSec * 60) + 2; i++) b.update(1 / 60);
    expect(b.info().ripples).toBe(0);
    expect(mesh.scale.x).toBeCloseTo(B.radius, 5);
  });

  it('調整表: enabled を false に すれば 張らない', () => {
    const saved = B.enabled;
    B.enabled = false;
    const b = new CoreBarrier(new Scene());
    b.setOn(true);
    expect(b.isOn()).toBe(false);
    B.enabled = saved;
  });
});
