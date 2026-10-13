import * as THREE from 'three';
import type { Vec3 } from '../contracts';

/**
 * しずく（みずやり）。まいた 瞬間、はんい の はたけ 1 マス に つき つぶ 3 こ が 上 1 マス から 落ちる（20 ステップ）。
 * 1 回 6（ながい じょうろ 2 マス × 3）。光の しくみ には 入れない・夜でも 同じ 明るさ（MeshBasicMaterial）。
 * 計算（`WaterDropModel`）と 描画（`WaterDropFx`）を 分けた。つぶ は 固定の 入れ物（毎ステップ new しない）。
 */

export const DROP_LIFE = 20;
export const DROPS_PER_TILE = 3;
export const DROP_POOL = 24;
export const DROP_COLOR = 0x81d4fa;
export const DROP_SIZE = 0.08;
/** はたけ の 上の面 から 上 1 マス から 落ちる */
const DROP_FALL = 1;
/** 1 マス の 中の つぶ の 場所（乱数 を 使わない） */
const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [0.25, 0.6],
  [0.7, 0.3],
  [0.45, 0.8],
];

export interface DropView {
  x: number;
  y: number;
  z: number;
  /** 0〜1（0 = 出た ところ） */
  age: number;
}

export class WaterDropModel {
  private readonly px = new Float32Array(DROP_POOL);
  private readonly py = new Float32Array(DROP_POOL);
  private readonly pz = new Float32Array(DROP_POOL);
  /** のこり ステップ（0 = 空き） */
  private readonly left = new Int16Array(DROP_POOL);
  private next = 0;
  /** これまで に 出た つぶ の 数（`farm.fx()` の `splash`） */
  total = 0;

  /** はたけ の マス ごと に 3 こ。マス の 上の面（y+1）から 1 マス 上 で 出す */
  spawn(cells: readonly Vec3[]): void {
    for (const c of cells) {
      for (const [ox, oz] of SPOTS) {
        const i = this.next;
        this.next = (this.next + 1) % DROP_POOL;
        this.px[i] = c.x + ox;
        this.py[i] = c.y + 1 + DROP_FALL;
        this.pz[i] = c.z + oz;
        this.left[i] = DROP_LIFE;
        this.total++;
      }
    }
  }

  /** 1 ステップ */
  tick(): void {
    for (let i = 0; i < DROP_POOL; i++) if (this.left[i]! > 0) this.left[i]!--;
  }

  /** いま 出ている つぶ の 数 */
  count(): number {
    let n = 0;
    for (let i = 0; i < DROP_POOL; i++) if (this.left[i]! > 0) n++;
    return n;
  }

  /** i 番目 の 今の 場所（空き なら false）。落ちる は だんだん はやく（二次） */
  read(i: number, out: DropView): boolean {
    const l = this.left[i]!;
    if (l <= 0) return false;
    const age = 1 - l / DROP_LIFE;
    out.x = this.px[i]!;
    out.y = this.py[i]! - DROP_FALL * age * age;
    out.z = this.pz[i]!;
    out.age = age;
    return true;
  }

  reset(): void {
    this.left.fill(0);
    this.total = 0;
    this.next = 0;
  }
}

/** 描画: 小さな 箱 の InstancedMesh 1 つ（描画 1 回） */
export class WaterDropFx {
  readonly model = new WaterDropModel();
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly v: DropView = { x: 0, y: 0, z: 0, age: 0 };
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(parent?: THREE.Object3D) {
    const geo = new THREE.BoxGeometry(DROP_SIZE, DROP_SIZE * 1.4, DROP_SIZE);
    const mat = new THREE.MeshBasicMaterial({ color: DROP_COLOR, transparent: true, opacity: 0.9, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, DROP_POOL);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    for (let i = 0; i < DROP_POOL; i++) this.mesh.setMatrixAt(i, this.hidden);
    this.mesh.instanceMatrix.needsUpdate = true;
    parent?.add(this.mesh);
  }

  /** `pour` の 出来事 を 受けた とき（`farm.lastPourCells()`）。0 マス でも 1 マス 分 は 出さない */
  pour(cells: readonly Vec3[]): void {
    this.model.spawn(cells);
  }

  /** 固定ステップ ごと に 1 回 */
  step(): void {
    this.model.tick();
    this.sync();
  }

  /** 今 出ている つぶ（`farm.fx()` 用） */
  particles(): Array<{ kind: 'splash'; x: number; y: number; z: number }> {
    const out: Array<{ kind: 'splash'; x: number; y: number; z: number }> = [];
    for (let i = 0; i < DROP_POOL; i++) if (this.model.read(i, this.v)) out.push({ kind: 'splash', x: this.v.x, y: this.v.y, z: this.v.z });
    return out;
  }

  private sync(): void {
    for (let i = 0; i < DROP_POOL; i++) {
      if (this.model.read(i, this.v)) {
        this.m.makeTranslation(this.v.x, this.v.y, this.v.z);
        this.mesh.setMatrixAt(i, this.m);
      } else {
        this.mesh.setMatrixAt(i, this.hidden);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
