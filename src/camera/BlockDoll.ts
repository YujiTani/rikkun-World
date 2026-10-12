import * as THREE from 'three';
import type { BlockId, ItemId } from '../contracts';

const isBlockId = (item: ItemId): item is BlockId => item !== 'yokai_orb' && !isMaterialItem(item);
import { HELD_MATERIAL, isMaterialItem } from '../ui/itemArt';
import { UNIT_BOX, getBlockMaterials } from '../fx/blockMaterials';
import type { ArmorSlot } from '../contracts';
import {
  DOLL_ANIM,
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
import { DollAnimator, newBodyPose, type ArmAnim, type BodyAnim } from './dollAnim';
import { buildKabuto, buildKote, buildSuneate, buildYoroiBody, buildYoroiShoulder } from './dollArmor';
import { buildHeldModel, hasHeldModel, isLeftHanded } from './heldTools';

const DEG = Math.PI / 180;

/** たおれたとき（やられた）横になる角度と、からだが地面にしずまないよう上げる高さ */
const FALLEN_ROLL_DEG = 90;
const FALLEN_LIFT = 0.25;

/** ようかいだまを手に持つ形（むらさきの玉・つや・目）。形と材料は使いまわす */
const ORB_GEOMETRY = new THREE.SphereGeometry(0.5, 10, 8);
const ORB_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x9c6ade });
const ORB_SHINE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffffff });
const ORB_EYE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0x111111 });

function mat(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color });
}

function box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[]): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
}

/** hidden = 見えない、first = 一人称（手足だけ）、third = 全部 */
const STAR_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffe066 });
const STAR_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export type DollMode = 'hidden' | 'first' | 'third';

/** 箱で作ったブロック人形（M1-02 §3.3）。原点が足もとの中央、前は -Z（yaw 0 = 北）。 */
export class BlockDoll {
  readonly group = new THREE.Group();
  /** あたま・からだ・うで（こしを軸に、はね・かたむき・ひねりができる）。あしは含まない */
  private readonly upper = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly animator = new DollAnimator();
  private readonly bodyPoseTmp = newBodyPose();
  private readonly heldModels = new Map<string, THREE.Group>();
  private heldModel: THREE.Group | null = null;
  private armorHead: ItemId | null = null;
  private armorBody: ItemId | null = null;
  private armorArms: ItemId | null = null;
  private armorLegs: ItemId | null = null;
  private readonly koteMeshes: THREE.Group[] = [];
  private readonly suneateMeshes: THREE.Group[] = [];
  private kabutoMesh: THREE.Group | null = null;
  private yoroiMesh: THREE.Group | null = null;
  private readonly shoulders: THREE.Group[] = [];
  private arcMeshes: { slash: THREE.Mesh; sweep: THREE.Mesh } | null = null;
  private readonly stars = new THREE.Group();
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
  /** うでのひじから上・あしのひざから上（一人称では隠す） */
  private readonly upperParts: THREE.Mesh[] = [];
  private readonly heldMesh = new THREE.Mesh(UNIT_BOX);
  /** ようかいだま を持つときの形（heldMesh のかわりに出す） */
  private readonly orbMesh = new THREE.Mesh(ORB_GEOMETRY, ORB_MATERIAL);
  /** 材料（かみ・あぶら など）を持つときの小さな板・かたまり */
  private readonly materialMesh = new THREE.Mesh(UNIT_BOX);
  private readonly materialMats = new Map<number, THREE.MeshBasicMaterial>();
  /** 0 = 立っている、1 = 横にたおれた */
  private fallen = 0;
  private alpha = 1;
  private held: ItemId | null = null;

  constructor() {
    const C = DOLL_COLORS;
    const [lw, lh, ld] = DOLL_SIZES.leg;
    const [bw, bh, bd] = DOLL_SIZES.body;
    const [aw, ah, ad] = DOLL_SIZES.arm;
    const [hw, hh, hd] = DOLL_SIZES.head;
    this.upper.position.y = lh;
    this.group.add(this.upper);

    // あし: 上の端を軸に振る
    for (const [g, x] of [
      [this.legL, -lw / 2],
      [this.legR, lw / 2],
    ] as const) {
      g.position.set(x, lh, 0);
      // ひざ（まん中）から上は一人称で隠す
      const pantsH = lh - DOLL_SIZES.shoeHeight;
      const kneeY = -lh / 2;
      const thigh = box(lw, lh / 2, ld, mat(C.pants));
      thigh.position.y = -lh / 4;
      this.upperParts.push(thigh);
      const pants = box(lw, pantsH - lh / 2, ld, mat(C.pants));
      pants.position.y = kneeY - (pantsH - lh / 2) / 2;
      const shoe = box(lw, DOLL_SIZES.shoeHeight, ld, mat(C.shoes));
      shoe.position.y = -lh + DOLL_SIZES.shoeHeight / 2;
      g.add(thigh, pants, shoe);
      this.group.add(g);
    }

    // からだ
    const body = box(bw, bh, bd, mat(C.shirt));
    body.position.y = bh / 2;
    this.bodyMesh = body;
    this.upper.add(body);

    // うで: 上 1/3 はそで（青）、下ははだ色
    for (const [g, x] of [
      [this.armL, -(bw / 2 + aw / 2)],
      [this.armR, bw / 2 + aw / 2],
    ] as const) {
      g.position.set(x, bh, 0);
      const sleeveH = ah * DOLL_SIZES.sleeveRatio;
      const sleeve = box(aw, sleeveH, ad, mat(C.shirt));
      sleeve.position.y = -sleeveH / 2;
      // ひじ（まん中）から上は一人称で隠す
      const upperSkin = box(aw, ah / 2 - sleeveH, ad, mat(C.skin));
      upperSkin.position.y = -sleeveH - (ah / 2 - sleeveH) / 2;
      this.upperParts.push(sleeve, upperSkin);
      const hand = box(aw, ah / 2, ad, mat(C.skin));
      hand.position.y = -ah / 2 - ah / 4;
      g.add(sleeve, upperSkin, hand);
      this.upper.add(g);
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
    this.head.position.y = bh;
    this.upper.add(this.head);

    // やられたとき頭の上をまわる星
    for (let i = 0; i < DOLL_ANIM.starCount; i++) {
      const star = new THREE.Mesh(STAR_GEOMETRY, STAR_MATERIAL);
      star.scale.setScalar(DOLL_ANIM.starSize);
      star.userData.shared = true;
      this.stars.add(star);
    }
    this.stars.visible = false;
    this.group.add(this.stars);

    // 右手に持つブロック（手の先）
    this.heldMesh.scale.setScalar(HELD_BLOCK_SIZE);
    this.heldMesh.position.set(0, -ah - HELD_BLOCK_SIZE * 0.2, 0);
    this.heldMesh.visible = false;
    this.armR.add(this.heldMesh);
    this.orbMesh.scale.setScalar(HELD_BLOCK_SIZE * 1.3);
    this.orbMesh.position.copy(this.heldMesh.position);
    this.orbMesh.visible = false;
    const shine = new THREE.Mesh(UNIT_BOX, ORB_SHINE_MATERIAL);
    shine.scale.setScalar(0.18);
    shine.position.set(-0.22, 0.25, -0.3);
    this.orbMesh.add(shine);
    for (const x of [-0.17, 0.17]) {
      const eye = new THREE.Mesh(UNIT_BOX, ORB_EYE_MATERIAL);
      eye.scale.set(0.12, 0.12, 0.05);
      eye.position.set(x, -0.02, -0.48);
      this.orbMesh.add(eye);
    }
    this.armR.add(this.orbMesh);
    this.materialMesh.position.copy(this.heldMesh.position);
    this.materialMesh.visible = false;
    this.armR.add(this.materialMesh);
    this.rotationOrder();
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
    for (const m of this.upperParts) m.visible = this.mode === 'third';
  }
  /** どの部分が見えるか */
  get parts(): { head: boolean; body: boolean; arms: boolean; legs: boolean } {
    const third = this.mode === 'third';
    const any = this.mode !== 'hidden';
    return { head: third, body: third, arms: any, legs: any };
  }

  /** 右手に持つアイテム（null = 何も持たない）。ゆみ だけ左手 */
  setHeld(item: ItemId | null): void {
    if (item === this.held) return;
    this.held = item;
    this.heldMesh.visible = false;
    this.orbMesh.visible = false;
    this.materialMesh.visible = false;
    if (this.heldModel) this.heldModel.visible = false;
    this.heldModel = null;
    if (item === null) return;
    if (hasHeldModel(item)) {
      let m = this.heldModels.get(item);
      if (!m) {
        m = buildHeldModel(item)!;
        m.position.copy(this.heldMesh.position);
        m.position.y += 0.04;
        this.heldModels.set(item, m);
      }
      (isLeftHanded(item) ? this.armL : this.armR).add(m);
      m.visible = true;
      this.heldModel = m;
    } else if (isMaterialItem(item)) {
      const h = HELD_MATERIAL[item];
      let m = this.materialMats.get(h.color);
      if (!m) {
        m = new THREE.MeshBasicMaterial({ color: h.color });
        this.materialMats.set(h.color, m);
      }
      this.materialMesh.material = m;
      this.materialMesh.scale.set(h.size[0], h.size[1], h.size[2]);
      this.materialMesh.visible = true;
    } else if (isBlockId(item)) {
      this.heldMesh.material = getBlockMaterials(item);
      this.heldMesh.visible = true;
    } else {
      // アイテムだけのもの（ようかいだま）はむらさきの玉
      this.orbMesh.visible = true;
    }
  }
  get heldItem(): ItemId | null {
    return this.held;
  }
  /** 持ったブロックの世界座標の中心（持っていなければ null） */
  heldWorldPosition(out: THREE.Vector3): THREE.Vector3 | null {
    if (this.held === null || this.mode === 'hidden') return null;
    this.group.updateMatrixWorld(true);
    if (this.heldModel) {
      return (this.heldModel.children[0] ?? this.heldModel).getWorldPosition(out);
    }
    return (this.orbMesh.visible ? this.orbMesh : this.materialMesh.visible ? this.materialMesh : this.heldMesh).getWorldPosition(out);
  }

  /** 防具を着せる（null = 着ていない）。かぶと・よろい・こて・すねあて以外のアイテムは見た目なし */
  setArmor(headItem: ItemId | null, bodyItem: ItemId | null, armsItem: ItemId | null = null, legsItem: ItemId | null = null): void {
    if (headItem !== this.armorHead) {
      this.armorHead = headItem;
      if (this.kabutoMesh) this.kabutoMesh.visible = headItem === 'kabuto';
      else if (headItem === 'kabuto') {
        this.kabutoMesh = buildKabuto();
        this.head.add(this.kabutoMesh);
      }
    }
    if (bodyItem !== this.armorBody) {
      this.armorBody = bodyItem;
      const on = bodyItem === 'yoroi';
      if (this.yoroiMesh) this.yoroiMesh.visible = on;
      else if (on) {
        this.yoroiMesh = buildYoroiBody();
        this.yoroiMesh.position.y = DOLL_SIZES.body[1] / 2;
        this.upper.add(this.yoroiMesh);
        this.yoroiMesh.traverse((o) => {
          if (o instanceof THREE.Mesh) this.upperParts.push(o);
        });
        for (const arm of [this.armL, this.armR]) {
          const sh = buildYoroiShoulder();
          arm.add(sh);
          sh.traverse((o) => {
            if (o instanceof THREE.Mesh) this.upperParts.push(o);
          });
          this.shoulders.push(sh);
        }
      }
      for (const sh of this.shoulders) sh.visible = on;
    }
    if (armsItem !== this.armorArms) {
      this.armorArms = armsItem;
      const on = armsItem === 'kote';
      if (this.koteMeshes.length === 0 && on) {
        for (const arm of [this.armL, this.armR]) {
          const k = buildKote();
          arm.add(k);
          this.koteMeshes.push(k);
        }
      }
      for (const k of this.koteMeshes) k.visible = on;
    }
    if (legsItem !== this.armorLegs) {
      this.armorLegs = legsItem;
      const on = legsItem === 'suneate';
      if (this.suneateMeshes.length === 0 && on) {
        for (const leg of [this.legL, this.legR]) {
          const k = buildSuneate();
          leg.add(k);
          this.suneateMeshes.push(k);
        }
      }
      for (const k of this.suneateMeshes) k.visible = on;
    }
    this.applyMode();
  }
  armorWorn(slot: ArmorSlot): ItemId | null {
    return slot === 'head' ? this.armorHead : slot === 'body' ? this.armorBody : slot === 'arms' ? this.armorArms : this.armorLegs;
  }

  // ---- 動き（docs/design/M4-craft.md §2.9）
  /** うでの動きを始める。優先が低くて始められなければ false */
  play(anim: Exclude<ArmAnim, 'none'>): boolean {
    return this.animator.startArm(anim);
  }
  /** ダメージのよろめき */
  hurt(): void {
    this.animator.startHurt();
  }
  get armAnim(): ArmAnim {
    return this.animator.armAnim;
  }
  get bodyAnim(): BodyAnim {
    return this.animator.bodyAnim;
  }
  /** うでの層の何ステップ目か */
  get animTick(): number {
    return this.animator.animTick;
  }
  /** 白い弧が出ているか（切ったあと 0.15 秒） */
  get arcShown(): 'none' | 'slash' | 'sweep' {
    return this.animator.arc;
  }

  /** 右うでを 1 回振る（置いたとき） */
  swing(): void {
    this.animator.startArm('place');
  }
  /** ものを すてる（M6）。右うでを前へ 1 回ふる */
  throwArm(): void {
    this.animator.startArm('throw');
  }
  /** パンチ。右うでを大きく前へ 1 回振る */
  punch(): void {
    this.animator.startArm('punch');
  }
  /** やられたとき 0 → 1 で横にたおれる（三人称で見える）。0 でもどる */
  setFallen(k: number): void {
    this.fallen = Math.max(0, Math.min(1, k));
    this.animator.setFallen(this.fallen);
  }
  /** うすくする（むてきの点滅用。1 = ふつう）。人形の材料だけを変える */
  setAlpha(a: number): void {
    const v = Math.max(0.05, Math.min(1, a));
    if (v === this.alpha) return;
    this.alpha = v;
    this.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o === this.heldMesh || o === this.orbMesh || o === this.materialMesh) return;
      if (o.userData.shared || o.userData.noAlpha) return;
      if (o.material === ORB_MATERIAL || o.material === ORB_SHINE_MATERIAL || o.material === ORB_EYE_MATERIAL) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.transparent = v < 1;
        m.opacity = v;
        m.needsUpdate = true;
      }
    });
  }
  get opacity(): number {
    return this.alpha;
  }
  get fallenAmount(): number {
    return this.fallen;
  }
  /** ほっているあいだ、0.25 秒に 1 回振る */
  setDigging(on: boolean): void {
    this.animator.setDigging(on);
  }

  /** 位置・向き・手足を更新する。onGround = false ならジャンプの形 */
  update(
    dt: number,
    pos: { x: number; y: number; z: number },
    yawDeg: number,
    pitchDeg: number,
    walking: boolean,
    onGround = true,
  ): void {
    this.animator.advance(dt, { moving: walking, onGround });
    const arm = this.animator.currentArmPose();
    const body = this.animator.bodyPose(this.bodyPoseTmp);
    const third = this.mode !== 'first';
    const lh = DOLL_SIZES.leg[1];

    // 倒れたとき 1 回はねる
    const downHop = DOLL_ANIM.downHop * Math.sin(Math.PI * Math.max(0, Math.min(1, (this.fallen - 0.7) / 0.3)));
    this.group.position.set(pos.x, pos.y + FALLEN_LIFT * this.fallen + downHop, pos.z);
    this.group.rotation.y = -yawDeg * DEG;
    this.group.rotation.z = this.fallen * FALLEN_ROLL_DEG * DEG;
    const p = Math.max(-DOLL_HEAD_PITCH_MAX_DEG, Math.min(DOLL_HEAD_PITCH_MAX_DEG, pitchDeg));
    this.head.rotation.x = p * DEG;
    this.head.rotation.y = third ? body.headYaw * DEG : 0;

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

    // からだの層: はね・かたむき・ひねり（一人称では画面がゆれないよう、うでの形だけ）
    const bob = walking ? DOLL_ANIM.walkBobHeight * Math.abs(Math.sin(this.phase)) * this.amplitude : 0;
    this.upper.position.y = lh + (third ? bob + body.upperY + arm.hop : 0);
    this.upper.rotation.x = third ? body.tilt * DEG : 0;
    this.upper.rotation.y = third ? arm.twist * DEG : 0;

    // うで
    const idleArms = this.animator.armAnim === 'none' ? body.armLift : 0;
    const first = this.mode === 'first';
    const mixX = (base: number, abs: number, w: number): number => {
      if (w <= 0) return base;
      const a = first
        ? HELD_ARM_RAISE_FIRST_DEG + pitchDeg + (abs - DOLL_ANIM.firstPersonXCenterDeg) * DOLL_ANIM.firstPersonXScale
        : abs;
      return lerp(base, a, w);
    };
    const zScale = first ? DOLL_ANIM.firstPersonZScale : 1;
    let rBase: number;
    let lBase = -swing;
    if (first) {
      rBase = (this.held !== null ? HELD_ARM_RAISE_FIRST_DEG : HELD_ARM_RAISE_FIRST_DEG * 0.6) + pitchDeg;
    } else {
      rBase = swing * (this.held !== null ? 0.3 : 1) + (this.held !== null ? HELD_ARM_RAISE_THIRD_DEG : 0);
      if (this.held === 'yumi') lBase = DOLL_ANIM.bowLeftRaiseDeg;
    }
    const addSign = first ? -1 : 1;
    const drop = first ? body.firstDrop : 0;
    this.armR.rotation.x = (mixX(rBase + idleArms, arm.rx, arm.rw) + addSign * arm.addR - drop) * DEG;
    this.armR.rotation.z = lerp(0, arm.rz * zScale, arm.rw) * DEG;
    this.armL.rotation.x = (mixX(lBase + idleArms, arm.lx, arm.lw) - drop) * DEG;
    this.armL.rotation.z = -lerp(0, arm.lz * zScale, arm.lw) * DEG;
    this.legR.rotation.x = (-swing + body.legBend) * DEG;
    this.legL.rotation.x = (swing - body.legBend) * DEG;

    this.updateFx();
  }

  /** 白い弧と、やられたときの星 */
  private updateFx(): void {
    const kind = this.animator.arc;
    if (kind !== 'none' && !this.arcMeshes) this.arcMeshes = this.buildArcs();
    if (this.arcMeshes) {
      for (const k of ['slash', 'sweep'] as const) {
        const m = this.arcMeshes[k];
        m.visible = kind === k && this.mode !== 'hidden';
        if (m.visible) {
          (m.material as THREE.MeshBasicMaterial).opacity = 1 - this.animator.arcAge / (DOLL_ANIM.arcTicks + 1);
        }
      }
    }
    const downShown = this.fallen > 0 && this.mode === 'third';
    this.stars.visible = downShown;
    if (downShown) {
      const th = this.fallen * FALLEN_ROLL_DEG * DEG;
      const headCenterY = DOLL_SIZES.leg[1] + DOLL_SIZES.body[1] + DOLL_SIZES.head[1] / 2;
      // まわりの中心（頭の真上）を、倒れた人形の座標にもどす
      const wx = -headCenterY * Math.sin(th);
      const wy = headCenterY * Math.cos(th) + 0.45;
      this.stars.position.set(wx * Math.cos(th) + wy * Math.sin(th), -wx * Math.sin(th) + wy * Math.cos(th), 0);
      this.stars.rotation.z = -th;
      const n = this.stars.children.length;
      const spin = this.animator.tickCount * DOLL_ANIM.starSpinDegPerTick * DEG;
      for (let i = 0; i < n; i++) {
        const a = spin + (i * 2 * Math.PI) / n;
        this.stars.children[i].position.set(Math.cos(a) * DOLL_ANIM.starRadius, 0, Math.sin(a) * DOLL_ANIM.starRadius);
        this.stars.children[i].rotation.y = a;
      }
    }
  }

  private buildArcs(): { slash: THREE.Mesh; sweep: THREE.Mesh } {
    const make = (c: { radius: number; width: number; fromDeg: number; toDeg: number }) => {
      const geo = new THREE.RingGeometry(
        c.radius - c.width / 2,
        c.radius + c.width / 2,
        20,
        1,
        c.fromDeg * DEG,
        (c.toDeg - c.fromDeg) * DEG,
      );
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
      );
      // 平らな輪を横にねかせ（前が輪の上）、少しななめにして見えるように
      m.rotation.x = -Math.PI / 2 + 0.35;
      m.position.set(0, DOLL_ANIM.arcHeight, 0);
      m.userData.noAlpha = true;
      m.visible = false;
      this.group.add(m);
      return m;
    };
    return { slash: make(DOLL_ANIM.slashArc), sweep: make(DOLL_ANIM.sweepArc) };
  }

  /** 先に向き（y）、そのあと自分のよこ向き（z）の順にまわす */
  private rotationOrder(): void {
    this.group.rotation.order = 'YXZ';
  }

  dispose(): void {
    // 持ったブロック・道具の材料・形は使いまわしなので dispose しない
    this.heldMesh.removeFromParent();
    this.orbMesh.removeFromParent();
    this.materialMesh.removeFromParent();
    for (const m of this.heldModels.values()) m.removeFromParent();
    for (const m of this.materialMats.values()) m.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.shared) {
        o.geometry.dispose();
        const m = o.material;
        for (const x of Array.isArray(m) ? m : [m]) x.dispose();
      }
    });
  }
}
