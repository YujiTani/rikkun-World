import * as THREE from 'three';
import type { BowEvent } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { BOLT_FRAMES, createYataModel, type BoltIn, type YataModel } from './yatagarasuFxModel';

/**
 * 八咫烏の 金の 光の 矢（A2）と むらさきの ほのお（B3）を 画面に 出す（LEGEND-4 PR2）。決まりは yatagarasuFxModel.ts。
 * 絵は スプライトシート（`public/models/fx/yata_bolt.png`・`yata_burst.png`。pixelfx、MIT。THIRD-PARTY-NOTICES.md）を 最初に 使う とき 1 回 読む。
 * 板は 十字（docs/art/design/05-effects.md §17）: 金の 光 = 矢の 向きに そった たて板と 水平の 板、ほのお = 立てた 板 2 まいを 十字に。
 * 描画回数 = 光 3 ＋ ほのお 2。三角形は 板 1 まい 2 つ（光 4 × 3 ＋ ほのお 4 × 2 = 20）。毎ステップ new しない。
 */
const Y = LEGEND4_TUNING.yatagarasu;
const BASE = './models/fx/';
/** 1 点の 大きさ（ブロック。1/32） */
const PX = 1 / 32;
/** 金の 光の 絵: 1 コマ 128 × 32 点。先（矢の 位置）は 左から 108 点 */
const BOLT_W = 128 * PX;
const BOLT_H = 32 * PX;
const BOLT_HEAD = 108 * PX;
/** ほのおの 絵: 1 コマ 224 × 200 点を ブロックの 1/50 に（輪の 直径が 半径 2 の 球と 同じ ほど）。シートは 6 列 × 5 行 */
const BURST_PX = 1 / 50;
const BURST_W = 224 * BURST_PX;
const BURST_H = 200 * BURST_PX;
const BURST_COLS = 6;
const BURST_ROWS = 5;

interface Slot {
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
  uv: THREE.BufferAttribute;
  mat: THREE.MeshBasicMaterial;
}

function makeSlot(tex: THREE.Texture, parent: THREE.Group, order: number): Slot {
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
  mesh.renderOrder = order;
  mesh.visible = false;
  parent.add(mesh);
  return { mesh, pos, uv, mat };
}

function loadTex(file: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(`${BASE}${file}`);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 4 頂点 (a, b, c, d) と 4 つの uv（u0, v0）…を 書く */
function writeUv(u: Float32Array, o: number, u0: number, u1: number, vTop: number, vBot: number): void {
  u[o] = u0; u[o + 1] = vTop;
  u[o + 2] = u0; u[o + 3] = vBot;
  u[o + 4] = u1; u[o + 5] = vBot;
  u[o + 6] = u1; u[o + 7] = vTop;
}

export class YatagarasuFx {
  private readonly group = new THREE.Group();
  private readonly model: YataModel = createYataModel();
  private bolts: Slot[] | null = null;
  private flames: Slot[] | null = null;
  private texBolt: THREE.Texture | null = null;
  private texBurst: THREE.Texture | null = null;

  constructor(scene: THREE.Object3D) {
    this.group.visible = false;
    scene.add(this.group);
  }

  /** 1 ステップに 1 回。`arrows` = その 人の `bow().arrows()`、`events` = その ステップの 弓の 出来事（`drainArrowEvents`） */
  step(arrows: readonly BoltIn[], events: readonly BowEvent[], reduced: boolean): void {
    this.model.step(arrows, events, reduced);
    const bl = this.model.bolts();
    const fl = this.model.flames();
    if (bl.length === 0 && fl.length === 0) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    if (bl.length > 0 || this.bolts) this.drawBolts(bl);
    if (fl.length > 0 || this.flames) this.drawFlames(fl);
  }

  /** 見えている 光と ほのおの 数（テスト・窓口用） */
  count(): { bolts: number; flames: number } {
    return { bolts: this.bolts ? this.bolts.filter((s) => s.mesh.visible).length : 0, flames: this.flames ? this.flames.filter((s) => s.mesh.visible).length : 0 };
  }

  dispose(): void {
    for (const s of [...(this.bolts ?? []), ...(this.flames ?? [])]) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.texBolt?.dispose();
    this.texBurst?.dispose();
    this.group.removeFromParent();
    this.bolts = null;
    this.flames = null;
    this.texBolt = null;
    this.texBurst = null;
  }

  private drawBolts(list: ReturnType<YataModel['bolts']>): void {
    if (!this.bolts) {
      this.texBolt = loadTex('yata_bolt.png');
      this.bolts = Array.from({ length: Y.boltMax }, () => makeSlot(this.texBolt!, this.group, 8));
    }
    for (let i = 0; i < this.bolts.length; i++) {
      const s = this.bolts[i]!;
      const b = list[i];
      if (!b) {
        s.mesh.visible = false;
        continue;
      }
      const d = b.dir;
      // s = 向き × 上（ほぼ 真上・真下なら x 軸）、v = s × 向き（黒龍の 墨の すじと 同じ 十字）
      let sx = -d.z;
      let sz = d.x;
      let sl = Math.hypot(sx, sz);
      if (sl < 1e-3) { sx = 1; sz = 0; sl = 1; }
      sx /= sl;
      sz /= sl;
      const vx = -sz * d.y;
      const vy = sz * d.x - sx * d.z;
      const vz = sx * d.y;
      const hw = BOLT_H / 2;
      const tail = BOLT_HEAD;
      const head = BOLT_W - BOLT_HEAD;
      const p = s.pos.array as Float32Array;
      const q = (o: number, wx: number, wy: number, wz: number): void => {
        const P = b.position;
        const tx = P.x - d.x * tail, ty = P.y - d.y * tail, tz = P.z - d.z * tail;
        const hx = P.x + d.x * head, hy = P.y + d.y * head, hz = P.z + d.z * head;
        p[o] = tx + wx; p[o + 1] = ty + wy; p[o + 2] = tz + wz;
        p[o + 3] = tx - wx; p[o + 4] = ty - wy; p[o + 5] = tz - wz;
        p[o + 6] = hx - wx; p[o + 7] = hy - wy; p[o + 8] = hz - wz;
        p[o + 9] = hx + wx; p[o + 10] = hy + wy; p[o + 11] = hz + wz;
      };
      q(0, vx * hw, vy * hw, vz * hw);
      q(12, sx * hw, 0, sz * hw);
      const u = s.uv.array as Float32Array;
      const vTop = 1 - b.frame / BOLT_FRAMES;
      const vBot = 1 - (b.frame + 1) / BOLT_FRAMES;
      writeUv(u, 0, 0, 1, vTop, vBot);
      writeUv(u, 8, 0, 1, vTop, vBot);
      s.pos.needsUpdate = true;
      s.uv.needsUpdate = true;
      s.mat.opacity = 1;
      s.mesh.visible = true;
    }
  }

  private drawFlames(list: ReturnType<YataModel['flames']>): void {
    if (!this.flames) {
      this.texBurst = loadTex('yata_burst.png');
      this.flames = Array.from({ length: Y.burstMax }, () => makeSlot(this.texBurst!, this.group, 9));
    }
    for (let i = 0; i < this.flames.length; i++) {
      const s = this.flames[i]!;
      const f = list[i];
      if (!f) {
        s.mesh.visible = false;
        continue;
      }
      const P = f.position;
      const hw = BURST_W / 2;
      const hh = BURST_H / 2;
      const p = s.pos.array as Float32Array;
      // 立てた 板 2 まい（x 向きと z 向き）。絵の まん中 = ほのおの 点
      p[0] = P.x - hw; p[1] = P.y + hh; p[2] = P.z;
      p[3] = P.x - hw; p[4] = P.y - hh; p[5] = P.z;
      p[6] = P.x + hw; p[7] = P.y - hh; p[8] = P.z;
      p[9] = P.x + hw; p[10] = P.y + hh; p[11] = P.z;
      p[12] = P.x; p[13] = P.y + hh; p[14] = P.z - hw;
      p[15] = P.x; p[16] = P.y - hh; p[17] = P.z - hw;
      p[18] = P.x; p[19] = P.y - hh; p[20] = P.z + hw;
      p[21] = P.x; p[22] = P.y + hh; p[23] = P.z + hw;
      const col = f.frame % BURST_COLS;
      const row = Math.floor(f.frame / BURST_COLS);
      const u = s.uv.array as Float32Array;
      const u0 = col / BURST_COLS;
      const u1 = (col + 1) / BURST_COLS;
      const vTop = 1 - row / BURST_ROWS;
      const vBot = 1 - (row + 1) / BURST_ROWS;
      writeUv(u, 0, u0, u1, vTop, vBot);
      writeUv(u, 8, u0, u1, vTop, vBot);
      s.pos.needsUpdate = true;
      s.uv.needsUpdate = true;
      s.mat.opacity = f.opacity;
      s.mesh.visible = true;
    }
  }
}
