import * as THREE from 'three';

/**
 * M0 用の仮の景色（草ブロックが少し並んでいるだけ）。
 * M1 で本物の世界に置きかえる。
 */
export function buildPlaceholderScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(5, 10, 3);
  scene.add(sun);

  const size = 8;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({ color: 0x5dbb3f });
  // 同じ形をたくさん置くので InstancedMesh で描画 1 回にまとめる
  const blocks = new THREE.InstancedMesh(geometry, material, size * size);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      m.makeTranslation(x - size / 2, 0, z - size / 2);
      blocks.setMatrixAt(i++, m);
    }
  }
  scene.add(blocks);

  camera.position.set(0, 4, 8);
  camera.lookAt(0, 0, 0);
}
