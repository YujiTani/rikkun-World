import * as THREE from 'three';
import { ROPE_STAKE } from '../blocks/rope';
import { tetherOf } from '../blocks/ropeTether';

/** ROPE-1 版 3: つないで いる 間、くいから プレイヤーの こしまで ほそい なわ（線 1 本）を かく */
export function createTetherLine(scene: THREE.Scene, world: { getBlock(x: number, y: number, z: number): string }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(6);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc9a46a }));
  line.frustumCulled = false;
  line.visible = false;
  scene.add(line);
  return {
    update(p: { x: number; y: number; z: number }): void {
      const a = tetherOf(world).live((x, y, z) => world.getBlock(x, y, z), ROPE_STAKE);
      line.visible = a !== null;
      if (!a) return;
      pos.set([a.x, a.y + 0.2, a.z, p.x, p.y + 0.9, p.z]);
      geo.attributes.position!.needsUpdate = true;
    },
  };
}
