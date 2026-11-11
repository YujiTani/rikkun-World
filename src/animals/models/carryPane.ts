import * as THREE from 'three';
import { CARRY } from './animalRendererShared';

/**
 * だっこ中の 羽の 置き場所を 区画（半分）ごとに 決める（COOP-1 5c。docs/design/COOP-1.md §3.7 (d)「だっこの 絵」・AC157）。
 * 決める 材料は「その 区画の カメラ」と「だっこ した 人の 足もと」だけ。
 * 自分の 半分で 自分が だっこ → 1 人称（カメラの 前・画面の 下 25%）、相手の 半分で だっこ → だっこ した 人の 胸の 前（3 人称）。
 */
interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface CarryPlacement {
  /** カメラと だっこ した 人の 目の 距離が `CARRY.firstPersonDist` 未満（1 人称） */
  first: boolean;
  /** 3 人称の 置き場所（足もと + 胸の 高さ・前・横）と、顔が カメラを 向く yaw */
  chest: { x: number; y: number; z: number; yaw: number };
}

/** 置き場所の 計算（純関数）。`out` を 渡せば その 入れものを 書きかえて 返す（毎フレーム new しない） */
export function carryPlacement(cam: P3, feet: P3, out: CarryPlacement = { first: true, chest: { x: 0, y: 0, z: 0, yaw: 0 } }): CarryPlacement {
  out.first = Math.hypot(cam.x - feet.x, cam.y - (feet.y + CARRY.eyeY), cam.z - feet.z) < CARRY.firstPersonDist;
  // カメラ から 足もと への 水平の むき（真上 なら 北）
  let fx = feet.x - cam.x;
  let fz = feet.z - cam.z;
  const len = Math.hypot(fx, fz);
  if (len < 1e-4) {
    fx = 0;
    fz = -1;
  } else {
    fx /= len;
    fz /= len;
  }
  // 足もとの むこう がわ へ chestFront、カメラ から 見て 右 へ chestSide
  const c = out.chest;
  c.x = feet.x + fx * CARRY.chestFront - fz * CARRY.chestSide;
  c.z = feet.z + fz * CARRY.chestFront + fx * CARRY.chestSide;
  c.y = feet.y + CARRY.chestY;
  c.yaw = Math.atan2(-(cam.x - c.x), -(cam.z - c.z));
  return out;
}

/** `placeCarriedRoot` が 使いまわす 入れもの */
export interface CarryScratch {
  v: THREE.Vector3;
  q: THREE.Quaternion;
  flipY: THREE.Quaternion;
}

/** 羽の 根（root）を `p` の とおりに 置く。1 人称は カメラ の 前、3 人称は 胸 の 前（顔が カメラの ほう） */
export function placeCarriedRoot(root: THREE.Object3D, camera: THREE.Camera, p: CarryPlacement, s: CarryScratch): void {
  root.scale.setScalar(p.first ? CARRY.firstScale : CARRY.scale);
  if (p.first) {
    const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 75;
    const topY = CARRY.topNdc * CARRY.front * Math.tan((fov * Math.PI) / 360);
    s.v.set(0, topY - CARRY.height * CARRY.firstScale, -CARRY.front).applyMatrix4(camera.matrixWorld);
    root.position.copy(s.v);
    camera.getWorldQuaternion(s.q);
    root.quaternion.copy(s.q).multiply(s.flipY); // 顔（−z）が カメラ の ほう
  } else {
    root.position.set(p.chest.x, p.chest.y, p.chest.z);
    root.rotation.set(0, p.chest.yaw, 0);
  }
}
