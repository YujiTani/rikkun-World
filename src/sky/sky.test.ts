import { lightBrightness } from '../world/light';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SCENERY_CONFIG } from '../game/config';
import { TimeOfDayImpl } from '../time/TimeOfDay';
import { Lighting, levelToLinear } from './lighting';
import { Sky } from './Sky';
import { skyDirection, sunMoonPose } from './sunMoon';

describe('Lighting', () => {
  it('登録した材料だけを「もとの色 × 明るさ」にする。もどせる', () => {
    const l = new Lighting();
    const a = new THREE.MeshBasicMaterial({ color: 0xff8000 });
    const b = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const c = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    l.register(a, 'block');
    l.register(b, 'doll');
    l.setLevels(0.5, 0.75);
    expect(a.color.r).toBeCloseTo(levelToLinear(0.5));
    expect(b.color.r).toBeCloseTo(levelToLinear(0.75));
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
    expect(m.color.r).toBeCloseTo(levelToLinear(0.5));
    expect(lit.color.r).toBe(1);
  });
  it('setBase は明るさをかけた色を入れる', () => {
    const l = new Lighting();
    const m = new THREE.MeshBasicMaterial({ color: 0x808080 });
    l.register(m, 'doll');
    l.setLevels(1, 0.5);
    l.setBase(m, 0xffffff);
    expect(m.color.r).toBeCloseTo(levelToLinear(0.5));
  });
  it('見た目（sRGB）が level 倍になる。夜は昼よりはっきり暗い', () => {
    const l = new Lighting();
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    l.register(m, 'block');
    l.setLevels(0.45, 1);
    const out = m.color.clone().convertLinearToSRGB();
    expect(out.r).toBeCloseTo(0.45, 2);
    expect(m.color.r).toBeLessThan(0.2);
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
    // #76 夜の暗さ(C): 夜空とかすみの色は 夜の色 0x1b2350 の 0.4 倍（three の色は 線形で持つので 線形でかける）、かすみは 1/3
    const night = new THREE.Color(0x1b2350).multiplyScalar(0.4).getHex();
    expect((scene.background as THREE.Color).getHex()).toBe(night);
    expect(scene.fog!.color.getHex()).toBe(night);
    expect(scene.fog!.near).toBeCloseTo(SCENERY_CONFIG.fogNear / 3, 3);
    expect(scene.fog!.far).toBeCloseTo(SCENERY_CONFIG.fogFar / 3, 3);
    // L の光（空の下の明るさ）を、#4 の見た目どおりの変換（levelToLinear）でかける。夜の外は さらに 0.16 倍（#76）
    expect(mat.color.r).toBeCloseTo(levelToLinear(lightBrightness(4) * 0.16));
    expect(sky.moon.visible).toBe(true);
    expect(sky.sun.visible).toBe(false);
    time.set(0);
    sky.update(cam);
    expect(mat.color.r).toBeCloseTo(1);
    expect((scene.background as THREE.Color).getHex()).toBe(0x8fd3ff); // 昼は今と同じ（#76）
    expect([scene.fog!.near, scene.fog!.far]).toEqual([SCENERY_CONFIG.fogNear, SCENERY_CONFIG.fogFar]);
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
  it('おひさまの向きは時刻で変わる（東 +X からのぼり、昼に真上、西 -X へ）', () => {
    const s = new TimeOfDayImpl().settings;
    const at = (t: number) => skyDirection(sunMoonPose(t, s).sun.angle, 0.25, { x: 0, y: 0, z: 0 });
    expect(at(100).x).toBeGreaterThan(0.5);
    expect(at(29700).y).toBeGreaterThan(0.9);
    expect(at(59000).x).toBeLessThan(-0.5);
    expect(at(100).x).not.toBeCloseTo(at(29700).x);
  });
  it('Sky.update で、おひさまがカメラについていき、時刻で場所が変わる', () => {
    const scene = new THREE.Scene();
    const time = new TimeOfDayImpl();
    const sky = new Sky({ scene, time, timeSettings: time.settings, lighting: new Lighting() });
    const cam = new THREE.PerspectiveCamera();
    time.set(100);
    sky.update(cam);
    const a = sky.sun.position.clone();
    time.set(40000);
    cam.position.set(10, 5, 10);
    sky.update(cam);
    const b = sky.sun.position.clone().sub(cam.position);
    expect(a.x).toBeGreaterThan(100);
    expect(b.x).toBeLessThan(0);
    expect(b.length()).toBeCloseTo(a.length(), 3);
  });
});
