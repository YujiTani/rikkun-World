/**
 * #308 gashaBig.ts を 分けた もの: がしゃどくろ（第一形態）の 型（関節の 名前・当たりの 箱・ガラスの 雲の マス・体の モデル）。
 * gashaBigActor・gashaBigPlaced など 体の 動きを 受け持つ 側は ここだけ 読む（gashaBig.ts と 輪に ならない ように）。
 */
import type { Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { SwirlEyes } from './gashaBigSwirl';

export const JOINT_NAMES = [
  'Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftArmMid', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightArmMid', 'RightForeArm', 'RightHand',
] as const;
export type JointName = (typeof JOINT_NAMES)[number];

/** ガラスの 雲の 1 マス: hit = 当たりの 箱の 番号、cell = マスの 番号（mask の 中）、ranges = この マスの 頂点（バケツの 中の はじめ・数） */
export interface GlassCell { hit: number; cell: number; joint: JointName; ranges: { start: number; count: number }[]; local: Vector3 }

export interface Hit {
  name: string;
  /** どの 関節に ついて 動くか */
  joint: JointName;
  /** もとの 座標（からだ ぜんたいの 休みの 姿勢）での 中心・3 本の 軸（長さ 1）・はんぶんの 大きさ */
  c: Vector3;
  axes: [Vector3, Vector3, Vector3];
  half: [number, number, number];
  /** ガラスの 雲: 1 ブロックの マスごとの 有る・ない（nx × nz。u が 軸 0、w が 軸 2）。割れた マスは 0 */
  mask?: GlassMask;
}

/** 雲の 板の マス（1 ブロック 単位）。割れる と on が 0 に なる */
export interface GlassMask { nx: number; nz: number; on: Uint8Array }
/** 箱の 中の 点（箱の 座標 u, w）が マスの 有る 所か */
export const maskHas = (m: GlassMask | undefined, u: number, w: number, hx: number, hz: number): boolean => {
  if (!m) return true;
  const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(((u + hx) / (2 * hx)) * m.nx)));
  const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(((w + hz) / (2 * hz)) * m.nz)));
  return m.on[iz * m.nx + ix] === 1;
};

export interface BigModel {
  /** ぜんたいの 親（位置・向き・拡大は これに つける） */
  group: Group;
  /** 関節ごとの Group（Hips が group の 子） */
  joints: Record<JointName, Group>;
  /** 休みの 姿勢での 関節の 位置（からだの 座標） */
  rest: Record<JointName, Vector3>;
  hits: Hit[];
  /** ガラスの 雲の マスの 一覧（割れる 単位）と、出す / 消す */
  glass: GlassCell[];
  setGlass(gc: GlassCell, on: boolean): void;
  /** 道に 生えた こけ・くさの 数（十字の 板の まとまり） */
  plants: number;
  /** 体の 外がわの こけ・くさ（かたまりの 数・板の 数）。毎コマ updateMoss で 関節の 動きに あわせる */
  mossOutside: { clumps: number; count: number };
  updateMoss(): void;
  /** 体の 外の こけ・くさを 焼く / もどす（gashaBigPlants.ts の OutsideMoss） */
  burnMoss(c: { x: number; y: number; z: number }, radius: number, max?: number): number[];
  restoreMoss(ids: readonly number[]): void;
  mossHidden(): number;
  /** コアの 見た目を ずらす（胴体の 座標の ずれ x, y, z・大きさの 倍・透明度の 倍）。もどす ときは (0,0,0,1,1) */
  setCoreFx(jx: number, jy: number, jz: number, scale: number, alphaK: number): void;
  /** コアの 色を 赤く する(0 = ふだんの 水色、1 = 赤。とどめの あと)。pulse = 明るさの ゆらぎ(0〜1)。0, 0 で もどす */
  setCoreRed(k: number, pulse?: number): void;
  eyes: MeshBasicMaterial;
  eyeHalo: MeshBasicMaterial;
  /** つかれた ときの くるくる目（渦巻き。ふだんは 見えない。gashaBigSwirl.ts） */
  swirl: SwirlEyes;
  brow: Mesh;
  /** もとの 座標 → ブロック の 拡大 */
  scale: number;
  /** 手の 先（もとの 座標。地面の 高さを 決める 点） */
  groundPts: Vector3[];
  /** 頭の 位置（もとの 座標） */
  head: Vector3;
  meshes: number;
}
