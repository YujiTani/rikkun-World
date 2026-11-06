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
  /** WAKIDOKORO §8: マグマで 燃えて いる（小さな 炎・けむり） */
  burning?: boolean;
}

/** WAKIDOKORO §8: 燃える 落としものの 炎・けむりの つぶ（1 か所の 表） */
const BURN_FX = {
  /** 1 つの 落としものに 出す つぶ: 炎 2・黒い けむり 4・火の粉 1（ゆず: 黒煙が 上がる） */
  flames: 2,
  smokes: 4,
  embers: 1,
  /** 火の粉: 1 まわりの 秒・のぼる 高さ・大きさ */
  emberPeriod: 1.1,
  emberRise: 1.2,
  emberSize: 0.05,
  /** 炎の 1 まわりの 秒・のぼる 高さ（マス）・大きさ */
  flamePeriod: 0.6,
  flameRise: 0.45,
  flameSize: 0.14,
  smokePeriod: 2.0,
  smokeRise: 1.8,
  smokeSize: 0.26,
  /** いちどに 出せる 燃える 落としもの */
  maxBags: 48,
} as const;
const BURN_PER = BURN_FX.flames + BURN_FX.smokes + BURN_FX.embers;
const FLAME_COLORS = [0xffb02e, 0xff6a1a] as const;
/** 黒い けむり: 生まれは 黒、のぼると すこし 灰（pixelfx の SMOKE_RAMP を 逆に した 並び） */
const SMOKE_RAMP = [0x141216, 0x1a171e, 0x2b2630, 0x433d48] as const;
const EMBER_COLORS = [0xffe26b, 0xff8a2a, 0xc9281f] as const;

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

/** MINE-1C: 宝箱の 光の 柱 1 本（落とし物の 柱と 同じ 形・色・濃さ。ジオメトリと ざいりょうは 共有。濃さは 袋の 係が 毎フレーム 更新する） */
export function createChestPillar(rar: Rarity): THREE.Mesh {
  const mesh = new THREE.Mesh(PILLAR_GEO, PILLAR_MATS[rar]);
  const w = SPARKLE[rar].width / PILLAR_BASE_W;
  mesh.scale.set(w, 1, w);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return mesh;
}

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
  /** WAKIDOKORO §8: 燃える つぶ（InstancedMesh 1 つ。燃えて いる ものが なければ 描かない） */
  private readonly burnMesh: THREE.InstancedMesh;
  private readonly burnColor = new THREE.Color();
  /** いま 出て いる 燃える つぶの 数（テスト用） */
  burnParticles = 0;

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
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    bm.userData.noDim = true;
    const burn = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bm, BURN_FX.maxBags * BURN_PER);
    burn.count = 0;
    burn.visible = false;
    burn.frustumCulled = false;
    burn.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    burn.setColorAt(0, this.burnColor.set(0xffffff));
    burn.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    // 炎の つぶは 小さな 入れ物に 入れる（光の輪の InstancedMesh とは べつの 層）
    const fire = new THREE.Group();
    fire.name = 'bag-burn';
    fire.add(burn);
    this.group.add(fire);
    this.burnMesh = burn;
  }

  /**
   * WAKIDOKORO §8: 燃える 落としもの 1 つの つぶ（時間で のぼる。落としものごとに ずらす）。
   * 動きと 色の 決め方は pixelfx（MIT, patch-gg/pixelfx `src/fx/fire/_lib.js` の smokePuff・ember）を 参考に した 自前の 箱つぶ:
   * けむりは 生まれて すぐ ふくらみ（0.65 → +0.45、その後 ゆっくり）、終わりに 小さく なって きえる。色は 黒 → 灰。
   * 火の粉は 熱い 黄 → 橙 → 赤 と さめて、終わりは ちらついて きえる。NOTICE.md に 表記。
   */
  private addBurn(n: number, bag: BagLike): number {
    const F = BURN_FX;
    for (let k = 0; k < BURN_PER && n < this.burnMesh.instanceMatrix.count; k++) {
      const kind = k < F.flames ? 0 : k < F.flames + F.smokes ? 1 : 2; // 0 炎・1 けむり・2 火の粉
      const period = kind === 0 ? F.flamePeriod : kind === 1 ? F.smokePeriod : F.emberPeriod;
      const age = ((this.time + bag.id * 0.37 + k * (period / BURN_PER)) % period) / period; // 0〜1
      const left = 1 - age;
      let size: number;
      let ox: number;
      let oz = 0;
      let rise: number;
      let color: number;
      if (kind === 0) {
        size = F.flameSize * (1 - age * 0.7);
        ox = k === 0 ? -0.08 : 0.08;
        rise = age * F.flameRise;
        color = FLAME_COLORS[k % 2]!;
      } else if (kind === 1) {
        // smokePuff: r = size·(0.65 + min(1, age·2.5)·0.45 + age·0.5)、うすく なる かわりに 小さく
        size = F.smokeSize * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * 0.5) * Math.min(1, left * 2.4);
        ox = Math.sin(age * 4.1 + k * 1.7) * (0.04 + age * 0.14);
        oz = Math.cos(age * 3.3 + k * 2.3) * (0.03 + age * 0.1);
        rise = age * F.smokeRise;
        color = SMOKE_RAMP[Math.min(SMOKE_RAMP.length - 1, Math.floor(age * SMOKE_RAMP.length))]!;
      } else {
        // ember: 熱い ほど 明るい。のこり 0.25 から ちらつく
        size = left < 0.25 && Math.sin(age * 40 + bag.id) < 0 ? 0 : F.emberSize;
        ox = 0.12 * (Math.sin(age * 2.3 + bag.id) - Math.sin(bag.id));
        rise = age * F.emberRise;
        color = EMBER_COLORS[left > 0.6 ? 0 : left > 0.3 ? 1 : 2]!;
      }
      this.mtx.makeScale(size, size, size).setPosition(bag.position.x + ox, bag.position.y + 0.1 + rise, bag.position.z + oz);
      this.burnMesh.setMatrixAt(n, this.mtx);
      this.burnMesh.setColorAt(n, this.burnColor.setHex(color));
      n++;
    }
    return n;
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
    let burnN = 0;
    for (const bag of bags) {
      if (bag.burning === true && bag.slots[0]) burnN = this.addBurn(burnN, bag);
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
    this.burnMesh.count = burnN;
    this.burnMesh.visible = burnN > 0;
    this.burnParticles = burnN;
    if (burnN > 0) {
      this.burnMesh.instanceMatrix.needsUpdate = true;
      if (this.burnMesh.instanceColor) this.burnMesh.instanceColor.needsUpdate = true;
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
    this.burnMesh.geometry.dispose();
    (this.burnMesh.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
