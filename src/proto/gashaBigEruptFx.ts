/**
 * #293 試作: 攻撃 4「口から 火山噴火」の 見た目。動きは gashaBigEruption.ts。
 *  風の すじ（口へ 集まる）・口の 光・火柱（円柱 + ドット絵の 十字の 炎の 板が 空へ）・黒い 噴煙（箱）・
 *  とんで いる 灰（火の ついた かたまり）・着地の 予告の 影・燃え残りの 炎の 板と こげ跡・燃える 植物の 炎。
 *  すべて InstancedMesh（毎コマ new しない。数は 上限つき）。乱数は シード付き。
 */
import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Sprite, SpriteMaterial, Texture, Vector3, type BufferGeometry, type Camera, type Scene,
} from 'three';
import { TUNE as T } from './gashaBigTuning';
import type { V3 } from './gashaBigEruption';
import { blankTexture, crossGeometry, flameTexture, glowTexture, hasDom } from './gashaBigBeamFx';

/** 予告の 影の 絵（まんなかが こい 丸） */
function shadowTexture(): Texture {
  if (!hasDom()) return blankTexture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.7, 'rgba(255,255,255,0.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 27, 0, Math.PI * 2); g.stroke();
  return new CanvasTexture(c);
}

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; rot: number; shade?: number }
interface Flame { x: number; y: number; z: number; age: number; life: number; ph: number }
export interface EmberView { x: number; y: number; z: number; age: number }
export interface AshView { x: number; y: number; z: number; spin: number }
export interface ShadowView { x: number; y: number; z: number; warn: number }

const CAP = { jet: 60, smoke: 260, flames: 120, ash: 130, shadows: 130, embers: 170, wind: 40 };

export class EruptFx {
  private readonly root = new Group();
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: (MeshBasicMaterial | SpriteMaterial)[] = [];
  private readonly texs: Texture[] = [];
  private readonly column: Mesh;
  private readonly glow: Sprite;
  private readonly windMesh: InstancedMesh;
  private readonly smokeMesh: InstancedMesh;
  private readonly jetMesh: InstancedMesh;
  private readonly ashMesh: InstancedMesh;
  private readonly shadowMesh: InstancedMesh;
  private readonly charMesh: InstancedMesh;
  private readonly flameMesh: InstancedMesh;
  private readonly smoke: Particle[] = [];
  private readonly jet: Particle[] = [];
  private readonly burn: Flame[] = [];
  private emberFlames = 0;
  private emberChars = 0;
  private ashN = 0; private shadowN = 0; private windN = 0;
  private colLevel = 0;
  private mouth: V3 = { x: 0, y: 0, z: 0 };
  private windLevel = 0;
  private clock = 0;
  private spawnAcc = 0;
  private seed = 4401;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly v2 = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly zAxis = new Vector3(0, 0, 1);
  private readonly col = new Color();

  constructor(private readonly scene: Scene, camera: Camera) {
    void camera;
    const K = T.eruption;
    this.root.name = 'gashaEruptFx';
    const track = <G extends BufferGeometry>(g: G): G => { this.geos.push(g); return g; };
    const mat = <M extends MeshBasicMaterial | SpriteMaterial>(m: M): M => { this.mats.push(m); return m; };
    // 火柱（上へ のびる 円柱。底が 口。高さ 1・半径 1）
    const cyl = track(new CylinderGeometry(1, 1.5, 1, 12, 1, true)); cyl.translate(0, 0.5, 0);
    this.column = new Mesh(cyl, mat(new MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })));
    this.column.frustumCulled = false; this.column.visible = false; this.column.renderOrder = 5;
    // 口の 光
    const gt = glowTexture(); this.texs.push(gt);
    this.glow = new Sprite(mat(new SpriteMaterial({ map: gt, blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false })));
    this.glow.visible = false; this.glow.renderOrder = 8;
    // 風の すじ（細い 箱。+z に のびる）
    const thin = track(new BoxGeometry(0.28, 0.28, 1));
    this.windMesh = new InstancedMesh(thin, mat(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false })), CAP.wind);
    this.windMesh.frustumCulled = false; this.windMesh.count = 0; this.windMesh.renderOrder = 4;
    // 黒い 噴煙・灰（箱）
    const box = track(new BoxGeometry(1, 1, 1));
    this.smokeMesh = new InstancedMesh(box, mat(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false })), CAP.smoke);
    this.smokeMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CAP.smoke * 3), 3);
    this.smokeMesh.frustumCulled = false; this.smokeMesh.count = 0; this.smokeMesh.renderOrder = 3;
    this.ashMesh = new InstancedMesh(box, mat(new MeshBasicMaterial({ color: 0xffffff, fog: false })), CAP.ash);
    this.ashMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CAP.ash * 3), 3);
    this.ashMesh.frustumCulled = false; this.ashMesh.count = 0; this.ashMesh.renderOrder = 6;
    // 炎（ドット絵の 十字の 板）: 火柱の 炎 / 燃えかす・燃える 植物
    const cross = track(crossGeometry());
    const ft = flameTexture(); this.texs.push(ft);
    const flameMat = mat(new MeshBasicMaterial({ map: ft, alphaTest: 0.5, side: DoubleSide, fog: false }));
    this.jetMesh = new InstancedMesh(cross, flameMat, CAP.jet);
    this.jetMesh.frustumCulled = false; this.jetMesh.count = 0; this.jetMesh.renderOrder = 6;
    this.flameMesh = new InstancedMesh(cross, flameMat, CAP.embers + CAP.flames);
    this.flameMesh.frustumCulled = false; this.flameMesh.count = 0;
    // 平らな 板: 予告の 影・こげ跡
    const flat = track(new PlaneGeometry(1, 1)); flat.rotateX(-Math.PI / 2);
    const st = shadowTexture(); this.texs.push(st);
    this.shadowMesh = new InstancedMesh(flat, mat(new MeshBasicMaterial({ map: st, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), CAP.shadows);
    this.shadowMesh.instanceColor = new InstancedBufferAttribute(new Float32Array(CAP.shadows * 3), 3);
    this.shadowMesh.frustumCulled = false; this.shadowMesh.count = 0; this.shadowMesh.renderOrder = 2;
    this.charMesh = new InstancedMesh(flat, mat(new MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })), CAP.embers + CAP.flames);
    this.charMesh.frustumCulled = false; this.charMesh.count = 0; this.charMesh.renderOrder = 2;
    this.root.add(this.column, this.glow, this.windMesh, this.smokeMesh, this.ashMesh, this.jetMesh, this.flameMesh, this.shadowMesh, this.charMesh);
    void K;
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

  /** とんで いる 灰（毎コマ ぜんぶ 渡す） */
  setAshes(list: readonly AshView[]): void {
    const n = Math.min(list.length, CAP.ash), K = T.eruption.ash;
    for (let i = 0; i < n; i++) {
      const a = list[i]!;
      this.q.setFromAxisAngle(this.v.set(0.6, 1, 0.3).normalize(), a.spin);
      const sz = K.size * (0.8 + 0.4 * ((i * 37) % 10) / 10);
      this.m.compose(this.v2.set(a.x, a.y, a.z), this.q, this.s.set(sz, sz, sz));
      this.ashMesh.setMatrixAt(i, this.m);
      // 火の ついた 色: 橙 → 赤（ばらつき）
      this.col.setHSL(0.02 + 0.07 * (((i * 53) % 10) / 10), 1, 0.55);
      this.ashMesh.setColorAt(i, this.col);
    }
    this.ashN = n; this.ashMesh.count = n; this.ashMesh.instanceMatrix.needsUpdate = true;
    if (this.ashMesh.instanceColor) this.ashMesh.instanceColor.needsUpdate = true;
  }

  /** 着地の 予告の 影（warn 0〜1 で 大きく・こく） */
  setShadows(list: readonly ShadowView[]): void {
    const n = Math.min(list.length, CAP.shadows), R = T.eruption.ash.shadowRadius;
    for (let i = 0; i < n; i++) {
      const a = list[i]!, k = 0.45 + 0.55 * a.warn;
      this.m.compose(this.v.set(a.x, a.y + 0.04, a.z), this.q.identity(), this.s.set(R * 2 * k, 1, R * 2 * k));
      this.shadowMesh.setMatrixAt(i, this.m);
      this.col.setRGB(0.25 + 0.75 * a.warn, 0.04 + 0.1 * a.warn, 0.02);
      this.shadowMesh.setColorAt(i, this.col);
    }
    this.shadowN = n; this.shadowMesh.count = n; this.shadowMesh.instanceMatrix.needsUpdate = true;
    if (this.shadowMesh.instanceColor) this.shadowMesh.instanceColor.needsUpdate = true;
  }

  /** 燃えかす（毎コマ ぜんぶ 渡す）。古い ほど 小さく なって 消える */
  setEmbers(list: readonly EmberView[]): void {
    const K = T.eruption.ember;
    const n = Math.min(list.length, CAP.embers);
    for (let i = 0; i < n; i++) {
      const e = list[i]!;
      const fadeIn = Math.min(1, e.age / 0.3), fadeOut = Math.min(1, (K.sec - e.age) / 3), k = fadeIn * fadeOut;
      const ph = i * 1.7;
      const flick = 1 + 0.25 * Math.sin(this.clock * 17 + ph) + 0.1 * Math.sin(this.clock * 41 + ph * 2);
      this.q.setFromAxisAngle(this.up, this.clock * 1.3 + ph);
      this.m.compose(this.v.set(e.x, e.y, e.z), this.q, this.s.set(K.flameScale * 0.9 * k, Math.max(0.01, K.flameScale * k * flick), K.flameScale * 0.9 * k));
      this.flameMesh.setMatrixAt(i, this.m);
      this.q.setFromAxisAngle(this.up, ph);
      this.m.compose(this.v.set(e.x, e.y + 0.03, e.z), this.q, this.s.set(K.radius * 1.8 * k, 1, K.radius * 1.8 * k));
      this.charMesh.setMatrixAt(i, this.m);
    }
    this.emberFlames = this.emberChars = n;
  }

  /** 燃える 植物: その マスの 上に 炎を しばらく */
  burnFlame(x: number, y: number, z: number): void {
    if (this.burn.length >= CAP.flames) this.burn.shift();
    this.burn.push({ x, y, z, age: 0, life: T.eruption.burnFlameSec * (0.7 + this.rnd() * 0.6), ph: this.rnd() * 6.28 });
  }

  /** 煙の 玉を n 個（口や 着地点から） */
  puff(x: number, y: number, z: number, n: number, size: number, up = 2, shade = 0.22): void {
    for (let i = 0; i < n; i++) {
      if (this.smoke.length >= CAP.smoke) this.smoke.shift();
      const a = this.rnd() * 6.28, d = this.rnd() * size * 0.4;
      this.smoke.push({ x: x + Math.cos(a) * d, y: y + this.rnd() * 0.6, z: z + Math.sin(a) * d, vx: Math.cos(a) * (0.4 + this.rnd() * 1.4), vy: up * (0.7 + this.rnd() * 0.8), vz: Math.sin(a) * (0.4 + this.rnd() * 1.4), age: 0, life: 4 + this.rnd() * 2.5, size: size * (0.6 + this.rnd() * 0.8), rot: this.rnd() * 3, shade: shade * (0.8 + this.rnd() * 0.4) });
    }
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
    // 火柱の 炎（上へ とぶ）
    let w = 0;
    for (const p of this.jet) {
      p.age += dt;
      if (p.age >= p.life) continue;
      this.jet[w++] = p;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const u = p.age / p.life, sc = p.size * (1 - 0.6 * u);
      this.q.setFromAxisAngle(this.up, p.rot + this.clock * 3);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sc, sc * 1.4, sc));
      this.jetMesh.setMatrixAt(w - 1, this.m);
    }
    this.jet.length = w; this.jetMesh.count = w; this.jetMesh.instanceMatrix.needsUpdate = true;
    // 噴煙
    w = 0;
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
    this.smoke.length = w; this.smokeMesh.count = w; this.smokeMesh.instanceMatrix.needsUpdate = true;
    if (this.smokeMesh.instanceColor) this.smokeMesh.instanceColor.needsUpdate = true;
    // 燃える 植物の 炎（燃えかすの 後ろに つづけて 並べる）
    w = 0;
    let idx = this.emberFlames;
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
    this.flameMesh.count = idx; this.flameMesh.instanceMatrix.needsUpdate = true;
    this.charMesh.count = this.emberChars; this.charMesh.instanceMatrix.needsUpdate = true;
  }

  counts(): { ashes: number; shadows: number; embers: number; burning: number; smoke: number; jet: number; wind: number; column: boolean } {
    return { ashes: this.ashN, shadows: this.shadowN, embers: this.emberFlames, burning: this.burn.length, smoke: this.smoke.length, jet: this.jet.length, wind: this.windN, column: this.column.visible };
  }

  clear(): void {
    this.smoke.length = this.jet.length = this.burn.length = 0;
    this.emberFlames = this.emberChars = this.ashN = this.shadowN = this.windN = 0;
    this.colLevel = this.windLevel = 0;
    for (const m of [this.windMesh, this.smokeMesh, this.jetMesh, this.ashMesh, this.shadowMesh, this.charMesh, this.flameMesh]) m.count = 0;
    this.column.visible = false; this.glow.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.root);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    for (const m of [this.windMesh, this.smokeMesh, this.jetMesh, this.ashMesh, this.shadowMesh, this.charMesh, this.flameMesh]) m.dispose();
  }
}
