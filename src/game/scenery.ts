import * as THREE from 'three';
import { SCENERY_CONFIG as C } from './config';

/**
 * 空の色・かすみ・遠くの海（見た目だけ）を作る（VOX-D: 世界は どこまでも続くので、海の板は プレイヤーについて動く）。
 * 海は プレイヤーの まわり（hole の はば）をあけて外側を囲む 4 まいの面。followScenery で 毎コマ 位置を合わせる。
 */
export function buildScenery(scene: THREE.Scene, hole: number = C.ocean.hole): THREE.Mesh {
  scene.background = new THREE.Color(C.skyColor);
  scene.fog = new THREE.Fog(C.skyColor, C.fogNear, C.fogFar);

  const e = C.ocean.extent;
  const y = C.ocean.surfaceY;
  const x0 = -hole;
  const x1 = hole;
  const z0 = -hole;
  const z1 = hole;
  // [xmin, zmin, xmax, zmax] の長方形 4 つ（北・南・西・東。かどはどれか 1 つにふくめる）
  const rects: Array<[number, number, number, number]> = [
    [x0 - e, z0 - e, x1 + e, z0], // 北
    [x0 - e, z1, x1 + e, z1 + e], // 南
    [x0 - e, z0, x0, z1], // 西
    [x1, z0, x1 + e, z1], // 東
  ];
  const build = (height: number): THREE.BufferGeometry => {
    const pos: number[] = [];
    const idx: number[] = [];
    rects.forEach(([ax, az, bx, bz], i) => {
      pos.push(ax, height, az, bx, height, az, bx, height, bz, ax, height, bz);
      const o = i * 4;
      // 上から見て表になる向き（法線 +Y）
      idx.push(o, o + 3, o + 2, o, o + 2, o + 1);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setIndex(idx);
    return geometry;
  };
  const material = new THREE.MeshBasicMaterial({ color: C.ocean.color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(build(y), material);
  mesh.name = 'ocean';
  scene.add(mesh);
  // 世界のふちの下: 水ごしに世界の外の下を見ると空が見えて細い線になるので、海の底（仮の海のふちの底の高さ）をしく
  // 色は、水（#3A7BD5 の 60%）ごしに見たとき海の色（ocean.color）になるすなの色
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xdfd7a0, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(build(C.ocean.floorY), floorMaterial);
  floor.name = 'oceanFloor';
  scene.add(floor);
  return mesh;
}

/** 海の板を プレイヤーの いる列（16 ごと）に合わせる。毎コマ呼んでよい */
export function followScenery(scene: THREE.Scene, x: number, z: number): void {
  const sx = Math.floor(x / 16) * 16;
  const sz = Math.floor(z / 16) * 16;
  for (const name of ['ocean', 'oceanFloor']) {
    const m = scene.getObjectByName(name);
    if (m) m.position.set(sx, 0, sz);
  }
}
