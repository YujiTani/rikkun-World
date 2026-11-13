import * as THREE from 'three';
import type { BlockId } from '../contracts';
import { isWater } from '../world/blocks/water';
import { UZU, UzuField, uzuBead, uzuBeadColor, uzuCount, uzuKindOf, uzuVentBead, OPEN_UP, type UzuBead, type UzuPoint, type UzuSpot } from './uzuModel';

/**
 * あわのうず（uzuModel.ts）の 絵。わきどころ・たきつぼ（マグマ版も）の 中（マグマ版は 面の 手前）を 小さな 四角の つぶが うずまき状に 回る。
 * 描画は InstancedMesh 1 つ（見える うずが ある 間だけ 1 回）。あわの 入れ物は 上限ぶん はじめに 作って 使いまわす。
 * ちかくの ブロックは UZU.refresh 秒おきに、プレイヤーの まわりの 立方体 だけを しらべる（全ブロックは 走査しない）。
 */

export interface UzuDeps {
  seed: number;
  getBlock: (x: number, y: number, z: number) => BlockId | 'outside';
  /** いま 画面を もつ 人の 位置（1 人なら 1 つ、2 人なら 2 つ）。空なら 何も 出さない（おもさ「とても かるい」） */
  foci: () => readonly UzuPoint[];
}

/** 吹き出し口に なれる となり: 空気・水・水の 見た目（わきどころ・たきつぼ） */
const OPEN_IDS: ReadonlySet<string> = new Set<BlockId>(['air', 'wakimizu', 'takitsubo']);

export class UzuFx {
  private readonly field: UzuField;
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly bead: UzuBead = { x: 0, y: 0, z: 0, size: 0, lead: 0 };
  private readonly cands: UzuSpot[] = Array.from({ length: UZU.maxCandidates }, () => ({ x: 0, y: 0, z: 0, kind: { magma: false, dir: 1 as const }, open: 0 }));
  private nCands = 0;
  private refresh = 0;
  private time = 0;
  /** 見えている あわの 数（テスト・報告用） */
  shown = 0;

  constructor(scene: THREE.Object3D, private readonly deps: UzuDeps) {
    this.field = new UzuField(deps.seed);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(UZU.sizeMax, UZU.sizeMax, UZU.sizeMax), mat, UZU.maxShown * Math.max(UZU.beads, UZU.ventBeads));
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
            c.open = kind.magma ? this.openMask(x, y, z) : 0;
          }
    }
  }

  /** まわりの 1 マスが あいて いる（空気・水の 見た目）か。マグマの 吹き出し口を きめる */
  private openMask(x: number, y: number, z: number): number {
    return (this.isOpen(x, y + 1, z) ? OPEN_UP : 0) | (this.isOpen(x + 1, y, z) ? 1 : 0) | (this.isOpen(x - 1, y, z) ? 2 : 0) | (this.isOpen(x, y, z + 1) ? 4 : 0) | (this.isOpen(x, y, z - 1) ? 8 : 0);
  }

  private isOpen(x: number, y: number, z: number): boolean {
    const id = this.deps.getBlock(x, y, z);
    return OPEN_IDS.has(id) || isWater(id);
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
      const magma = e.spot.kind.magma;
      for (let i = 0, m = uzuCount(e.spot.kind); i < m; i++) {
        if (magma) uzuVentBead(e.phase, this.time, i, e.vent, this.bead);
        else uzuBead(e.spot.kind, e.phase, this.time, i, e.face, this.bead);
        if (this.bead.size <= 0) continue;
        d.position.set(e.spot.x + this.bead.x, e.spot.y + this.bead.y, e.spot.z + this.bead.z);
        d.scale.setScalar((this.bead.size / UZU.sizeMax) * g);
        d.updateMatrix();
        this.mesh.setMatrixAt(n, d.matrix);
        this.mesh.setColorAt(n, this.color.setHex(uzuBeadColor(e.spot.kind.magma, this.bead.lead)));
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
