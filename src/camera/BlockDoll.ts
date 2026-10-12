import * as THREE from 'three';
import type { BlockId, ItemId } from '../contracts';

const isBlockId = (item: ItemId): item is BlockId => item !== 'yokai_orb';
import { UNIT_BOX, getBlockMaterials } from '../fx/blockMaterials';
import {
  ACTION_SWING_DEG,
  ACTION_SWING_SECONDS,
  DIG_SWING_PERIOD_SECONDS,
  DOLL_COLORS,
  DOLL_HEAD_PITCH_MAX_DEG,
  DOLL_SETTLE_SECONDS,
  DOLL_SIZES,
  DOLL_SWING_MAX_DEG,
  DOLL_SWING_PERIOD_SECONDS,
  HELD_ARM_RAISE_FIRST_DEG,
  HELD_ARM_RAISE_THIRD_DEG,
  HELD_BLOCK_SIZE,
} from './config';

const DEG = Math.PI / 180;

function mat(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[]): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}

/** hidden = 見えない、first = 一人称（手足だけ）、third = 全部 */
export type DollMode = 'hidden' | 'first' | 'third';

/** 箱で作ったブロック人形（M1-02 §3.3）。原点が足もとの中央、前は -Z（yaw 0 = 北）。 */
export class BlockDoll {
  readonly group = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private phase = 0;
  /** 0〜1。振りの大きさ */
  private amplitude = 0;
  /** 右うでの角度（度）。左うでと左あしは逆向き */
  armAngle = 0;
  legAngle = 0;
  private mode: DollMode = 'hidden';
  private readonly bodyMesh: THREE.Mesh;
  private readonly heldMesh = new THREE.Mesh(UNIT_BOX);
  private held: ItemId | null = null;
  /** 右うでを振っている経過秒。負 = 振っていない */
  private actionT = -1;
  private digging = false;
  private digTimer = 0;

  constructor() {
    const C = DOLL_COLORS;
    const [lw, lh, ld] = DOLL_SIZES.leg;
    const [bw, bh, bd] = DOLL_SIZES.body;
    const [aw, ah, ad] = DOLL_SIZES.arm;
    const [hw, hh, hd] = DOLL_SIZES.head;

    // あし: 上の端を軸に振る
    for (const [g, x] of [
      [this.legL, -lw / 2],
      [this.legR, lw / 2],
    ] as const) {
      g.position.set(x, lh, 0);
      const pants = box(lw, lh - DOLL_SIZES.shoeHeight, ld, mat(C.pants));
      pants.position.y = -(lh - DOLL_SIZES.shoeHeight) / 2;
      const shoe = box(lw, DOLL_SIZES.shoeHeight, ld, mat(C.shoes));
      shoe.position.y = -lh + DOLL_SIZES.shoeHeight / 2;
      g.add(pants, shoe);
      this.group.add(g);
    }

    // からだ
    const body = box(bw, bh, bd, mat(C.shirt));
    body.position.y = lh + bh / 2;
    this.bodyMesh = body;
    this.group.add(body);

    // うで: 上 1/3 はそで（青）、下ははだ色
    for (const [g, x] of [
      [this.armL, -(bw / 2 + aw / 2)],
      [this.armR, bw / 2 + aw / 2],
    ] as const) {
      g.position.set(x, lh + bh, 0);
      const sleeveH = ah * DOLL_SIZES.sleeveRatio;
      const sleeve = box(aw, sleeveH, ad, mat(C.shirt));
      sleeve.position.y = -sleeveH / 2;
      const hand = box(aw, ah - sleeveH, ad, mat(C.skin));
      hand.position.y = -sleeveH - (ah - sleeveH) / 2;
      g.add(sleeve, hand);
      this.group.add(g);
    }

    // あたま: 前 = -Z、後ろ = +Z、上 = +Y。上面と後ろ面は髪
    const skin = mat(C.skin);
    const hair = mat(C.hair);
    // BoxGeometry の面の順: +x, -x, +y, -y, +z, -z
    const headMesh = box(hw, hh, hd, [skin, skin, hair, skin, hair, skin]);
    headMesh.position.y = hh / 2;
    this.head.add(headMesh);
    const eyeMat = mat(C.eye);
    for (const x of [-0.12, 0.12]) {
      const eye = box(0.1, 0.1, 0.02, eyeMat);
      eye.position.set(x, hh * 0.5, -hd / 2 - 0.005);
      this.head.add(eye);
    }
    // 前髪
    const fringe = box(hw, 0.1, 0.03, hair);
    fringe.position.set(0, hh - 0.05, -hd / 2 - 0.005);
    this.head.add(fringe);
    this.head.position.y = lh + bh;
    this.group.add(this.head);

    // 右手に持つブロック（手の先）
    this.heldMesh.scale.setScalar(HELD_BLOCK_SIZE);
    this.heldMesh.position.set(0, -ah - HELD_BLOCK_SIZE * 0.2, 0);
    this.heldMesh.visible = false;
    this.armR.add(this.heldMesh);
    this.applyMode();
  }

  /** あたまとからだが見えるか（M1 からの意味。一人称では false） */
  get visible(): boolean {
    return this.mode === 'third';
  }
  set visible(v: boolean) {
    this.setMode(v ? 'third' : 'hidden');
  }

  setMode(mode: DollMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.applyMode();
  }
  getMode(): DollMode {
    return this.mode;
  }
  private applyMode(): void {
    this.group.visible = this.mode !== 'hidden';
    this.head.visible = this.mode === 'third';
    this.bodyMesh.visible = this.mode === 'third';
  }
  /** どの部分が見えるか */
  get parts(): { head: boolean; body: boolean; arms: boolean; legs: boolean } {
    const third = this.mode === 'third';
    const any = this.mode !== 'hidden';
    return { head: third, body: third, arms: any, legs: any };
  }

  /** 右手に持つアイテム（null = 何も持たない） */
  setHeld(item: ItemId | null): void {
    if (item === this.held) return;
    this.held = item;
    if (item === null) {
      this.heldMesh.visible = false;
    } else {
      // M3: アイテムだけのもの（ようかいだま）の持ち方は担当 AD が足す。それまでは石で表示
      this.heldMesh.material = getBlockMaterials(isBlockId(item) ? item : 'stone');
      this.heldMesh.visible = true;
    }
  }
  get heldItem(): ItemId | null {
    return this.held;
  }
  /** 持ったブロックの世界座標の中心（持っていなければ null） */
  heldWorldPosition(out: THREE.Vector3): THREE.Vector3 | null {
    if (this.held === null || this.mode === 'hidden') return null;
    this.group.updateMatrixWorld(true);
    return this.heldMesh.getWorldPosition(out);
  }

  /** 右うでを 1 回振る（置いたとき） */
  swing(): void {
    this.actionT = 0;
  }
  /** ほっているあいだ、0.25 秒に 1 回振る */
  setDigging(on: boolean): void {
    if (on && !this.digging) this.digTimer = DIG_SWING_PERIOD_SECONDS; // すぐ 1 回目を振る
    this.digging = on;
  }

  /** 位置・向き・手足を更新する */
  update(
    dt: number,
    pos: { x: number; y: number; z: number },
    yawDeg: number,
    pitchDeg: number,
    walking: boolean,
  ): void {
    this.group.position.set(pos.x, pos.y, pos.z);
    this.group.rotation.y = -yawDeg * DEG;
    const p = Math.max(-DOLL_HEAD_PITCH_MAX_DEG, Math.min(DOLL_HEAD_PITCH_MAX_DEG, pitchDeg));
    this.head.rotation.x = p * DEG;

    const target = walking ? 1 : 0;
    const rate = dt / DOLL_SETTLE_SECONDS;
    if (this.amplitude < target) this.amplitude = Math.min(target, this.amplitude + rate);
    else this.amplitude = Math.max(target, this.amplitude - rate);
    if (walking) this.phase += (2 * Math.PI * dt) / DOLL_SWING_PERIOD_SECONDS;
    else if (this.amplitude === 0) this.phase = 0;

    const swing = DOLL_SWING_MAX_DEG * this.amplitude * Math.sin(this.phase);
    // 右うで前なら右あしは後ろ（逆位相）
    this.armAngle = swing;
    this.legAngle = -swing;
    this.updateAction(dt);
    const actionDeg =
      this.actionT >= 0 ? ACTION_SWING_DEG * Math.sin((Math.PI * this.actionT) / ACTION_SWING_SECONDS) : 0;
    if (this.mode === 'first') {
      // 一人称: 右うでは前に出して、向き（pitch）にそのままついていく（見え方に合わせた形）
      const raise = this.held !== null ? HELD_ARM_RAISE_FIRST_DEG : HELD_ARM_RAISE_FIRST_DEG * 0.6;
      this.armR.rotation.x = (raise + pitchDeg - actionDeg) * DEG;
    } else {
      const raise = this.held !== null ? HELD_ARM_RAISE_THIRD_DEG : 0;
      this.armR.rotation.x = (swing * (this.held !== null ? 0.3 : 1) + raise - actionDeg) * DEG;
    }
    this.armL.rotation.x = -swing * DEG;
    this.legR.rotation.x = -swing * DEG;
    this.legL.rotation.x = swing * DEG;
  }

  private updateAction(dt: number): void {
    if (this.digging) {
      this.digTimer += dt;
      if (this.digTimer >= DIG_SWING_PERIOD_SECONDS - 1e-9) {
        this.digTimer -= DIG_SWING_PERIOD_SECONDS;
        if (this.actionT < 0) this.actionT = 0;
      }
    }
    if (this.actionT >= 0) {
      this.actionT += dt;
      if (this.actionT >= ACTION_SWING_SECONDS) this.actionT = -1;
    }
  }

  dispose(): void {
    // 持ったブロックの材料・形は使いまわしなので dispose しない
    this.heldMesh.removeFromParent();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        for (const x of Array.isArray(m) ? m : [m]) x.dispose();
      }
    });
  }
}
