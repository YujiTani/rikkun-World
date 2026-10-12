import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import { COMBAT_FX, bagPose } from './combatFxModel';

export interface BagLike {
  id: number;
  position: Vec3;
  ticksLeft: number;
}

const B = COMBAT_FX.bag;

const BODY_GEO = new THREE.BoxGeometry(B.bodySize, B.bodySize, B.bodySize);
const ROPE_GEO = new THREE.BoxGeometry(...B.ropeSize);
const GLOW_GEO = new THREE.BoxGeometry(B.glowSize, B.glowSize, B.glowSize);
const PILLAR_GEO = new THREE.BoxGeometry(...B.pillarSize);
const BODY_MAT = new THREE.MeshBasicMaterial({ color: B.bodyColor });
const ROPE_MAT = new THREE.MeshBasicMaterial({ color: B.ropeColor });
for (const m of [BODY_MAT, ROPE_MAT]) m.userData.noDim = true;

interface Visual {
  root: THREE.Group;
  spinner: THREE.Group;
  glowMat: THREE.MeshBasicMaterial;
  pillarMat: THREE.MeshBasicMaterial;
}

function glowMaterial(opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: B.glowColor, transparent: true, opacity, depthWrite: false });
  m.userData.noDim = true; // 光るものは暗くしない
  return m;
}

/** おとしもの ぶくろ の見た目（茶色い箱・ひも・黄色い光・光の柱）。bags が増えたら出し、へったら消す */
export class BagVisuals {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<number, Visual>();
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'bags';
    scene.add(this.group);
  }

  count(): number {
    return this.visuals.size;
  }

  update(dt: number, bags: readonly BagLike[]): void {
    this.time += dt;
    const seen = new Set<number>();
    for (const bag of bags) {
      seen.add(bag.id);
      let v = this.visuals.get(bag.id);
      if (!v) {
        v = this.create();
        this.visuals.set(bag.id, v);
        this.group.add(v.root);
      }
      const pose = bagPose(this.time, bag.ticksLeft);
      v.root.position.set(bag.position.x, bag.position.y, bag.position.z);
      v.spinner.position.y = pose.y;
      v.spinner.rotation.y = pose.spin;
      v.glowMat.opacity = B.glowOpacity * pose.glow;
      v.pillarMat.opacity = B.pillarOpacity * pose.glow;
    }
    for (const [id, v] of this.visuals) {
      if (seen.has(id)) continue;
      this.group.remove(v.root);
      v.glowMat.dispose();
      v.pillarMat.dispose();
      this.visuals.delete(id);
    }
  }

  private create(): Visual {
    const root = new THREE.Group();
    const spinner = new THREE.Group();
    const body = new THREE.Mesh(BODY_GEO, BODY_MAT);
    const rope = new THREE.Mesh(ROPE_GEO, ROPE_MAT);
    rope.position.y = B.bodySize / 2 + B.ropeSize[1] / 2;
    const glowMat = glowMaterial(B.glowOpacity);
    const glow = new THREE.Mesh(GLOW_GEO, glowMat);
    glow.renderOrder = 3;
    spinner.add(body, rope, glow);
    const pillarMat = glowMaterial(B.pillarOpacity);
    const pillar = new THREE.Mesh(PILLAR_GEO, pillarMat);
    pillar.position.y = B.pillarSize[1] / 2;
    pillar.renderOrder = 3;
    root.add(spinner, pillar);
    return { root, spinner, glowMat, pillarMat };
  }

  dispose(): void {
    this.update(0, []);
    this.group.removeFromParent();
  }
}
