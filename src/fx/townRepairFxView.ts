import * as THREE from 'three';
import { FX_CAP, type RepairFx } from '../town/townRepairFxModel';
import { BLOCK_TILES, tileUv } from '../world/blocks/textures';
import type { BlockId } from '../contracts';
import data from '../town/repairFinal.json';

/**
 * TOWN-1 1.4 §2.16 の 12: ブロックが もどる ときの 絵。ぽん 箱（同じ 絵の 箱が 1.18 倍から 1.0 へ）と 木くず・ほこり。
 * ぽん 箱は 8 つ 分の 場所を 1 つの ジオメトリに まとめて 毎ステップ 書きかえる（ブロックの まとめ絵を そのまま 使う）。木くず・ほこりは InstancedMesh。
 * どちらも 何か 出て いる 間だけ 描く（描画 +2 まで）。光らない・点滅 しない。毎フレーム new しない。
 */
const PAL = data.palette as Record<string, string>;
const KIND_COLOR = [PAL.kuzu!, PAL.kuzu_kage!, PAL.hokori!];

const SHADE_TOP = 1;
const SHADE_BOTTOM = 0.5;
const SHADE_Z = 0.8;
const SHADE_X = 0.6;
/** 箱 1 つの 面の ならび（+y −y +x −x +z −z）と、4 つの かど（u, v）。ブロックの 向きは 1 つの 絵を 全面に */
const FACES: { n: [number, number, number]; o: [number, number, number]; u: [number, number, number]; v: [number, number, number]; shade: number; tile: 0 | 1 | 2 }[] = [
  { n: [0, 1, 0], o: [-1, 1, 1], u: [1, 0, 0], v: [0, 0, -1], shade: SHADE_TOP, tile: 0 },
  { n: [0, -1, 0], o: [-1, -1, -1], u: [1, 0, 0], v: [0, 0, 1], shade: SHADE_BOTTOM, tile: 1 },
  { n: [1, 0, 0], o: [1, -1, 1], u: [0, 0, -1], v: [0, 1, 0], shade: SHADE_X, tile: 2 },
  { n: [-1, 0, 0], o: [-1, -1, -1], u: [0, 0, 1], v: [0, 1, 0], shade: SHADE_X, tile: 2 },
  { n: [0, 0, 1], o: [-1, -1, 1], u: [1, 0, 0], v: [0, 1, 0], shade: SHADE_Z, tile: 2 },
  { n: [0, 0, -1], o: [1, -1, -1], u: [-1, 0, 0], v: [0, 1, 0], shade: SHADE_Z, tile: 2 },
];

export class TownRepairFxView {
  readonly group = new THREE.Group();
  private readonly popMesh: THREE.Mesh;
  private readonly popPos: THREE.BufferAttribute;
  private readonly popUv: THREE.BufferAttribute;
  private readonly popCol: THREE.BufferAttribute;
  private readonly bits: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  readonly popMaterial: THREE.MeshBasicMaterial;
  readonly bitMaterial: THREE.MeshBasicMaterial;
  /** いま 描いて いる 数（テスト窓口・性能の 目安） */
  shown = { pops: 0, bits: 0 };

  /** atlas ＝ ブロックの まとめ絵（世界と 同じ 物） */
  constructor(atlas: THREE.Texture) {
    const n = FX_CAP.pop * 24;
    const geo = new THREE.BufferGeometry();
    this.popPos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.popUv = new THREE.BufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.popCol = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const nor = new Float32Array(n * 3);
    const idx: number[] = [];
    for (let b = 0; b < FX_CAP.pop; b++) {
      FACES.forEach((f, i) => {
        const base = b * 24 + i * 4;
        for (let k = 0; k < 4; k++) nor.set(f.n, (base + k) * 3);
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
    }
    geo.setAttribute('position', this.popPos);
    geo.setAttribute('uv', this.popUv);
    geo.setAttribute('color', this.popCol);
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.popMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.popMaterial.map = atlas;
    this.popMesh = new THREE.Mesh(geo, this.popMaterial);
    this.popMesh.frustumCulled = false;
    this.popMesh.visible = false;
    this.popMesh.renderOrder = 3;

    this.bitMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const total = FX_CAP.chip + FX_CAP.dust;
    this.bits = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.bitMaterial, total);
    this.bits.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bits.setColorAt(0, this.color.set(KIND_COLOR[0]!)); // instanceColor を 作る
    this.bits.frustumCulled = false;
    this.bits.count = 0;
    this.bits.visible = false;
    this.group.add(this.popMesh, this.bits);
  }

  /** 毎フレーム（model の 状態を 絵に うつす） */
  update(fx: RepairFx): void {
    this.drawPops(fx);
    this.drawBits(fx);
  }

  private drawPops(fx: RepairFx): void {
    const p = fx.pops;
    let n = 0;
    for (let i = 0; i < p.cap && n < FX_CAP.pop; i++) {
      if (p.age[i]! < 0) continue;
      const tiles = BLOCK_TILES[p.id[i] as BlockId] ?? BLOCK_TILES.stone!;
      const h = p.scale[i]! / 2;
      FACES.forEach((f, fi) => {
        const [u0, v0, u1, v1] = tileUv(tiles[f.tile]);
        const base = n * 24 + fi * 4;
        for (let k = 0; k < 4; k++) {
          const cu = k === 1 || k === 2 ? 1 : 0;
          const cv = k >= 2 ? 1 : 0;
          const q = base + k;
          this.popPos.setXYZ(
            q,
            p.x[i]! + (f.o[0] + f.u[0] * 2 * cu + f.v[0] * 2 * cv) * h,
            p.y[i]! + (f.o[1] + f.u[1] * 2 * cu + f.v[1] * 2 * cv) * h,
            p.z[i]! + (f.o[2] + f.u[2] * 2 * cu + f.v[2] * 2 * cv) * h,
          );
          this.popUv.setXY(q, cu ? u1 : u0, cv ? v1 : v0);
          this.popCol.setXYZ(q, f.shade, f.shade, f.shade);
        }
      });
      n++;
    }
    this.popMesh.visible = n > 0;
    this.popMesh.geometry.setDrawRange(0, n * 36);
    if (n > 0) {
      this.popPos.needsUpdate = true;
      this.popUv.needsUpdate = true;
      this.popCol.needsUpdate = true;
    }
    this.shown.pops = n;
  }

  private drawBits(fx: RepairFx): void {
    let n = 0;
    const put = (x: number, y: number, z: number, sx: number, sy: number, kind: number): void => {
      this.dummy.position.set(x, y + sy / 2, z);
      this.dummy.scale.set(sx, sy, sx);
      this.dummy.updateMatrix();
      this.bits.setMatrixAt(n, this.dummy.matrix);
      this.bits.setColorAt(n, this.color.set(KIND_COLOR[kind]!));
      n++;
    };
    const c = fx.chips;
    for (let i = 0; i < c.cap; i++) if (c.age[i]! >= 0) put(c.x[i]!, c.y[i]!, c.z[i]!, c.w[i]!, c.h[i]!, c.kind[i]!);
    const d = fx.dusts;
    for (let i = 0; i < d.cap; i++) if (d.age[i]! >= 0) put(d.x[i]!, d.y[i]!, d.z[i]!, d.scale[i]!, d.scale[i]!, 2);
    this.bits.count = n;
    this.bits.visible = n > 0;
    if (n > 0) {
      this.bits.instanceMatrix.needsUpdate = true;
      this.bits.instanceColor!.needsUpdate = true;
    }
    this.shown.bits = n;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.popMesh.geometry.dispose();
    this.popMaterial.dispose();
    this.bits.geometry.dispose();
    this.bitMaterial.dispose();
    this.bits.dispose();
  }
}
