import { lightBrightness } from '../world/light';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TimeOfDayImpl } from '../time/TimeOfDay';
import { Lighting } from './lighting';
import { Sky } from './Sky';
import { sunMoonPose } from './sunMoon';

describe('Lighting', () => {
  it('登録した材料だけを「もとの色 × 明るさ」にする。もどせる', () => {
    const l = new Lighting();
    const a = new THREE.MeshBasicMaterial({ color: 0xff8000 });
    const b = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const c = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    l.register(a, 'block');
    l.register(b, 'doll');
    l.setLevels(0.5, 0.75);
    expect(a.color.r).toBeCloseTo(0.5);
    expect(b.color.r).toBeCloseTo(0.75);
    expect(c.color.g).toBe(1);
    l.setLevels(1, 1);
    expect(a.color.getHex()).toBe(0xff8000);
  });
  it('noDim は暗くしない。何度登録しても 1 つ', () => {
    const l = new Lighting();
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lit = new THREE.MeshBasicMaterial({ color: 0xffffff });
    lit.userData.noDim = true;
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), m), new THREE.Mesh(new THREE.BoxGeometry(), lit));
    expect(l.registerTree(root, 'doll')).toBe(1);
    l.registerTree(root, 'doll');
    expect(l.size()).toBe(1);
    l.setLevels(0.45, 0.5);
    expect(m.color.r).toBeCloseTo(0.5);
    expect(lit.color.r).toBe(1);
  });
  it('setBase は明るさをかけた色を入れる', () => {
    const l = new Lighting();
    const m = new THREE.MeshBasicMaterial({ color: 0x808080 });
    l.register(m, 'doll');
    l.setLevels(1, 0.5);
    l.setBase(m, 0xffffff);
    expect(m.color.r).toBeCloseTo(0.5);
  });
});

describe('Sky', () => {
  it('時刻に合わせて背景・かすみ・明るさを変える', () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fd3ff);
    scene.fog = new THREE.Fog(0x8fd3ff, 40, 90);
    const time = new TimeOfDayImpl();
    const lighting = new Lighting();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    lighting.register(mat, 'block');
    const sky = new Sky({ scene, time, timeSettings: time.settings, lighting });
    const cam = new THREE.PerspectiveCamera();
    time.set(60000);
    sky.update(cam);
    expect((scene.background as THREE.Color).getHex()).toBe(0x1b2350);
    expect(scene.fog!.color.getHex()).toBe(0x1b2350);
    expect(mat.color.r).toBeCloseTo(lightBrightness(4));
    expect(sky.moon.visible).toBe(true);
    expect(sky.sun.visible).toBe(false);
    time.set(0);
    sky.update(cam);
    expect(mat.color.r).toBeCloseTo(1);
    expect(sky.sun.visible).toBe(true);
  });
  it('おひさま は東から西へ。おつきさま は よる', () => {
    const s = new TimeOfDayImpl().settings;
    expect(sunMoonPose(0, s).sun.angle).toBe(0);
    expect(sunMoonPose(29700, s).sun.angle).toBeCloseTo(Math.PI / 2, 1);
    expect(sunMoonPose(60000, s).sun.visible).toBe(false);
    expect(sunMoonPose(60000, s).moon.visible).toBe(true);
    expect(sunMoonPose(91799, s).moon.angle).toBeLessThanOrEqual(Math.PI);
  });
});
