import * as THREE from 'three';

/**
 * WEAPON-9 試作（見た目の OK 用。遊びの しくみは 無い）: 虹の ドーム B「にじの おび」＋ 中は くもりガラスの 白・まん中の 白い 玉・地面の 輪・かけら、にじの 斬撃 A。
 * 絵の もとは art/WEAPON-9/final/（build.py）。まく・おびは 球 1 つの シェーダー（1/8 ブロックの 升目・網で 点を ぬく）。
 * 描画 4（まく・輪・玉・かけら）+ 斬撃 1（出した 間だけ）。
 */
const R = 7;
const BASE = './models/fx/';
const SHARDS = 24;

const VERT = `
varying vec3 vP;
varying vec3 vNv;
varying vec3 vVd;
void main() {
  vP = position;
  vNv = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vVd = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform float uT;
varying vec3 vP;
varying vec3 vNv;
varying vec3 vVd;
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
  bool front = gl_FrontFacing;
  float lon = atan(vP.z, vP.x) + PI;
  float ln = clamp((vP.y / ${R.toFixed(1)} + 1.0) * 0.5, 0.0, 1.0);
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

function tex(url: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(url);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 球 16×6 を 地面で 切る（地面より 下の 面を 捨てる） */
function domeGeometry(centerAboveGround: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(R, 16, 6).toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const keepP: number[] = [];
  const keepN: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    let top = -Infinity;
    for (let k = 0; k < 3; k++) top = Math.max(top, pos.getY(i + k));
    if (top < -centerAboveGround - 1e-4) continue;
    for (let k = 0; k < 3; k++) {
      keepP.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      keepN.push(nor.getX(i + k), nor.getY(i + k), nor.getZ(i + k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
  return out;
}

export class NijiProtoFx {
  private readonly group = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;
  private dome: THREE.Mesh | null = null;
  private readonly ring: THREE.Mesh;
  private readonly orb: THREE.Mesh;
  private readonly shards: THREE.Points;
  private readonly slashMesh: THREE.Mesh;
  private readonly slashTex: THREE.Texture;
  private on = false;
  private groundY = 0;
  private t = 0;
  private slashAge = -1;
  private slashFixed = -1;
  private tris = 0;

  constructor(scene: THREE.Scene, private readonly camera: THREE.Camera) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uT: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex(`${BASE}niji_ring.png`), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.ring.renderOrder = 1;
    this.orb = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ map: tex(`${BASE}niji_orb.png`), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    );
    this.orb.renderOrder = 3;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SHARDS * 3), 3));
    const cols: number[] = [];
    const palette = [[1, 0.97, 0.89], [0.37, 0.85, 0.56], [0.31, 0.64, 0.94], [0.82, 0.42, 0.9]];
    for (let i = 0; i < SHARDS; i++) cols.push(...palette[i % 4]!);
    sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.shards = new THREE.Points(sg, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
    this.shards.renderOrder = 4;
    this.slashTex = tex(`${BASE}niji_slash.png`);
    this.slashTex.repeat.set(0.25, 1);
    this.slashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6 * (44 / 64)),
      new THREE.MeshBasicMaterial({ map: this.slashTex, transparent: true, alphaTest: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    this.slashMesh.renderOrder = 5;
    this.slashMesh.visible = false;
    for (const o of [this.ring, this.orb, this.shards, this.slashMesh]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.ring.visible = this.orb.visible = this.shards.visible = false;
    scene.add(this.group);
  }

  private build(centerAboveGround: number): void {
    if (this.dome) {
      this.group.remove(this.dome);
      this.dome.geometry.dispose();
    }
    const g = domeGeometry(centerAboveGround);
    this.tris = g.getAttribute('position').count / 3 + 4; // 球（地面で 切る）+ 輪 2 + 玉 2
    this.dome = new THREE.Mesh(g, this.mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = 2;
    this.group.add(this.dome);
    const rr = Math.sqrt(R * R - centerAboveGround * centerAboveGround);
    const s = (14 * rr) / 6.4;
    this.ring.scale.set(s, 1, s);
  }

  show(on: boolean, groundY: number, centerAboveGround: number): void {
    this.on = on;
    this.groundY = groundY;
    if (on) this.build(centerAboveGround);
    if (this.dome) this.dome.visible = on;
    this.ring.visible = on;
    this.orb.visible = on;
    this.shards.visible = on;
  }

  slash(frame?: number): void {
    this.slashAge = 0;
    this.slashFixed = frame ?? -1;
  }

  /** 1 ステップごと */
  step(center: { x: number; y: number; z: number }, yawDeg: number): void {
    this.t += 1 / 60;
    this.mat.uniforms.uT!.value = this.t;
    const cam = this.camera.position;
    if (this.on) {
      const inside = Math.hypot(cam.x - center.x, cam.y - center.y, cam.z - center.z) < 1.5;
      this.ring.position.set(center.x, this.groundY + 0.03, center.z);
      this.orb.visible = !inside;
      // 玉は カメラの ほうへ 少し 出して（子の 体に うまらない）、カメラに 正面
      const toCam = new THREE.Vector3().subVectors(cam, center).normalize();
      this.orb.position.copy(center).addScaledVector(toCam, 0.4);
      this.orb.quaternion.copy(this.camera.quaternion);
      this.dome?.position.set(center.x, center.y, center.z);
      const p = this.shards.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < SHARDS; i++) {
        const a = i * 2.399963 + 0.7;
        const rad = (0.25 + ((i * 0.37) % 0.65)) * R * 0.9;
        const rise = (i * 0.173 + this.t * 0.12) % 1;
        const y = -2 + rise * 8;
        const rh = Math.sqrt(Math.max(0, rad * rad - y * y * 0.3));
        p.setXYZ(i, center.x + Math.cos(a + this.t * 0.1) * rh, center.y + y, center.z + Math.sin(a + this.t * 0.1) * rh);
      }
      p.needsUpdate = true;
    }
    if (this.slashAge >= 0) {
      const f = this.slashFixed >= 0 ? this.slashFixed : Math.floor(this.slashAge / 4);
      if (f > 3) {
        this.slashAge = -1;
        this.slashMesh.visible = false;
      } else {
        const yaw = (yawDeg * Math.PI) / 180;
        this.slashMesh.visible = true;
        this.slashMesh.position.set(center.x + Math.sin(yaw) * 2.2, center.y + 0.5, center.z - Math.cos(yaw) * 2.2);
        this.slashMesh.quaternion.copy(this.camera.quaternion);
        this.slashTex.offset.x = f * 0.25;
        if (this.slashFixed < 0) this.slashAge++;
      }
    }
  }

  info() {
    return { dome: this.on, groundY: this.groundY, tris: this.tris, slash: this.slashAge >= 0 };
  }
}
