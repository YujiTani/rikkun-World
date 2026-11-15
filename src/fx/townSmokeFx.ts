import * as THREE from 'three';
import { SMOKE, TownSmoke } from '../town/townSmoke';
import { TOWN } from '../town/townTuning';

/**
 * TOWN-1 1B-2: かじやの えんとつの けむりを 描く。十字に 重ねた 2 まいの 板（たて・よこ）に、8×8 の ドット絵の 丸（黒っぽい 灰色）を 描く。
 * 年を とるほど ドットが ぬけて うすく なり（市松でなく 決まった ならびで ぬく）、色は 少し 明るく なる。半とうめいは 使わない。
 * 描画は InstancedMesh 1 つ（つぶが 1 つでも ある 間だけ +1 回）。毎フレーム new しない。
 */
const MAX = TOWN.perf.smokeMax;

const VERT = `
attribute float aLife;
attribute float aSeed;
varying vec2 vUv;
varying float vLife;
varying float vSeed;
void main() {
  vUv = uv;
  vLife = aLife;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FRAG = `
varying vec2 vUv;
varying float vLife;
varying float vSeed;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 43.1) * 43758.5453); }
void main() {
  vec2 c = floor(vUv * 8.0);
  vec2 d = (c + 0.5) / 8.0 - 0.5;
  float r = length(d) * 2.0;
  if (r > 0.95 - h(c + 3.0) * 0.3) discard;
  if (h(c) < vLife * vLife * 0.95) discard;
  vec3 col = mix(vec3(0.012, 0.012, 0.016), vec3(0.075, 0.08, 0.095), vLife);
  if (h(c + 9.0) > 0.7) col *= 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** 十字の 板 1 組（たて板 ＋ よこ板。1 まい 1 マス 四方） */
function crossGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const h = 0.5;
  const pos = [-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0, 0, -h, -h, 0, -h, h, 0, h, h, 0, h, -h];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return g;
}

export class TownSmokeFx {
  readonly model: TownSmoke;
  private readonly mesh: THREE.InstancedMesh;
  private readonly life: THREE.InstancedBufferAttribute;
  private readonly seed: THREE.InstancedBufferAttribute;
  private readonly dummy = new THREE.Object3D();
  /** いま 見えて いる つぶの 数（テスト窓口 town.smoke()） */
  shown = 0;

  constructor(scene: THREE.Object3D, seed = 2381) {
    this.model = new TownSmoke(seed);
    const geo = crossGeometry();
    this.life = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aLife', this.life);
    geo.setAttribute('aSeed', this.seed);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** 1 ステップ。spot ＝ えんとつの 口の 上（街が なければ null）。eye ＝ 見る 人の 目 */
  update(dt: number, spot: { x: number; y: number; z: number } | null, eye: { x: number; y: number; z: number }): void {
    const near = spot !== null && Math.hypot(eye.x - spot.x, eye.z - spot.z) <= SMOKE.near;
    this.model.update(dt, spot, near);
    let n = 0;
    const d = this.dummy;
    for (const p of this.model.puffs) {
      if (!p.active) continue;
      const k = p.age / p.life;
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(0, p.seed * Math.PI, 0);
      d.scale.setScalar(SMOKE.size0 + (SMOKE.size1 - SMOKE.size0) * k);
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.life.setX(n, k);
      this.seed.setX(n, p.seed);
      n++;
    }
    this.shown = n;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.life.needsUpdate = true;
    this.seed.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
