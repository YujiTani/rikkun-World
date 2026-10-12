import * as THREE from 'three';
import type { TimeOfDay } from '../contracts';
import type { TimeSettings } from '../time/config';
import { SKY_VIEW } from './config';
import type { Lighting } from './lighting';
import { skyDirection, sunMoonPose } from './sunMoon';

export interface SkyDeps {
  scene: THREE.Scene;
  time: TimeOfDay & { skyColorValue?(): number };
  timeSettings: TimeSettings;
  lighting: Lighting;
}

/**
 * 空・かすみの色、ブロックと人形の明るさ、おひさま・おつきさま（M3 §3.2）。
 * 毎ステップ update(camera) を呼ぶ。色は scene.background と scene.fog に入れる。
 */
export class Sky {
  readonly sun: THREE.Mesh;
  readonly moon: THREE.Mesh;
  private readonly bg = new THREE.Color();
  private readonly dir = { x: 0, y: 0, z: 0 };

  constructor(private readonly d: SkyDeps) {
    const geo = new THREE.PlaneGeometry(SKY_VIEW.size, SKY_VIEW.size);
    const make = (color: number, name: string): THREE.Mesh => {
      const mat = new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide });
      // 暗くしない（ひとつの色のまま）
      mat.userData.noDim = true;
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.frustumCulled = false;
      m.visible = false;
      d.scene.add(m);
      return m;
    };
    this.sun = make(SKY_VIEW.sunColor, 'sun');
    this.moon = make(SKY_VIEW.moonColor, 'moon');
    if (!(d.scene.background instanceof THREE.Color)) d.scene.background = new THREE.Color();
  }

  update(camera: THREE.Camera): void {
    const { time, scene, lighting, timeSettings } = this.d;
    const color = time.skyColorValue ? time.skyColorValue() : parseInt(time.skyColor().slice(1), 16);
    this.bg.setHex(color);
    (scene.background as THREE.Color).copy(this.bg);
    if (scene.fog) scene.fog.color.copy(this.bg);
    lighting.setLevels(time.brightness(), time.dollBrightness());

    const pose = sunMoonPose(time.dayTick(), timeSettings);
    this.place(this.sun, pose.sun, camera);
    this.place(this.moon, pose.moon, camera);
  }

  private place(mesh: THREE.Mesh, pose: { visible: boolean; angle: number }, camera: THREE.Camera): void {
    mesh.visible = pose.visible;
    if (!pose.visible) return;
    const dir = skyDirection(pose.angle, SKY_VIEW.tilt, this.dir);
    const r = SKY_VIEW.distance;
    const p = camera.position;
    mesh.position.set(p.x + dir.x * r, p.y + dir.y * r, p.z + dir.z * r);
    mesh.lookAt(p);
  }

  dispose(): void {
    this.d.scene.remove(this.sun, this.moon);
    this.sun.geometry.dispose();
    (this.sun.material as THREE.Material).dispose();
    (this.moon.material as THREE.Material).dispose();
  }
}
