/**
 * MINE-1F §3.8: やかたの 見た目の 動き（描画の 部品）。コマの 数は `yakataMotion` の 表から 読む。
 * - YakataFloat: 祭壇の 上に 中身の アイコンが ふわっと うかぶ（ゆっくり 回る・上下に ゆれる）。板は 先に 作りおき（毎フレーム new しない）。
 * - YakataGateFx: 門が せり上がる / ひらく（さがる）・ふさがった とき ほこり。門の ブロックは すぐ かわるので、見た目だけの 飾り。
 * つなぐのは A（wire）: show/hide・close/open は 出来事の とき 1 回・update は 毎ステップ。
 */
import * as THREE from 'three';
import type { ItemId } from '../contracts/items';
import { drawPixels, itemIconPixels } from '../ui/itemIcon';
import { setYakataSway } from '../world/light/yakataLight';
import { yakataMotion } from './yakataMotion';

/** うかぶ 中身の 同時 数〔こ〕・板の 大きさ〔マス〕・祭壇の 上の 高さ〔マス〕 */
const FLOAT_SLOTS = 4;
const FLOAT_SIZE = 0.7;
const FLOAT_HEIGHT = 1.3;
/** ほこりの 数〔こ〕・大きさ〔マス〕・うき上がる 高さ〔マス〕 */
const DUST_COUNT = 8;
const DUST_SIZE = 0.25;
const DUST_RISE = 0.8;

const texCache = new Map<ItemId, THREE.CanvasTexture>();

function iconTexture(item: ItemId): THREE.CanvasTexture {
  let t = texCache.get(item);
  if (!t) {
    const c = document.createElement('canvas');
    drawPixels(c, itemIconPixels(item));
    t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(item, t);
  }
  return t;
}

export interface FloatCell {
  item: ItemId;
  /** 祭壇の ブロックの 中心（x, 上面 y, z） */
  x: number;
  y: number;
  z: number;
}

export class YakataFloat {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly baseY: number[] = [];

  constructor() {
    const geo = new THREE.PlaneGeometry(FLOAT_SIZE, FLOAT_SIZE);
    for (let i = 0; i < FLOAT_SLOTS; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
      m.visible = false;
      this.meshes.push(m);
      this.baseY.push(0);
      this.group.add(m);
    }
  }

  /** 中身を 出す（FLOAT_SLOTS こまで）。宝箱が あいた とき 1 回 */
  show(cells: readonly FloatCell[]): void {
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      const c = cells[i];
      m.visible = !!c;
      if (!c) continue;
      (m.material as THREE.MeshBasicMaterial).map = iconTexture(c.item);
      (m.material as THREE.MeshBasicMaterial).needsUpdate = true;
      m.position.set(c.x, c.y + FLOAT_HEIGHT, c.z);
      this.baseY[i] = c.y + FLOAT_HEIGHT;
    }
  }

  /** 取ったら / やかたを 出たら 消す */
  hide(): void {
    for (const m of this.meshes) m.visible = false;
  }

  /** 毎ステップ。frame = 数えつづける コマ（60 = 1 秒）。reduce なら 回らず ゆれない。あやしい たいまつの ゆれ（`setYakataSway`）も ここで 進める */
  update(frame: number, reduce: boolean): void {
    setYakataSway(frame, reduce);
    const f = yakataMotion(reduce).floatItem;
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      if (!m.visible) continue;
      m.rotation.y = f.spinFrames > 0 ? ((frame + i * 30) / f.spinFrames) * Math.PI * 2 : 0;
      m.position.y = this.baseY[i] + f.bobAmp * Math.sin(((frame + i * 20) / f.bobFrames) * Math.PI * 2);
    }
  }

  dispose(): void {
    (this.meshes[0]?.geometry as THREE.BufferGeometry | undefined)?.dispose();
    for (const m of this.meshes) (m.material as THREE.Material).dispose();
  }
}

export interface GateBox {
  /** 門の まん中の 下（x, 床 y, z）・幅 / 奥行き / 高さ〔マス〕 */
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

export class YakataGateFx {
  readonly group = new THREE.Group();
  private readonly slab: THREE.Mesh;
  private readonly dust: THREE.Mesh[] = [];
  private gate: GateBox | null = null;
  private mode: 'none' | 'close' | 'open' = 'none';
  private t = 0;
  private reduce = false;

  constructor(color = 0x6a5a4a) {
    this.slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color }));
    this.slab.visible = false;
    this.group.add(this.slab);
    const g = new THREE.BoxGeometry(DUST_SIZE, DUST_SIZE, DUST_SIZE);
    for (let i = 0; i < DUST_COUNT; i++) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xcfc6b8, transparent: true }));
      m.visible = false;
      this.dust.push(m);
      this.group.add(m);
    }
  }

  /** ふさがる: 下から せり上がる（stopAt コマで ぴたっと・dustAt で ほこり）。reduce なら 動かさない */
  close(gate: GateBox, reduce: boolean): void {
    this.begin(gate, reduce, 'close');
  }

  /** ひらく: さがって いく（gateOpenEnd コマ） */
  open(gate: GateBox, reduce: boolean): void {
    this.begin(gate, reduce, 'open');
  }

  /** 動いている 最中か（A が 見た目の 終わりを 待つ ときに） */
  get active(): boolean {
    return this.mode !== 'none';
  }

  private begin(gate: GateBox, reduce: boolean, mode: 'close' | 'open'): void {
    this.gate = gate;
    this.reduce = reduce;
    this.mode = reduce ? 'none' : mode;
    this.t = 0;
    if (reduce) this.hideAll();
    else this.update();
  }

  /** 毎ステップ（動いて いない 間は すぐ 戻る） */
  update(): void {
    const g = this.gate;
    if (this.mode === 'none' || !g) return;
    const m = yakataMotion(this.reduce);
    const c = m.gateClose;
    const end = this.mode === 'close' ? c.endAt : m.gateOpenEnd;
    if (this.t > end) {
      this.hideAll();
      this.mode = 'none';
      return;
    }
    let k: number;
    if (this.mode === 'close') k = Math.min(this.t / Math.max(c.stopAt, 1), 1) * c.riseTo;
    else k = 1 - Math.min(this.t / Math.max(m.gateOpenEnd, 1), 1);
    // 門の 本体は すでに ブロックで 立つ / 消える ので、板は 上書きの 飾り（下から 出る・下へ しまう）
    const s = this.slab;
    s.visible = k > 0 && k < 1;
    s.scale.set(g.w, g.h * k, g.d);
    s.position.set(g.x, g.y + (g.h * k) / 2, g.z);
    const dustT = this.mode === 'close' ? this.t - c.dustAt : this.t - m.gateOpenEnd;
    const showDust = this.mode === 'close' && dustT >= 0 && dustT <= c.endAt - c.dustAt;
    const span = Math.max(c.endAt - c.dustAt, 1);
    for (let i = 0; i < this.dust.length; i++) {
      const d = this.dust[i];
      d.visible = showDust;
      if (!showDust) continue;
      const a = (i / this.dust.length) * Math.PI * 2;
      const p = dustT / span;
      d.position.set(g.x + Math.cos(a) * (g.w / 2 + p * 0.6), g.y + 0.2 + p * DUST_RISE, g.z + Math.sin(a) * (g.d / 2 + p * 0.6));
      (d.material as THREE.MeshBasicMaterial).opacity = 1 - p;
    }
    this.t++;
  }

  private hideAll(): void {
    this.slab.visible = false;
    for (const d of this.dust) d.visible = false;
  }

  dispose(): void {
    this.slab.geometry.dispose();
    (this.slab.material as THREE.Material).dispose();
    this.dust[0]?.geometry.dispose();
    for (const d of this.dust) (d.material as THREE.Material).dispose();
  }
}
