import * as THREE from 'three';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { createInkModel, type InkArrowIn, type InkTrail } from './kokuryuInkModel';
import { INK_PX_BLOCK, INK_STRIP_H, INK_STRIP_W, paintInkStrip } from './kokuryuInkPaint';

/**
 * 黒龍の 墨の すじ（LEGEND-4 PR1）: 矢の うしろの 黒い けむり ＋ 水色の さし色。見た目だけ。決まりは kokuryuInkModel.ts、絵は kokuryuInkPaint.ts
 * （pixelfx rocket の けむりが 出どころ。MIT）。ゲームの 十字の 板（docs/art/design/05-effects.md §17）: 同じ 絵の 板を 2 まい（矢の 向きに そった たて板と 水平の 板）。
 * 1 本 = 板 2 まい = 三角形 4・描画 1。同時に 3 本まで = 描画 3・三角形 12（上限 4・150。LEGEND-4 §3.7）。絵は 最初に 飛んだ とき 1 回だけ 作る。毎ステップ new しない。
 */
const MAX = LEGEND4_TUNING.kokuryu.trailMax;
/** 板の はんぶんの はば（ブロック） */
const HALF_W = (INK_STRIP_H * INK_PX_BLOCK) / 2;
/** 絵 1 まいの 長さ（ブロック） */
const STRIP_LEN = INK_STRIP_W * INK_PX_BLOCK;

interface Slot {
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
  uv: THREE.BufferAttribute;
  mat: THREE.MeshBasicMaterial;
}

export class KokuryuInkFx {
  private readonly group = new THREE.Group();
  private readonly model = createInkModel();
  private slots: Slot[] | null = null;
  private tex: THREE.DataTexture | null = null;

  constructor(scene: THREE.Object3D) {
    this.group.visible = false;
    scene.add(this.group);
  }

  /** 1 ステップに 1 回。`arrows` = その 人の `bow().arrows()`（straight の 矢だけ すじが 出る） */
  step(arrows: readonly InkArrowIn[], reduced: boolean): void {
    const trails = this.model.step(arrows, reduced);
    if (trails.length === 0) {
      this.group.visible = false;
      return;
    }
    const slots = (this.slots ??= this.build());
    this.group.visible = true;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]!;
      const t = trails[i];
      if (!t || t.length < 0.05) {
        s.mesh.visible = false;
        continue;
      }
      this.place(s, t);
    }
  }

  /** 見えている すじの 数（テスト・窓口用） */
  count(): number {
    return this.slots ? this.slots.filter((s) => s.mesh.visible).length : 0;
  }

  dispose(): void {
    for (const s of this.slots ?? []) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.tex?.dispose();
    this.group.removeFromParent();
    this.slots = null;
    this.tex = null;
  }

  private build(): Slot[] {
    const data = paintInkStrip();
    const tex = new THREE.DataTexture(data, INK_STRIP_W, INK_STRIP_H, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.tex = tex;
    const out: Slot[] = [];
    for (let i = 0; i < MAX; i++) {
      const g = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(8 * 3), 3);
      const uv = new THREE.BufferAttribute(new Float32Array(8 * 2), 2);
      pos.setUsage(THREE.DynamicDrawUsage);
      uv.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', pos);
      g.setAttribute('uv', uv);
      g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 8;
      mesh.visible = false;
      this.group.add(mesh);
      out.push({ mesh, pos, uv, mat });
    }
    return out;
  }

  /** 板 1 まいの 4 頂点（うしろ +・うしろ −・先 −・先 +）を 書く。(wx, wy, wz) = はばの 半分の ベクトル */
  private quad(p: Float32Array, o: number, t: InkTrail, wx: number, wy: number, wz: number): void {
    p[o] = t.tail.x + wx; p[o + 1] = t.tail.y + wy; p[o + 2] = t.tail.z + wz;
    p[o + 3] = t.tail.x - wx; p[o + 4] = t.tail.y - wy; p[o + 5] = t.tail.z - wz;
    p[o + 6] = t.head.x - wx; p[o + 7] = t.head.y - wy; p[o + 8] = t.head.z - wz;
    p[o + 9] = t.head.x + wx; p[o + 10] = t.head.y + wy; p[o + 11] = t.head.z + wz;
  }

  /** 板 2 まいの 頂点を 書く（たて板 = 向き u と v、水平の 板 = u と s。矢が 真上・真下でも こわれない） */
  private place(s: Slot, t: InkTrail): void {
    const d = t.dir;
    // s = 向き × 上（ほぼ 真上・真下なら x 軸）、v = s × 向き
    let sx = -d.z;
    let sz = d.x;
    let sl = Math.hypot(sx, sz);
    if (sl < 1e-3) {
      sx = 1;
      sz = 0;
      sl = 1;
    }
    sx /= sl;
    sz /= sl;
    const vx = -sz * d.y;
    const vy = sz * d.x - sx * d.z;
    const vz = sx * d.y;
    const p = s.pos.array as Float32Array;
    this.quad(p, 0, t, vx * HALF_W, vy * HALF_W, vz * HALF_W);
    this.quad(p, 12, t, sx * HALF_W, 0, sz * HALF_W);
    // 絵は 右はし = 先。1 点 = 1/32 ブロックの まま（のばさない）。絵の 上の 行 = v 0
    const u0 = Math.max(0, 1 - t.length / STRIP_LEN);
    const uv = s.uv.array as Float32Array;
    for (let q = 0; q < 2; q++) {
      const o = q * 8;
      uv[o] = u0; uv[o + 1] = 0;
      uv[o + 2] = u0; uv[o + 3] = 1;
      uv[o + 4] = 1; uv[o + 5] = 1;
      uv[o + 6] = 1; uv[o + 7] = 0;
    }
    s.pos.needsUpdate = true;
    s.uv.needsUpdate = true;
    s.mat.opacity = t.opacity;
    s.mesh.visible = true;
  }
}
