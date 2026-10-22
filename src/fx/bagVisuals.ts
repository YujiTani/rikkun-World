import * as THREE from 'three';
import type { ItemId, Rarity, Vec3 } from '../contracts';
import { itemIconPixels } from '../ui/itemIcon';
import { RARITY_COLOR, RARITY_ORDER } from '../drops/rarity';
import { SPARKLE, SparkleLayer, bagBodyHue, pillarOpacity, rainbowHue } from './dropSparkle';
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
  /** 止まっている（なければ止まっている扱い）。とんでいるあいだは くるくる回る */
  resting?: boolean;
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
  wasResting: boolean;
  restT: number;
  rarity: Rarity;
  /** 7 段目の 袋だけ: 袋そのものの 色が にじ色に 変わる（WEAPON-7 §2.3）。この 袋だけの 材料（絵は 使いまわし） */
  tint: THREE.MeshBasicMaterial | null;
}

function pillarMaterial(color: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: B.pillarOpacity, depthWrite: false });
  m.userData.noDim = true; // 光るものは暗くしない
  return m;
}
// 7 段ぶん（RARITY-7）。5〜7 段目の柱は 段の色のまま（にじ色に流すのは 7 段目だけ）
const PILLAR_MATS = Object.fromEntries(RARITY_ORDER.map((r) => [r, pillarMaterial(RARITY_COLOR[r])])) as Record<Rarity, THREE.MeshBasicMaterial>;
/** 7 段目の柱: たてに 7 色ならんだ にじのグラデーション（1 色ずつ変わるのではなく、柱 1 本に全部の色が見える）。ゆっくり上へ流れる */
const RAINBOW_ROWS = 64;
const PILLAR_RAINBOW_TEX = (() => {
  const data = new Uint8Array(RAINBOW_ROWS * 4);
  const c = new THREE.Color();
  for (let i = 0; i < RAINBOW_ROWS; i++) {
    c.setHSL(i / RAINBOW_ROWS, 0.85, 0.72);
    data[i * 4] = Math.round(c.r * 255);
    data[i * 4 + 1] = Math.round(c.g * 255);
    data[i * 4 + 2] = Math.round(c.b * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, 1, RAINBOW_ROWS, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();
PILLAR_MATS.legendary.map = PILLAR_RAINBOW_TEX;
PILLAR_MATS.legendary.color.set(0xffffff);
PILLAR_MATS.legendary.needsUpdate = true;
const RING_GEO = new THREE.RingGeometry(0.34, 0.44, 32).rotateX(-Math.PI / 2);
const RING_MAX = 400;
const RING_GROW_SECONDS = 0.5;
/** 柱の根もとの太さ（PILLAR_GEO のはば）。めずらしさごとに scale で太くする */
const PILLAR_BASE_W = B.pillarSize[0];
const SPIN_FLYING = Math.PI * 2; // とんでいるあいだ 1 回転/秒

interface Pillar {
  mesh: THREE.Mesh;
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
  private readonly sparkle = new SparkleLayer();
  /** 地面の光の輪は 1 つの InstancedMesh（1 こずつ色を持つ）。段が増えても描画回数は 1 回のまま */
  private readonly rings: THREE.InstancedMesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private ringN = 0;
  private readonly ringColor = new THREE.Color();
  private readonly mtx = new THREE.Matrix4();

  /** onLand: 1 回の update で 着地があれば、いちばんめずらしいもの 1 つだけ呼ぶ（音用） */
  constructor(
    scene: THREE.Scene,
    private readonly onLand?: (r: Rarity) => void,
  ) {
    this.group.name = 'bags';
    scene.add(this.group);
    this.sparkle.addTo(this.group);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    m.userData.noDim = true;
    const im = new THREE.InstancedMesh(RING_GEO, m, RING_MAX);
    im.count = 0;
    im.frustumCulled = false;
    im.renderOrder = 2;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, this.ringColor.set(0xffffff)); // instanceColor を作っておく
    im.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.group.add(im);
    this.rings = im;
    this.ringMat = m;
  }

  /** いま出ている光の輪の数 */
  ringCount(): number {
    return this.rings.count;
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
    let landed = -1;
    this.sparkle.begin(dt);
    this.ringN = 0;
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
      const resting = bag.resting ?? true;
      const rar = bag.rarity ?? 'common';
      v.root.position.set(bag.position.x, bag.position.y, bag.position.z);
      v.rarity = rar;
      this.tintBody(v, rar);
      if (resting) {
        // 着地: 地面から うかんで ゆっくり回る・ふわふわ
        v.spinner.position.y = pose.y;
        v.spinner.rotation.y = pose.spin + bag.id * 0.7; // アイテムごとに向きをずらす
        v.restT += dt;
        if (!v.wasResting) {
          this.sparkle.flash(bag.position.x, bag.position.y, bag.position.z, rar);
          landed = Math.max(landed, RARITY_ORDER.indexOf(rar));
        }
        // 地面の光の輪（ひろがって とまる）
        const n = this.ringN;
        if (n < RING_MAX) {
          const sc = 0.4 + 0.6 * Math.min(1, v.restT / RING_GROW_SECONDS);
          this.mtx.makeScale(sc, 1, sc).setPosition(bag.position.x, bag.position.y + 0.03, bag.position.z);
          this.rings.setMatrixAt(n, this.mtx);
          // 7 段目の輪は にじ色にゆっくり流れる（ほかは 段の色）
          if (rar === 'legendary') this.ringColor.setHSL(rainbowHue(this.time, 0.3), 0.7, 0.7);
          else this.ringColor.setHex(RARITY_COLOR[rar]);
          this.rings.setColorAt(n, this.ringColor);
          this.ringN = n + 1;
        }
      } else {
        v.restT = 0;
        v.spinner.position.y = B.lift;
        v.spinner.rotation.y = this.time * SPIN_FLYING + bag.id * 0.7; // とんでいるあいだ くるっと回る
      }
      v.wasResting = resting;

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
      v.tint?.dispose();
      this.group.remove(v.root);
      this.visuals.delete(id);
    }
    this.rings.count = this.ringN;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    for (let k = 0; k < Math.max(clusters, this.pillars.length); k++) {
      if (k >= clusters) {
        this.pillars[k]!.mesh.visible = false;
        continue;
      }
      let p = this.pillars[k];
      if (!p) {
        const mesh = new THREE.Mesh(PILLAR_GEO, PILLAR_MATS.common);
        mesh.renderOrder = 3;
        p = { mesh };
        this.pillars[k] = p;
        this.group.add(mesh);
      }
      const x = this.cx[k]! / this.cn[k]!;
      const z = this.cz[k]! / this.cn[k]!;
      const rar = this.cr[k]!;
      const w = SPARKLE[rar].width / PILLAR_BASE_W;
      p.mesh.visible = true;
      p.mesh.material = PILLAR_MATS[rar];
      p.mesh.scale.set(w, 1, w);
      p.mesh.position.set(x, this.cy[k]! + B.pillarSize[1] / 2, z);
      this.sparkle.addPillar(x, this.cy[k]!, z, rar, this.time, (this.ck[k]! * 0.37) % 1);
    }
    // 柱の濃さ（めずらしい: ゆっくりゆれる）・7 段目: 7 色のグラデーションがゆっくり上へ流れる（点滅なし）
    for (const r of RARITY_ORDER) PILLAR_MATS[r].opacity = pillarOpacity(r, this.time);
    PILLAR_RAINBOW_TEX.offset.y = -rainbowHue(this.time);
    this.sparkle.addFlashes();
    this.sparkle.end();
    if (landed >= 0) this.onLand?.(RARITY_ORDER[landed]!);
  }

  private create(item: ItemId): Visual {
    const root = new THREE.Group();
    const spinner = new THREE.Group();
    root.add(spinner);
    const v: Visual = { root, spinner, item, layers: 0, wasResting: true, restT: 1, rarity: 'common', tint: null };
    this.setLayers(v, 1);
    return v;
  }

  /** 7 段目（legendary）の 袋の 色: 絵の 色に にじ色を ゆっくり かける（明るめ。点滅なし）。ほかの 段は 絵のまま */
  private tintBody(v: Visual, rar: Rarity): void {
    if (rar !== 'legendary') {
      if (v.tint) {
        v.tint.dispose();
        v.tint = null;
        this.setLayers(v, v.layers);
      }
      return;
    }
    if (!v.tint) {
      v.tint = iconMaterial(v.item).clone();
      v.tint.userData.noDim = true;
      this.setLayers(v, v.layers);
    }
    v.tint.color.setHSL(bagBodyHue(this.time), 1, 0.78);
  }

  private setLayers(v: Visual, n: number): void {
    v.spinner.clear();
    const mat = v.tint ?? iconMaterial(v.item);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(PLANE_GEO, mat);
      m.position.set((i - (n - 1) / 2) * B.stackGap, 0, (i - (n - 1) / 2) * B.stackGap);
      v.spinner.add(m);
    }
    v.layers = n;
  }

  dispose(): void {
    this.update(0, []);
    for (const p of this.pillars) this.group.remove(p.mesh);
    this.pillars.length = 0;
    this.sparkle.dispose();
    this.rings.dispose();
    this.ringMat.dispose();
    this.group.removeFromParent();
  }
}
