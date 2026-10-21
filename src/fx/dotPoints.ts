import * as THREE from 'three';

/**
 * WEAPON-8: ドット絵の 点（THREE.Points。正方形）。1 点 = size 個の 点 = size/16 ブロック（画面では 整数 ピクセル）。
 * 土と 草の つぶ・手もとの 光の つぶに 使う。1 つの Points = 描画 1 回。毎フレーム new しない。
 * `dither` は 網の 段（0 = なし、1〜4 = 市松の 斜めの 網で そのぶん ぬく。2 = 半分）。
 */
const VERT = `
attribute vec3 aColor;
attribute float aSize;
attribute float aDither;
uniform float uVh;
varying vec3 vColor;
varying float vDither;
void main() {
  vColor = aColor;
  vDither = aDither;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, floor(aSize / 16.0 * projectionMatrix[1][1] * uVh * 0.5 / max(0.01, -mv.z) + 0.5));
}`;
const FRAG = `
varying vec3 vColor;
varying float vDither;
void main() {
  if (vDither > 0.5) {
    vec2 q = floor(gl_FragCoord.xy / 2.0);
    if (mod(q.x + q.y, 4.0) < vDither) discard;
  }
  gl_FragColor = vec4(vColor, 1.0);
  #include <colorspace_fragment>
}`;

const _size = new THREE.Vector2();

export class DotPoints {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly dith: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private n = 0;

  constructor(readonly max: number, opts: { depthTest?: boolean; renderOrder?: number } = {}) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.dith = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aDither', new THREE.BufferAttribute(this.dith, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uVh: { value: 800 } }, depthWrite: false, depthTest: opts.depthTest ?? true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.renderOrder ?? 60;
    this.points.visible = false;
    this.points.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(_size);
      this.mat.uniforms.uVh!.value = _size.y;
    };
  }

  get count(): number {
    return this.n;
  }

  reset(): void {
    this.n = 0;
  }

  add(x: number, y: number, z: number, c: THREE.Color, size: number, dither = 0): void {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.dith[i] = dither;
  }

  /** 書きおわり。点が 0 なら 描かない（描画 0） */
  done(): void {
    this.points.visible = this.n > 0;
    if (this.n === 0) return;
    for (const k of ['position', 'aColor', 'aSize', 'aDither']) (this.geo.getAttribute(k) as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
