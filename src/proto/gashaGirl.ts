/**
 * #293 試作（開発サーバーだけ）: がしゃどくろ 第二形態（少女）の「ワープ → 詠唱 → 魔法 4 種」。
 * `?proto=gashaGirl` のときだけ main.ts から 読まれる。GLB は リポジトリの proto-assets/ を /__proto-gasha/ から 読む。
 * 少女は 歩かない・走らない（移動は ワープだけ）。ふだんは ゾンビの ように 右うでを 前に 出して 立つ。
 * すべて Game.onUpdate の 固定ステップで 進める。乱数は シード付き。ダメージは なし（見た目だけ）。
 * 魔法 1: 背面か 左横へ ワープ → プレイヤーの 足もとに 噴き出す / 2: 真後ろ → 周囲攻撃（渦）/
 * 3: 距離を とって → 火の玉 10 連射（ホーミング）/ 4: 距離を とって → 青い 弾の 扇（へびのように ゆれる・追尾なし）
 */
import {
  AdditiveBlending, Box3, BufferGeometry, CanvasTexture, CircleGeometry, Color, DoubleSide, Float32BufferAttribute, Group, LoopOnce,
  AnimationClip, AnimationMixer, Mesh, MeshBasicMaterial, NormalBlending, Object3D, PerspectiveCamera, PlaneGeometry, Points, Quaternion,
  Scene, ShaderMaterial, SRGBColorSpace, Vector3, type Camera, type Material, type MeshStandardMaterial, type SkinnedMesh, type Bone,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GashaGirlDeps {
  scene: Scene;
  camera: Camera;
  onUpdate(fn: (dt: number) => void): void;
  /** 描く 直前（カメラを 上書きする 用） */
  onBeforeRender(fn: () => void): void;
  player(): { x: number; y: number; z: number; yawDeg: number };
  groundY(x: number, z: number): number;
  solid(x: number, y: number, z: number): boolean;
}

/** りっくんは 1.8 ブロック */
export const GIRL_HEIGHTS = [3.0]; // yuzu 2026-10-23: 3.0 ブロックに 決定
const GAP = 2.6;
const D2R = Math.PI / 180;

const tmpV = new Vector3();
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();

function aimBone(bone: Object3D, child: Object3D, dir: Vector3): void {
  bone.updateWorldMatrix(true, true);
  const a = bone.getWorldPosition(new Vector3());
  const cur = child.getWorldPosition(tmpV).sub(a).normalize();
  const delta = tmpQ.setFromUnitVectors(cur, dir.clone().normalize());
  const wq = bone.getWorldQuaternion(tmpQ2).premultiply(delta);
  const pq = bone.parent!.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateWorldMatrix(false, true);
}

function rotateWorld(bone: Object3D, axis: Vector3, rad: number): void {
  bone.updateWorldMatrix(true, true);
  const delta = tmpQ.setFromAxisAngle(axis, rad);
  const wq = bone.getWorldQuaternion(tmpQ2).premultiply(delta);
  const pq = bone.parent!.getWorldQuaternion(new Quaternion());
  bone.quaternion.copy(pq.invert().multiply(wq));
  bone.updateWorldMatrix(false, true);
}

/** ゾンビの ように 右うでを 前へ。model の まえ = +Z */
function poseZombie(root: Object3D, front: Vector3): void {
  const b = (n: string) => root.getObjectByName(n) as Bone;
  const down = new Vector3(0, -1, 0);
  const left = new Vector3().crossVectors(new Vector3(0, 1, 0), front);
  root.updateMatrixWorld(true);
  aimBone(b('RightArm'), b('RightForeArm'), front.clone());
  aimBone(b('RightForeArm'), b('RightHand'), front.clone().multiplyScalar(0.96).addScaledVector(down, 0.28));
  aimBone(b('LeftArm'), b('LeftForeArm'), down.clone().addScaledVector(left, 0.12));
  aimBone(b('LeftForeArm'), b('LeftHand'), down.clone().addScaledVector(left, 0.05));
  rotateWorld(b('Head'), new Vector3().crossVectors(front, new Vector3(0, 1, 0)).normalize(), 0.3);
}

// ---------- 乱数（シード付き。state を 外に 持って、さきよみ できる） ----------
function mulberry(s: number): [number, number] {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}

// ---------- 絵（canvas で 作る） ----------
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** 白っぽい ふち ぼかしの 光の 玉（色は 材料の color で つける） */
function makeGlowTex(): CanvasTexture {
  return canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  });
}

/** 白〜灰の 輪（中は うすく うまっている） */
function makeRingTex(): CanvasTexture {
  return canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.95)'); g.addColorStop(0.88, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
}

/** たてに 細長い とがった 炎の 絵（下が ふとい） */
function makeFlameTex(outer: string, mid: string, core: string, seed: number): CanvasTexture {
  return canvasTex(64, 256, (c) => {
    let rs = seed;
    const layers: [string, number][] = [[outer, 1], [mid, 0.62], [core, 0.28]];
    const curve = 9 + seed % 3;
    for (const [col, w] of layers) {
      c.shadowColor = col; c.shadowBlur = 8;
      const g = c.createLinearGradient(0, 256, 0, 0);
      g.addColorStop(0, col); g.addColorStop(0.7, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(32 - w * 24, 252);
      c.bezierCurveTo(32 - w * 28, 170, 32 - w * 8 + curve, 70, 32 + curve * 1.5, 8);
      c.bezierCurveTo(32 + w * 8 + curve, 70, 32 + w * 28, 170, 32 + w * 24, 252);
      c.closePath(); c.fill();
      rs = mulberry(rs)[0];
    }
  });
}

/** 上から 見た 渦の 炎（オレンジ〜黄〜白の 帯 6 本、外は ちぎれた 舌と 火の粉） */
function makeVortexTex(): CanvasTexture {
  const N = 512, R = 240;
  return canvasTex(N, N, (c) => {
    let rs = 12345;
    const rnd = () => { const [s, v] = mulberry(rs); rs = s; return v; };
    c.translate(N / 2, N / 2);
    c.globalCompositeOperation = 'lighter';
    const ARMS = 6;
    for (let k = 0; k < ARMS; k++) {
      const th0 = (k / ARMS) * Math.PI * 2;
      for (let i = 0; i < 150; i++) {
        const u = 0.08 + (i / 150) * 0.92;
        const th = th0 + u * 4.2 + Math.sin(u * 18 + k) * 0.06;
        const r = u * R;
        const w = 4 + 20 * u * (0.7 + 0.3 * Math.sin(u * 9 + k * 2));
        const tear = u > 0.65 && rnd() < (u - 0.55) * 1.2; // 外ほど ちぎれる
        const x = Math.cos(th) * r, y = Math.sin(th) * r;
        const a = tear ? 0.08 : 1;
        for (const [col, s] of [['rgba(255,90,10,0.30)', 1], ['rgba(255,190,50,0.45)', 0.6], ['rgba(255,255,225,0.6)', 0.26]] as const) {
          c.fillStyle = col.replace(/[\d.]+\)$/, `${parseFloat(col.slice(col.lastIndexOf(',') + 1)) * a})`);
          c.beginPath(); c.arc(x, y, w * s, 0, Math.PI * 2); c.fill();
        }
        if (u > 0.7 && rnd() < 0.18) { // 外へ のびる 舌
          c.strokeStyle = 'rgba(255,150,30,0.6)'; c.lineWidth = 2 + rnd() * 3;
          c.beginPath(); c.moveTo(x, y);
          c.quadraticCurveTo(Math.cos(th + 0.3) * (r + 18), Math.sin(th + 0.3) * (r + 18), Math.cos(th + 0.45) * (r + 36 * rnd()), Math.sin(th + 0.45) * (r + 36 * rnd()));
          c.stroke();
        }
      }
    }
    for (let i = 0; i < 60; i++) { // 火の粉
      const a = rnd() * Math.PI * 2, r = (0.5 + rnd() * 0.5) * R;
      c.fillStyle = 'rgba(255,200,90,0.8)'; c.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2);
    }
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 30); // 中心の 白い 光
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,200,100,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 30, 0, Math.PI * 2); c.fill();
    c.globalCompositeOperation = 'destination-in'; // ふちを 消す
    const m = c.createRadialGradient(0, 0, R * 0.8, 0, 0, N / 2);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = m; c.fillRect(-N / 2, -N / 2, N, N);
  });
}

// ---------- 粒（Points ひとつに 全部。CPU で うごかす） ----------
const PARTICLE_VS = `
attribute float aSize; attribute vec4 aColor; uniform float uPx; varying vec4 vColor;
void main(){ vColor=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(aSize*uPx/max(gl_Position.w,0.1),0.0,512.0); }`;
const PARTICLE_FS = `
varying vec4 vColor; uniform float uAdd;
void main(){ float d=length(gl_PointCoord-vec2(0.5))*2.0; if(d>1.0) discard; float f=pow(1.0-d,1.6);
  if(uAdd>0.5) gl_FragColor=vec4(vColor.rgb*vColor.a*f,1.0); else gl_FragColor=vec4(vColor.rgb,vColor.a*f); }`;

class ParticlePool {
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
    geo.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new Float32BufferAttribute(this.size, 1));
    geo.setAttribute('aColor', new Float32BufferAttribute(this.col, 4));
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
    (g.getAttribute('position') as Float32BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as Float32BufferAttribute).needsUpdate = true;
    (g.getAttribute('aColor') as Float32BufferAttribute).needsUpdate = true;
  }
  clear(): void { this.life.fill(0); this.size.fill(0); }
}

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export interface GashaGirlHandle {
  place(opts?: { groundY?: number; shift?: number; side?: boolean }): void;
  figures: Group[];
  labels(riky: { x: number; y: number; z: number }, w: number, h: number): { x: number; y: number }[];
  phase(): string;
  /** 立ち姿の 数えなおし（撮影用） */
  standNow(): void;
  setSeed(n: number): void;
  warpNow(spell?: number): void;
  camera(mode: 'overview' | 'default'): void;
  /** 次に 使う 魔法を 決める（1〜4。撮影用） */
  nextSpell(n: number): void;
  /** 次の 魔法 1 の ワープ先が 左横か（シードの さきよみ） */
  predictSide(): 'left' | 'back';
  info(): Record<string, number | string>;
}

const CLIP_FIRE = 0.7; // 詠唱の 70% ごろに 魔法を 出す
const FB_COUNT = 10, FB_GAP = 0.09, FB_ORB_GAP = 0.1, FB_SPEED = 14, FB_TURN = 120 * D2R, FB_STOP_NEAR = 3, FB_HOMING_MAX = 2.5, FB_LIFE = 4;
const WAVE_COUNT = 10, WAVE_FAN = 80 * D2R, WAVE_SPEED = 6, WAVE_AMP = 0.6, WAVE_HZ = 1.5, WAVE_RANGE = 14, WAVE_LIFE = 3;
const HIT_R = 0.6;
const SPELLS = 4;

export function startGashaGirl(deps: GashaGirlDeps): void {
  new GLTFLoader().load(
    './__proto-gasha/girl-rig/girl-cast.glb',
    (gltf) => {
      void import('three/examples/jsm/utils/SkeletonUtils.js').then(({ clone }) => build(deps, gltf.scene, gltf.animations[0]!, clone));
    },
    undefined,
    (e) => console.warn('[proto gashaGirl] 読めません', e),
  );
}

function build(deps: GashaGirlDeps, src: Object3D, clip: AnimationClip, clone: (o: Object3D) => Object3D): void {
  const scene = deps.scene;
  const front = new Vector3(0, 0, 1);
  const H = GIRL_HEIGHTS[0]!;

  // ---- 少女 ----
  const model = clone(src);
  poseZombie(model, front);
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model, true);
  model.scale.multiplyScalar(H / (box.max.y - box.min.y));
  model.updateMatrixWorld(true);
  model.position.y -= new Box3().setFromObject(model, true).min.y;
  const mats: MeshBasicMaterial[] = [];
  model.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
    const mesh = o as Mesh;
    if (mesh.isMesh) {
      const old = mesh.material as MeshStandardMaterial;
      const m = new MeshBasicMaterial({ map: old.map, color: 0xffffff, transparent: true, opacity: 1, alphaTest: old.alphaTest });
      mesh.material = m; mats.push(m);
    }
  });
  const pivot = new Group();
  pivot.add(model);
  scene.add(pivot);
  // 立ち姿の ポーズを 保存（詠唱のあと もどす）
  const standPose: { bone: Object3D; q: Quaternion; p: Vector3 }[] = [];
  model.traverse((o) => { if ((o as Bone).isBone) standPose.push({ bone: o, q: o.quaternion.clone(), p: o.position.clone() }); });
  const restorePose = () => standPose.forEach((s) => { s.bone.quaternion.copy(s.q); s.bone.position.copy(s.p); });
  const mixer = new AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
  const CLIP_DUR = clip.duration;
  const hand = model.getObjectByName('RightHand')!;
  const y0 = model.position.y;

  // ---- 粒・絵 ----
  const add = new ParticlePool(3000, true);
  const smoke = new ParticlePool(400, false);
  scene.add(add.points, smoke.points);
  const glowTex = makeGlowTex(), ringTex = makeRingTex(), vortexTex = makeVortexTex();
  const bladeTex = makeFlameTex('rgba(150,50,230,1)', 'rgba(220,130,255,1)', 'rgba(255,245,255,1)', 3);
  const flameTex = makeFlameTex('rgba(255,90,10,1)', 'rgba(255,200,60,1)', 'rgba(255,255,230,1)', 7);
  const basic = (map: CanvasTexture, color = 0xffffff, opacity = 1): MeshBasicMaterial => new MeshBasicMaterial({
    map, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const disc = new CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  const plane = new PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const flat = (mat: Material, parent: Object3D): Mesh => { const m = new Mesh(disc, mat); m.renderOrder = 3; m.visible = false; parent.add(m); return m; };
  const crossed = (mat: Material, parent: Object3D): Group => {
    const g = new Group();
    const a = new Mesh(plane, mat), b = new Mesh(plane, mat);
    b.rotation.y = Math.PI / 2; a.renderOrder = b.renderOrder = 4;
    g.add(a, b); g.visible = false; parent.add(g);
    return g;
  };

  // ---- 乱数 ----
  let rs = 1, vs = 99;
  const rng = () => { const [s, v] = mulberry(rs); rs = s; return v; };
  const vrng = () => { const [s, v] = mulberry(vs); vs = s; return v; };
  const vr = (a: number, b: number) => a + (b - a) * vrng();

  // ---- 魔法 1: 噴き出す（紫の 輪 → 炎の 刃） ----
  const ER = { root: new Group(), t: -1, ring: null as unknown as Mesh, flash: null as unknown as Mesh,
    blades: [] as { outer: Group; inner: Group; h: number; w: number; start: number; lean: number; ph: number }[], count: 6, x: 0, y: 0, z: 0 };
  scene.add(ER.root);
  const ringMat = basic(ringTex, 0xa040ff, 0), flashMat = basic(glowTex, 0xe8c8ff, 0), bladeMat = basic(bladeTex, 0xf0e4ff, 0.95);
  ER.ring = flat(ringMat, ER.root); ER.flash = flat(flashMat, ER.root);
  for (let i = 0; i < 9; i++) {
    const outer = new Group(); const inner = crossed(bladeMat, outer); outer.add(inner); ER.root.add(outer); outer.visible = false;
    ER.blades.push({ outer, inner, h: 2, w: 0.5, start: 0.9, lean: 0.3, ph: 0 });
  }
  const fireEruption = (x: number, z: number) => {
    ER.x = x; ER.z = z; ER.y = deps.groundY(Math.floor(x), Math.floor(z)) + 1.04;
    ER.root.position.set(x, ER.y, z); ER.t = 0;
    ER.count = 7 + Math.floor(vrng() * 3);
    ER.blades.forEach((b, i) => {
      b.h = vr(3.0, 4.0); b.w = vr(0.7, 0.95); b.start = 0.9 + i * 0.025 + vr(0, 0.05); b.lean = vr(0.05, 0.14); b.ph = vr(0, 6);
      const ph = (i / ER.count) * Math.PI * 2 + vr(-0.3, 0.3), r = vr(0.15, 0.9);
      b.outer.position.set(Math.cos(ph) * r, 0, -Math.sin(ph) * r);
      b.outer.rotation.y = ph;
    });
  };
  const updateEruption = (dt: number) => {
    if (ER.t < 0) return;
    const t = (ER.t += dt);
    if (t > 2.7) { ER.t = -1; ER.root.visible = false; ER.ring.visible = ER.flash.visible = false; ER.blades.forEach((b) => (b.outer.visible = false)); return; }
    ER.root.visible = true;
    const rad = t < 0.8 ? 2.2 * easeOut(t / 0.8) : 2.2 + 0.5 * ((t - 0.8) / 1.9);
    ER.ring.visible = true; ER.ring.scale.set(rad, 1, rad);
    ringMat.opacity = Math.min(1, t / 0.4) * 0.9 * (t > 1.8 ? 1 - (t - 1.8) / 0.9 : 1);
    const fl = clamp01(1 - Math.abs(t - 0.9) / 0.3);
    ER.flash.visible = fl > 0; ER.flash.scale.setScalar(0.8 + 2.2 * easeOut((t - 0.6) / 0.5)); flashMat.opacity = fl * 1.3;
    if (t < 0.8) for (let k = 0; k < 3; k++) { // 火の粉が 内向きに あつまる
      const a = vr(0, Math.PI * 2), r = vr(2.6, 3.2);
      add.emit(ER.x + Math.cos(a) * r, ER.y + vr(0, 0.5), ER.z + Math.sin(a) * r, -Math.cos(a) * 3.2, 0.3, -Math.sin(a) * 3.2, 0.7, 0.14, 0.06, 0xf0e0ff, 0x9040e0);
    }
    for (let i = 0; i < ER.blades.length; i++) {
      const b = ER.blades[i]!;
      const on = i < ER.count && t > b.start && t < b.start + 1.25;
      b.outer.visible = on; b.inner.visible = on;
      if (!on) continue;
      const u = t - b.start;
      const g = u < 0.25 ? easeOut(u / 0.25) : u > 0.9 ? 1 - (u - 0.9) / 0.35 : 1;
      const fk = 1 + 0.07 * Math.sin(t * 28 + b.ph);
      b.inner.scale.set(b.w * g + 0.05, Math.max(0.01, b.h * g * fk), b.w * g + 0.05);
      b.inner.rotation.z = -(b.lean * (0.4 + 0.6 * g));
    }
    if (t > 0.95 && t < 1.7) for (let k = 0; k < 2; k++) add.emit(ER.x + vr(-0.6, 0.6), ER.y + vr(0, 1), ER.z + vr(-0.6, 0.6), vr(-0.8, 0.8), vr(1.5, 4), vr(-0.8, 0.8), 0.8, 0.12, 0.04, 0xe0b0ff, 0x6020b0, -1);
    if (t > 1.2 && t < 2.2) {
      for (let k = 0; k < 2; k++) smoke.emit(ER.x + vr(-0.6, 0.6), ER.y + 0.3, ER.z + vr(-0.6, 0.6), vr(-0.5, 0.5), vr(1, 2), vr(-0.5, 0.5), 1.1, 0.5, 1.3, 0x2a1838, 0x050208, 0, 0.5);
      add.emit(ER.x + vr(-0.8, 0.8), ER.y + 0.3, ER.z + vr(-0.8, 0.8), vr(-0.6, 0.6), vr(2, 4), vr(-0.6, 0.6), 1, 0.1, 0.03, 0xd8a0ff, 0x501090);
    }
  };

  // ---- 魔法 2: 周囲攻撃（渦） ----
  const VX = { root: new Group(), spin: new Group(), t: -1, x: 0, y: 0, z: 0 };
  VX.root.add(VX.spin); scene.add(VX.root);
  const vMat1 = basic(vortexTex, 0xffffff, 0), vMat2 = basic(vortexTex, 0xffc080, 0), coreMat = basic(glowTex, 0xfff0c0, 0), tongueMat = basic(flameTex, 0xffffff, 0);
  const vDisc1 = flat(vMat1, VX.spin), vDisc2 = flat(vMat2, VX.spin), vCore = flat(coreMat, VX.root);
  vDisc2.position.y = 0.02;
  const TONGUES = 16;
  const tongues: { g: Group; r: number; h: number; ph: number }[] = [];
  for (let i = 0; i < TONGUES; i++) {
    const g = crossed(tongueMat, VX.spin);
    const a = (i / TONGUES) * Math.PI * 2 + vr(-0.1, 0.1);
    tongues.push({ g, r: vr(0.88, 1.0), h: vr(0.7, 1.5), ph: a });
    g.position.set(Math.cos(a), 0, Math.sin(a));
  }
  const VR = 5.5;
  const fireVortex = (x: number, z: number) => {
    VX.x = x; VX.z = z; VX.y = deps.groundY(Math.floor(x), Math.floor(z)) + 1.05;
    VX.root.position.set(x, VX.y, z); VX.t = 0;
  };
  const updateVortex = (dt: number) => {
    if (VX.t < 0) return;
    const t = (VX.t += dt);
    if (t > 2.6) { VX.t = -1; VX.root.visible = false; vDisc1.visible = vDisc2.visible = vCore.visible = false; tongues.forEach((q) => (q.g.visible = false)); return; }
    VX.root.visible = true;
    const e = t < 0.3 ? easeOut(t / 0.3) : 1;
    const a = Math.min(1, t / 0.2) * (t > 2.1 ? 1 - (t - 2.1) / 0.5 : 1);
    const r = VR * Math.max(0.05, e);
    VX.spin.rotation.y = t * 3;
    vDisc1.visible = vDisc2.visible = vCore.visible = true;
    vDisc1.scale.set(r, 1, r); vDisc2.scale.set(r * 0.9, 1, r * 0.9); vDisc2.rotation.y = -t * 5; // 逆まわり
    vMat1.opacity = a * 0.95; vMat2.opacity = a * 0.5; tongueMat.opacity = a;
    vCore.scale.setScalar(0.6 + 0.15 * Math.sin(t * 20)); coreMat.opacity = a;
    for (const q of tongues) {
      q.g.visible = true;
      q.g.position.set(Math.cos(q.ph) * r * q.r, 0, Math.sin(q.ph) * r * q.r);
      q.g.rotation.y = -q.ph;
      const f = (1 + 0.3 * Math.sin(t * 17 + q.ph * 5)) * e * (t > 2.1 ? 1 - (t - 2.1) / 0.5 : 1);
      q.g.scale.set(0.8, Math.max(0.01, q.h * f), 0.8);
    }
    if (t < 2.2) for (let k = 0; k < 4; k++) {
      const an = vr(0, Math.PI * 2), rr = vr(1, VR) * e;
      add.emit(VX.x + Math.cos(an) * rr, VX.y + 0.1, VX.z + Math.sin(an) * rr, -Math.sin(an) * 2, vr(1.5, 3.5), Math.cos(an) * 2, 0.7, 0.12, 0.04, 0xffd070, 0xc03000, -1);
    }
  };

  // ---- 弾（魔法 3: 火の玉 / 魔法 4: 青い 波） ----
  interface Proj { on: boolean; kind: 0 | 1; pos: Vector3; dir: Vector3; age: number; homing: boolean; org: Vector3; perp: Vector3; ph: number; amp: number; }
  const projs: Proj[] = [];
  for (let i = 0; i < 24; i++) projs.push({ on: false, kind: 0, pos: new Vector3(), dir: new Vector3(), age: 0, homing: true, org: new Vector3(), perp: new Vector3(), ph: 0, amp: 0 });
  const burstRing = new Mesh(disc, basic(ringTex));
  void burstRing;
  const bursts: { mesh: Mesh; mat: MeshBasicMaterial; t: number; size: number; on: boolean }[] = [];
  for (let i = 0; i < 12; i++) {
    const mat = basic(ringTex, 0xffffff, 0);
    const mesh = flat(mat, scene);
    bursts.push({ mesh, mat, t: 0, size: 1, on: false });
  }
  let nBurst = 0;
  const burst = (p: Vector3, kind: 0 | 1) => {
    const b = bursts[nBurst++ % bursts.length]!;
    b.on = true; b.t = 0; b.size = kind === 0 ? 1.4 : 0.8;
    b.mat.color.setHex(kind === 0 ? 0xff8a20 : 0x60b8ff);
    b.mesh.position.set(p.x, Math.max(p.y, deps.groundY(Math.floor(p.x), Math.floor(p.z)) + 1.06), p.z);
    b.mesh.visible = true;
    const n = kind === 0 ? 14 : 8;
    add.emit(p.x, p.y, p.z, 0, 0, 0, 0.25, kind === 0 ? 2.6 : 1.4, 0.4, kind === 0 ? 0xfff0c0 : 0xe0f8ff, kind === 0 ? 0xff7010 : 0x3070ff);
    for (let k = 0; k < n; k++) add.emit(p.x, p.y, p.z, vr(-2.5, 2.5), vr(0.5, 3.5), vr(-2.5, 2.5), vr(0.4, 0.8), 0.14, 0.04, kind === 0 ? 0xffc060 : 0xb0e0ff, kind === 0 ? 0xc03000 : 0x2040c0, -6, 0.5);
    if (kind === 0) for (let k = 0; k < 4; k++) smoke.emit(p.x + vr(-0.3, 0.3), p.y, p.z + vr(-0.3, 0.3), vr(-0.4, 0.4), vr(0.6, 1.4), vr(-0.4, 0.4), 0.9, 0.5, 1.2, 0x40281a, 0x100808, 0, 0.5);
  };
  const stats = { fbHit: 0, fbMiss: 0, waveHit: 0, waveMiss: 0, fired: 0 };
  const chestOf = (p: { x: number; y: number; z: number }, out: Vector3) => out.set(p.x, p.y + 1.2, p.z);
  const chest = new Vector3(), want = new Vector3(), axis = new Vector3();
  const updateProjs = (dt: number) => {
    const pl = deps.player();
    chestOf(pl, chest);
    for (const q of projs) {
      if (!q.on) continue;
      q.age += dt;
      if (q.kind === 0) {
        if (q.homing && (q.age > FB_HOMING_MAX || q.pos.distanceTo(chest) < FB_STOP_NEAR)) q.homing = false;
        if (q.homing) {
          want.copy(chest).sub(q.pos).normalize();
          const ang = Math.acos(Math.min(1, Math.max(-1, q.dir.dot(want))));
          const turn = FB_TURN * dt;
          if (ang <= turn) q.dir.copy(want);
          else { axis.crossVectors(q.dir, want); if (axis.lengthSq() > 1e-8) q.dir.applyAxisAngle(axis.normalize(), turn); }
          q.dir.normalize();
        }
        q.pos.addScaledVector(q.dir, FB_SPEED * dt);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 0.55, 0.55, 0xfff6c8, 0xffe080);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 1.2, 1.2, 0xff8a20, 0xff6010);
        for (let k = 0; k < 2; k++) add.emit(q.pos.x + vr(-0.06, 0.06), q.pos.y + vr(-0.06, 0.06), q.pos.z + vr(-0.06, 0.06), vr(-0.2, 0.2), vr(0, 0.5), vr(-0.2, 0.2), 0.4, 0.5, 0.08, 0xff9a30, 0x601000);
        const hit = q.pos.distanceTo(chest) < HIT_R;
        const ground = deps.solid(Math.floor(q.pos.x), Math.floor(q.pos.y), Math.floor(q.pos.z));
        if (hit || ground || q.age >= FB_LIFE) { q.on = false; burst(q.pos, 0); if (hit) stats.fbHit++; else stats.fbMiss++; }
      } else {
        const d = WAVE_SPEED * q.age;
        q.pos.copy(q.org).addScaledVector(q.dir, d).addScaledVector(q.perp, q.amp * Math.sin(Math.PI * 2 * WAVE_HZ * q.age + q.ph));
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 0.5, 0.5, 0xeaffff, 0xa0e0ff);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 1.0, 1.0, 0x60b0ff, 0x3070ff);
        for (let k = 0; k < 2; k++) add.emit(q.pos.x, q.pos.y, q.pos.z, vr(-0.15, 0.15), vr(-0.15, 0.15), vr(-0.15, 0.15), 0.55, 0.45, 0.08, 0x4aa8ff, 0x1020a0);
        if (vrng() < 0.35) add.emit(q.pos.x, q.pos.y, q.pos.z, vr(-0.5, 0.5), vr(-0.4, 0.4), vr(-0.5, 0.5), 0.9, 0.14, 0.04, 0x90d0ff, 0x2040c0);
        const hit = q.pos.distanceTo(chest) < HIT_R;
        const ground = deps.solid(Math.floor(q.pos.x), Math.floor(q.pos.y), Math.floor(q.pos.z));
        if (hit || ground || d >= WAVE_RANGE || q.age >= WAVE_LIFE) { q.on = false; if (hit || ground) burst(q.pos, 1); if (hit) stats.waveHit++; else stats.waveMiss++; }
      }
    }
    for (const b of bursts) {
      if (!b.on) continue;
      b.t += dt;
      const u = b.t / 0.45;
      if (u >= 1) { b.on = false; b.mesh.visible = false; continue; }
      const s = b.size * (0.2 + 0.8 * easeOut(u));
      b.mesh.scale.set(s, 1, s); b.mat.opacity = 1 - u;
    }
  };
  const spawnProj = (kind: 0 | 1, from: Vector3, dir: Vector3, amp = 0, ph = 0) => {
    const q = projs.find((p) => !p.on);
    if (!q) return;
    q.on = true; q.kind = kind; q.age = 0; q.homing = true; q.pos.copy(from); q.org.copy(from); q.dir.copy(dir).normalize();
    q.perp.set(-q.dir.z, 0, q.dir.x).normalize(); q.amp = amp; q.ph = ph; stats.fired++;
  };

  // ---- 少女の 流れ ----
  type Phase = 'stand' | 'vanish' | 'appear' | 'cast';
  let phase: Phase = 'stand', pt = 0, spell = 0;
  let side: 'left' | 'back' = 'back', dist = 4.5, ang = 0;
  let fbShots = 0, fired = false, mixerLeft = 0, castLen = CLIP_DUR, forced = -1;
  let t = 0;
  const tele = new Vector3();
  const fwdOf = (p: { yawDeg: number }) => { const y = p.yawDeg * D2R; return { fx: Math.sin(y), fz: -Math.cos(y), rx: Math.cos(y), rz: Math.sin(y) }; };
  const faceTo = (p: { x: number; z: number }) => { pivot.rotation.y = Math.atan2(p.x - pivot.position.x, p.z - pivot.position.z); };
  const fade = (k: number) => { // k: 0 = 見える、1 = 消えた
    mats.forEach((m) => (m.opacity = 1 - k));
    pivot.scale.set(1 - 0.5 * k, 1 + 0.25 * k, 1 - 0.5 * k);
  };
  const purpleBurst = (n: number) => {
    const c = pivot.position;
    for (let i = 0; i < n; i++) add.emit(c.x + vr(-0.5, 0.5), c.y + vr(0, H), c.z + vr(-0.5, 0.5), vr(-2, 2), vr(-1, 3), vr(-2, 2), vr(0.4, 0.9), 0.2, 0.05, 0xf0d8ff, 0x6020c0, -1.5, 0.5);
  };
  const chooseWarp = () => {
    spell = forced >= 0 ? forced : Math.floor(rng() * SPELLS); forced = -1;
    if (spell === 0) { side = rng() < 0.5 ? 'left' : 'back'; dist = 4 + rng(); }
    else if (spell === 1) { side = 'back'; dist = 4 + rng(); }
    else { ang = (rng() * 2 - 1) * 60 * D2R; dist = 10 + 2 * rng(); }
  };
  const teleport = () => {
    const p = deps.player(); const f = fwdOf(p);
    let dx: number, dz: number;
    if (spell >= 2) { dx = f.fx * Math.cos(ang) + f.rx * Math.sin(ang); dz = f.fz * Math.cos(ang) + f.rz * Math.sin(ang); }
    else if (side === 'left') { dx = -f.rx; dz = -f.rz; } else { dx = -f.fx; dz = -f.fz; }
    const x = p.x + dx * dist, z = p.z + dz * dist;
    tele.set(x, deps.groundY(Math.floor(x), Math.floor(z)) + 1, z);
    pivot.position.copy(tele);
    faceTo(p);
  };
  const startCast = () => {
    phase = 'cast'; pt = 0; fired = false; fbShots = 0; castLen = CLIP_DUR;
    action.reset(); action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.fadeIn(0.15).play();
    mixerLeft = 1e9;
  };
  const endCast = () => {
    action.fadeOut(0.15);
    mixerLeft = 0.2;
    phase = 'stand'; pt = 0; 
  };
  const handPos = (out: Vector3) => hand.getWorldPosition(out);
  const hp = new Vector3(), dirV = new Vector3();
  const fire = () => {
    const p = deps.player();
    if (spell === 0) fireEruption(p.x, p.z);
    else if (spell === 1) fireVortex(pivot.position.x, pivot.position.z);
    else if (spell === 3) {
      handPos(hp); chestOf(p, chest);
      const base = Math.atan2(chest.x - hp.x, chest.z - hp.z); // +Z 基準の 向き
      const pit = Math.atan2(chest.y - hp.y, Math.hypot(chest.x - hp.x, chest.z - hp.z));
      for (let i = 0; i < WAVE_COUNT; i++) {
        const a = base + (i / (WAVE_COUNT - 1) - 0.5) * WAVE_FAN;
        dirV.set(Math.sin(a) * Math.cos(pit), Math.sin(pit), Math.cos(a) * Math.cos(pit));
        spawnProj(1, hp, dirV, WAVE_AMP, i * 1.3);
      }
      purpleBurstAt(hp, 0x80c0ff);
    }
  };
  const purpleBurstAt = (c: Vector3, col: number) => { for (let i = 0; i < 10; i++) add.emit(c.x, c.y, c.z, vr(-1.5, 1.5), vr(-1, 1.5), vr(-1.5, 1.5), 0.5, 0.18, 0.04, 0xffffff, col); };
  const orbPos = (i: number, out: Vector3) => { // 少女の まわりに うかぶ 火の玉（前がわの 半円）
    const a = ((i / (FB_COUNT - 1)) - 0.5) * 2 * 120 * D2R + pivot.rotation.y;
    const r = 1.5 + 0.1 * Math.sin(t * 2 + i);
    return out.set(pivot.position.x + Math.sin(a) * r, pivot.position.y + H * (0.66 + 0.2 * (i % 3) / 2) + 0.15 * Math.sin(t * 3 + i * 1.7), pivot.position.z + Math.cos(a) * r);
  };
  const shootFireball = (i: number) => {
    const p = deps.player(); orbPos(i, hp); chestOf(p, chest);
    const h = Math.atan2(chest.x - hp.x, chest.z - hp.z) + (i % 2 ? 1 : -1) * vr(0.1, 0.4);
    const pit = 0.25;
    dirV.set(Math.sin(h) * Math.cos(pit), Math.sin(pit), Math.cos(h) * Math.cos(pit));
    spawnProj(0, hp, dirV);
    add.emit(hp.x, hp.y, hp.z, 0, 0, 0, 0.2, 1.6, 0.3, 0xfff0c0, 0xff7010);
  };

  // ---- 毎ステップ ----
  const camTarget = { pos: new Vector3(), look: new Vector3(), init: false };
  let camMode: 'overview' | 'default' = 'default';
  deps.onUpdate((dt) => {
    t += dt; pt += dt;
    const p = deps.player();
    if (phase === 'stand') {
      model.position.y = y0 + Math.sin(t * 1.6) * 0.02; model.position.x = Math.sin(t * 0.9) * 0.03;
      faceTo(p);
      if (pt >= 2.0) { chooseWarp(); phase = 'vanish'; pt = 0; purpleBurst(24); }
    } else if (phase === 'vanish') {
      fade(clamp01(pt / 0.4));
      if (pt >= 0.4) { teleport(); phase = 'appear'; pt = 0; fade(1); purpleBurst(24); }
    } else if (phase === 'appear') {
      faceTo(p); fade(1 - clamp01(pt / 0.4));
      if (pt >= 0.4) { fade(0); startCast(); }
    } else {
      faceTo(p);
      if (spell === 2) castLen = Math.max(CLIP_DUR, CLIP_FIRE * CLIP_DUR + FB_COUNT * FB_GAP + 0.4);
      if (!fired && pt >= CLIP_FIRE * CLIP_DUR) { fired = true; fire(); }
      if (spell === 2 && fired) {
        const due = Math.floor((pt - CLIP_FIRE * CLIP_DUR) / FB_GAP + 1e-6) + 1;
        while (fbShots < Math.min(FB_COUNT, due)) shootFireball(fbShots++);
      }
      if (spell === 2) { // 火の玉が 0.1 秒おきに ぽっと 出て ふわふわ うかぶ
        const shown = Math.min(FB_COUNT, Math.floor((pt - 0.3) / FB_ORB_GAP) + 1);
        for (let i = fbShots; i < shown; i++) {
          orbPos(i, hp);
          if (pt - 0.3 - i * FB_ORB_GAP < dt * 1.5) add.emit(hp.x, hp.y, hp.z, 0, 0, 0, 0.2, 1.6, 0.3, 0xfff0c0, 0xff7010);
          add.emit(hp.x, hp.y, hp.z, 0, 0, 0, dt * 2, 0.55, 0.55, 0xfff6c8, 0xffe080);
          add.emit(hp.x, hp.y, hp.z, 0, 0, 0, dt * 2, 1.2, 1.2, 0xff8a20, 0xff6010);
        }
      }
      handPos(hp);
      for (let k = 0; k < 2; k++) add.emit(hp.x + vr(-0.2, 0.2), hp.y + vr(-0.2, 0.2), hp.z + vr(-0.2, 0.2), vr(-0.3, 0.3), vr(0.2, 0.9), vr(-0.3, 0.3), 0.5, 0.14, 0.03, 0xf0d8ff, 0x7030d0);
      if (pt >= castLen) endCast();
    }
    if (mixerLeft > 0) {
      mixer.update(dt); pivot.updateMatrixWorld(true);
      mixerLeft -= dt;
      if (mixerLeft <= 0) { action.stop(); mixer.stopAllAction(); restorePose(); }
    }
    pivot.updateMatrixWorld(true);
    updateEruption(dt); updateVortex(dt); updateProjs(dt);
    add.update(dt); smoke.update(dt);
    // 俯瞰カメラの 目標（ふたりの まんなかを 見る）
    const gp = pivot.position, f = fwdOf(p);
    const mx = (p.x + gp.x) / 2, mz = (p.z + gp.z) / 2, my = p.y + 1;
    const sep = Math.hypot(p.x - gp.x, p.z - gp.z), ex = Math.max(0, sep - 5);
    const tp = new Vector3(mx + f.rx * (3 + 0.3 * ex) + f.fx * (2 + 0.2 * ex), my + 3.5 + 0.35 * ex, mz + f.rz * (3 + 0.3 * ex) + f.fz * (2 + 0.2 * ex));
    const tl = new Vector3(mx, my, mz);
    if (!camTarget.init) { camTarget.pos.copy(tp); camTarget.look.copy(tl); camTarget.init = true; }
    else { camTarget.pos.lerp(tp, 0.15); camTarget.look.lerp(tl, 0.15); }
  });
  deps.onBeforeRender(() => {
    const cam = deps.camera as PerspectiveCamera;
    const px = (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / (2 * Math.tan(((cam.fov ?? 70) * D2R) / 2));
    add.mat.uniforms.uPx!.value = px; smoke.mat.uniforms.uPx!.value = px;
    if (camMode === 'overview') { cam.position.copy(camTarget.pos); cam.lookAt(camTarget.look); cam.updateMatrixWorld(true); }
  });

  // ---- 外から 使う（テスト・スクショ） ----
  const place = (opts?: { groundY?: number; shift?: number; side?: boolean }) => {
    const p = deps.player(); const f = fwdOf(p);
    const sd = opts?.shift ?? 0;
    const x = p.x + f.fx * 5 + f.rx * sd, z = p.z + f.fz * 5 + f.rz * sd;
    pivot.position.set(x, (opts?.groundY ?? deps.groundY(Math.floor(x), Math.floor(z))) + 1, z);
    pivot.rotation.y = opts?.side ? Math.atan2(f.rx, f.rz) : Math.atan2(p.x - x, p.z - z);
  };
  void GAP;
  place();
  const handle: GashaGirlHandle = {
    place, figures: [pivot],
    labels: (riky, w, h) => {
      const pts = [new Vector3(pivot.position.x, pivot.position.y + H + 0.3, pivot.position.z), new Vector3(riky.x, riky.y + 2.1, riky.z)];
      return pts.map((v) => { v.project(deps.camera); return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }; });
    },
    phase: () => phase,
    setSeed: (n) => { rs = n >>> 0; vs = (Math.imul(n, 7919) + 13) >>> 0; },
    warpNow: (s) => { if (s !== undefined) forced = (s - 1 + SPELLS) % SPELLS; if (phase === 'stand') pt = 2.0; },
    camera: (m) => { camMode = m; camTarget.init = false; },
    standNow: () => { if (phase === 'stand') pt = 0; },
    nextSpell: (n) => { forced = (n - 1 + SPELLS) % SPELLS; },
    predictSide: () => (mulberry(rs)[1] < 0.5 ? 'left' : 'back'),
    info: () => ({
      phase, spell: spell + 1, forced, castT: pt, side, dist, eruptionT: ER.t, vortexT: VX.t,
      fireballs: projs.filter((q) => q.on && q.kind === 0).length, waves: projs.filter((q) => q.on && q.kind === 1).length,
      ...stats, girlX: pivot.position.x, girlZ: pivot.position.z,
    }),
  };
  (window as unknown as { __gashaGirl: GashaGirlHandle }).__gashaGirl = handle;
  void Color;
}
