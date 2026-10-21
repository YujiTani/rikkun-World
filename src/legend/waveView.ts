import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import type { WaveView3D } from './WaveSystem';

/** 真空波の 絵の 向き `face` を 決める ための カメラ（画面に うつした 進む 向き）。WEAPON-8 §3.8 */
export function createWaveView3D(camera: THREE.PerspectiveCamera): { view: () => WaveView3D } {
  const fwd = new THREE.Vector3();
  const v = new THREE.Vector3();
  const forward: Vec3 = { x: 0, y: 0, z: -1 };
  const out: WaveView3D = {
    forward,
    project(p, o) {
      v.set(p.x, p.y, p.z).project(camera);
      if (v.z < -1 || v.z > 1) return false;
      o.x = v.x * camera.aspect;
      o.y = v.y;
      return true;
    },
  };
  return {
    view() {
      camera.updateMatrixWorld();
      camera.getWorldDirection(fwd);
      forward.x = fwd.x;
      forward.y = fwd.y;
      forward.z = fwd.z;
      return out;
    },
  };
}
