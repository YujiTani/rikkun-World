import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import type { DomeGrains } from '../legend/domeGrains';
import { slashAngleDeg, slashViewFor, type SlashView } from '../legend/slashView';

/**
 * WEAPON-9 虹の 見た目（B「にじの おび」ドーム ＋ 斬撃 A）。絵の もとは art/WEAPON-9/final/（build.py）。
 * ドーム ぜんぶで 1 つの エフェクト: 描画 4（まく・輪・玉・かけらと つぶの 点）・三角形 ≦ 220（球 18×6 を 地面で 切る 198 ＋ 輪 2 ＋ 玉 2）。
 * まくは 球 1 つの シェーダー（1/8 ブロックの 升目・網で 点を ぬく）。外がわの 面だけ 白い もや・ふち。内がわの 面は おびの 細い 線だけ
 * （一人称・カメラが ドームの 中でも 画面を 白く しない）。明るさは 出る・消える 時の 1 回ずつ（とどまる 間は 一定。おびが 回る だけ）。
 * 材質は ぜんぶ `warmUp` で 読みこみ中に 作る（最初の シャイニングで 作りなおさない）。
 */
export const DOME_R = 7;
const BASE = './models/fx/';
/** まくの 形: 経 18 本・緯度の 輪 6 本（北極 90° から 南 −25° まで。地面に とどく 手前で 切る）= 198 三角形（極 18 ＋ おび 5 × 36）。経と緯度の 刻みを 同じくらい（約 20°）に して りんかくを なめらかに */
const SEG = 18;
const LAT_BOTTOM = -25;
const BANDS = 5;
const MAX_POINTS = 64;

const VERT = `
varying vec3 vP;
varying vec3 vNv;
varying vec3 vVd;
varying vec3 vInfl;
varying vec3 vOrg;
void main() {
  vP = position;
  // 多角形の かどが 球の 外に 出るよう 少し ふくらませ、ふちは フラグメントで 本当の 球の まるで 切る
  vInfl = position * 1.03;
  vOrg = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vNv = normalMatrix * normalize(position);
  vec4 mv = modelViewMatrix * vec4(vInfl, 1.0);
  vVd = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform float uT;
varying vec3 vP;
varying vec3 vNv;
varying vec3 vVd;
varying vec3 vInfl;
varying vec3 vOrg;
const float PI = 3.14159265;
float bayer(vec2 c) {
  int x = int(mod(c.x, 4.0)); int y = int(mod(c.y, 4.0));
  int i = y * 4 + x;
  float m[16] = float[16](0.,8.,2.,10., 12.,4.,14.,6., 3.,11.,1.,9., 15.,7.,13.,5.);
  return (m[i] + 0.5) / 16.0;
}
vec3 hue3(float h) {
  float m = mod(h, 3.0);
  if (m < 1.0) return vec3(0.373, 0.851, 0.557);
  if (m < 2.0) return vec3(0.310, 0.639, 0.941);
  return vec3(0.820, 0.420, 0.902);
}
void main() {
  // りんかく: カメラから この 点への 線が 本当の 球(半径 ${DOME_R.toFixed(1)})に とどかない 所は ぬく
  vec3 rd = normalize(vInfl - vOrg);
  if (length(cross(rd, vOrg)) > ${DOME_R.toFixed(1)}) discard;
  bool front = gl_FrontFacing;
  float lon = atan(vP.z, vP.x) + PI;
  float ln = clamp((vP.y / ${DOME_R.toFixed(1)} + 1.0) * 0.5, 0.0, 1.0);
  float ilon = floor(lon / (2.0 * PI) * 352.0);
  float ilat = floor(ln * 176.0);
  float bay = bayer(vec2(ilon, ilat));
  float ndv = abs(dot(normalize(vNv), normalize(-vVd)));
  float rim = 1.0 - ndv;
  vec4 col = vec4(0.0);
  bool rimOpaque = false;
  if (front) {
    if (rim > 0.925) { col = vec4(0.227, 0.196, 0.439, 1.0); rimOpaque = true; }
    else if (rim > 0.82) { col = vec4(1.0, 0.973, 0.886, 1.0); rimOpaque = true; }
    else if (rim > 0.7 && bay < 0.8) { col = vec4(1.0, 0.906, 0.651, 1.0); rimOpaque = true; }
    else if (rim > 0.55 && rim <= 0.7 && bay < 0.5) { col = vec4(0.914, 0.722, 0.361, 1.0); rimOpaque = true; }
    else {
      float a = rim < 0.25 ? 0.10 : (rim < 0.5 ? 0.17 : 0.24);
      col = vec4(0.97, 0.97, 0.94, a);
    }
  }
  float rot = uT * 2.0 * PI / 5.0;
  float wdt = 0.30 * clamp(1.0 - 0.75 * clamp(ln - 0.15, 0.0, 1.0), 0.12, 1.0);
  float q = (lon - rot - ln * 1.9 * PI) / (2.0 * PI) * 4.0;
  float u = fract(q);
  bool inb;
  if (front) inb = u < wdt && (ln > 0.12 || bay < (ln + 0.04) * 8.0);
  else inb = u < wdt && abs(u - wdt * 0.5) < 0.04 && bay < 0.5;
  if (inb && !rimOpaque) {
    float h = floor(q) + floor(ln * 3.0 + uT * 0.6);
    vec3 hc = hue3(h) * (front ? 1.0 : 0.8);
    bool core = abs(u - wdt * 0.45) < wdt * 0.12;
    col = vec4(core ? vec3(1.0, 0.973, 0.886) : hc, 1.0);
  }
  if (col.a <= 0.0) discard;
  gl_FragColor = col;
}`;

function tex(url: string, flipY = true): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = flipY;
  return t;
}

const PALETTE = [
  [1, 0.97, 0.89],
  [0.37, 0.85, 0.56],
  [0.31, 0.64, 0.94],
  [0.82, 0.42, 0.9],
];

export interface DomeShow {
  /** ドームの 今の 半径（0 = なし） */
  radius: number;
  /** 体の 中心 */
  center: Vec3;
  /** もとの 足もとの 高さ（地面） */
  groundY: number;
  /** F（はなした ステップを 1 とした） */
  F: number;
}

export interface NijiSlashInfo {
  view: SlashView;
  angle: number;
  age: number;
  /** 板の まん中の 世界の 位置 */
  pos: Vec3;
}

/** まくの 三角形（経 SEG 本・北極から LAT_BOTTOM まで BANDS+1 区間）。法線は 位置から シェーダーで 出す */
function domeTriangles(): Float32Array {
  const rings: number[] = [];
  for (let i = 0; i <= BANDS + 1; i++) rings.push(90 + ((LAT_BOTTOM - 90) * i) / (BANDS + 1));
  const P = (lat: number, k: number): [number, number, number] => {
    const la = (lat * Math.PI) / 180;
    const lo = (k / SEG) * Math.PI * 2;
    return [Math.cos(la) * Math.cos(lo) * DOME_R, Math.sin(la) * DOME_R, Math.cos(la) * Math.sin(lo) * DOME_R];
  };
  const out: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => void out.push(...a, ...b, ...c);
  for (let k = 0; k < SEG; k++) tri(P(rings[0]!, k), P(rings[1]!, k + 1), P(rings[1]!, k)); // 極（外がわが 表）
  for (let r = 1; r <= BANDS; r++) {
    for (let k = 0; k < SEG; k++) {
      const a = P(rings[r]!, k), b = P(rings[r]!, k + 1), c = P(rings[r + 1]!, k), d = P(rings[r + 1]!, k + 1);
      tri(a, b, c);
      tri(b, d, c);
    }
  }
  return new Float32Array(out);
}

export class NijiFx {
  private readonly group = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;
  private readonly dome: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly orb: THREE.Mesh;
  private readonly points: THREE.Points;
  private readonly pointPos: THREE.BufferAttribute;
  private readonly pointCol: THREE.BufferAttribute;
  private readonly slashTex: THREE.Texture;
  private readonly slashMesh: THREE.Mesh;
  private readonly tmp = new THREE.Vector3();
  private t = 0;
  private tris = 0;
  private on = false;
  private slashAge = -1;
  private slashView: SlashView = 'side';
  private slashAngle = 0;
  private lastView: SlashView | null = null;

  private readonly scene: THREE.Scene;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    base = BASE,
  ) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uT: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // 描画を 1 回に（DoubleSide の 半透明は ふつう 裏・表の 2 回に 分かれる）
      forceSinglePass: true,
      fog: false,
    });
    // まくの 形(北極から −25° まで)。毎ステップ 作らない（大きさは scale だけ）
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(domeTriangles(), 3));
    this.tris = (SEG + SEG * 2 * BANDS) + 4; // まく ＋ 輪 2 ＋ 玉 2
    this.dome = new THREE.Mesh(g, this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 2;

    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex(`${base}niji_ring.png`), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.ring.renderOrder = 1;
    this.orb = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ map: tex(`${base}niji_orb.png`), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.orb.renderOrder = 3;

    const pg = new THREE.BufferGeometry();
    this.pointPos = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3);
    this.pointPos.setUsage(THREE.DynamicDrawUsage);
    this.pointCol = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3);
    this.pointCol.setUsage(THREE.DynamicDrawUsage);
    pg.setAttribute('position', this.pointPos);
    pg.setAttribute('color', this.pointCol);
    pg.setDrawRange(0, 0);
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
    this.points.renderOrder = 4;

    this.slashTex = tex(`${base}niji_slash.png`);
    this.slashTex.repeat.set(0.25, 0.5);
    this.slashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6 * (44 / 64)),
      new THREE.MeshBasicMaterial({ map: this.slashTex, transparent: true, alphaTest: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    this.slashMesh.renderOrder = 5;

    for (const o of [this.dome, this.ring, this.orb, this.points, this.slashMesh]) {
      o.frustumCulled = false;
      o.visible = false;
      this.group.add(o);
    }
    scene.add(this.group);
    this.scene = scene;
  }

  /** シーンから はずして 形・材質・絵を すてる */
  dispose(): void {
    this.scene.remove(this.group);
    for (const o of [this.dome, this.ring, this.orb, this.points, this.slashMesh]) {
      o.geometry.dispose();
      const m = o.material as THREE.Material & { map?: THREE.Texture | null };
      m.map?.dispose();
      m.dispose();
    }
  }

  /** 読みこみ中に 材質（描画の プログラム）を ぜんぶ 作る。最初の シャイニング・斬撃で 作りなおさない */
  warmUp(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): void {
    const all = [this.dome, this.ring, this.orb, this.points, this.slashMesh];
    const was = all.map((o) => o.visible);
    for (const o of all) o.visible = true;
    this.points.geometry.setDrawRange(0, 1);
    renderer.compile(scene, camera);
    // 絵(テクスチャ)も 先に GPU へ
    for (const t of [this.slashTex, (this.ring.material as THREE.MeshBasicMaterial).map, (this.orb.material as THREE.MeshBasicMaterial).map]) if (t) renderer.initTexture(t);
    all.forEach((o, i) => (o.visible = was[i]!));
    this.points.geometry.setDrawRange(0, 0);
  }

  /** 1 ステップ ごと */
  step(show: DomeShow | null, grains: DomeGrains, reduced: boolean, firstPerson: boolean): void {
    const on = !!show && show.radius > 0;
    if (!reduced) this.t += 1 / 60;
    this.mat.uniforms.uT!.value = this.t;
    if (on !== this.on) {
      this.on = on;
      this.dome.visible = this.ring.visible = this.orb.visible = this.points.visible = on;
    }
    if (on && show) {
      const c = show.center;
      const scale = show.radius / DOME_R;
      const above = c.y - show.groundY;
      this.dome.position.set(c.x, c.y, c.z);
      this.dome.scale.setScalar(scale);
      const rr = Math.sqrt(Math.max(0, show.radius * show.radius - above * above));
      const s = (14 * rr) / 6.4;
      this.ring.scale.set(Math.max(s, 1e-3), 1, Math.max(s, 1e-3));
      this.ring.position.set(c.x, show.groundY + 0.03, c.z);
      const cam = this.camera.position;
      const inside = Math.hypot(cam.x - c.x, cam.y - c.y, cam.z - c.z) < 1.5;
      this.orb.visible = !inside && !firstPerson;
      this.tmp.set(cam.x - c.x, cam.y - c.y, cam.z - c.z).normalize();
      this.orb.position.set(c.x + this.tmp.x * 0.4, c.y + this.tmp.y * 0.4, c.z + this.tmp.z * 0.4);
      this.orb.quaternion.copy(this.camera.quaternion);
      // かけら ＋ つぶ（1 つの 点）
      const n = grains.count();
      const list = grains.list();
      const pa = this.pointPos.array as Float32Array;
      const ca = this.pointCol.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const q = list[i]!;
        pa[i * 3] = q.x;
        pa[i * 3 + 1] = q.y;
        pa[i * 3 + 2] = q.z;
        const col = q.kind === 'idle' ? PALETTE[0]! : PALETTE[(q.id + 1) % 4]!;
        ca[i * 3] = col[0]!;
        ca[i * 3 + 1] = col[1]!;
        ca[i * 3 + 2] = col[2]!;
      }
      this.pointPos.needsUpdate = true;
      this.pointCol.needsUpdate = true;
      this.points.geometry.setDrawRange(0, n);
    }
    this.slashStep();
  }

  /** にじの 斬撃を 出す。絵(よこ・ねかせ)は 出た ステップに 1 回だけ きめる（§5.7.1） */
  slash(at: Vec3, uDeg: number): void {
    const cam = this.camera.position;
    this.slashAngle = slashAngleDeg(uDeg, { x: at.x - cam.x, z: at.z - cam.z });
    this.slashView = slashViewFor(this.slashAngle, this.lastView);
    this.lastView = this.slashView;
    this.slashAge = 0;
    // 絵の 中で 刃の 弧は よこ = 板の まん中より 上・ねかせ = 下に ある ので、見た目の まん中が 体の 高さに なるよう ずらす
    this.slashMesh.position.set(at.x, at.y + (this.slashView === 'side' ? -0.45 : 0.7), at.z);
    this.slashTex.offset.y = this.slashView === 'side' ? 0.5 : 0;
  }

  private slashStep(): void {
    if (this.slashAge < 0) {
      this.slashMesh.visible = false;
      return;
    }
    const f = Math.floor(this.slashAge / 4);
    if (f > 3) {
      this.slashAge = -1;
      this.slashMesh.visible = false;
      return;
    }
    this.slashMesh.visible = true;
    this.slashMesh.quaternion.copy(this.camera.quaternion);
    this.slashTex.offset.x = f * 0.25;
    this.slashAge++;
  }

  /** 出ている 斬撃の 絵（窓口用） */
  slashes(): NijiSlashInfo[] {
    return this.slashAge >= 0 ? [{ view: this.slashView, angle: this.slashAngle, age: this.slashAge, pos: { x: this.slashMesh.position.x, y: this.slashMesh.position.y, z: this.slashMesh.position.z } }] : [];
  }

  info() {
    // 描画回数: 見えている 物の 数（まく・輪・玉・つぶの 点。斬撃は 別）
    const draws = this.on ? [this.dome, this.ring, this.orb, this.points].filter((o) => o.visible).length : 0;
    return { dome: this.on, tris: this.on ? this.tris : 0, draws, slash: this.slashAge >= 0 };
  }
}
