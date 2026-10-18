import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOOK_COVER, type BookLayout, type Rect } from './bookLayout';
import { bookPose, type Pose } from './bookPose';
import type { BookModel } from './bookModel';

/**
 * BOOK-1 案 C「まほうの ずかん」の 3D の 本（docs/art/book-1/STYLE.md §2・§6）。
 * - 本は 自分の WebGLRenderer（alpha）で ゲームの 上に かさねる。ゲームの 景色は 描きなおさない。
 * - カメラは 画面の 高さ ÷ 2 ÷ tan(15°) の 所に 置くので、z ＝ 0 の 面の 1 単位が 画面の 1px（紙の 上に HTML を ぴったり かさねられる）。
 * - 描くのは 動きの 間と 作りなおしの ときだけ（`render()` が dirty を 見る）。
 * - 同じ 材料の 面・金具は 1 つに まとめて 描画回数を へらす。
 */

const T = 20; // 紙の たばの あつみ
const C = 18; // 表紙の あつみ
const M = BOOK_COVER; // 表紙が 紙より はみだす 長さ
const LEAF = 4; // めくる 紙の あつみ
const S = 2; // 絵の こまかさ（canvas は px の 2 倍）
const WOOD = '#8a5a2e';
const WOOD_DARK = '#5a3616';
const GOLD = '#e0b545';
const PAPER = '#fbfaf5';

const canvas = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
};
const tex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
/** 決まった 並びの 乱数（見た目の きまった もよう用） */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
const FACE_INDEX: Record<Face, number> = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };

/** 要る 面だけの 箱（同じ 材料の 面は 1 つの 描画に まとまる） */
function faceBox(w: number, h: number, d: number, faces: Partial<Record<Face, THREE.Material>>): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  const src = Array.from(g.index!.array);
  const mats: THREE.Material[] = [];
  const out: number[] = [];
  g.clearGroups();
  for (const m of new Set(Object.values(faces) as THREE.Material[])) {
    const start = out.length;
    for (const [name, mat] of Object.entries(faces) as [Face, THREE.Material][]) {
      if (mat !== m) continue;
      const f = FACE_INDEX[name] * 6;
      out.push(...src.slice(f, f + 6));
    }
    g.addGroup(start, out.length - start, mats.length);
    mats.push(m);
  }
  g.setIndex(out);
  return new THREE.Mesh(g, mats);
}

export class Book3D {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 10, 8000);
  private layout: BookLayout | null = null;
  private built: { pw: number; ph: number } | null = null;
  private readonly disposables: Array<{ dispose(): void }> = [];

  // 部品
  private root = new THREE.Group();
  private base = new THREE.Group();
  private left = new THREE.Group();
  private leafPivot = new THREE.Group();
  private pageGroup = new THREE.Group(); // 紙の 見開きの 面（z ＝ 0）の 目印

  private dirty = true;
  private closeFromE = 1;
  private lastAnim = '';
  private lastE = 0;
  private pose: Pose = { visible: false, e: 1, grow: 1, leaf: null, shake: 0 };

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'bk-canvas';
    parent.appendChild(this.canvas);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-400, 600, 900);
    this.scene.add(sun);
    this.scene.add(this.root);
  }

  /** 画面の 大きさや 紙の 大きさが かわったとき */
  setLayout(L: BookLayout): void {
    const sizeChanged = !this.layout || this.layout.vw !== L.vw || this.layout.vh !== L.vh;
    this.layout = L;
    if (sizeChanged) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(L.vw, L.vh, false);
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.camera.aspect = L.vw / L.vh;
      this.camera.position.set(0, 0, L.vh / 2 / Math.tan(THREE.MathUtils.degToRad(15)));
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();
    }
    if (!this.built || this.built.pw !== L.pageW || this.built.ph !== L.pageH) this.build(L.pageW, L.pageH);
    this.dirty = true;
  }

  /** モデルの 今の 動きから 姿勢を 決める（描くのは render()） */
  update(m: BookModel): void {
    const L = this.layout;
    if (!L) return;
    if (m.anim === 'close' && this.lastAnim !== 'close') this.closeFromE = this.lastE;
    this.lastAnim = m.anim;
    const pose = bookPose({ view: m.view, anim: m.anim, p: m.progress(), turnDir: m.turnDir, closeFromE: this.closeFromE });
    this.lastE = pose.e;
    this.pose = pose;
    this.applyPose(pose, L);
    this.dirty = true;
  }

  private applyPose(pose: Pose, L: BookLayout): void {
    this.root.visible = pose.visible;
    const cx = L.book.l + L.book.w / 2;
    const cy = L.book.t + L.book.h / 2;
    const e = pose.e;
    const pw = L.pageW;
    this.root.position.set(cx - L.vw / 2 + pose.shake * 10, L.vh / 2 - cy, 0);
    this.root.rotation.set(-0.4 * (1 - e), 0, pose.shake * 0.03);
    this.root.scale.setScalar((1 - 0.18 * (1 - e)) * (0.4 + 0.6 * pose.grow));
    this.base.position.x = -(pw / 2) * (1 - e);
    this.left.rotation.y = Math.PI * (1 - e);
    this.leafPivot.visible = pose.leaf !== null;
    if (pose.leaf !== null) this.leafPivot.rotation.y = -pose.leaf;
    this.root.updateMatrixWorld(true);
  }

  /** 描き直しが 要るときだけ 描く。描いたら true */
  render(): boolean {
    if (!this.dirty || !this.layout) return false;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** 3D の 紙の 見開きが 画面に うつる 四角（px。ひらいて 止まっている とき） */
  pageRect(): Rect | null {
    const L = this.layout;
    if (!L || !this.built) return null;
    const v = new THREE.Vector3();
    let l = Infinity,
      t = Infinity,
      r = -Infinity,
      b = -Infinity;
    this.pageGroup.updateMatrixWorld(true);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      v.set(sx * L.pageW, (sy * L.pageH) / 2, 0).applyMatrix4(this.pageGroup.matrixWorld).project(this.camera);
      const x = ((v.x + 1) / 2) * L.vw;
      const y = ((1 - v.y) / 2) * L.vh;
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, y);
      b = Math.max(b, y);
    }
    return { l, t, w: r - l, h: b - t };
  }

  /** 前回の 描画の 回数と 三角形（性能の 記録用） */
  info(): { calls: number; triangles: number } {
    return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  /** とじたら 紙・表紙の 絵と 形を すてる（renderer は のこす） */
  release(): void {
    this.clear();
    this.built = null;
  }

  dispose(): void {
    this.release();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ------------------------------------------------------------------ 作る

  private clear(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables.length = 0;
    this.root.clear();
    this.base = new THREE.Group();
    this.left = new THREE.Group();
    this.leafPivot = new THREE.Group();
    this.pageGroup = new THREE.Group();
  }

  private track<D extends { dispose(): void }>(d: D): D {
    this.disposables.push(d);
    return d;
  }

  private build(pw: number, ph: number): void {
    this.clear();
    this.built = { pw, ph };
    const basic = (o: THREE.MeshBasicMaterialParameters) => this.track(new THREE.MeshBasicMaterial(o));
    const lam = (o: THREE.MeshLambertMaterialParameters) => this.track(new THREE.MeshLambertMaterial(o));
    const mapOf = (c: HTMLCanvasElement) => this.track(tex(c));

    // 紙（上の 面は 光で かわらない）と あつみの すじ
    const paperL = basic({ map: mapOf(this.paperCanvas(pw, ph, 'L')) });
    const paperR = basic({ map: mapOf(this.paperCanvas(pw, ph, 'R')) });
    const edgeU = lam({ map: mapOf(this.edgeCanvas('u')) });
    const edgeV = lam({ map: mapOf(this.edgeCanvas('v')) });
    const stack = (side: 'L' | 'R') => {
      const m = faceBox(pw, ph, T, side === 'L' ? { pz: paperL, nx: edgeU, py: edgeV, ny: edgeV } : { pz: paperR, px: edgeU, py: edgeV, ny: edgeV });
      m.position.set(side === 'L' ? -pw / 2 : pw / 2, 0, -T / 2);
      this.track(m.geometry);
      return m;
    };

    // 表紙
    const cw = pw + M;
    const chh = ph + M * 2;
    const side = lam({ color: new THREE.Color(WOOD).multiplyScalar(0.7) });
    const cover = (sideName: 'L' | 'R') => {
      const inner = lam({ map: mapOf(this.coverInnerCanvas(pw, ph, sideName)) });
      const faces: Partial<Record<Face, THREE.Material>> = { pz: inner, px: side, nx: side, py: side, ny: side };
      if (sideName === 'L') faces.nz = lam({ map: mapOf(this.coverOuterCanvas(cw, chh)) });
      const m = faceBox(cw, chh, C, faces);
      m.position.set(sideName === 'L' ? -cw / 2 : cw / 2, 0, -T - C / 2);
      this.track(m.geometry);
      return m;
    };

    // 金具（左・右・せなか）と 宝石
    const goldMat = lam({ color: GOLD, emissive: 0x3a2a00 });
    const gem = new THREE.Mesh(new THREE.CylinderGeometry(52, 52, 12, 24), lam({ color: '#2bb3a0', emissive: 0x0b3a34 }));
    gem.rotation.x = Math.PI / 2;
    gem.position.set(-cw / 2, 0, -T - C - 6);
    this.track(gem.geometry);
    const brackets = (sx: -1 | 1, extra: THREE.BufferGeometry[] = []) => {
      const parts: THREE.BufferGeometry[] = [...extra];
      for (const sy of [-1, 1]) {
        const x0 = sx * (pw + M);
        const y0 = (sy * (ph + M * 2)) / 2;
        const h = new THREE.BoxGeometry(40, M, 6);
        h.translate(x0 - sx * 20, y0 - (sy * M) / 2, -T + 3);
        const v = new THREE.BoxGeometry(M, 40, 6);
        v.translate(x0 - (sx * M) / 2, y0 - sy * 20, -T + 3);
        parts.push(h, v);
      }
      const g = mergeGeometries(parts)!;
      this.track(g);
      return new THREE.Mesh(g, goldMat);
    };
    const ring = new THREE.TorusGeometry(58, 6, 8, 24);
    ring.translate(-cw / 2, 0, -T - C - 4);
    const clasp = new THREE.BoxGeometry(30, M, 6);
    const clasps = mergeGeometries([clasp.clone().translate(0, ph / 2 + M / 2, -T + 3), clasp.clone().translate(0, -ph / 2 - M / 2, -T + 3)])!;
    this.track(clasps);
    this.track(clasp);
    this.track(ring);

    // せなか・しおりひも・かげ
    const spine = faceBox(M * 2, chh, C, { pz: side, px: side, nx: side, py: side, ny: side });
    spine.position.set(0, 0, -T - C / 2 - 0.5);
    this.track(spine.geometry);
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(10, 50, 1.5), lam({ color: '#3a8f6e' }));
    ribbon.position.set(30, -ph / 2 - 15, 1);
    ribbon.rotation.z = 0.06;
    this.track(ribbon.geometry);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry((pw * 2 + M * 2) * 1.35, (ph + M * 2) * 1.35),
      basic({ map: mapOf(this.shadowCanvas()), transparent: true, depthWrite: false }),
    );
    shadow.position.set(14, -22, -T - C - 3);
    this.track(shadow.geometry);
    shadow.renderOrder = -1;

    // めくる 紙（まっすぐのまま 回る）
    const leaf = faceBox(pw, ph, LEAF, { pz: paperR, nz: paperL });
    leaf.position.set(pw / 2, 0, 0);
    this.track(leaf.geometry);
    this.leafPivot.position.set(0, 0, LEAF / 2);
    this.leafPivot.add(leaf);
    this.leafPivot.visible = false;

    // 見開きの 面（z ＝ 0）の 目印
    this.pageGroup.position.set(0, 0, 0);

    this.left.add(stack('L'), cover('L'), brackets(-1, [ring]), gem);
    this.base.add(stack('R'), cover('R'), brackets(1), new THREE.Mesh(clasps, goldMat), spine, ribbon, shadow, this.leafPivot, this.left, this.pageGroup);
    this.root.add(this.base);
    if (this.layout) this.applyPose(this.pose, this.layout);
  }

  // ------------------------------------------------------------------ 絵（canvas）

  private paperCanvas(pw: number, ph: number, side: 'L' | 'R'): HTMLCanvasElement {
    const [c, g] = canvas(pw * S, ph * S);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, c.width, c.height);
    // とじ目の かげ 60px
    const w = 60 * S;
    const x0 = side === 'L' ? c.width : 0;
    const x1 = side === 'L' ? c.width - w : w;
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, 'rgba(60,40,20,0.22)');
    gr.addColorStop(1, 'rgba(60,40,20,0)');
    g.fillStyle = gr;
    g.fillRect(side === 'L' ? c.width - w : 0, 0, w, c.height);
    return c;
  }

  private edgeCanvas(along: 'u' | 'v'): HTMLCanvasElement {
    const [c, g] = canvas(64, 64);
    g.fillStyle = '#ece6d8';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < 64; i += 4) (along === 'u' ? g.fillRect(i, 0, 1, 64) : g.fillRect(0, i, 64, 1));
    return c;
  }

  private grain(g: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
    g.fillStyle = WOOD;
    g.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let y = 0; y < h; y += 2) {
      const k = Math.sin(y * 0.045 + Math.sin(y * 0.0065) * 6) * 0.5 + 0.5;
      g.fillStyle = `rgba(60,30,10,${0.04 + k * 0.1})`;
      g.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(40,20,5,0.18)';
      g.fillRect(r() * w, r() * h, 24 + r() * 60, 1.5);
    }
  }

  /** 表紙の 内がわ（ひらいた とき 紙の まわりに 見える）。紙の ふちに ページの すじ */
  private coverInnerCanvas(pw: number, ph: number, side: 'L' | 'R'): HTMLCanvasElement {
    const cw = pw + M;
    const chh = ph + M * 2;
    const [c, g] = canvas(cw * S, chh * S);
    this.grain(g, c.width, c.height, side === 'L' ? 3 : 5);
    g.fillStyle = 'rgba(40,20,5,0.25)';
    g.fillRect(0, 0, c.width, 3 * S);
    // 紙の たばの ふち（外がわの 3 辺に 8px の すじ）
    const px = (side === 'L' ? M : 0) * S;
    const bw = 8 * S;
    const draw = (x: number, y: number, w: number, h: number, horizontal: boolean) => {
      g.fillStyle = '#ece6d8';
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      if (horizontal) for (let i = 0; i < h; i += 2 * S) g.fillRect(x, y + i, w, 1);
      else for (let i = 0; i < w; i += 2 * S) g.fillRect(x + i, y, 1, h);
    };
    const pwS = pw * S;
    const phS = ph * S;
    const top = M * S;
    draw(px, top - bw, pwS, bw, true);
    draw(px, top + phS, pwS, bw, true);
    if (side === 'L') draw(px - bw, top - bw, bw, phS + bw * 2, false);
    else draw(px + pwS, top - bw, bw, phS + bw * 2, false);
    return c;
  }

  /** 表紙の 外がわ（とじた ときの 顔）。板・金のわく・題 */
  private coverOuterCanvas(cw: number, chh: number): HTMLCanvasElement {
    const [c, g] = canvas(cw * S, chh * S);
    this.grain(g, c.width, c.height, 11);
    for (let i = 1; i < 4; i++) {
      g.fillStyle = 'rgba(50,25,8,0.35)';
      g.fillRect(0, (c.height / 4) * i, c.width, 3);
    }
    g.strokeStyle = GOLD;
    g.lineWidth = 5 * S;
    g.strokeRect(M * S * 1.6, M * S * 1.6, c.width - M * S * 3.2, c.height - M * S * 3.2);
    g.lineWidth = 1.5 * S;
    g.strokeStyle = '#fff0b0';
    g.strokeRect(M * S * 1.6 + 5 * S, M * S * 1.6 + 5 * S, c.width - M * S * 3.2 - 10 * S, c.height - M * S * 3.2 - 10 * S);
    g.fillStyle = GOLD;
    g.font = `bold ${Math.round(Math.min(40, cw / 9) * S)}px "Hiragino Maru Gothic ProN", sans-serif`;
    g.textAlign = 'center';
    g.fillText('あそびかたの ほん', c.width / 2, c.height * 0.8);
    g.fillStyle = WOOD_DARK;
    return c;
  }

  private shadowCanvas(): HTMLCanvasElement {
    const [c, g] = canvas(256, 256);
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    return c;
  }
}
