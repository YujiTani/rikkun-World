import * as THREE from 'three';
import type { BlockId } from '../contracts';
import { UZU, UzuField, uzuBead, uzuBeadColor, uzuKindOf, type UzuBead, type UzuLook, type UzuPoint, type UzuSpot } from './uzuModel';

/**
 * あわのうず（uzuModel.ts）の 絵。わきどころ・たきつぼ（マグマ版も）の まわりを 小さな 箱の あわが 回る。
 * 描画は InstancedMesh 1 つ（見える うずが ある 間だけ 1 回）。あわの 入れ物は 上限ぶん はじめに 作って 使いまわす。
 * ちかくの ブロックは UZU.refresh 秒おきに、プレイヤーの まわりの 立方体 だけを しらべる（全ブロックは 走査しない）。
 */

export interface UzuDeps {
  seed: number;
  getBlock: (x: number, y: number, z: number) => BlockId | 'outside';
  /** いま 画面を もつ 人の 位置（1 人なら 1 つ、2 人なら 2 つ）。空なら 何も 出さない（おもさ「とても かるい」） */
  foci: () => readonly UzuPoint[];
}

export class UzuFx {
  /** 向きの 案（試作。切りかえて 撮れる） */
  look: UzuLook = UZU.look;
  private readonly field: UzuField;
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly bead: UzuBead = { x: 0, y: 0, z: 0, scale: 0 };
  private readonly cands: UzuSpot[] = Array.from({ length: UZU.maxCandidates }, () => ({ x: 0, y: 0, z: 0, kind: { magma: false, dir: 1 as const } }));
  private nCands = 0;
  private refresh = 0;
  private time = 0;
  /** 見えている あわの 数（テスト・報告用） */
  shown = 0;

  constructor(scene: THREE.Object3D, private readonly deps: UzuDeps) {
    this.field = new UzuField(deps.seed);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(UZU.size, UZU.size, UZU.size), mat, UZU.maxShown * UZU.beads);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = UZU.renderOrder; // 水の 見た目の ブロックの あと（水の 中に かくれない）
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.setColorAt(0, this.color); // instanceColor を 先に 作る
    scene.add(this.mesh);
  }

  /** うずの 数（テスト・報告用） */
  get spots(): number {
    return this.field.shown();
  }

  update(dt: number): void {
    this.time += dt;
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = UZU.refresh;
      const foci = this.deps.foci();
      this.scan(foci);
      this.field.sync(this.cands, foci, this.nCands);
    }
    this.field.step(dt);
    this.draw();
  }

  /** プレイヤーの まわり（range マス）の 立方体だけ しらべる */
  private scan(foci: readonly UzuPoint[]): void {
    this.nCands = 0;
    const R = Math.ceil(UZU.range);
    for (const f of foci) {
      const cx = Math.floor(f.x);
      const cy = Math.floor(f.y);
      const cz = Math.floor(f.z);
      for (let y = cy - R; y <= cy + R; y++)
        for (let z = cz - R; z <= cz + R; z++)
          for (let x = cx - R; x <= cx + R; x++) {
            const id = this.deps.getBlock(x, y, z);
            if (id === 'outside') continue;
            const kind = uzuKindOf(id);
            if (!kind || this.nCands >= UZU.maxCandidates) continue;
            if (this.has(x, y, z)) continue; // 2 人の 範囲が かさなる ところ
            const c = this.cands[this.nCands++]!;
            c.x = x;
            c.y = y;
            c.z = z;
            c.kind = kind;
          }
    }
  }

  private has(x: number, y: number, z: number): boolean {
    for (let i = 0; i < this.nCands; i++) {
      const c = this.cands[i]!;
      if (c.x === x && c.y === y && c.z === z) return true;
    }
    return false;
  }

  private draw(): void {
    const d = this.dummy;
    let n = 0;
    for (const e of this.field.entries) {
      if (!e.used || e.grow <= 0) continue;
      const g = e.grow * e.grow * (3 - 2 * e.grow); // なめらかに
      for (let i = 0; i < UZU.beads; i++) {
        uzuBead(this.look, e.spot.kind, e.phase, this.time, i, e.axis, this.bead);
        d.position.set(e.spot.x + this.bead.x, e.spot.y + this.bead.y, e.spot.z + this.bead.z);
        d.scale.setScalar(this.bead.scale * g);
        d.updateMatrix();
        this.mesh.setMatrixAt(n, d.matrix);
        this.mesh.setColorAt(n, this.color.setHex(uzuBeadColor(e.spot.kind.magma, i)));
        n++;
      }
    }
    this.shown = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
