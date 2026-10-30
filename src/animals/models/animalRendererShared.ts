import type * as THREE from 'three';
import type { CoopInfo, KitInfo } from '../../contracts';
import type { AnimalFx } from '../../fx/animalFx';
import type { AnimalModelKind } from './chickenModel';
import type { PoseBuf } from './chickenPose';
import type { BuiltModel } from './voxelMesh';

export interface Entry {
  id: number;
  /** 形の 種類 × リボン の ある なし（`kindIndex * 2 + mark`） */
  key: number;
  kind: AnimalModelKind;
  /** 形の 骨 → 動き の 骨 番号 */
  bmap: Int16Array;
  gen: number;
  root: THREE.Group;
  rig: THREE.Group;
  bones: THREE.Bone[];
  mesh: THREE.SkinnedMesh;
  hull: THREE.SkinnedMesh;
  pose: PoseBuf;
  model: BuiltModel;
  /** 版 3.2: パタパタ の はじまり・着地 の 時刻（ms） */
  flutterOn: boolean;
  flutterStart: number;
  landStart: number;
}

/** 角度を −π〜π に */
export function wrapAngle(a: number): number {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  else if (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export interface AnimalRendererStats {
  /** 見えている にわとり の 数 */
  animals: number;
  /** 今フレーム 描く もの（メッシュ・Points）の 数 = 描画回数 */
  draws: number;
  /** 描く 三角形 の 数（つぶ・影 込み） */
  triangles: number;
}

export interface AnimalRendererOpts {
  /** 音・つぶ・頭の 上の ハート の 計算 */
  fx: AnimalFx;
  /** 「動きの 強さ」0〜1。なければ 1 */
  motion?: () => number;
  /** 時計（ミリ秒。パタパタ・着地 ぽよん の 経過に 使う。なければ performance.now） */
  now?: () => number;
  /**
   * プレイヤー の 足もと（だっこ の 置き場所 を きめる）。カメラ が プレイヤー の 目 に 近ければ 1 人称（画面 の 下 25% に 顔 が 見える）、
   * はなれて いれば 3 人称（プレイヤー の 胸 の 前）。なければ いつも カメラ の 前（1 人称）。
   */
  player?: () => { x: number; y: number; z: number } | null;
  /**
   * LIVE-2: こたつ の たまご（`forEachKit`）・小屋（`forEachCoop`）の もと。`animals` を そのまま わたす。
   * なければ こたつ の たまご・小屋 は 描かない。
   */
  source?: {
    forEachKit(fn: (k: KitInfo & { hatchT: number }) => void): void;
    forEachCoop(fn: (c: CoopInfo) => void): void;
  };
  /**
   * LIVE-2: 小屋 を ここで 描く（1 つ 2 回: 小屋 ＋ すばこ の たまご）。ふだん は false（小屋 は ブロック の 面で 描く。
   * その ときは すばこ の たまご だけ 描く）。
   */
  drawCoops?: boolean;
}

/** 小屋 1 つ */
export interface CoopProp {
  root: THREE.Group;
  coop: THREE.Group;
  nest: THREE.Group;
  door: THREE.Group;
  nestMesh: THREE.SkinnedMesh;
  nestKey: string;
}

/** だっこ の 置きかた（DESIGN 16.16・LIVE-1 §2.8・AC28） */
export const CARRY = {
  /** だっこ中 の 大きさ（ふつう より 小さい） */
  scale: 0.7,
  /** にわとり の 高さ（ブロック。コーム まで） */
  height: 0.8,
  /** 1 人称: カメラ から の 前 の 距離 */
  front: 1.2,
  /** 1 人称: にわとり の 上の はし が 来る 画面 の 高さ（ndc。−1 = 下の はし。−0.5 = 下 25% の さかい） */
  topNdc: -0.1,
  /** 1 人称: だっこ中 の 大きさ（ステータス板 の 上 に おさまる ように 小さめ） */
  firstScale: 0.45,
  /** 3 人称: 胸 の 高さ・前 への 出し */
  chestY: 1.0,
  chestFront: 0.3,
  /** 3 人称: カメラ から 見て 右 へ（プレイヤー の かげ に ならない） */
  chestSide: 0.8,
  /** プレイヤー の 目 の 高さ（足もと から） */
  eyeY: 1.6,
  /** カメラ が この 距離 より 近ければ 1 人称（`DOLL_HIDE_DISTANCE`） */
  firstPersonDist: 1.2,
} as const;

/** `carryInfo()` の 中身（テスト・UI 検査用） */
export interface CarryInfo {
  firstPerson: boolean;
  /** にわとり の 足もと の 位置（世界） */
  x: number;
  y: number;
  z: number;
  /** 上の はし の 画面 の 高さ（ndc。−1 = 下の はし） */
  topNdcY: number;
  /** 下の はし の 画面 の 高さ（ndc） */
  bottomNdcY: number;
  /** まん中 の 画面 の よこ（ndc） */
  centerNdcX: number;
  /** にわとり の 前（−z）と カメラ の ほう の 向きの 内積（1 = まっすぐ カメラ を 向く） */
  faceToCamera: number;
}
