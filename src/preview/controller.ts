import * as THREE from 'three';
import { BlockDoll } from '../camera/BlockDoll';
import { YOKAI_ORDER, createYokai } from '../yokai';
import type { YokaiBase, YokaiMotion } from '../yokai';

/** 見本ページの動きボタン（設計書 7 章） */
export type PreviewMotion = YokaiMotion;
export type PreviewView = 'free' | 'front' | 'side';

export const FLOOR_COLOR = 0xdde6ee;
export const SKY_COLOR = 0xbfe0ff;
export const SPACING = 3;
/** 台の上でゆっくり回る（1 回転 8 秒） */
export const SPIN_SECONDS = 8;
/** たおれて、また出てくるまで（たおれ始めから）。大きさ 0 になって 1 秒後 */
export const REVIVE_SECONDS = 1.6;
export const FIXED_DT = 1 / 60;

/** 左から: 人形、からかさ、ちょうちん、ぬりかべ、ろくろくび */
export const DOLL_X = -7.5;
export function yokaiX(index: number): number {
  return (index - 1.5) * SPACING;
}

export interface LabelAnchor {
  kind: 'doll' | 'yokai';
  index: number;
  name: string;
  position: THREE.Vector3;
}

const DEG = Math.PI / 180;

/** 見本ページの中身（描画の機械には触らない。テストしやすいように分けてある） */
export class PreviewController {
  readonly stage = new THREE.Group();
  readonly yokai: YokaiBase[] = YOKAI_ORDER.map((id) => createYokai(id));
  readonly doll = new BlockDoll();
  readonly anchors: LabelAnchor[] = [];

  private readonly slots: THREE.Group[] = [];
  private readonly dieClock: number[] = [];
  private readonly dollColors = new Map<THREE.Material, number>();
  private dollSilhouette = false;
  silhouette = false;
  rotating = true;
  view: PreviewView = 'free';
  /** 台の向き（ラジアン） */
  yaw = 0;
  steps = 0;

  constructor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 40),
      new THREE.MeshBasicMaterial({ color: FLOOR_COLOR }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.stage.add(floor);

    const padGeo = new THREE.CylinderGeometry(1.25, 1.25, 0.06, 32);
    const padMat = new THREE.MeshBasicMaterial({ color: 0xc3cfdb });
    const addSlot = (x: number): THREE.Group => {
      const slot = new THREE.Group();
      slot.position.x = x;
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.y = -0.03 + 0.001;
      slot.add(pad);
      this.stage.add(slot);
      this.slots.push(slot);
      return slot;
    };

    this.doll.setMode('third');
    this.doll.update(0, { x: 0, y: 0, z: 0 }, 0, 0, false);
    addSlot(DOLL_X).add(this.doll.group);
    this.anchors.push({ kind: 'doll', index: 0, name: 'プレイヤー', position: new THREE.Vector3(DOLL_X, 0, 1.4) });

    this.yokai.forEach((y, i) => {
      addSlot(yokaiX(i)).add(y.root);
      this.dieClock.push(0);
      this.anchors.push({ kind: 'yokai', index: i + 1, name: y.displayName, position: new THREE.Vector3(yokaiX(i), 0, 1.4) });
    });
    this.doll.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        this.dollColors.set(m, (m as THREE.MeshBasicMaterial).color.getHex());
      }
    });
    this.applyYaw();
  }

  setSilhouette(on: boolean): void {
    this.silhouette = on;
    for (const y of this.yokai) y.setSilhouette(on);
    // 人形もまっ黒に（大きさくらべ用）
    this.dollSilhouette = on;
    for (const [m, c] of this.dollColors) (m as THREE.MeshBasicMaterial).color.setHex(on ? 0x000000 : c);
  }
  get dollIsSilhouette(): boolean {
    return this.dollSilhouette;
  }

  setRotating(on: boolean): void {
    this.rotating = on;
    if (on) this.view = 'free';
  }

  /** 回転を止めて正面（まえ）／真横（よこ）を向ける */
  setView(v: 'front' | 'side'): void {
    this.rotating = false;
    this.view = v;
    this.yaw = v === 'front' ? 0 : 90 * DEG;
    this.applyYaw();
  }

  setMotion(m: PreviewMotion): void {
    for (const y of this.yokai) {
      switch (m) {
        case 'wait':
        case 'move':
          y.setMotion(m);
          break;
        case 'attack':
          y.attack();
          break;
        case 'hit':
          y.hit();
          break;
        case 'die':
          y.die();
          break;
      }
    }
  }

  private applyYaw(): void {
    // モデルの前は -Z。yaw 0 でカメラ（+Z 側）に顔を向けるので半回転ぶんたす
    for (const s of this.slots) s.rotation.y = this.yaw + Math.PI;
  }

  /** 固定ステップ 1 コマ */
  update(dt: number = FIXED_DT): void {
    this.steps++;
    if (this.rotating) {
      this.yaw = (this.yaw + (Math.PI * 2 * dt) / SPIN_SECONDS) % (Math.PI * 2);
      this.applyYaw();
    }
    this.yokai.forEach((y, i) => {
      y.update(dt);
      if (y.motion === 'die') {
        this.dieClock[i]! += dt;
        if (this.dieClock[i]! >= REVIVE_SECONDS - 1e-9) {
          y.revive();
          this.dieClock[i] = 0;
        }
      } else {
        this.dieClock[i] = 0;
      }
    });
    this.doll.update(dt, { x: 0, y: 0, z: 0 }, 0, 0, false);
  }
}
