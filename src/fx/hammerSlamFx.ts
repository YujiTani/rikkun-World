import * as THREE from 'three';
import type { HammerEvent } from '../tools/hammer/HammerSystem';
import { crossYaw } from './parryFx';
import { HAMMER_FX_MAX, HAMMER_SHEET, hammerFacingDeg, hammerFrameAt, hammerFrameUv, hammerFxPlacement } from './hammerSlamModel';

/**
 * 大地のハンマーの 地面の われ・光（H1）。十字の 板 2 まい（DESIGN §17）を 同時に 2 つまで。
 * 毎フレーム new しない（板・材質・絵の 写しを 最初に 作って 使い回す）。画面を 光らせない・点滅なし。
 * しっぱい（何も こわせなかった）は 小さく うすい 土けむり（同じ 絵の 小さい 版）。
 */
/** 失敗の 土けむりの 大きさ（ふつうの われに くらべて）と 濃さ */
const BONK_SCALE = 0.4;
const BONK_ALPHA = 0.55;

interface Slot {
  group: THREE.Group;
  /** 十字の 2 まい（大きさは 板ごとに かける。グループに かけると 直交した 板が ゆがむ） */
  planes: [THREE.Mesh, THREE.Mesh];
  mat: THREE.MeshBasicMaterial;
  tex: THREE.Texture;
  age: number;
  reduced: boolean;
  alpha: number;
}

export class HammerSlamFx {
  private readonly slots: Slot[] = [];
  private readonly geo = new THREE.PlaneGeometry(1, 1);
  private next = 0;

  constructor(private readonly scene: THREE.Scene, basePath = './models/fx/') {
    const base = new THREE.TextureLoader().load(`${basePath}hammer_slam.png`);
    base.magFilter = THREE.NearestFilter;
    base.minFilter = THREE.NearestFilter;
    base.generateMipmaps = false;
    base.colorSpace = THREE.SRGBColorSpace;
    for (let i = 0; i < HAMMER_FX_MAX; i++) {
      const tex = base.clone();
      tex.needsUpdate = true;
      tex.repeat.set(1 / HAMMER_SHEET.cols, 1 / HAMMER_SHEET.rows);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const group = new THREE.Group();
      const a = new THREE.Mesh(this.geo, mat);
      const b = new THREE.Mesh(this.geo, mat);
      b.rotation.y = Math.PI / 2;
      a.frustumCulled = false;
      b.frustumCulled = false;
      group.add(a, b);
      group.visible = false;
      scene.add(group);
      this.slots.push({ group, planes: [a, b], mat, tex, age: -1, reduced: false, alpha: 1 });
    }
  }

  /** 出来事（hammer.drainEvents）を 受けて、いま 出ている 物を 1 ステップ すすめる */
  step(events: readonly HammerEvent[], reduced: boolean): void {
    for (const e of events) {
      if (e.type === 'slam') {
        if (e.cells.length === 0) continue; // 何も こわれて いない ときは 土けむり（bonk）の ほう
        this.start(e.position, e.dir, e.depth, e.big, 1, 1, reduced);
      } else this.start(e.position, e.dir, 1, false, BONK_SCALE, BONK_ALPHA, reduced);
    }
    for (const s of this.slots) {
      if (s.age < 0) continue;
      const f = hammerFrameAt(s.age, s.reduced);
      if (f === null) {
        s.age = -1;
        s.group.visible = false;
        continue;
      }
      const uv = hammerFrameUv(f);
      s.tex.offset.set(uv.x, uv.y);
      s.mat.opacity = s.alpha;
      s.age++;
    }
  }

  private start(pos: { x: number; y: number; z: number }, dir: { dx: number; dz: number }, depth: number, big: boolean, scale: number, alpha: number, reduced: boolean): void {
    const s = this.slots[this.next]!; // ふるい ほうから 入れかえる
    this.next = (this.next + 1) % this.slots.length;
    const p = hammerFxPlacement(pos, dir, depth, big);
    s.group.position.set(p.x, p.y, p.z);
    for (const m of s.planes) m.scale.set(p.w * scale, p.h * scale, 1);
    // 絵の 地面の 点を そろえる（小さくした とき 地面から はなれない ように）
    s.group.position.y = Math.floor(pos.y + 1e-6) + (p.y - Math.floor(pos.y + 1e-6)) * scale;
    s.group.rotation.y = crossYaw(hammerFacingDeg(dir));
    s.age = 0;
    s.reduced = reduced;
    s.alpha = alpha;
    s.group.visible = true;
  }

  /** 出ている 数（テストの 窓口用） */
  active(): number {
    return this.slots.filter((s) => s.age >= 0).length;
  }

  dispose(): void {
    for (const s of this.slots) {
      this.scene.remove(s.group);
      s.mat.dispose();
      s.tex.dispose();
    }
    this.geo.dispose();
  }
}
