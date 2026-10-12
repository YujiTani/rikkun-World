import * as THREE from 'three';
import type { ItemId, Rarity, Vec3 } from '../contracts';
import { itemIconPixels } from '../ui/itemIcon';
import { RARITY_COLOR } from '../drops/rarity';
import { COMBAT_FX, bagPose } from './combatFxModel';

/** 落ちたアイテム 1 つ（`combat.bags()` の 1 件。slots は 1 つ） */
export interface BagLike {
  id: number;
  position: Vec3;
  slots: ReadonlyArray<{ item: ItemId; count: number }>;
  ticksLeft: number;
  /** 同じ回にばらまいたもの（光の柱は 1 回に 1 本）。なければ 1 つずつ */
  batch?: number;
  /** 柱の色（その回でいちばんめずらしいもの）。なければ common */
  rarity?: Rarity;
}

const B = COMBAT_FX.bag;

const PLANE_GEO = new THREE.PlaneGeometry(B.iconSize, B.iconSize);
const PILLAR_GEO = new THREE.BoxGeometry(...B.pillarSize);

const textures = new Map<string, THREE.DataTexture>();
const materials = new Map<string, THREE.MeshBasicMaterial>();

/** アイテムの 16x16 の絵 → ぼかさない板の材料（アイテムごとに 1 つを使いまわす） */
function iconMaterial(item: ItemId): THREE.MeshBasicMaterial {
  let m = materials.get(item);
  if (m) return m;
  const px = itemIconPixels(item);
  const data = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const c = px[y * 16 + x]!;
      const o = ((15 - y) * 16 + x) * 4; // DataTexture は下の行から
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = c[3];
    }
  const tex = new THREE.DataTexture(data, 16, 16, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  textures.set(item, tex);
  materials.set(item, m);
  return m;
}

interface Visual {
  root: THREE.Group;
  spinner: THREE.Group;
  item: ItemId;
  layers: number;
}

function pillarMaterial(color: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: B.pillarOpacity, depthWrite: false });
  m.userData.noDim = true; // 光るものは暗くしない
  return m;
}
const PILLAR_MATS = {
  common: pillarMaterial(RARITY_COLOR.common),
  uncommon: pillarMaterial(RARITY_COLOR.uncommon),
  rare: pillarMaterial(RARITY_COLOR.rare),
  superRare: pillarMaterial(RARITY_COLOR.superRare),
} as const;
const SPARK_GEO = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const SPARKS = 6;

interface Pillar {
  mesh: THREE.Mesh;
  sparks: THREE.Group;
}

/**
 * 落ちたアイテムの見た目: アイテムの絵の小さな板が、ゆっくり回りながらふわふわ。
 * 数が 2 こ以上なら少しずらして重ねる。光の柱は、近くにかたまった落としものの真ん中に 1 本。
 */
export class BagVisuals {
  readonly group = new THREE.Group();
  private readonly visuals = new Map<number, Visual>();
  private readonly pillars: Pillar[] = [];
  private readonly cx: number[] = [];
  private readonly cy: number[] = [];
  private readonly cz: number[] = [];
  private readonly cn: number[] = [];
  private readonly ck: number[] = [];
  private readonly cr: Rarity[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'bags';
    scene.add(this.group);
  }

  /** いま出ている落ちたアイテムの数 */
  count(): number {
    return this.visuals.size;
  }

  /** いま出ている光の柱の数 */
  pillarCount(): number {
    let n = 0;
    for (const p of this.pillars) if (p.mesh.visible) n++;
    return n;
  }

  update(dt: number, bags: readonly BagLike[]): void {
    this.time += dt;
    const seen = new Set<number>();
    let clusters = 0;
    for (const bag of bags) {
      const slot = bag.slots[0];
      if (!slot) continue;
      seen.add(bag.id);
      let v = this.visuals.get(bag.id);
      if (!v) {
        v = this.create(slot.item);
        this.visuals.set(bag.id, v);
        this.group.add(v.root);
      }
      const layers = Math.min(B.stackMax, slot.count >= 2 ? 2 + (slot.count >= 16 ? 1 : 0) : 1);
      if (layers !== v.layers) this.setLayers(v, layers);
      const pose = bagPose(this.time, bag.ticksLeft);
      v.root.position.set(bag.position.x, bag.position.y, bag.position.z);
      v.spinner.position.y = pose.y;
      v.spinner.rotation.y = pose.spin + bag.id * 0.7; // アイテムごとに向きをずらす

      // 光の柱: 1 回のばらまき（batch）に 1 本
      const key = bag.batch ?? -bag.id;
      let k = 0;
      for (; k < clusters; k++) if (this.ck[k] === key) break;
      if (k === clusters) {
        this.cx[k] = this.cy[k] = this.cz[k] = this.cn[k] = 0;
        this.ck[k] = key;
        this.cr[k] = bag.rarity ?? 'common';
        clusters++;
      }
      this.cx[k]! += bag.position.x;
      this.cy[k] = Math.min(this.cn[k] === 0 ? Infinity : this.cy[k]!, bag.position.y);
      this.cz[k]! += bag.position.z;
      this.cn[k]!++;
    }
    for (const [id, v] of this.visuals) {
      if (seen.has(id)) continue;
      this.group.remove(v.root);
      this.visuals.delete(id);
    }
    for (let k = 0; k < Math.max(clusters, this.pillars.length); k++) {
      if (k >= clusters) {
        this.pillars[k]!.mesh.visible = false;
        this.pillars[k]!.sparks.visible = false;
        continue;
      }
      let p = this.pillars[k];
      if (!p) {
        const mesh = new THREE.Mesh(PILLAR_GEO, PILLAR_MATS.common);
        mesh.renderOrder = 3;
        const sparks = new THREE.Group();
        for (let i = 0; i < SPARKS; i++) sparks.add(new THREE.Mesh(SPARK_GEO, PILLAR_MATS.superRare));
        p = { mesh, sparks };
        this.pillars[k] = p;
        this.group.add(mesh, sparks);
      }
      const x = this.cx[k]! / this.cn[k]!;
      const z = this.cz[k]! / this.cn[k]!;
      const rar = this.cr[k]!;
      p.mesh.visible = true;
      p.mesh.material = PILLAR_MATS[rar];
      p.mesh.position.set(x, this.cy[k]! + B.pillarSize[1] / 2, z);
      // むらさき（superRare）だけ、ゆっくり回るきらきらの粒
      p.sparks.visible = rar === 'superRare';
      if (p.sparks.visible) {
        p.sparks.position.set(x, this.cy[k]!, z);
        for (let i = 0; i < SPARKS; i++) {
          const a = this.time * 0.8 + (i * Math.PI * 2) / SPARKS;
          p.sparks.children[i]!.position.set(Math.cos(a) * 0.5, 0.3 + ((i * 1.7 + this.time * 0.6) % 4), Math.sin(a) * 0.5);
        }
      }
    }
  }

  private create(item: ItemId): Visual {
    const root = new THREE.Group();
    const spinner = new THREE.Group();
    root.add(spinner);
    const v: Visual = { root, spinner, item, layers: 0 };
    this.setLayers(v, 1);
    return v;
  }

  private setLayers(v: Visual, n: number): void {
    v.spinner.clear();
    const mat = iconMaterial(v.item);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(PLANE_GEO, mat);
      m.position.set((i - (n - 1) / 2) * B.stackGap, 0, (i - (n - 1) / 2) * B.stackGap);
      v.spinner.add(m);
    }
    v.layers = n;
  }

  dispose(): void {
    this.update(0, []);
    for (const p of this.pillars) this.group.remove(p.mesh, p.sparks);
    this.pillars.length = 0;
    this.group.removeFromParent();
  }
}
