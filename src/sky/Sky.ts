import * as THREE from 'three';
import type { TimeOfDay } from '../contracts';
import type { TimeSettings } from '../time/config';
import { darkenFromBrightness, skyBrightness, skyDarkness, LIGHT_CONFIG } from '../world/light';
import type { WorldLight } from '../world/light/WorldLight';
import { SCENERY_CONFIG } from '../game/config';
import { SKY_VIEW } from './config';
import type { Lighting } from './lighting';
import { skyDirection, sunMoonPose } from './sunMoon';

export interface SkyDeps {
  scene: THREE.Scene;
  time: TimeOfDay & { skyColorValue?(): number };
  timeSettings: TimeSettings;
  lighting: Lighting;
  /** 光の仕組み。あれば、人形の明るさを足もとの光で決める（無ければ時刻だけで決める） */
  light?: WorldLight;
  /** 人形の足もと（light と一緒に渡す） */
  focus?: () => { x: number; y: number; z: number };
}

/**
 * 空・かすみの色、ブロックと人形の明るさ、おひさま・おつきさま（M3 §3.2）。
 * 毎ステップ update(camera) を呼ぶ。色は scene.background と scene.fog に入れる。
 */
export class Sky {
  readonly sun: THREE.Mesh;
  readonly moon: THREE.Mesh;
  private readonly bg = new THREE.Color();
  /** いま 人形にかけている明るさ（テスト窓口 render.env 用） */
  lastDoll = 1;
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
    // 空の光を弱める段数（ブロックの材料の uniform と LightField.level が読む。メッシュは作り直さない）
    const darken = darkenFromBrightness(time.brightness(), timeSettings.nightBrightness);
    skyDarkness.value = darken;
    // #76 夜空とかすみの色は 夜の度合い nt で 0.4 倍へ（線形の色にかける）。かすみの近さも 1/3 へ
    const nt = skyDarkness.night;
    this.bg.multiplyScalar(1 + (SCENERY_CONFIG.nightSkyColorMul - 1) * nt);
    (scene.background as THREE.Color).copy(this.bg);
    if (scene.fog) {
      scene.fog.color.copy(this.bg);
      if (scene.fog instanceof THREE.Fog) {
        const k = 1 + (SCENERY_CONFIG.nightFogMul - 1) * nt;
        scene.fog.near = SCENERY_CONFIG.fogNear * k;
        scene.fog.far = SCENERY_CONFIG.fogFar * k;
      }
    }
    // ブロック以外の景色（海など）は、空の下の明るさ（夜の倍率つき）。人形は足もとの光
    const outdoor = skyBrightness(LIGHT_CONFIG.maxLevel, darken);
    let doll = time.dollBrightness();
    const { light, focus } = this.d;
    if (light && focus) {
      const p = focus();
      doll = Math.max(LIGHT_CONFIG.dollMin, light.brightness(p.x, p.y + 0.5, p.z));
    }
    this.lastDoll = doll;
    lighting.setLevels(outdoor, doll);

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
