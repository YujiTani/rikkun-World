/**
 * #308 gashaGirl.ts を 分けた もの: 少女の 骨を 世界の 向きで 回す 道具と、立ち姿（ゾンビ）の 最初の 形。
 */
import type { Bone, Object3D } from 'three';
import { Quaternion, Vector3 } from 'three';

const tmpV = new Vector3();
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();

function aimBone(bone: Object3D, child: Object3D, dir: Vector3): void {
  bone.updateWorldMatrix(true, true);
  const a = bone.getWorldPosition(new Vector3());
  const cur = child.getWorldPosition(tmpV).sub(a).normalize();
  const delta = tmpQ.setFromUnitVectors(cur, dir.clone().normalize());
  const wq = bone.getWorldQuaternion(tmpQ2).premultiply(delta);
  const pq = bone.parent!.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateWorldMatrix(false, true);
}

export function rotateWorld(bone: Object3D, axis: Vector3, rad: number): void {
  bone.updateWorldMatrix(true, true);
  const delta = tmpQ.setFromAxisAngle(axis, rad);
  const wq = bone.getWorldQuaternion(tmpQ2).premultiply(delta);
  const pq = bone.parent!.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateWorldMatrix(false, true);
}

/** ゾンビの ように 右うでを 前へ。model の まえ = +Z */
export function poseZombie(root: Object3D, front: Vector3): void {
  const b = (n: string) => root.getObjectByName(n) as Bone;
  const down = new Vector3(0, -1, 0);
  const left = new Vector3().crossVectors(new Vector3(0, 1, 0), front);
  root.updateMatrixWorld(true);
  aimBone(b('RightArm'), b('RightForeArm'), front.clone());
  aimBone(b('RightForeArm'), b('RightHand'), front.clone().multiplyScalar(0.96).addScaledVector(down, 0.28));
  aimBone(b('LeftArm'), b('LeftForeArm'), down.clone().addScaledVector(left, 0.12));
  aimBone(b('LeftForeArm'), b('LeftHand'), down.clone().addScaledVector(left, 0.05));
  rotateWorld(b('Head'), new Vector3().crossVectors(front, new Vector3(0, 1, 0)).normalize(), 0.3);
}
