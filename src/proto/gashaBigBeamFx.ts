/**
 * #293 試作: 攻撃 3「目から 光線」の 見た目（光線 2 本・目の 十字の きらめき・着弾点の 光・こげ跡・燃える 炎・煙）。動きは gashaBigBeam.ts。
 *  ・こげ跡 = 平らな 四角の 板 1 つの InstancedMesh、炎 = ドット絵の 十字の 板（2 まいを 1 つの 形に）を 1 つの InstancedMesh、煙 = 箱 1 つの InstancedMesh。
 *  ・毎コマ new しない。数は gashaBigTuning.ts の beam（上限つき）。乱数は シード付き。
 */
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, DataTexture, Texture, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, NearestFilter, PlaneGeometry, Quaternion,
  Sprite, SpriteMaterial, Vector3, type Camera, type Scene,
} from 'three';
import { TUNE as T } from './gashaBigTuning';
import type { V3 } from './gashaBigBeam';

/** 画面が ない（ユニットテスト）ときの 1 ドットの 白い 絵 */
const blankTexture = (): DataTexture => { const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; return t; };
const hasDom = (): boolean => typeof document !== 'undefined';

interface Mark { x: number; y: number; z: number; yaw: number; age: number; life: number; r: number }
interface Flame { x: number; y: number; z: number; age: number; life: number; ph: number }
interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; rot: number }

/** ふつうの 十字 きらめき（4 方向に のびる 光 + 斜めの 小さい 光）の 絵 */
function sparkleTexture(): Texture {
  if (!hasDom()) return blankTexture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 26);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,200,190,0.85)'); rg.addColorStop(1, 'rgba(255,60,60,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const arm = (x0: number, y0: number, x1: number, y1: number, w: number): void => {
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = lg; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  arm(0, 32, 64, 32, 3); arm(32, 0, 32, 64, 3); arm(10, 10, 54, 54, 1.5); arm(54, 10, 10, 54, 1.5);
  const t = new CanvasTexture(c);
  return t;
}

/** 光の 玉（着弾点） */
function glowTexture(): Texture {
  if (!hasDom()) return blankTexture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,230,1)'); rg.addColorStop(0.3, 'rgba(255,170,90,0.8)'); rg.addColorStop(1, 'rgba(255,60,20,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** 炎の ドット絵（12 x 16）。0 = すきま、1 = 赤、2 = 橙、3 = 黄 */
const FLAME_PIX = [
  '.....1......',
  '.....11.....',
  '....112.....',
  '....122..1..',
  '...1222.11..',
  '...12223112.',
  '..1222322.1.',
  '..12223322..',
  '.112233332..',
  '.122233332..',
  '.122333332.1',
  '1122333332.1',
  '1223333332.1',
  '1223333332..',
  '.12233332...',
  '..111222....',
];
function flameTexture(): Texture {
  if (!hasDom()) return blankTexture();
  const w = 12, h = FLAME_PIX.length, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const col = ['', '#d8241c', '#ff7a1a', '#ffd23a'];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = Number(FLAME_PIX[y]![x] === '.' ? 0 : FLAME_PIX[y]![x]);
    if (k > 0) { g.fillStyle = col[k]!; g.fillRect(x, y, 1, 1); }
  }
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter;
  return t;
}

/** 十字の 板（たて 2 まいを 直角に）。底が y = 0、高さ 1、はば 0.8 */
function crossGeometry(): BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const quad = (ax: number, az: number): void => {
    const b = pos.length / 3, hw = 0.4;
    pos.push(-hw * ax, 0, -hw * az, hw * ax, 0, hw * az, hw * ax, 1, hw * az, -hw * ax, 1, -hw * az);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  quad(1, 0); quad(0, 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export class BeamFx {
  private readonly root = new Group();
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: (MeshBasicMaterial | SpriteMaterial)[] = [];
  private readonly texs: Texture[] = [];
  // 光線
  private readonly beamOuter: Mesh[] = [];
  private readonly beamCore: Mesh[] = [];
  private readonly impact: Sprite[] = [];
  private readonly sparkle: Sprite[] = [];
  private beamsOn = false;
  // 跡・炎・煙
  private readonly markMesh: InstancedMesh;
  private readonly flameMesh: InstancedMesh;
  private readonly smokeMesh: InstancedMesh;
  private readonly marks: Mark[] = [];
  private readonly flames: Flame[] = [];
  private readonly puffs: Puff[] = [];
  private burnCount = 0;
  private clock = 0;
  private seed = 303;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly zAxis = new Vector3(0, 0, 1);

  constructor(private readonly scene: Scene, private readonly camera: Camera) {
    const K = T.beam;
    this.root.name = 'gashaBeamFx';
    // 光線（+z に のびる 円柱。長さ 1）
    const cyl = new CylinderGeometry(1, 1, 1, 10, 1, true);
    cyl.rotateX(Math.PI / 2); cyl.translate(0, 0, 0.5);
    this.geos.push(cyl);
    const mkMat = (color: number, opacity: number): MeshBasicMaterial => {
      const m = new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide });
      this.mats.push(m);
      return m;
    };
    const outerMat = mkMat(K.colorOuter, 0.6), coreMat = mkMat(K.colorCore, 0.95);
    const glowTex = glowTexture(), sparkTex = sparkleTexture();
    this.texs.push(glowTex, sparkTex);
    const glowMat = new SpriteMaterial({ map: glowTex, blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    const sparkMat = new SpriteMaterial({ map: sparkTex, blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    this.mats.push(glowMat, sparkMat);
    for (let i = 0; i < 2; i++) {
      const o = new Mesh(cyl, outerMat), c = new Mesh(cyl, coreMat);
      o.frustumCulled = c.frustumCulled = false; o.visible = c.visible = false;
      o.renderOrder = 5; c.renderOrder = 6;
      this.beamOuter.push(o); this.beamCore.push(c);
      const im = new Sprite(glowMat); im.visible = false; im.renderOrder = 7;
      const sp = new Sprite(sparkMat); sp.visible = false; sp.renderOrder = 8;
      this.impact.push(im); this.sparkle.push(sp);
      this.root.add(o, c, im, sp);
    }
    // こげ跡（平らな 四角）
    const flat = new PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    this.geos.push(flat);
    const markMat = new MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mats.push(markMat);
    this.markMesh = new InstancedMesh(flat, markMat, K.maxMarks);
    this.markMesh.frustumCulled = false; this.markMesh.count = 0; this.markMesh.renderOrder = 2;
    // 炎（ドット絵の 十字の 板）
    const cross = crossGeometry();
    this.geos.push(cross);
    const ft = flameTexture();
    this.texs.push(ft);
    const flameMat = new MeshBasicMaterial({ map: ft, alphaTest: 0.5, side: DoubleSide, fog: false });
    this.mats.push(flameMat);
    this.flameMesh = new InstancedMesh(cross, flameMat, K.maxFlames);
    this.flameMesh.frustumCulled = false; this.flameMesh.count = 0;
    // 煙（箱）
    const box = new BoxGeometry(1, 1, 1);
    this.geos.push(box);
    const smokeMat = new MeshBasicMaterial({ color: 0x77706a, transparent: true, opacity: 0.78, depthWrite: false });
    this.mats.push(smokeMat);
    this.smokeMesh = new InstancedMesh(box, smokeMat, K.maxSmoke);
    this.smokeMesh.frustumCulled = false; this.smokeMesh.count = 0; this.smokeMesh.renderOrder = 3;
    this.root.add(this.markMesh, this.flameMesh, this.smokeMesh);
    scene.add(this.root);
  }

  private rnd(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  /** 目の 十字の きらめき（level 0〜1。0 で 消える）。pulse は 点滅の 時間 */
  setSparkle(eyes: V3[], level: number): void {
    const K = T.beam;
    for (let i = 0; i < 2; i++) {
      const sp = this.sparkle[i]!, e = eyes[i];
      if (!e || level <= 0.01) { sp.visible = false; continue; }
      // 目の すこし カメラがわへ（頭の 中に うまらない ように）
      this.v.set(this.camera.position.x - e.x, this.camera.position.y - e.y, this.camera.position.z - e.z).normalize().multiplyScalar(1.6);
      sp.position.set(e.x + this.v.x, e.y + this.v.y, e.z + this.v.z);
      const k = level * (0.85 + 0.15 * Math.sin(this.clock * 25 + i * 1.7));
      const size = K.sparkleSize * (0.3 + 0.9 * k);
      sp.scale.set(size, size, 1);
      (sp.material as SpriteMaterial).opacity = Math.min(1, 0.3 + level);
      sp.material.rotation = this.clock * 0.6;
      sp.visible = true;
    }
  }

  /** 光線 2 本を 目から 先（ends）まで。on = false で 消す */
  setBeams(eyes: V3[], ends: V3[], on: boolean): void {
    const K = T.beam;
    this.beamsOn = on;
    for (let i = 0; i < 2; i++) {
      const o = this.beamOuter[i]!, c = this.beamCore[i]!, im = this.impact[i]!;
      const e = eyes[i], t = ends[i];
      if (!on || !e || !t) { o.visible = c.visible = im.visible = false; continue; }
      const len = Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z);
      this.v.set(t.x - e.x, t.y - e.y, t.z - e.z).normalize();
      this.q.setFromUnitVectors(this.zAxis, this.v);
      const pulse = 1 + 0.14 * Math.sin(this.clock * 38 + i * 2.1);
      const r = K.beamRadius * pulse;
      o.position.set(e.x, e.y, e.z); o.quaternion.copy(this.q); o.scale.set(r, r, len); o.visible = true;
      c.position.copy(o.position); c.quaternion.copy(this.q); c.scale.set(r * 0.45, r * 0.45, len); c.visible = true;
      im.position.set(t.x, t.y + 0.4, t.z);
      const sz = 3.6 * (0.9 + 0.2 * Math.sin(this.clock * 31 + i));
      im.scale.set(sz, sz, 1); im.visible = true;
    }
  }

  /** 着弾点に こげ跡を 1 つ（N 個に 1 つ 炎も） */
  burn(x: number, y: number, z: number): void {
    const K = T.beam;
    if (this.marks.length >= K.maxMarks) this.marks.shift();
    this.marks.push({ x: x + (this.rnd() - 0.5) * 0.8, y: y + 0.03, z: z + (this.rnd() - 0.5) * 0.8, yaw: this.rnd() * Math.PI, age: 0, life: K.markSec, r: K.markRadius * (0.7 + this.rnd() * 0.6) });
    this.burnCount++;
    if (K.flameEvery > 0 && this.burnCount % K.flameEvery === 0) {
      if (this.flames.length >= K.maxFlames) this.flames.shift();
      this.flames.push({ x: x + (this.rnd() - 0.5) * 1.6, y, z: z + (this.rnd() - 0.5) * 1.6, age: 0, life: K.flameSec * (0.7 + this.rnd() * 0.6), ph: this.rnd() * 6.28 });
    }
  }

  /** 煙の 玉を n 個（size 倍）。着弾点の まわりから もくもく 上へ */
  smoke(x: number, y: number, z: number, n: number, size: number): void {
    const K = T.beam;
    for (let i = 0; i < n; i++) {
      if (this.puffs.length >= K.maxSmoke) this.puffs.shift();
      const a = this.rnd() * Math.PI * 2, d = this.rnd() * size * 0.5;
      this.puffs.push({
        x: x + Math.cos(a) * d, y: y + 0.3 + this.rnd() * 0.6, z: z + Math.sin(a) * d,
        vx: Math.cos(a) * (0.3 + this.rnd() * 0.9), vy: 1.2 + this.rnd() * 1.6, vz: Math.sin(a) * (0.3 + this.rnd() * 0.9),
        age: 0, life: K.smokeSec * (0.7 + this.rnd() * 0.6), size: size * (0.6 + this.rnd() * 0.7), rot: this.rnd() * 3,
      });
    }
  }

  update(dt: number): void {
    this.clock += dt;
    // こげ跡
    let w = 0;
    for (const mk of this.marks) {
      mk.age += dt;
      if (mk.age >= mk.life) continue;
      this.marks[w++] = mk;
      const fadeIn = Math.min(1, mk.age / 0.25), fadeOut = Math.min(1, (mk.life - mk.age) / 3);
      const sc = mk.r * 2 * fadeIn * fadeOut;
      this.q.setFromAxisAngle(this.up, mk.yaw);
      this.m.compose(this.v.set(mk.x, mk.y, mk.z), this.q, this.s.set(sc, 1, sc));
      this.markMesh.setMatrixAt(w - 1, this.m);
    }
    this.marks.length = w;
    this.markMesh.count = w; this.markMesh.instanceMatrix.needsUpdate = true;
    // 炎（ゆらぐ）
    w = 0;
    const K = T.beam;
    for (const f of this.flames) {
      f.age += dt;
      if (f.age >= f.life) continue;
      this.flames[w++] = f;
      const grow = Math.min(1, f.age / 0.3), fade = Math.min(1, (f.life - f.age) / 1.2);
      const flick = 1 + 0.25 * Math.sin(this.clock * 17 + f.ph) + 0.1 * Math.sin(this.clock * 41 + f.ph * 2);
      const h = K.flameSize * grow * fade * flick;
      this.q.setFromAxisAngle(this.up, this.clock * 1.3 + f.ph);
      this.m.compose(this.v.set(f.x, f.y, f.z), this.q, this.s.set(K.flameSize * 0.9 * fade * grow, Math.max(0.01, h), K.flameSize * 0.9 * fade * grow));
      this.flameMesh.setMatrixAt(w - 1, this.m);
    }
    this.flames.length = w;
    this.flameMesh.count = w; this.flameMesh.instanceMatrix.needsUpdate = true;
    // 煙
    w = 0;
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age >= p.life) continue;
      this.puffs[w++] = p;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 1 - 0.25 * dt; p.vx *= 1 - 0.3 * dt; p.vz *= 1 - 0.3 * dt;
      const u = p.age / p.life, sc = p.size * (0.5 + 1.1 * Math.min(1, u * 1.6)) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      this.q.setFromAxisAngle(this.up, p.rot + p.age * 0.4);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sc, sc, sc));
      this.smokeMesh.setMatrixAt(w - 1, this.m);
    }
    this.puffs.length = w;
    this.smokeMesh.count = w; this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  counts(): { marks: number; flames: number; smoke: number; beams: number; sparkle: number } {
    return { marks: this.marks.length, flames: this.flames.length, smoke: this.puffs.length, beams: this.beamsOn ? 2 : 0, sparkle: this.sparkle.filter((s) => s.visible).length };
  }

  /** あとかたづけ（跡・炎・煙・光線を ぜんぶ 消す） */
  clear(): void {
    this.marks.length = this.flames.length = this.puffs.length = 0;
    this.burnCount = 0;
    this.markMesh.count = this.flameMesh.count = this.smokeMesh.count = 0;
    this.setBeams([], [], false);
    this.setSparkle([], 0);
  }

  dispose(): void {
    this.scene.remove(this.root);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.markMesh.dispose(); this.flameMesh.dispose(); this.smokeMesh.dispose();
  }
}
