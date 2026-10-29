/**
 * #308 gashaGirl.ts を 分けた もの: 少女の 粒（Points ひとつに 全部。CPU で うごかす）。
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, NormalBlending, Points, ShaderMaterial } from 'three';

const PARTICLE_VS = `
attribute float aSize; attribute vec4 aColor; uniform float uPx; varying vec4 vColor;
void main(){ vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(aSize*uPx/max(gl_Position.w,0.1),0.0,512.0); }`;
const PARTICLE_FS = `
varying vec4 vColor; uniform float uAdd;
void main(){ float d=length(gl_PointCoord-vec2(0.5))*2.0; if(d>1.0) discard; float f=pow(1.0-d,1.6);
  if(uAdd>0.5) gl_FragColor=vec4(vColor.rgb*vColor.a*f,1.0); else gl_FragColor=vec4(vColor.rgb,vColor.a*f); }`;

export class ParticlePool {
  readonly points: Points;
  private readonly n: number;
  private readonly pos: Float32Array; private readonly vel: Float32Array;
  private readonly col: Float32Array; private readonly size: Float32Array;
  private readonly c0: Float32Array; private readonly c1: Float32Array;
  private readonly life: Float32Array; private readonly maxLife: Float32Array;
  private readonly s0: Float32Array; private readonly s1: Float32Array;
  private readonly grav: Float32Array; private readonly drag: Float32Array;
  private next = 0;
  readonly mat: ShaderMaterial;
  constructor(n: number, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
    this.c0 = new Float32Array(n * 3); this.c1 = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.maxLife = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3)); // 配列を コピーしない（毎ステップ 書きかえる）
    geo.setAttribute('aSize', new BufferAttribute(this.size, 1));
    geo.setAttribute('aColor', new BufferAttribute(this.col, 4));
    this.mat = new ShaderMaterial({
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending, uniforms: { uPx: { value: 600 }, uAdd: { value: additive ? 1 : 0 } },
    });
    this.points = new Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c0: number, c1: number, grav = 0, drag = 0): void {
    const i = this.next; this.next = (i + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.grav[i] = grav; this.drag[i] = drag;
    this.c0[i * 3] = ((c0 >> 16) & 255) / 255; this.c0[i * 3 + 1] = ((c0 >> 8) & 255) / 255; this.c0[i * 3 + 2] = (c0 & 255) / 255;
    this.c1[i * 3] = ((c1 >> 16) & 255) / 255; this.c1[i * 3 + 1] = ((c1 >> 8) & 255) / 255; this.c1[i * 3 + 2] = (c1 & 255) / 255;
  }
  update(dt: number): void {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) { this.size[i] = 0; continue; }
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) { this.size[i] = 0; continue; }
      const t = 1 - this.life[i]! / this.maxLife[i]!;
      const dr = 1 - Math.min(1, this.drag[i]! * dt);
      this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1]! * dr + this.grav[i]! * dt;
      for (let k = 0; k < 3; k++) {
        this.pos[i * 3 + k]! += this.vel[i * 3 + k]! * dt;
        this.col[i * 4 + k] = this.c0[i * 3 + k]! + (this.c1[i * 3 + k]! - this.c0[i * 3 + k]!) * t;
      }
      this.col[i * 4 + 3] = (1 - t) * (1 - t * 0.3);
      this.size[i] = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t;
    }
    const g = this.points.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('aSize').needsUpdate = true;
    g.getAttribute('aColor').needsUpdate = true;
  }
  clear(): void { this.life.fill(0); this.size.fill(0); }
}
