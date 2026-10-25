/**
 * #293 直し 4: 少女の 間、コアを まもる 虹色の フィールドバリア(オーナー 2026-10-24 20:23)。
 *  ・コアを つつむ 半透明の 球。虹(レジェンダリーの 色)が ゆっくり 流れ、うすく 明滅する。
 *  ・たたかれると はじいた 場所から 波紋が 球の 上を ひろがる(少し ふくらむ)。
 *  ・少女が 出た(固まった)とき 張られ、とどめ・少女が 消えたら 消える。出し入れは `setOn()`。
 * 数は ぜんぶ gashaBigTuning.ts の freeze.barrier。見た目だけ(当たりは gashaBigHit.ts の bodyGuard)。
 */
import { AdditiveBlending, Color, DoubleSide, Mesh, ShaderMaterial, SphereGeometry, Vector4, type Scene } from 'three';
import { RAINBOW_HEX } from '../ui/theme/palette';
import { TUNE as T } from './gashaBigTuning';

const MAX_RIPPLES = 8;

export interface Ripple { x: number; y: number; z: number; age: number }

const VERT = `
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
void main() {
  vLocal = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = `
uniform float uTime;
uniform float uOpacity;
uniform float uFill;
uniform float uFlow;
uniform float uScale;
uniform float uFlicker;
uniform float uFlickerHz;
uniform float uRim;
uniform float uRippleWidth;
uniform float uRippleSpeed;
uniform float uRippleSec;
uniform float uRippleBoost;
uniform vec3 uColors[5];
uniform vec4 uRipples[${MAX_RIPPLES}];
varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDir;
vec3 rainbow(float h) {
  float x = fract(h) * 5.0;
  int i = int(floor(x));
  float f = x - float(i);
  vec3 a = uColors[0]; vec3 b = uColors[1];
  if (i == 1) { a = uColors[1]; b = uColors[2]; }
  else if (i == 2) { a = uColors[2]; b = uColors[3]; }
  else if (i == 3) { a = uColors[3]; b = uColors[4]; }
  else if (i == 4) { a = uColors[4]; b = uColors[0]; }
  return mix(a, b, f);
}
void main() {
  vec3 n = normalize(vNormalW);
  float fres = 1.0 - abs(dot(n, normalize(vViewDir)));
  float rim = pow(clamp(fres, 0.0, 1.0), uRim);
  float hue = vLocal.y * uScale + vLocal.x * uScale * 0.6 + uTime * uFlow;
  vec3 col = rainbow(hue);
  float flick = 1.0 - uFlicker * 0.5 * (1.0 + sin(uTime * uFlickerHz * 6.2831853));
  float ring = 0.0;
  vec3 dir = normalize(vLocal);
  for (int k = 0; k < ${MAX_RIPPLES}; k++) {
    vec4 r = uRipples[k];
    if (r.w < 0.0) continue;
    float ang = acos(clamp(dot(dir, r.xyz), -1.0, 1.0));
    float d = (ang - r.w * uRippleSpeed) / uRippleWidth;
    ring += exp(-d * d) * (1.0 - clamp(r.w / uRippleSec, 0.0, 1.0));
  }
  float a = (uFill + (1.0 - uFill) * rim) * flick + ring * uRippleBoost;
  vec3 c = col * (0.85 + 0.6 * rim) + vec3(1.0) * ring * 0.5;
  gl_FragColor = vec4(c, clamp(a * uOpacity, 0.0, 1.0));
}`;

export class CoreBarrier {
  private readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private readonly rip: Ripple[] = [];
  private on = false;
  private clock = 0;
  private kick = 0;
  private cx = 0; private cy = 0; private cz = 0;

  constructor(private readonly scene: Scene) {
    const B = T.freeze.barrier;
    const colors = RAINBOW_HEX.map((h) => new Color(h));
    this.mat = new ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, fog: false,
      uniforms: {
        uTime: { value: 0 }, uOpacity: { value: B.opacity }, uFill: { value: B.fill }, uFlow: { value: B.flowSpeed }, uScale: { value: B.flowScale },
        uFlicker: { value: B.flickerAmt }, uFlickerHz: { value: B.flickerHz }, uRim: { value: B.rimPower },
        uRippleWidth: { value: B.rippleWidth }, uRippleSpeed: { value: B.rippleSpeed }, uRippleSec: { value: B.rippleSec }, uRippleBoost: { value: B.rippleBoost },
        uColors: { value: colors },
        uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new Vector4(0, 1, 0, -1)) },
      },
    });
    this.mesh = new Mesh(new SphereGeometry(1, 32, 20), this.mat);
    this.mesh.name = 'coreBarrier';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }

  /** 張る / 消す(消すと 波紋も 消える) */
  setOn(on: boolean): void {
    const next = on && T.freeze.barrier.enabled;
    if (next === this.on) return;
    this.on = next;
    if (!next) { this.rip.length = 0; this.kick = 0; }
    this.mesh.visible = next;
  }

  isOn(): boolean { return this.on; }

  /** コアの 中心(世界の 座標) */
  setCenter(x: number, y: number, z: number): void {
    this.cx = x; this.cy = y; this.cz = z;
    this.mesh.position.set(x, y, z);
  }

  /** たたかれた: (x, y, z) の 方向から 波紋を 出す(コアの 中心から 見た 向き) */
  ripple(x: number, y: number, z: number): void {
    if (!this.on) return;
    let dx = x - this.cx, dy = y - this.cy, dz = z - this.cz;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-6) { dx = 0; dy = 1; dz = 0; } else { dx /= l; dy /= l; dz /= l; }
    this.rip.push({ x: dx, y: dy, z: dz, age: 0 });
    if (this.rip.length > T.freeze.barrier.rippleMax) this.rip.shift();
    this.kick = 1;
  }

  update(dt: number): void {
    if (!this.on) return;
    const B = T.freeze.barrier;
    this.clock += dt;
    for (const r of this.rip) r.age += dt;
    for (let i = this.rip.length - 1; i >= 0; i--) if (this.rip[i]!.age >= B.rippleSec) this.rip.splice(i, 1);
    this.kick = Math.max(0, this.kick - dt / Math.max(1e-3, B.rippleSec * 0.35));
    const u = this.mat.uniforms;
    u.uTime!.value = this.clock;
    // 調整表は その場で かえられる(毎コマ 読みなおす)
    u.uOpacity!.value = B.opacity; u.uFill!.value = B.fill; u.uFlow!.value = B.flowSpeed; u.uScale!.value = B.flowScale;
    u.uFlicker!.value = B.flickerAmt; u.uFlickerHz!.value = B.flickerHz; u.uRim!.value = B.rimPower;
    u.uRippleWidth!.value = B.rippleWidth; u.uRippleSpeed!.value = B.rippleSpeed; u.uRippleSec!.value = B.rippleSec; u.uRippleBoost!.value = B.rippleBoost;
    const arr = u.uRipples!.value as Vector4[];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = this.rip[i];
      if (r) arr[i]!.set(r.x, r.y, r.z, r.age); else arr[i]!.set(0, 1, 0, -1);
    }
    this.mesh.scale.setScalar(B.radius * (1 + B.scaleKick * this.kick));
  }

  info(): { on: boolean; ripples: number; radius: number } {
    return { on: this.on, ripples: this.rip.length, radius: T.freeze.barrier.radius };
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
