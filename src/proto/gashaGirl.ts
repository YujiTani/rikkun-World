/**
 * #293 試作（開発サーバーだけ）: がしゃどくろ 第二形態（少女）の 大きさを、りっくんと くらべる。
 * `?proto=gashaGirl` のときだけ main.ts から 読まれる。GLB は リポジトリに 入れず /__proto-gasha/ から 読む。
 * 少女は 歩かない・走らない（移動は ワープだけ）。片手を 前に 出して 立つ ポーズを 骨を 回して 作り、
 * 立ち姿の 小さな ゆれだけ 固定ステップ（Game.onUpdate）で 動かす。
 */
import { Box3, type Camera, MeshBasicMaterial, type Mesh, type MeshStandardMaterial, Group, Object3D, Quaternion, Scene, SkinnedMesh, Vector3, type Bone } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GashaGirlDeps {
  scene: Scene;
  camera: Camera;
  onUpdate(fn: (dt: number) => void): void;
  player(): { x: number; y: number; z: number; yawDeg: number };
  groundY(x: number, z: number): number;
}

/** りっくんは 1.8 ブロック。左から 小さい順 */
export const GIRL_HEIGHTS = [2.0, 2.4, 3.0];
const AHEAD = 5; // プレイヤーの 前 4〜6 ブロック
const GAP = 2.6; // 体と体の まんなかどうしの 間

const tmpV = new Vector3();
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();

/** bone から child へ の 向きを、世界の 向き dir に 合わせる（bone だけ 回す） */
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

function rotateWorld(bone: Object3D, axis: Vector3, rad: number): void {
  bone.updateWorldMatrix(true, true);
  const delta = tmpQ.setFromAxisAngle(axis, rad);
  const wq = bone.getWorldQuaternion(tmpQ2).premultiply(delta);
  const pq = bone.parent!.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateWorldMatrix(false, true);
}

/** ゾンビの ように 右うでを 前へ。model の まえ = +Z、みぎて(model の 右) = -X と して 呼ぶ。 */
function poseZombie(root: Object3D, front: Vector3): void {
  const b = (n: string) => root.getObjectByName(n) as Bone;
  const down = new Vector3(0, -1, 0);
  const left = new Vector3().crossVectors(new Vector3(0, 1, 0), front); // 向かって 左（model の 左）
  root.updateMatrixWorld(true);
  // 右うで: 肩の 高さで まっすぐ 前（手首は 少し 下）
  const q = new URLSearchParams(location.search).get('pose');
  aimBone(b('RightArm'), b('RightForeArm'), q === 'side' ? left.clone().negate() : q === 'diag' ? front.clone().addScaledVector(left, -0.8) : front.clone());
  const tw = Number(new URLSearchParams(location.search).get('twist') ?? 0);
  if (tw) { rotateWorld(b('RightArm'), front, (tw * Math.PI) / 180); rotateWorld(b('RightForeArm'), front, (tw * Math.PI) / 180); }
  aimBone(b('RightForeArm'), b('RightHand'), front.clone().multiplyScalar(0.96).addScaledVector(down, 0.28));
  // 左うで: 体の よこに だらん
  aimBone(b('LeftArm'), b('LeftForeArm'), down.clone().addScaledVector(left, 0.12));
  aimBone(b('LeftForeArm'), b('LeftHand'), down.clone().addScaledVector(left, 0.05));
  // あたまは 少し 前へ
  rotateWorld(b('Head'), new Vector3().crossVectors(front, new Vector3(0, 1, 0)).normalize(), 0.3);
}

export interface GashaGirlHandle {
  place(opts?: { groundY?: number; shift?: number; side?: boolean }): void;
  figures: Group[];
  /** 各体の 頭の 上の 画面の 位置（px、スクショの ラベル用）。りっくんの 頭も 返す */
  labels(riky: { x: number; y: number; z: number }, w: number, h: number): { x: number; y: number }[];
}

export function startGashaGirl(deps: GashaGirlDeps): void {
  const base = './__proto-gasha/girl-rig/girl-rigged.glb';
  new GLTFLoader().load(
    base,
    (gltf) => {
      const figures: { pivot: Group; model: Object3D; h: number }[] = [];
      const front = new Vector3(0, 0, 1);
      // 1 体ずつ 別の 骨が いるので 読みなおす（同じ 読みこみの clone は SkeletonUtils が いる）
      void import('three/examples/jsm/utils/SkeletonUtils.js').then(({ clone }) => {
        GIRL_HEIGHTS.forEach((h) => {
          const model = clone(gltf.scene);
          if (new URLSearchParams(location.search).get('pose') !== 'rest') poseZombie(model, front);
          model.updateMatrixWorld(true);
          const box = new Box3().setFromObject(model, true);
          const s = h / (box.max.y - box.min.y);
          model.scale.multiplyScalar(s);
          model.updateMatrixWorld(true);
          const box2 = new Box3().setFromObject(model, true);
          model.position.y -= box2.min.y; // 足の うらを 0 に
          model.traverse((o) => {
            if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
            // この ゲームの 世界には 光源が ない（材料の 色で 明るさを 決める）ので、明かりの いらない 材料に かえる
            const mesh = o as Mesh;
            if (mesh.isMesh) {
              const old = mesh.material as MeshStandardMaterial;
              mesh.material = new MeshBasicMaterial({ map: old.map, color: 0xffffff, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest });
            }
          });
          const pivot = new Group();
          pivot.add(model);
          deps.scene.add(pivot);
          figures.push({ pivot, model, h });
        });
        const place = (opts?: { groundY?: number; shift?: number; side?: boolean }) => {
          const p = deps.player();
          const yaw = (p.yawDeg * Math.PI) / 180;
          const fx = Math.sin(yaw), fz = -Math.cos(yaw); // プレイヤーの 前
          const rx = Math.cos(yaw), rz = Math.sin(yaw); // プレイヤーの 右
          figures.forEach((f, i) => {
            const side = (i - 1) * GAP + (opts?.shift ?? 0);
            const x = p.x + fx * AHEAD + rx * side;
            const z = p.z + fz * AHEAD + rz * side;
            const y = (opts?.groundY ?? deps.groundY(Math.floor(x), Math.floor(z))) + 1;
            f.pivot.position.set(x, y, z);
            // プレイヤーの ほうを 向く（model の まえ = +Z）
            f.pivot.rotation.y = opts?.side ? Math.atan2(rx, rz) : Math.atan2(p.x - x, p.z - z); // side: よこ向き（スクショ用）
          });
        };
        place();
        let t = 0;
        deps.onUpdate((dt) => {
          t += dt;
          figures.forEach((f, i) => {
            const ph = i * 1.7;
            f.model.position.y = f.model.userData.y0 ?? (f.model.userData.y0 = f.model.position.y);
            f.model.position.y += Math.sin(t * 1.6 + ph) * 0.02;
            f.model.position.x = Math.sin(t * 0.9 + ph) * 0.03;
          });
        });
        (window as unknown as { __gashaGirl: GashaGirlHandle }).__gashaGirl = { place, figures: figures.map((f) => f.pivot),
          labels: (riky, w, h) => {
            const pts = figures.map((f) => new Vector3(f.pivot.position.x, f.pivot.position.y + f.h + 0.3, f.pivot.position.z));
            pts.push(new Vector3(riky.x, riky.y + 1.8 + 0.3, riky.z));
            return pts.map((v) => { v.project(deps.camera); return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }; });
          },
        };
      });
    },
    undefined,
    (e) => console.warn('[proto gashaGirl] 読めません', e),
  );
}

