import * as THREE from 'three';
import { boxGeo } from '../common';

const PER_BURST = 4;
const SLOTS = 3;
const SECONDS = 0.3;

/** 火の玉が当たったときの、オレンジの立方体 4 こがパッと散る（毎回 new しないよう、使いまわす） */
export class BurstFx {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 1 });
  private readonly cubes: THREE.Mesh[] = [];
  private readonly ages: number[] = new Array<number>(SLOTS).fill(-1);
  private next = 0;

  constructor() {
    for (let i = 0; i < PER_BURST * SLOTS; i++) {
      const m = new THREE.Mesh(boxGeo(0.12, 0.12, 0.12), this.mat);
      m.visible = false;
      this.cubes.push(m);
      this.group.add(m);
    }
  }

  spawn(x: number, y: number, z: number): void {
    const s = this.next;
    this.next = (this.next + 1) % SLOTS;
    this.ages[s] = 0;
    for (let i = 0; i < PER_BURST; i++) {
      const m = this.cubes[s * PER_BURST + i]!;
      m.visible = true;
      m.position.set(x, y, z);
      m.userData.ox = x;
      m.userData.oy = y;
      m.userData.oz = z;
    }
  }

  update(dt: number): void {
    for (let s = 0; s < SLOTS; s++) {
      if (this.ages[s]! < 0) continue;
      this.ages[s] = this.ages[s]! + dt;
      const k = this.ages[s]! / SECONDS;
      for (let i = 0; i < PER_BURST; i++) {
        const m = this.cubes[s * PER_BURST + i]!;
        if (k >= 1) {
          m.visible = false;
          continue;
        }
        const a = (i / PER_BURST) * Math.PI * 2 + Math.PI / 4;
        const d = 0.5 * k;
        m.position.set(m.userData.ox + Math.cos(a) * d, m.userData.oy + 0.2 * k, m.userData.oz + Math.sin(a) * d);
      }
      if (k >= 1) this.ages[s] = -1;
    }
  }

  dispose(): void {
    this.mat.dispose();
  }
}
