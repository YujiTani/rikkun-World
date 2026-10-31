// みずもり・どうづきを 持った 形（HOUSE-1C PR-2 #340。見た目は yuzu が 決めた 案 B「しらきの はしご わく」の 道具）。
// 体の 前に 小さな 3D の 箱を 1 つ 持たせる（1 つの メッシュ ＝ 描画 +1。持って いない 間は 描かない）。持つ 動き: どうづきは ふりあげて 落とす、みずもりは ゆらす。
// 体の つぶし・のばしは 動きの 間だけ（もとの 大きさに もどす）。毎フレーム 新しい 物は 作らない。
import * as THREE from 'three';
import type { ToolKind as HeldToolKind } from './tuning';

export type { HeldToolKind };

/** 箱 1 つ（ブロック単位。手の 位置が 原点・上 +y・前 −z・右 +x） */
interface Part {
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  color: string;
}

const WATER = '#8FDCF2';
const WOOD = '#E2CDA2';
const WOOD_DARK = '#C8AF80';
const IRON = '#4A4A52';

/** 道具の 形（案 B。まっすぐ 立てた 向き）。どうづきは 手から 下へ 約 0.6、みずもりは 手の 上に 水平 */
const PARTS: Readonly<Record<HeldToolKind, readonly Part[]>> = {
  level: [
    { size: [0.7, 0.1, 0.13], pos: [0, 0.06, 0], color: WOOD },
    { size: [0.62, 0.02, 0.08], pos: [0, 0.11, 0], color: WATER },
    { size: [0.03, 0.03, 0.03], pos: [-0.2, 0.125, 0], color: '#C8442C' },
    { size: [0.03, 0.03, 0.03], pos: [0, 0.125, 0], color: '#C8442C' },
    { size: [0.03, 0.03, 0.03], pos: [0.2, 0.125, 0], color: '#C8442C' },
    { size: [0.05, 0.12, 0.1], pos: [-0.28, -0.05, 0], color: WOOD_DARK },
    { size: [0.05, 0.12, 0.1], pos: [0.28, -0.05, 0], color: WOOD_DARK },
  ],
  tamp: [
    { size: [0.36, 0.05, 0.05], pos: [0, 0.02, 0], color: WOOD },
    { size: [0.06, 0.46, 0.06], pos: [0, -0.22, 0], color: WOOD },
    { size: [0.24, 0.14, 0.24], pos: [0, -0.52, 0], color: '#B98A55' },
    { size: [0.25, 0.03, 0.25], pos: [0, -0.45, 0], color: IRON },
  ],
};

/** 持つ 位置（体の 中心から。ブロック） */
const IDLE: Readonly<Record<HeldToolKind, { x: number; y: number; z: number }>> = {
  level: { x: 0.28, y: 0.78, z: -0.32 },
  tamp: { x: 0.3, y: 0.92, z: -0.3 },
};

/** 動きの 長さ（ステップ）と、体の つぶれ（1 ＝ そのまま） */
const MOVE = { tampTicks: 20, levelTicks: 24, liftTicks: 8, slamTicks: 3, squash: 0.9 } as const;

/** 箱を 1 つの 形（頂点の 色つき）に まとめる */
function merge(parts: readonly Part[]): THREE.BufferGeometry {
  const boxes = parts.map((p) => {
    const g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]).toNonIndexed();
    g.translate(p.pos[0], p.pos[1], p.pos[2]);
    const n = g.getAttribute('position').count;
    const c = new THREE.Color(p.color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const total = boxes.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const g of boxes) {
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export class HeldTool {
  /** 体（doll の group）に つける 根。lighting.registerTree(root, 'doll') は 呼ぶ 側 */
  readonly root = new THREE.Group();
  private readonly inner = new THREE.Group();
  private readonly models = new Map<HeldToolKind, THREE.Mesh>();
  private kind: HeldToolKind | null = null;
  /** 動きの 経過（ステップ）。-1 ＝ 動いて いない */
  private t = -1;
  private spriteScale: THREE.Vector3 | null = null;

  constructor(private readonly sprite: () => THREE.Object3D | undefined) {
    this.root.name = 'heldBuildTool';
    this.inner.rotation.order = 'YXZ';
    this.inner.rotation.y = Math.PI / 2; // 長い 向きを 体の 前へ（横から 見て 形が 分かる）
    this.root.add(this.inner);
    for (const k of ['level', 'tamp'] as const) {
      const m = new THREE.Mesh(merge(PARTS[k]), new THREE.MeshBasicMaterial({ vertexColors: true }));
      m.visible = false;
      m.frustumCulled = false;
      this.inner.add(m);
      this.models.set(k, m);
    }
    this.root.visible = false;
  }

  /** 持つ 道具（null ＝ 持たない） */
  hold(kind: HeldToolKind | null): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.t = -1;
    for (const [k, m] of this.models) m.visible = k === kind;
    this.root.visible = kind !== null;
    if (kind === null) this.restore();
  }

  /** 使った（どうづきを ふる・みずもりを おく）: 動きを はじめる */
  kick(): void {
    if (this.kind) this.t = 0;
  }

  /** 世界の 1 ステップごと */
  tick(): void {
    if (this.t < 0) return;
    const len = this.kind === 'tamp' ? MOVE.tampTicks : MOVE.levelTicks;
    this.t++;
    if (this.t >= len) this.t = -1;
  }

  /** 描く 直前: ポーズを 体に あわせる */
  apply(): void {
    const k = this.kind;
    if (!k) return;
    const base = IDLE[k];
    let dy = 0;
    let rx = 0;
    let rz = 0;
    let sq = 1;
    if (this.t >= 0 && k === 'tamp') {
      // ふりあげて（0〜lift）→ 落とす（slam）→ もどる
      const lift = MOVE.liftTicks;
      const slam = lift + MOVE.slamTicks;
      if (this.t < lift) {
        const u = this.t / lift;
        dy = 0.35 * u;
        rx = -18 * u;
        sq = 1 + (1 - MOVE.squash) * 0.5 * u;
      } else if (this.t < slam) {
        const u = (this.t - lift) / MOVE.slamTicks;
        dy = 0.35 * (1 - u) - 0.12 * u;
        rx = -18 * (1 - u) + 10 * u;
        sq = MOVE.squash;
      } else {
        const u = (this.t - slam) / (MOVE.tampTicks - slam);
        dy = -0.12 * (1 - u);
        rx = 10 * (1 - u);
        sq = MOVE.squash + (1 - MOVE.squash) * u;
      }
    } else if (this.t >= 0) {
      const u = this.t / MOVE.levelTicks;
      rz = 14 * Math.sin(u * Math.PI * 4) * (1 - u);
      sq = 1 - (1 - MOVE.squash) * Math.sin(u * Math.PI);
    }
    this.root.position.set(base.x, base.y + dy, base.z);
    this.root.rotation.set((rx * Math.PI) / 180, 0, 0);
    this.inner.rotation.z = (rz * Math.PI) / 180;
    this.squash(sq);
  }

  /** 体の つぶし・のばし（動きの 間だけ。1 ＝ もとの 大きさ） */
  private squash(q: number): void {
    const sp = this.sprite();
    if (!sp) return;
    if (q === 1) {
      this.restore();
      return;
    }
    this.spriteScale ??= sp.scale.clone();
    sp.scale.set(this.spriteScale.x * (2 - q), this.spriteScale.y * q, this.spriteScale.z);
  }

  private restore(): void {
    const sp = this.sprite();
    if (sp && this.spriteScale) {
      sp.scale.copy(this.spriteScale);
      this.spriteScale = null;
    }
  }

  dispose(): void {
    for (const m of this.models.values()) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
