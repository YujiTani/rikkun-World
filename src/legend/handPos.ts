import * as THREE from 'three';
import type { Vec3 } from '../contracts';

/**
 * WEAPON-8 §3.5: 剣を 持つ 手（にぎり）と 剣先の 位置。ため中の 手もとの 光が ここへ あつまる。
 * - 三人称: 体の 右がわ・頭の あたり（ため中の 絵は おおげさぎり コマ 5 = 刀を 頭の 上）。向きに ついて まわる。
 * - 一人称（カメラが 体に 近く 人形が 見えない 状態）: 画面の 右下の 剣の にぎり。今の ゲームは 一人称の 剣を 描かない ので、
 *   にぎり・剣先の 画面の 位置を ここで 決め、カメラの 前 FIRST_DEPTH の 所に 置く（光は 画面の その 位置に 見える）。
 */
export const THIRD_HAND = { right: 0.38, up: 1.65 } as const;
export const THIRD_TIP = { right: 0.2, forward: 0.7, up: 0.55 } as const;
/** 一人称: 画面の 位置（0〜1。左上が 0）。右下 4 分の 1 の 中・照準の まわりの 外 */
export const FIRST_PERSON_HAND = { x: 0.72, y: 0.8 } as const;
export const FIRST_PERSON_TIP = { x: 0.8, y: 0.66 } as const;
/** 一人称で 光を 置く カメラからの きょり。三人称（カメラは 約 4 マス うしろ）に くらべて 光の 大きさは この 割合 */
export const FIRST_DEPTH = 1.6;
export const FIRST_SCALE = 0.4;

export interface HandInfo {
  first: boolean;
  world: Vec3;
  tip: Vec3;
  /** 画面の 位置 0〜1（左上が 0）。見えない とき null */
  screen: { x: number; y: number } | null;
  /** 光の 大きさの 倍率（一人称は 小さく） */
  scale: number;
}

export function newHandInfo(): HandInfo {
  return { first: false, world: { x: 0, y: 0, z: 0 }, tip: { x: 0, y: 0, z: 0 }, screen: null, scale: 1 };
}

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();

/** 世界の 点の 画面の 位置（0〜1、左上が 0）。うしろ・画面の 外は null */
export function screenOf(camera: THREE.PerspectiveCamera, p: Vec3, out: { x: number; y: number }): { x: number; y: number } | null {
  _v.set(p.x, p.y, p.z).project(camera);
  if (_v.z < -1 || _v.z > 1) return null;
  const x = (_v.x + 1) / 2;
  const y = (1 - _v.y) / 2;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  out.x = x;
  out.y = y;
  return out;
}

/** 画面の 位置（0〜1）を カメラの 前 depth の 世界の 点に する */
export function pointOnScreen(camera: THREE.PerspectiveCamera, sx: number, sy: number, depth: number, out: Vec3): Vec3 {
  _v.set(sx * 2 - 1, 1 - sy * 2, 0.5).unproject(camera);
  _v.sub(camera.position).normalize();
  // 視線の 前向きの 成分が depth に なる 長さまで
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  const t = depth / Math.max(1e-6, _v.dot(fwd));
  out.x = camera.position.x + _v.x * t;
  out.y = camera.position.y + _v.y * t;
  out.z = camera.position.z + _v.z * t;
  return out;
}

export function computeHand(i: { first: boolean; pos: Vec3; yawDeg: number; camera: THREE.PerspectiveCamera }, out: HandInfo): HandInfo {
  out.first = i.first;
  if (i.first) {
    pointOnScreen(i.camera, FIRST_PERSON_HAND.x, FIRST_PERSON_HAND.y, FIRST_DEPTH, out.world);
    pointOnScreen(i.camera, FIRST_PERSON_TIP.x, FIRST_PERSON_TIP.y, FIRST_DEPTH, out.tip);
    out.scale = FIRST_SCALE;
  } else {
    const y = i.yawDeg * DEG;
    const rx = Math.cos(y);
    const rz = Math.sin(y);
    const fx = Math.sin(y);
    const fz = -Math.cos(y);
    out.world.x = i.pos.x + rx * THIRD_HAND.right;
    out.world.y = i.pos.y + THIRD_HAND.up;
    out.world.z = i.pos.z + rz * THIRD_HAND.right;
    out.tip.x = out.world.x + rx * THIRD_TIP.right + fx * THIRD_TIP.forward;
    out.tip.y = out.world.y + THIRD_TIP.up;
    out.tip.z = out.world.z + rz * THIRD_TIP.right + fz * THIRD_TIP.forward;
    out.scale = 1;
  }
  const s = out.screen ?? { x: 0, y: 0 };
  out.screen = screenOf(i.camera, out.world, s) ? s : null;
  return out;
}
