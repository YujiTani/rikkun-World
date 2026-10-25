/**
 * #293 試作: 攻撃 4「口から 火山噴火」の 見た目。動きは gashaBigEruption.ts。
 *  風の すじ（口へ 集まる）・口の 光・火柱（円柱 + ドット絵の 十字の 炎の 板が 空へ）・黒い 噴煙（箱）・
 *  とんで いる 隕石（箱を 組んだ 岩 + 光の かさ + 炎の 尾 + 黒い けむりの 尾）・着地の 予告の 赤い 輪（大きさ = 落下範囲）・
 *  着地（広がる 輪・光・ふきあがる 炎・岩の かけら・土けむり）・飛び散る 火の 粉・燃え残りの 炎の 板と こげ跡・燃える 植物の 炎。
 *  すべて InstancedMesh（毎コマ new しない。数は 上限つき）。炎の 板は ぜんぶ 1 つの InstancedMesh（描画 1 回）。乱数は シード付き。
 */
import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Sprite, SpriteMaterial, Texture, Vector3, type Camera, type Scene,
} from 'three';
import { TUNE as T } from './gashaBigTuning';
import { flyerAt, type Flyer, type V3 } from './gashaBigEruption';
import { blankTexture, crossGeometry, flameTexture, glowTexture, hasDom } from './gashaBigBeamFx';

/** 予告の 丸の 絵（まんなかが こい 丸） */
function shadowTexture(): Texture {
  if (!hasDom()) return blankTexture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.7, 'rgba(255,255,255,0.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** 輪の 絵（ふちだけ。太い 線の まんなかが 半径 RING_R / 32） */
const RING_R = 28;
function ringTexture(): Texture {
  if (!hasDom()) return blankTexture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, RING_R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(32, 32, RING_R - 5, 0, Math.PI * 2); g.stroke();
  return new CanvasTexture(c);
}

/** 箱を いくつか 組んだ 形（面ごとの 色つき。MeshBasicMaterial の vertexColors で 使う）。faces = [+x, -x, +y, -y, +z, -z] の 色 */
function boxesGeometry(parts: { s: [number, number, number]; p: [number, number, number]; faces: number[] }[]): BufferGeometry {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new Color();
  for (const part of parts) {
    const b = new BoxGeometry(part.s[0], part.s[1], part.s[2]);
    b.translate(part.p[0], part.p[1], part.p[2]);
    const base = pos.length / 3, P = b.getAttribute('position'), I = b.getIndex()!;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      c.setHex(part.faces[Math.floor(i / 4)] ?? part.faces[0]!);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < I.count; i++) idx.push(base + I.getX(i));
    b.dispose();
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** 隕石の 岩（大きさ 約 1。黒っぽい 岩の 箱 3 つ ＋ ひびから のぞく 溶岩の 小さな 箱） */
function rockGeometry(): BufferGeometry {
  const R = [0x6b4a36, 0x4a3326, 0x7a573f, 0x2e2019, 0x553a2b, 0x3e2b20]; // [+x, -x, +y(上・明るい), -y(下・暗い), +z, -z]
  const R2 = [0x5a3e2e, 0x3c2a20, 0x6d4d38, 0x261a14, 0x4a3326, 0x34251c];
  const L = [0xffb43a, 0xff7a1a, 0xffd86a, 0xd8401c, 0xff9a2a, 0xff6a1a]; // 溶岩（明るい）
  return boxesGeometry([
    { s: [1, 0.9, 1], p: [0, 0, 0], faces: R },
    { s: [0.62, 0.6, 0.62], p: [0.36, 0.28, -0.22], faces: R2 },
    { s: [0.55, 0.5, 0.58], p: [-0.3, -0.26, 0.3], faces: R2 },
    { s: [0.26, 0.26, 0.26], p: [0.52, -0.12, 0.18], faces: L },
    { s: [0.22, 0.22, 0.22], p: [-0.2, 0.42, -0.36], faces: L },
    { s: [0.24, 0.24, 0.24], p: [-0.5, 0.1, -0.1], faces: L },
    { s: [0.2, 0.2, 0.2], p: [0.1, -0.48, 0.42], faces: L },
  ]);
}

/** 行列を じかに 書く: 位置 (x, y, z)・y 軸の 回り ang・大きさ（横 sxz、たて sy、奥 sz = sxz）。arr の i 番目 */
function writeYRot(arr: Float32Array, i: number, x: number, y: number, z: number, ang: number, sxz: number, sy: number, sz = sxz): void {
  const c = Math.cos(ang), s = Math.sin(ang), o = i * 16;
  arr[o] = c * sxz; arr[o + 1] = 0; arr[o + 2] = -s * sxz; arr[o + 3] = 0;
  arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
  arr[o + 8] = s * sz; arr[o + 9] = 0; arr[o + 10] = c * sz; arr[o + 11] = 0;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
}

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; rot: number; shade?: number; g?: number; hot?: boolean }
interface Flame { x: number; y: number; z: number; age: number; life: number; ph: number }
interface Pop { x: number; y: number; z: number; age: number }
export interface EmberView { x: number; y: number; z: number; age: number }
/** とんで いる 隕石・火の 粉と 予告の 強さを 読む 口（MeteorRain） */
export interface RainView { meteors: readonly (Flyer & { id: number })[]; sparks: readonly Flyer[]; warn(a: Flyer): number }

// 隕石・火の 粉・燃えかすの 数は 調整表の 上限（ember.max・meteor.maxFlying・splash.maxFlying）から 出す（+10 は 余裕）。調整表を かえても あふれない
const CAP = { jet: 300, smoke: 260, flames: 120, embers: T.eruption.ember.max + 10, wind: 40, meteors: T.eruption.meteor.maxFlying + 10, sparks: T.eruption.splash.maxFlying + 10, debris: 420, rings: 80 };
const TRAIL_CAP = CAP.meteors * 6;
const FLAME_CAP = CAP.embers + CAP.flames + CAP.jet + TRAIL_CAP + CAP.sparks;
const SMOKE_CAP = CAP.smoke + CAP.meteors * 3 + CAP.debris;

export class EruptFx {
  private readonly root = new Group();
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: (MeshBasicMaterial | SpriteMaterial)[] = [];
  private readonly texs: Texture[] = [];
  private readonly column: Mesh;
  private readonly glow: Sprite;
  private readonly windMesh: InstancedMesh;
  private readonly smokeMesh: InstancedMesh;
  /** 隕石の 岩 */
  private readonly rockMesh: InstancedMesh;
  /** 隕石の 光の かさ ＋ 着地の 光（加算） */
  private readonly haloMesh: InstancedMesh;
  /** 予告: うすい 丸（だんだん 大きく・こく）と 赤い 輪（大きさ = 落下範囲） */
  private readonly warnFillMesh: InstancedMesh;
  private readonly warnRingMesh: InstancedMesh;
  /** 着地で 広がる 輪（加算） */
  private readonly shockMesh: InstancedMesh;
  private readonly charMesh: InstancedMesh;
  /** 炎の 板 ぜんぶ（燃えかす・燃える 植物・火柱の 炎と 着地の 炎・隕石の 尾・火の 粉） */
  private readonly flameMesh: InstancedMesh;
  private readonly smoke: Particle[] = [];
  private readonly jet: Particle[] = [];
  private readonly debris: Particle[] = [];
  private readonly burn: Flame[] = [];
  private readonly rings: Pop[] = [];
  private rain: RainView | null = null;
  private emberFlames = 0;
  private emberChars = 0;
  private emberVersion = -1;
  private charDirty = false;
  private windN = 0;
  private cnt = { meteors: 0, trails: 0, sparks: 0, warns: 0, flashes: 0 };
  private colLevel = 0;
  private mouth: V3 = { x: 0, y: 0, z: 0 };
  private windLevel = 0;
  private clock = 0;
  private spawnAcc = 0;
  private seed = 4401;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly v = new Vector3();
  private readonly v2 = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly zAxis = new Vector3(0, 0, 1);
  private readonly spinAxis = new Vector3(0.6, 1, 0.3).normalize();
  private readonly col = new Color();
  private readonly pa: V3 = { x: 0, y: 0, z: 0 };
  private readonly pb: V3 = { x: 0, y: 0, z: 0 };
  private readonly pc: V3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly scene: Scene, camera: Camera) {
    void camera;
    this.root.name = 'gashaEruptFx';
    const track = <G extends BufferGeometry>(g: G): G => { this.geos.push(g); return g; };
    const mat = <M extends MeshBasicMaterial | SpriteMaterial>(m: M): M => { this.mats.push(m); return m; };
    const inst = (g: BufferGeometry, mt: MeshBasicMaterial, cap: number, order: number, color = false): InstancedMesh => {
      const im = new InstancedMesh(g, mt, cap);
      if (color) im.instanceColor = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      im.frustumCulled = false; im.count = 0; im.renderOrder = order;
      return im;
    };
    // 火柱（上へ のびる 円柱。底が 口。高さ 1・半径 1）
    const cyl = track(new CylinderGeometry(1, 1.5, 1, 12, 1, true)); cyl.translate(0, 0.5, 0);
    this.column = new Mesh(cyl, mat(new MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })));
    this.column.frustumCulled = false; this.column.visible = false; this.column.renderOrder = 5;
    // 口の 光
    const gt = glowTexture(); this.texs.push(gt);
    this.glow = new Sprite(mat(new SpriteMaterial({ map: gt, blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false })));
    this.glow.visible = false; this.glow.renderOrder = 8;
    // 風の すじ（細い 箱。+z に のびる）
    this.windMesh = inst(track(new BoxGeometry(0.28, 0.28, 1)), mat(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false })), CAP.wind, 4);
    // 黒い 噴煙・土けむり・隕石の けむりの 尾・着地の 岩の かけら（箱）
    this.smokeMesh = inst(track(new BoxGeometry(1, 1, 1)), mat(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })), SMOKE_CAP, 3, true);
    // 隕石の 岩（面の 色つきの 箱の 組み合わせ）
    this.rockMesh = inst(track(rockGeometry()), mat(new MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false })), CAP.meteors, 6, true);
    // 光の かさ・着地の 光（十字の 板に 丸い 光。加算。まんなかが 中心）
    const cross = track(crossGeometry());
    const haloGeo = track(crossGeometry()); haloGeo.translate(0, -0.5, 0);
    this.haloMesh = inst(haloGeo, mat(new MeshBasicMaterial({ map: gt, color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })), CAP.meteors + CAP.rings, 7, true);
    // 炎（ドット絵の 十字の 板）
    const ft = flameTexture(); this.texs.push(ft);
    this.flameMesh = inst(cross, mat(new MeshBasicMaterial({ map: ft, alphaTest: 0.5, side: DoubleSide, fog: false })), FLAME_CAP, 6);
    // 平らな 板: 予告・着地の 輪・こげ跡
    const flat = track(new PlaneGeometry(1, 1)); flat.rotateX(-Math.PI / 2);
    const st = shadowTexture(), rt = ringTexture(); this.texs.push(st, rt);
    const decal = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    this.warnFillMesh = inst(flat, mat(new MeshBasicMaterial({ map: st, color: 0xffffff, opacity: 0.55, ...decal })), CAP.meteors, 2, true);
    this.warnRingMesh = inst(flat, mat(new MeshBasicMaterial({ map: rt, color: 0xffffff, opacity: 0.95, fog: false, ...decal })), CAP.meteors, 2, true);
    this.shockMesh = inst(flat, mat(new MeshBasicMaterial({ map: rt, color: 0xffffff, blending: AdditiveBlending, fog: false, side: DoubleSide, ...decal })), CAP.rings, 7, true);
    this.charMesh = inst(flat, mat(new MeshBasicMaterial({ color: 0x14100c, opacity: 0.85, ...decal })), CAP.embers + CAP.flames, 2);
    this.root.add(this.column, this.glow, this.windMesh, this.smokeMesh, this.rockMesh, this.haloMesh, this.flameMesh, this.warnFillMesh, this.warnRingMesh, this.shockMesh, this.charMesh);
    scene.add(this.root);
  }

  private rnd(): number { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }

  /** 吸いこむ 風の すじ（level 0〜1。0 で 消える）。mouth = 口 */
  setWind(mouth: V3, level: number): void { this.mouth = mouth; this.windLevel = level; }
  /** 火柱（level 0〜1。0 で 消える） */
  setColumn(mouth: V3, level: number): void { this.mouth = mouth; this.colLevel = level; }
  /** 口の 光（level 0〜1） */
  setMouthGlow(mouth: V3, level: number): void {
    if (level <= 0.01) { this.glow.visible = false; return; }
    this.glow.position.set(mouth.x, mouth.y, mouth.z);
    const sz = (3 + 5 * level) * (0.9 + 0.1 * Math.sin(this.clock * 30));
    this.glow.scale.set(sz, sz, 1); this.glow.visible = true;
  }

  /** とんで いる 隕石・火の 粉・予告を 読む 口（null で 消す）。描くのは update() */
  setRain(rain: RainView | null): void { this.rain = rain; }

  /** 隕石の 着地: 広がる 輪・光・ふきあがる 炎・岩の かけら・土けむり */
  impact(x: number, y: number, z: number): void {
    const I = T.eruption.impact;
    if (this.rings.length >= CAP.rings) this.rings.shift();
    this.rings.push({ x, y, z, age: 0 });
    for (let i = 0; i < I.fireballs; i++) {
      if (this.jet.length >= CAP.jet) this.jet.shift();
      const a = this.rnd() * 6.28, d = this.rnd() * 0.8;
      this.jet.push({ x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d, vx: Math.cos(a) * (1 + this.rnd() * 2.5), vy: 5 + this.rnd() * 5, vz: Math.sin(a) * (1 + this.rnd() * 2.5), age: 0, life: 0.35 + this.rnd() * 0.25, size: 1.5 + this.rnd() * 1.2, rot: this.rnd() * 6 });
    }
    for (let i = 0; i < I.debris; i++) {
      if (this.debris.length >= CAP.debris) this.debris.shift();
      const a = this.rnd() * 6.28, sp = I.debrisSpeed * (0.45 + this.rnd() * 0.55);
      this.debris.push({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: 5 + this.rnd() * 6, vz: Math.sin(a) * sp, age: 0, life: I.debrisSec * (0.7 + this.rnd() * 0.3), size: 0.22 + this.rnd() * 0.3, rot: this.rnd() * 6, g: 22, hot: this.rnd() < 0.35 });
    }
    this.puff(x, y + 0.2, z, I.dust, 1.7, 1.4, 0.5, 0.4); // 土けむりは 早く 消える
  }

  /** 火の 粉が 落ちた: 小さく ぼっと 炎 */
  sparkPop(x: number, y: number, z: number): void {
    if (this.jet.length >= CAP.jet) this.jet.shift();
    this.jet.push({ x, y, z, vx: 0, vy: 2.5, vz: 0, age: 0, life: 0.3, size: 0.9 + this.rnd() * 0.4, rot: this.rnd() * 6 });
  }

  /** 燃えかす（毎コマ ぜんぶ 渡す）。古い ほど 小さく なって 消える。version = ならびの 版（かわらなければ こげ跡は 出入りの 間だけ 書きなおす） */
  setEmbers(list: readonly EmberView[], version = -1): void {
    const K = T.eruption.ember;
    const n = Math.min(list.length, CAP.embers);
    const all = version < 0 || version !== this.emberVersion;
    this.emberVersion = version;
    let charDirty = all;
    const fa = this.flameMesh.instanceMatrix.array as Float32Array, ca = this.charMesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const e = list[i]!;
      const fadeIn = Math.min(1, e.age / 0.3), fadeOut = Math.min(1, (K.sec - e.age) / 3), k = fadeIn * fadeOut;
      const ph = i * 1.7;
      const flick = 1 + 0.25 * Math.sin(this.clock * 17 + ph) + 0.1 * Math.sin(this.clock * 41 + ph * 2);
      // 炎の 板: y 軸で 回して 大きさ を かける（数百 あるので 行列を じかに 書く）
      writeYRot(fa, i, e.x, e.y, e.z, this.clock * 1.3 + ph, K.flameScale * 0.9 * k, Math.max(0.01, K.flameScale * k * flick));
      if (!all && k >= 1) continue; // こげ跡は 動かない（出入りの 間と ならびが かわった ときだけ 書く）
      const cs = K.radius * 1.8 * k;
      writeYRot(ca, i, e.x, e.y + 0.03, e.z, ph, cs, 1, cs);
      charDirty = true;
    }
    this.emberFlames = this.emberChars = n;
    this.charDirty = this.charDirty || charDirty;
  }

  /** 燃える 植物: その マスの 上に 炎を しばらく */
  burnFlame(x: number, y: number, z: number): void {
    if (this.burn.length >= CAP.flames) this.burn.shift();
    this.burn.push({ x, y, z, age: 0, life: T.eruption.burnFlameSec * (0.7 + this.rnd() * 0.6), ph: this.rnd() * 6.28 });
  }

  /** 煙の 玉を n 個（口や 着地点から） */
  puff(x: number, y: number, z: number, n: number, size: number, up = 2, shade = 0.22, life = 1): void {
    for (let i = 0; i < n; i++) {
      if (this.smoke.length >= CAP.smoke) this.smoke.shift();
      const a = this.rnd() * 6.28, d = this.rnd() * size * 0.4;
      this.smoke.push({ x: x + Math.cos(a) * d, y: y + this.rnd() * 0.6, z: z + Math.sin(a) * d, vx: Math.cos(a) * (0.4 + this.rnd() * 1.4), vy: up * (0.7 + this.rnd() * 0.8), vz: Math.sin(a) * (0.4 + this.rnd() * 1.4), age: 0, life: (4 + this.rnd() * 2.5) * life, size: size * (0.6 + this.rnd() * 0.8), rot: this.rnd() * 3, shade: shade * (0.8 + this.rnd() * 0.4) });
    }
  }

  /** 炎の 板を 1 まい: a（根もと）から (dx, dy, dz) の 向きへ のびる。len = 長さ、w = はば */
  private flameBoard(idx: number, a: V3, dx: number, dy: number, dz: number, len: number, w: number, roll: number): void {
    const L = Math.hypot(dx, dy, dz);
    if (L > 1e-6) this.q.setFromUnitVectors(this.up, this.v2.set(dx / L, dy / L, dz / L)); else this.q.identity();
    this.q.multiply(this.q2.setFromAxisAngle(this.up, roll));
    this.m.compose(this.v.set(a.x, a.y, a.z), this.q, this.s.set(w / 0.8, Math.max(0.01, len), w / 0.8));
    this.flameMesh.setMatrixAt(idx, this.m);
  }

  update(dt: number): void {
    const K = T.eruption;
    this.clock += dt;
    // 火柱
    const lv = this.colLevel;
    if (lv > 0.01) {
      this.column.visible = true;
      const r = K.columnRadius * (0.85 + 0.15 * Math.sin(this.clock * 26)) * (0.4 + 0.6 * lv);
      this.column.position.set(this.mouth.x, this.mouth.y, this.mouth.z);
      this.column.scale.set(r, K.columnHeight * lv, r);
      // 炎の 板と 噴煙を 口から 空へ
      this.spawnAcc += dt * lv;
      while (this.spawnAcc > 0.035) {
        this.spawnAcc -= 0.035;
        if (this.jet.length >= CAP.jet) this.jet.shift();
        const a = this.rnd() * 6.28, d = this.rnd() * 0.8;
        this.jet.push({ x: this.mouth.x + Math.cos(a) * d, y: this.mouth.y, z: this.mouth.z + Math.sin(a) * d, vx: (this.rnd() - 0.5) * 3, vy: 22 + this.rnd() * 14, vz: (this.rnd() - 0.5) * 3, age: 0, life: 0.9 + this.rnd() * 0.7, size: K.columnRadius * (1.3 + this.rnd() * 1.2), rot: this.rnd() * 6 });
        if (this.rnd() < 0.9) this.puff(this.mouth.x, this.mouth.y + K.columnHeight * (0.35 + 0.5 * this.rnd()) * lv, this.mouth.z, 1, K.plumeSize, 3.5);
      }
    } else this.column.visible = false;
    // 風の すじ（口へ あつまる。外から 内へ くり返し）
    const wl = this.windLevel;
    if (wl > 0.01) {
      const n = Math.min(CAP.wind, Math.round(K.windLines * (0.4 + 0.6 * wl)));
      for (let i = 0; i < n; i++) {
        const ph = (this.clock * (0.55 + 0.25 * ((i * 7) % 5) / 5) + i * 0.37) % 1;
        const ang = i * 2.399 + Math.floor(this.clock * 0.55 + i * 0.37) * 1.3;
        const hr = Math.sin(i * 12.9898) * 6, rad = K.windRadius * (1 - ph) + 1.5;
        this.v.set(this.mouth.x + Math.cos(ang) * rad, this.mouth.y + hr * (1 - ph), this.mouth.z + Math.sin(ang) * rad);
        this.v2.set(this.mouth.x - this.v.x, this.mouth.y - this.v.y, this.mouth.z - this.v.z).normalize();
        this.q.setFromUnitVectors(this.zAxis, this.v2);
        const len = (2 + 4 * ph) * wl;
        this.m.compose(this.v, this.q, this.s.set(1, 1, Math.max(0.01, len)));
        this.windMesh.setMatrixAt(i, this.m);
      }
      this.windN = n; this.windMesh.count = n; this.windMesh.instanceMatrix.needsUpdate = true;
    } else if (this.windN > 0) { this.windN = 0; this.windMesh.count = 0; }
    // 噴煙・土けむり
    let w = 0;
    for (const p of this.smoke) {
      p.age += dt;
      if (p.age >= p.life) continue;
      this.smoke[w++] = p;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 1 - 0.2 * dt; p.vx *= 1 - 0.25 * dt; p.vz *= 1 - 0.25 * dt;
      const u = p.age / p.life, sc = p.size * (0.5 + 1.2 * Math.min(1, u * 1.5)) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
      this.q.setFromAxisAngle(this.up, p.rot + p.age * 0.3);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sc, sc, sc));
      this.smokeMesh.setMatrixAt(w - 1, this.m);
      const sh = p.shade ?? 0.22;
      this.smokeMesh.setColorAt(w - 1, this.col.setRGB(sh, sh * 0.97, sh * 1.02));
    }
    this.smoke.length = w;
    let smokeIdx = w;
    // 炎の 板: 燃えかす（setEmbers で 0〜）→ 燃える 植物 → 火柱・着地の 炎 → 隕石の 尾 → 火の 粉
    let idx = this.emberFlames;
    w = 0;
    for (const f of this.burn) {
      f.age += dt;
      if (f.age >= f.life) continue;
      this.burn[w++] = f;
      const grow = Math.min(1, f.age / 0.3), fade = Math.min(1, (f.life - f.age) / 1.0);
      const flick = 1 + 0.25 * Math.sin(this.clock * 17 + f.ph);
      this.q.setFromAxisAngle(this.up, this.clock * 1.3 + f.ph);
      this.m.compose(this.v.set(f.x, f.y, f.z), this.q, this.s.set(1.2 * grow * fade, Math.max(0.01, 1.5 * grow * fade * flick), 1.2 * grow * fade));
      this.flameMesh.setMatrixAt(idx++, this.m);
    }
    this.burn.length = w;
    w = 0;
    for (const p of this.jet) {
      p.age += dt;
      if (p.age >= p.life) continue;
      this.jet[w++] = p;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = p.age / p.life, sc = p.size * (u < 0.15 ? 0.6 + u / 0.15 * 0.4 : 1 - 0.6 * (u - 0.15) / 0.85);
      this.q.setFromAxisAngle(this.up, p.rot + this.clock * 3);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sc, sc * 1.4, sc));
      this.flameMesh.setMatrixAt(idx++, this.m);
    }
    this.jet.length = w;
    // 隕石: 岩（回る）・光の かさ・炎の 尾・けむりの 尾・予告の 輪。火の 粉
    const M = K.meteor, rain = this.rain;
    let rockN = 0, haloN = 0, warnN = 0, trails = 0, sparks = 0;
    if (rain) {
      for (const a of rain.meteors) {
        if (rockN >= CAP.meteors) break;
        const p = flyerAt(a, a.t, this.pa);
        const sz = M.size * (0.85 + 0.3 * ((a.id * 37) % 10) / 10);
        this.q.setFromAxisAngle(this.spinAxis, a.t * 5 + a.id);
        this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sz, sz, sz));
        this.rockMesh.setMatrixAt(rockN, this.m);
        this.rockMesh.setColorAt(rockN, this.col.setRGB(1, 1, 1));
        rockN++;
        const hs = sz * 2.6 * (0.9 + 0.12 * Math.sin(this.clock * 24 + a.id));
        this.q.setFromAxisAngle(this.up, this.clock * 2 + a.id);
        this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(hs / 0.8, hs, hs / 0.8));
        this.haloMesh.setMatrixAt(haloN, this.m);
        this.haloMesh.setColorAt(haloN, this.col.setRGB(1, 0.55, 0.2));
        haloN++;
        // 炎の 尾: いまの 位置から 少し 前の 位置へ。うしろほど 細く。尾の さきの うしろに 黒い けむりの 箱
        const pc = this.pc;
        pc.x = p.x; pc.y = p.y; pc.z = p.z;
        let tb = a.t;
        for (let k = 0; k < M.trailLen; k++) {
          tb = a.t - (k + 1) * M.trailGapSec;
          if (tb < 0) break;
          const b = flyerAt(a, tb, this.pb);
          const dx = b.x - pc.x, dy = b.y - pc.y, dz = b.z - pc.z, len = Math.hypot(dx, dy, dz);
          if (len > 0.05 && idx < FLAME_CAP) {
            const wd = M.trailWidth * (sz / M.size) * (1 - 0.7 * (k / M.trailLen)) * (0.9 + 0.15 * Math.sin(this.clock * 30 + k + a.id));
            this.flameBoard(idx++, pc, dx, dy, dz, len * 1.35 + 0.4, wd, a.id + k * 1.3);
            trails++;
          }
          pc.x = b.x; pc.y = b.y; pc.z = b.z;
        }
        for (let j = 0; j < M.smokeTrail && smokeIdx < SMOKE_CAP; j++) {
          const ts = tb - (j + 1) * M.trailGapSec * 1.6;
          if (ts < 0) break;
          const c = flyerAt(a, ts, this.pb);
          const ss = sz * (1.1 + 0.5 * j);
          this.q.setFromAxisAngle(this.up, a.id + j);
          this.m.compose(this.v.set(c.x, c.y, c.z), this.q, this.s.set(ss, ss, ss));
          this.smokeMesh.setMatrixAt(smokeIdx, this.m);
          this.smokeMesh.setColorAt(smokeIdx, this.col.setRGB(0.16, 0.15, 0.16));
          smokeIdx++;
        }
        // 予告の 輪（大きさ = 落下範囲）と だんだん 大きく なる 丸
        const wv = rain.warn(a);
        if (wv > 0 && warnN < CAP.meteors) {
          const R = M.radius, ringS = (2 * R * 32) / RING_R;
          this.m.compose(this.v.set(a.lx, a.ly + 0.05, a.lz), this.q.identity(), this.s.set(ringS, 1, ringS));
          this.warnRingMesh.setMatrixAt(warnN, this.m);
          const pulse = wv > 0.6 ? 0.75 + 0.25 * Math.sin(this.clock * 28) : 1;
          this.warnRingMesh.setColorAt(warnN, this.col.setRGB(pulse, 0.12 * pulse, 0.06 * pulse));
          const fs = 2 * R * (0.25 + 0.75 * wv);
          this.m.compose(this.v.set(a.lx, a.ly + 0.04, a.lz), this.q, this.s.set(fs, 1, fs));
          this.warnFillMesh.setMatrixAt(warnN, this.m);
          this.warnFillMesh.setColorAt(warnN, this.col.setRGB(0.3 + 0.7 * wv, 0.05 + 0.08 * wv, 0.03));
          warnN++;
        }
      }
      for (const s of rain.sparks) {
        if (sparks >= CAP.sparks || idx >= FLAME_CAP) break;
        const p = flyerAt(s, s.t, this.pa), b = flyerAt(s, s.t - 0.05, this.pb);
        const sz = K.splash.size;
        this.flameBoard(idx++, p, b.x - p.x, b.y - p.y, b.z - p.z, sz * 1.5, sz, s.t * 9 + s.lx);
        sparks++;
      }
    }
    // 着地の 輪（落下範囲まで 広がって 消える）と 光
    const I = K.impact;
    let shockN = 0, flashes = 0;
    w = 0;
    for (const r of this.rings) {
      r.age += dt;
      const life = Math.max(I.ringSec, I.flashSec);
      if (r.age >= life) continue;
      this.rings[w++] = r;
      if (r.age < I.ringSec) {
        const u = r.age / I.ringSec, rr = M.radius * (0.3 + 0.8 * (1 - (1 - u) * (1 - u))), ringS = (2 * rr * 32) / RING_R, f = 1 - u;
        this.m.compose(this.v.set(r.x, r.y + 0.08, r.z), this.q.identity(), this.s.set(ringS, 1, ringS));
        this.shockMesh.setMatrixAt(shockN, this.m);
        this.shockMesh.setColorAt(shockN, this.col.setRGB(1 * f, 0.6 * f, 0.2 * f));
        shockN++;
      }
      if (r.age < I.flashSec && haloN < CAP.meteors + CAP.rings) {
        const u = r.age / I.flashSec, fs = I.flashSize * (0.6 + 0.6 * u);
        this.m.compose(this.v.set(r.x, r.y + 1, r.z), this.q.identity(), this.s.set(fs / 0.8, fs, fs / 0.8));
        this.haloMesh.setMatrixAt(haloN, this.m);
        this.haloMesh.setColorAt(haloN, this.col.setRGB(1 - u * 0.5, 0.8 * (1 - u), 0.5 * (1 - u)));
        haloN++; flashes++;
      }
    }
    this.rings.length = w;
    // 岩の かけら（重力で 落ちる。けむりの 箱の あとに ならべる）
    w = 0;
    for (const p of this.debris) {
      p.age += dt;
      if (p.age >= p.life) continue;
      this.debris[w++] = p;
      p.vy -= (p.g ?? 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const sc = p.size * (1 - 0.5 * (p.age / p.life));
      this.q.setFromAxisAngle(this.spinAxis, p.rot + p.age * 9);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sc, sc, sc));
      if (smokeIdx >= SMOKE_CAP) continue;
      this.smokeMesh.setMatrixAt(smokeIdx, this.m);
      this.smokeMesh.setColorAt(smokeIdx, p.hot ? this.col.setRGB(1, 0.55, 0.15) : this.col.setRGB(0.3, 0.22, 0.17));
      smokeIdx++;
    }
    this.debris.length = w;
    this.cnt.meteors = rockN; this.cnt.trails = trails; this.cnt.sparks = sparks; this.cnt.warns = warnN; this.cnt.flashes = flashes;
    const flush = (im: InstancedMesh, n: number): void => {
      im.count = n;
      if (n > 0) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    };
    flush(this.smokeMesh, smokeIdx);
    flush(this.flameMesh, idx);
    flush(this.rockMesh, rockN);
    flush(this.haloMesh, haloN);
    flush(this.warnRingMesh, warnN);
    flush(this.warnFillMesh, warnN);
    flush(this.shockMesh, shockN);
    this.charMesh.count = this.emberChars;
    if (this.charDirty) { this.charMesh.instanceMatrix.needsUpdate = true; this.charDirty = false; }
  }

  /** 数（テスト・片づけの 確かめ）。meteors = 描いた 隕石、warns = 予告の 輪、sparks = 火の 粉、trails = 尾の 板、rings = 着地の 輪、debris = かけら */
  counts(): { meteors: number; warns: number; sparks: number; trails: number; rings: number; flashes: number; debris: number; embers: number; burning: number; smoke: number; jet: number; wind: number; column: boolean } {
    return {
      meteors: this.cnt.meteors, warns: this.cnt.warns, sparks: this.cnt.sparks, trails: this.cnt.trails, rings: this.rings.length, flashes: this.cnt.flashes, debris: this.debris.length,
      embers: this.emberFlames, burning: this.burn.length, smoke: this.smoke.length, jet: this.jet.length, wind: this.windN, column: this.column.visible,
    };
  }

  clear(): void {
    this.smoke.length = this.jet.length = this.burn.length = this.debris.length = this.rings.length = 0;
    this.rain = null;
    this.emberFlames = this.emberChars = this.windN = 0;
    this.emberVersion = -1;
    this.cnt = { meteors: 0, trails: 0, sparks: 0, warns: 0, flashes: 0 };
    this.colLevel = this.windLevel = 0;
    for (const m of this.meshes()) m.count = 0;
    this.column.visible = false; this.glow.visible = false;
  }

  private meshes(): InstancedMesh[] {
    return [this.windMesh, this.smokeMesh, this.rockMesh, this.haloMesh, this.flameMesh, this.warnFillMesh, this.warnRingMesh, this.shockMesh, this.charMesh];
  }

  dispose(): void {
    this.scene.remove(this.root);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    for (const m of this.meshes()) m.dispose();
  }
}
