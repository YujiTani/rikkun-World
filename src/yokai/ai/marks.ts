import * as THREE from 'three';
import { boxGeo } from '../common';
import { AI_CONST } from './config';

const SIZE = 0.16;
const GAP = 0.24;

let whiteMat: THREE.MeshBasicMaterial | null = null;
let grayMat: THREE.MeshBasicMaterial | null = null;
function mats(): [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial] {
  whiteMat ??= new THREE.MeshBasicMaterial({ color: 0xffffff });
  grayMat ??= new THREE.MeshBasicMaterial({ color: 0x808080 });
  return [whiteMat, grayMat];
}

export function disposeMarkMaterials(): void {
  whiteMat?.dispose();
  grayMat?.dispose();
  whiteMat = null;
  grayMat = null;
}

/** 頭の上の「まる」（残り = 白、へった分 = 灰色）。たたかれた妖怪にだけ出す */
export class Marks {
  readonly group = new THREE.Group();
  private readonly cubes: THREE.Mesh[] = [];
  private count = 0;

  constructor() {
    this.group.visible = false;
  }

  /** 体力 hp / maxHp を見せる */
  show(hp: number, maxHp: number): void {
    const n = Math.min(maxHp, AI_CONST.maxMarks);
    const [white, gray] = mats();
    while (this.cubes.length < n) {
      const m = new THREE.Mesh(boxGeo(SIZE, SIZE, 0.04), white);
      this.cubes.push(m);
      this.group.add(m);
    }
    this.count = n;
    for (let i = 0; i < this.cubes.length; i++) {
      const m = this.cubes[i]!;
      m.visible = i < n;
      m.material = i < hp ? white : gray;
      m.position.set((i - (n - 1) / 2) * GAP, 0, 0);
    }
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  get shown(): boolean {
    return this.group.visible;
  }

  get total(): number {
    return this.count;
  }
}
