/**
 * #293 がしゃどくろ 第二形態（少女）の「ワープ → 詠唱 → 魔法 4 種」。
 * 試作ページ（`?proto=gashaGirl`、開発サーバーだけ）は すぐ はじまる。ふだんの ゲームでは `{ dormant: true }` で 読みこんで ねかせて おき（見えない・動かない・描かない）、
 * 大きな 姿の 体力が 1/3 に なって 固まったら release.ts が summon() で はじめる（笑い声 → ワープで 飛びまわる → 決めポーズ → 5 回の 魔法 → 大きな 姿の かたに 座って 休む（perchSpot・setHitBox）→ また 魔法）。dismiss() で 止める。GLB は public/models/gasha/girl-cast.glb（相対パス。公開版でも 読める。頂点の 使わない 属性を 減らし、テクスチャは JPEG の 圧縮を 強めて 約 4 MB）。
 * 少女は 歩かない・走らない（移動は ワープだけ）。ふだんは ゾンビの ように 右うでを 前に 出して 立つ。
 * すべて Game.onUpdate の 固定ステップで 進める。乱数は シード付き。ダメージは なし（見た目だけ）。
 * 魔法 1: 背面か 左横へ ワープ → プレイヤーの 足もとに 噴き出す / 2: 真後ろ → 周囲攻撃（渦）/
 * 3: 距離を とって → 火の玉 10 連射（ホーミング）/ 4: 距離を とって → 青い 弾の 扇（へびのように ゆれる・追尾なし）
 */
import {
  AdditiveBlending, Box3, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, DoubleSide, Group, LoopOnce,
  AnimationClip, AnimationMixer, Mesh, MeshBasicMaterial, NormalBlending, Object3D, PerspectiveCamera, PlaneGeometry, Points, Quaternion,
  Scene, ShaderMaterial, SRGBColorSpace, Sprite, SpriteMaterial, Vector3, type Camera, type Material, type MeshStandardMaterial, type SkinnedMesh, type Bone,
} from 'three';
import { ruby } from '../ui/text';
import { bearingOf } from '../combat/parry';
import { TUNE as T, applyTune, applyTuneFromUrl } from './gashaGirlTuning';
import { sharedGashaBgm } from './gashaBgm';
import { createGirlSfx, createWebAudioPlayer } from './gashaGirlSfx';
import { IntroSeq, introAngleDeg, introSpot, type IntroEvent } from './gashaGirlIntro';
import { applyDelta, blendPose, SIT_DELTA, type BaseBone } from './gashaGirlPose';
import { POSES } from './gashaGirlPoseData';
import type { BoxLike } from './gashaBigHit';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GashaGirlDeps {
  scene: Scene;
  camera: Camera;
  onUpdate(fn: (dt: number) => void): void;
  /** 描く 直前（カメラを 上書きする 用） */
  onBeforeRender(fn: () => void): void;
  player(): { x: number; y: number; z: number; yawDeg: number; vx: number; vz: number };
  /** プレイヤーに ダメージ（妖怪の 攻撃と 同じ PlayerCombat.damage。むてき時間・ノックバックつき）。入ったら true */
  hurt(amount: number, from: { x: number; y: number; z: number }): boolean;
  hp(): number;
  maxHp(): number;
  /** パリィに 聞く（妖怪と おなじ 口）。by: 設置系 'attack'、弾系 'fireball'。dirDeg は プレイヤー足もと → 当たった 物 */
  parry(h: { dirDeg: number | null; by: 'attack' | 'fireball'; amount: number }): { result: 'success' | 'early' | 'fail' | 'none'; amount: number };
  /** ゲームの BGM の ミキサー（BGM 音量の 設定に のる）。まだ 音が 使えない ときは null */
  bgmOut(): { ctx: AudioContext; bus: AudioNode } | null;
  /** ゲームの ミキサーの 効果音バス（main.ts の mixer.output()）。わたすと 効果音は ここを 通る（設定の 音量・ミュートが 効く）。なければ 自前の AudioContext */
  sfxOut?(): { ctx: AudioContext; destination: AudioNode } | null;
  /** ふだんの BGM を 止める（少女の 間） */
  suppressBgm(on: boolean, fade?: { outSec?: number; inSec?: number; delaySec?: number }): void;
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
    g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(0.55, 'rgba(255,255,255,0.09)');
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

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export interface GashaGirlOpts {
  /** true: 読みこんだ あと ねかせて おく（ふだんの ゲーム）。summon() で はじまる。なければ すぐ はじまる（?proto=gashaGirl） */
  dormant?: boolean;
  /** dormant: 5 回の 魔法の あと 少女が 座る 場所(大きな 姿の かたの 上。足もとの 世界の 座標と 向き)。なければ null(その 場に 座る) */
  perchSpot?(): { x: number; y: number; z: number; yawDeg: number } | null;
  /** dormant: 座っている 少女の 当たりの 箱を 大きな 姿の 当たりに 足す(名前 girl)。null で はずす。箱の 中身は 少女が 毎コマ 更新する */
  setHitBox?(box: BoxLike | null): void;
}

/** ふだんの ゲームから 少女を 動かす 口 */
export interface GirlController {
  /** 少女の 戦いを はじめる（2 秒 何もいない → 背面か 横へ ワープして 詠唱）。dormant のときだけ */
  summon(): void;
  /** 止めて かくす（エフェクト・弾・BGM の 頼み・文字を 消す）。dormant のときだけ */
  dismiss(): void;
  /** 少女の 戦いの 最中か（ねかせて いる 間は false） */
  active(): boolean;
  /** とどめ(大きな 姿の 体力 0): 魔法・弾・当たりの 箱を ぜんぶ 消して、その場に 座りこむ。動かない・無敵。ねている 間は 何も しない */
  finish(): void;
  /** コアが こわれた: 座った まま 透けて 粉に なって 消えて いく(finish() の あとだけ) */
  crumble(): void;
  /** いまの 場面: off(ねている)/ laugh(笑い声)/ orbit(飛びまわる)/ pose(決めポーズ)/ girl(戦い)/ perch(かたに 座って 休む)/ down(とどめで 座りこむ)/ crumble(消えて いく) */
  stage(): 'off' | 'laugh' | 'orbit' | 'pose' | 'girl' | 'perch' | 'down' | 'crumble';
  handle: GashaGirlHandle;
}

export interface GashaGirlHandle {
  place(opts?: { groundY?: number; shift?: number; side?: boolean }): void;
  figures: Group[];
  labels(riky: { x: number; y: number; z: number }, w: number, h: number): { x: number; y: number }[];
  phase(): string;
  /** 立ち姿の 数えなおし（撮影用） */
  standNow(): void;
  setSeed(n: number): void;
  warpNow(spell?: number): void;
  camera(mode: 'overview' | 'default' | 'look' | 'close' | 'idle' | 'idleSide'): void;
  /** 立ち姿で とめておく（idle.gif 用） */
  holdStand(on: boolean): void;
  /** 回数・止めた回数の 数えなおし（撮影用） */
  resetTurns(): void;
  /** 次に 使う 魔法を 決める（1〜4。撮影用） */
  nextSpell(n: number): void;
  /** 次の 魔法 1 の ワープ先が 左横か（シードの さきよみ） */
  predictSide(): 'left' | 'back';
  info(): Record<string, number | string | boolean>;
  /** 戦いの 数を 上書き（gashaGirlTuning.ts の TUNE と おなじ 形） */
  tune(o: unknown): void;
  /** テスト用: パリィの 結果を 決めうち（null で ふつう） */
  forceParry(r: 'success' | 'early' | null): void;
}

const SPELLS = 4;

export function startGashaGirl(deps: GashaGirlDeps, opts: GashaGirlOpts = {}): Promise<GirlController> {
  applyTuneFromUrl(location.search);
  return new Promise<GirlController>((resolve, reject) => {
    new GLTFLoader().load(
      './models/gasha/girl-cast.glb',
      (gltf) => {
        void import('three/examples/jsm/utils/SkeletonUtils.js').then(({ clone }) => {
          try { resolve(build(deps, gltf.scene, gltf.animations[0]!, clone, opts)); } catch (e) { console.warn('[gashaGirl] 作れません', e); reject(e instanceof Error ? e : new Error('girl build')); } // build() の 途中で 失敗しても 待たされ続けない
        }, reject);
      },
      undefined,
      (e) => { console.warn('[gashaGirl] 読めません', e); reject(e instanceof Error ? e : new Error('girl glb')); },
    );
  });
}

function build(deps: GashaGirlDeps, src: Object3D, clip: AnimationClip, clone: (o: Object3D) => Object3D, opts: GashaGirlOpts): GirlController {
  const dormant = opts.dormant === true;
  const scene = deps.scene;
  const front = new Vector3(0, 0, 1);
  const H = GIRL_HEIGHTS[0]!;

  // ---- 少女 ----
  const model = clone(src);
  const bareRest = new Map<string, Quaternion>(); // 少女の 骨の もとの 休みの 回転(座りポーズの もと)
  model.traverse((o) => { if ((o as Bone).isBone) bareRest.set(o.name, o.quaternion.clone()); });
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
  const bareBase: BaseBone[] = standPose.map((s) => ({ bone: s.bone, q: bareRest.get(s.bone.name) ?? s.q })); // 座りポーズの もと
  const standBase: BaseBone[] = standPose.map((s) => ({ bone: s.bone, q: s.q })); // 決めポーズの もと(ゾンビの 立ち姿)
  const restorePose = () => standPose.forEach((s) => { s.bone.quaternion.copy(s.q); s.bone.position.copy(s.p); });
  const mixer = new AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
  const clipDur = () => clip.duration / T.cast.speed; // 詠唱の 長さ（秒）
  const hand = model.getObjectByName('RightHand')!;
  const y0 = model.position.y;

  // ---- 粒・絵 ----
  const add = new ParticlePool(3000, true);
  const smoke = new ParticlePool(400, false);
  scene.add(add.points, smoke.points);
  const glowTex = makeGlowTex(), ringTex = makeRingTex(), vortexTex = makeVortexTex();
  const bladeTex = makeFlameTex('rgba(160,80,255,1)', 'rgba(200,150,255,1)', 'rgba(240,216,255,1)', 3);
  const flameTex = makeFlameTex('rgba(255,90,10,1)', 'rgba(255,200,60,1)', 'rgba(255,255,230,1)', 7);
  const basic = (map: CanvasTexture, color = 0xffffff, opacity = 1): MeshBasicMaterial => new MeshBasicMaterial({
    map, color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  /** 通常合成（重なっても 飽和しない） */
  const basicN = (map: CanvasTexture, color = 0xffffff, opacity = 1): MeshBasicMaterial => new MeshBasicMaterial({
    map, color, transparent: true, opacity, blending: NormalBlending, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
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

  const stats = { fbHit: 0, fbMiss: 0, waveHit: 0, waveMiss: 0, fired: 0, hits: 0, ringHits: 0, vortexHits: 0, swHits: 0 };
  Object.assign(stats, { parried: 0, parryEarly: 0, reflected: 0, reflectHits: 0 });
  const st2 = stats as typeof stats & { parried: number; parryEarly: number; reflected: number; reflectHits: number };
  /** パリィに 聞く（当たる 瞬間）。success: 防ぐ／はね返す、early: ダメージが へる */
  let parryForce: 'success' | 'early' | null = null;
  const askParry = (by: 'attack' | 'fireball', at: { x: number; y: number; z: number }) => {
    const p = deps.player();
    if (parryForce) return { result: parryForce, amount: parryForce === 'early' ? T.damage.heart / 2 : T.damage.heart }; // テスト用
    return deps.parry({ dirDeg: bearingOf({ x: p.x, y: p.y, z: p.z }, at), by, amount: T.damage.heart });
  };
  /** 設置系（輪・渦）の 当たり: パリィは 防ぐだけ。'hit' = ダメージが 入った、'blocked' = 防いだ、'retry' = むてき時間 など */
  const setHit = (from: { x: number; y: number; z: number }): 'hit' | 'blocked' | 'retry' => {
    const r = askParry('attack', from);
    if (r.result === 'success') { st2.parried++; return 'blocked'; }
    if (r.result === 'early') st2.parryEarly++;
    const ok = deps.hurt(r.result === 'early' ? r.amount : T.damage.heart, from);
    if (ok) { stats.hits++; sfx.playerHit(); }
    return ok ? 'hit' : 'retry';
  };
  let nextSetHit = 0; // 設置系の 次の 判定（むてき時間と おなじ ぐらい あける）
  let flinchT = 0, flinchTotal = 1, reflectWait = 0;
  const hurtPlayer = (from: { x: number; y: number; z: number }, amount = T.damage.heart): boolean => { const ok = deps.hurt(amount, from); if (ok) { stats.hits++; sfx.playerHit(); } return ok; };

  // ---- 魔法 1: 噴き出す（紫の 輪 → 炎の 刃）。輪は 3 つ ----
  const bladeMat = basic(bladeTex, 0xffffff, 0.4);
  const makeEruption = () => {
    const E = { root: new Group(), t: -1, rad: 0, hitEnd: 0, count: 6, x: 0, y: 0, z: 0,
      blades: [] as { outer: Group; inner: Group; h: number; w: number; start: number; lean: number; ph: number }[] };
    scene.add(E.root);
    const ringMat = basicN(ringTex, 0xa040ff, 0), flashMat = basicN(glowTex, 0xd0a0ff, 0); // 輪の 塗りと 閃光は 通常合成（3 つ 重なっても むらさきが 見える）
    const ring = flat(ringMat, E.root), flash = flat(flashMat, E.root);
    for (let i = 0; i < 12; i++) {
      const outer = new Group(); const inner = crossed(bladeMat, outer); outer.add(inner); E.root.add(outer); outer.visible = false;
      E.blades.push({ outer, inner, h: 2, w: 0.5, start: 0.9, lean: 0.3, ph: 0 });
    }
    const fire = (x: number, z: number) => {
      E.x = x; E.z = z; E.y = deps.groundY(Math.floor(x), Math.floor(z)) + 1.04;
      E.root.position.set(x, E.y, z); E.t = 0; E.hitEnd = 0;
      E.count = 10 + Math.floor(vrng() * 3);
      E.blades.forEach((b, i) => {
        b.h = vr(3.0, 4.0); b.w = vr(0.7, 0.9); b.start = T.s1.delaySec + vr(0, 0.06); b.lean = vr(0.05, 0.14); b.ph = vr(0, 6);
        const ph = i * 2.39996 + vr(-0.2, 0.2), r = T.s1.radius * 0.85 * Math.sqrt((i + 0.5) / E.count); // 輪の はんい いっぱいに ばらまく
        b.outer.position.set(Math.cos(ph) * r, 0, -Math.sin(ph) * r);
        b.outer.rotation.y = ph;
        if (i < E.count) E.hitEnd = Math.max(E.hitEnd, b.start + T.s1.activeSec);
      });
    };
    const hitActive = () => E.t >= 0 && E.t < E.hitEnd;
    const update = (dt: number) => {
      if (E.t < 0) return;
      const t = (E.t += dt);
      if (t > 2.2) { E.t = -1; E.root.visible = false; ring.visible = flash.visible = false; E.blades.forEach((b) => (b.outer.visible = false)); return; }
      E.root.visible = true;
      const rad = t < 0.35 ? T.s1.radius * easeOut(t / 0.35) : T.s1.radius + 0.4 * ((t - 0.35) / 1.85);
      E.rad = rad;
      ring.visible = true; ring.scale.set(rad, 1, rad);
      const hitOn = t < E.hitEnd; // 魔法陣が 出てから 炎が おわるまで 輪の 中は あぶない（ふちを 明るく ゆらす）
      ringMat.opacity = 0.5 * Math.min(1, t / 0.25) * (hitOn ? 0.95 + 0.05 * Math.sin(t * 25) : 0.9) * (t > 1.4 ? 1 - (t - 1.4) / 0.8 : 1);
      ringMat.color.setHex(hitOn ? 0xe098ff : 0xa040ff);
      const fl = clamp01(1 - Math.abs(t - (T.s1.delaySec - 0.05)) / 0.2);
      flash.visible = fl > 0; flash.scale.setScalar(1 + 3 * easeOut((t - 0.25) / 0.4)); flashMat.opacity = fl * 0.5 / Math.max(1, T.s1.rings); // 閃光の 強さは 輪の 数で わる
      if (t < T.s1.delaySec) for (let k = 0; k < 4; k++) { // 火の粉が 内向きに あつまる
        const a = vr(0, Math.PI * 2), r = vr(T.s1.radius * 1.1, T.s1.radius * 1.3);
        add.emit(E.x + Math.cos(a) * r, E.y + vr(0, 0.5), E.z + Math.sin(a) * r, -Math.cos(a) * 8, 0.3, -Math.sin(a) * 8, 0.45, 0.14, 0.06, 0xf0e0ff, 0x9040e0);
      }
      for (let i = 0; i < E.blades.length; i++) {
        const b = E.blades[i]!;
        const on = i < E.count && t > b.start && t < b.start + T.s1.activeSec;
        b.outer.visible = on; b.inner.visible = on;
        if (!on) continue;
        const u = t - b.start;
        const g = u < 0.2 ? easeOut(u / 0.2) : u > 0.8 ? 1 - (u - 0.8) / 0.3 : 1;
        const fk = 1 + 0.07 * Math.sin(t * 28 + b.ph);
        b.inner.scale.set(b.w * g + 0.05, Math.max(0.01, b.h * g * fk), b.w * g + 0.05);
        b.inner.rotation.z = -(b.lean * (0.4 + 0.6 * g));
      }
      if (t > T.s1.delaySec + 0.05 && t < 1.2) for (let k = 0; k < 3; k++) add.emit(E.x + vr(-T.s1.radius * 0.8, T.s1.radius * 0.8), E.y + vr(0, 1), E.z + vr(-T.s1.radius * 0.8, T.s1.radius * 0.8), vr(-0.8, 0.8), vr(1.5, 4), vr(-0.8, 0.8), 0.8, 0.12, 0.04, 0xe0b0ff, 0x6020b0, -1);
      if (t > 0.7 && t < 1.7) {
        smoke.emit(E.x + vr(-T.s1.radius * 0.7, T.s1.radius * 0.7), E.y + 0.3, E.z + vr(-T.s1.radius * 0.7, T.s1.radius * 0.7), vr(-0.5, 0.5), vr(1, 2), vr(-0.5, 0.5), 1.1, 0.5, 1.3, 0x2a1838, 0x050208, 0, 0.5);
        add.emit(E.x + vr(-T.s1.radius * 0.8, T.s1.radius * 0.8), E.y + 0.3, E.z + vr(-T.s1.radius * 0.8, T.s1.radius * 0.8), vr(-0.6, 0.6), vr(2, 4), vr(-0.6, 0.6), 1, 0.1, 0.03, 0xd8a0ff, 0x501090);
      }
    };
    return { fire, update, hitActive, e: E };
  };
  const erups = [makeEruption(), makeEruption(), makeEruption()];
  /** 3 つの 輪: 足もと、進む 方向の 約 3 ブロック先、その 先の 左右どちらか */
  const fireEruptions = () => {
    const p = deps.player();
    let dx = p.vx, dz = p.vz;
    if (Math.hypot(dx, dz) < 0.5) { const f = fwdOf(p); dx = f.fx; dz = f.fz; }
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const sgn = rng() < 0.5 ? -1 : 1;
    const A = T.s1.ahead, S = T.s1.side, n = T.s1.rings;
    if (n > 0) sfx.s1(T.s1.delaySec); // 予告（輪）→ 噴出。輪が 3 つでも 1 回ずつ
    if (n > 0) erups[0]!.fire(p.x, p.z);
    if (n > 1) erups[1]!.fire(p.x + dx * A, p.z + dz * A);
    if (n > 2) erups[2]!.fire(p.x + dx * A - dz * S * sgn, p.z + dz * A + dx * S * sgn);
  };

  // ---- 魔法 2: 周囲攻撃（渦 9 か所。3×3 の 格子。渦と 渦の すき間に にげる） ----
  const warnMat = basic(ringTex, 0xff9040, 0.3);
  const makeVortex = () => {
    const V = { root: new Group(), spin: new Group(), t: -1, x: 0, y: 0, z: 0, r: 1 };
    V.root.add(V.spin); scene.add(V.root);
    const m1 = basic(vortexTex, 0xffffff, 0), m2 = basic(vortexTex, 0xffc080, 0), cMat = basic(glowTex, 0xfff0c0, 0), tMat = basic(flameTex, 0xffffff, 0);
    const d1 = flat(m1, V.spin), d2 = flat(m2, V.spin), core = flat(cMat, V.root);
    d2.position.y = 0.02;
    const tongues: { g: Group; r: number; h: number; ph: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const g = crossed(tMat, V.spin);
      const a = (i / 10) * Math.PI * 2 + vr(-0.1, 0.1);
      tongues.push({ g, r: vr(0.88, 1.0), h: vr(0.7, 1.5), ph: a });
      g.position.set(Math.cos(a), 0, Math.sin(a));
    }
    const warn = flat(warnMat, scene);
    const fire = (x: number, z: number) => {
      V.x = x; V.z = z; V.y = deps.groundY(Math.floor(x), Math.floor(z)) + 1.05; V.r = T.s2.radius;
      V.root.position.set(x, V.y, z); V.t = 0;
    };
    const showWarn = (on: boolean, x = 0, z = 0) => {
      warn.visible = on;
      if (on) { warn.position.set(x, deps.groundY(Math.floor(x), Math.floor(z)) + 1.05, z); warn.scale.set(T.s2.radius, 1, T.s2.radius); }
    };
    const hits = (px: number, pz: number) => V.t >= 0.1 && V.t < T.s2.hitSec && Math.hypot(px - V.x, pz - V.z) < V.r * (V.t < 0.3 ? Math.max(0.05, easeOut(V.t / 0.3)) : 1);
    const update = (dt: number) => {
      if (V.t < 0) return;
      const t = (V.t += dt);
      if (t > T.s2.totalSec) { V.t = -1; V.root.visible = false; d1.visible = d2.visible = core.visible = false; tongues.forEach((q) => (q.g.visible = false)); return; }
      V.root.visible = true;
      const e = t < 0.3 ? easeOut(t / 0.3) : 1;
      const tail = t > T.s2.hitSec ? 1 - (t - T.s2.hitSec) / (T.s2.totalSec - T.s2.hitSec) : 1;
      const a = Math.min(1, t / 0.2) * tail;
      const r = V.r * Math.max(0.05, e);
      V.spin.rotation.y = t * 3;
      d1.visible = d2.visible = core.visible = true;
      d1.scale.set(r, 1, r); d2.scale.set(r * 0.9, 1, r * 0.9); d2.rotation.y = -t * 5; // 逆まわり
      m1.opacity = a * 0.95; m2.opacity = a * 0.5; tMat.opacity = a;
      core.scale.setScalar(0.4 + 0.1 * Math.sin(t * 20)); cMat.opacity = a;
      for (const q of tongues) {
        q.g.visible = true;
        q.g.position.set(Math.cos(q.ph) * r * q.r, 0, Math.sin(q.ph) * r * q.r);
        q.g.rotation.y = -q.ph;
        const f = (1 + 0.3 * Math.sin(t * 17 + q.ph * 5)) * e * tail;
        q.g.scale.set(0.8, Math.max(0.01, q.h * f), 0.8);
      }
      if (t < T.s2.hitSec) for (let k = 0; k < 2; k++) {
        const an = vr(0, Math.PI * 2), rr = vr(0.3, V.r) * e;
        add.emit(V.x + Math.cos(an) * rr, V.y + 0.1, V.z + Math.sin(an) * rr, -Math.sin(an) * 2, vr(1.5, 3.5), Math.cos(an) * 2, 0.7, 0.12, 0.04, 0xffd070, 0xc03000, -1);
      }
    };
    return { fire, update, showWarn, hits, v: V };
  };
  const vortices = Array.from({ length: 25 }, () => makeVortex()) // grid は 5 まで;
  /** 少女を 中心に した 格子の 渦の 位置（少女の 向きに そろえる。ずらさない） */
  const gridCenters = (cx: number, cz: number, yaw: number) => {
    const n = T.s2.grid, out: { x: number; z: number }[] = [];
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = (i - (n - 1) / 2) * T.s2.spacing, b = (j - (n - 1) / 2) * T.s2.spacing;
      out.push({ x: cx + rx * a + fx * b, z: cz + rz * a + fz * b });
    }
    return out;
  };
  const fireVortices = () => { sfx.s2Vortex(); fireVorticesAt(); }; // 渦は 9 か所でも 音は 1 回
  const fireVorticesAt = () => gridCenters(pivot.position.x, pivot.position.z, pivot.rotation.y).forEach((c, i) => vortices[i]?.fire(c.x, c.z));
  const showVortexWarn = (on: boolean) => {
    const cs = gridCenters(pivot.position.x, pivot.position.z, pivot.rotation.y);
    vortices.forEach((v, i) => v.showWarn(on && i < cs.length, cs[i]?.x, cs[i]?.z));
  };

  // ---- 弾（魔法 3: 火の玉 / 魔法 4: 青い 波） ----
  interface Proj { on: boolean; kind: 0 | 1; pos: Vector3; dir: Vector3; age: number; homing: boolean; org: Vector3; perp: Vector3; ph: number; amp: number; reflected: boolean; }
  const projs: Proj[] = [];
  for (let i = 0; i < 44; i++) projs.push({ on: false, kind: 0, pos: new Vector3(), dir: new Vector3(), age: 0, homing: true, org: new Vector3(), perp: new Vector3(), ph: 0, amp: 0, reflected: false });
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
    if (kind === 0) sfx.s3Hit();
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
  const chestOf = (p: { x: number; y: number; z: number }, out: Vector3) => out.set(p.x, p.y + 1.2, p.z);
  const chest = new Vector3(), want = new Vector3(), axis = new Vector3();
  /** パリィ成功: はね返す（少女へ 向き直し・追尾 おわり・プレイヤーの もの） */
  const reflectProj = (q: Proj) => {
    want.set(pivot.position.x, pivot.position.y + H * 0.55, pivot.position.z).sub(q.pos);
    if (want.lengthSq() < 1e-6) want.copy(q.dir).negate();
    q.dir.copy(want).normalize(); q.homing = false; q.reflected = true; q.amp = 0; q.age = 0; st2.reflected++;
    add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, 0.25, 2.4, 0.4, 0xffffff, 0xfff0c0);
  };
  const updateProjs = (dt: number) => {
    const pl = deps.player();
    chestOf(pl, chest);
    for (const q of projs) {
      if (!q.on) continue;
      q.age += dt;
      if (q.reflected) { // はね返した 弾（プレイヤーの もの）。少女に 当たったら ひるませる
        q.pos.addScaledVector(q.dir, (q.kind === 0 ? T.s3.speed : T.s4.speed) * T.parry.reflectSpeedMul * dt);
        const c0 = q.kind === 0 ? [0xffffff, 0xffe8b0, 0xffc060] : [0xffffff, 0xd0f8ff, 0x90e0ff];
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 0.7, 0.7, c0[0]!, c0[1]!);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 1.4, 1.4, c0[2]!, c0[2]!);
        add.emit(q.pos.x + vr(-0.06, 0.06), q.pos.y + vr(-0.06, 0.06), q.pos.z + vr(-0.06, 0.06), vr(-0.2, 0.2), vr(0, 0.5), vr(-0.2, 0.2), 0.4, 0.5, 0.08, c0[1]!, c0[2]!);
        const gx = q.pos.x - pivot.position.x, gz = q.pos.z - pivot.position.z;
        const onGirl = pivot.visible && Math.hypot(gx, gz) < T.parry.girlHitR && q.pos.y > pivot.position.y - 0.2 && q.pos.y < pivot.position.y + H + 0.3;
        const gr = deps.solid(Math.floor(q.pos.x), Math.floor(q.pos.y), Math.floor(q.pos.z));
        if (onGirl || gr || q.age >= T.s3.lifeSec) {
          q.on = false; burst(q.pos, q.kind);
          if (onGirl) { st2.reflectHits++; flinchT = flinchTotal = T.parry.flinchSec; }
        }
        continue;
      }
      if (q.kind === 0) {
        if (q.homing && (q.age > T.s3.homingMaxSec || q.pos.distanceTo(chest) < T.s3.stopNear)) q.homing = false;
        if (q.homing) {
          want.copy(chest).sub(q.pos).normalize();
          const ang = Math.acos(Math.min(1, Math.max(-1, q.dir.dot(want))));
          const turn = (T.s3.turnDeg * D2R) * dt;
          if (ang <= turn) q.dir.copy(want);
          else { axis.crossVectors(q.dir, want); if (axis.lengthSq() > 1e-8) q.dir.applyAxisAngle(axis.normalize(), turn); }
          q.dir.normalize();
        }
        q.pos.addScaledVector(q.dir, T.s3.speed * dt);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 0.55, 0.55, 0xfff6c8, 0xffe080);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 1.2, 1.2, 0xff8a20, 0xff6010);
        for (let k = 0; k < 2; k++) add.emit(q.pos.x + vr(-0.06, 0.06), q.pos.y + vr(-0.06, 0.06), q.pos.z + vr(-0.06, 0.06), vr(-0.2, 0.2), vr(0, 0.5), vr(-0.2, 0.2), 0.4, 0.5, 0.08, 0xff9a30, 0x601000);
        const hit = q.pos.distanceTo(chest) < T.s3.hitR;
        const ground = deps.solid(Math.floor(q.pos.x), Math.floor(q.pos.y), Math.floor(q.pos.z));
        if (hit) { const r = askParry('fireball', q.pos); if (r.result === 'success') { reflectProj(q); continue; } q.on = false; burst(q.pos, 0); stats.fbHit++; if (r.result === 'early') st2.parryEarly++; hurtPlayer(q.pos, r.result === 'early' ? r.amount : T.damage.heart); continue; }
        if (ground || q.age >= T.s3.lifeSec) { q.on = false; burst(q.pos, 0); stats.fbMiss++; }
      } else {
        const d = T.s4.speed * q.age;
        if (q.homing && q.org.distanceTo(chest) < T.s4.stopNear) q.homing = false; // 3 ブロックより 近づいたら 追尾 おわり
        if (q.homing) { // ごく 弱い ホーミング（25°/秒）
          want.copy(chest).sub(q.org).normalize();
          const ang = Math.acos(Math.min(1, Math.max(-1, q.dir.dot(want))));
          const turn = (T.s4.turnDeg * D2R) * dt;
          if (ang <= turn) q.dir.copy(want);
          else { axis.crossVectors(q.dir, want); if (axis.lengthSq() > 1e-8) q.dir.applyAxisAngle(axis.normalize(), turn); }
          q.dir.normalize(); q.perp.set(-q.dir.z, 0, q.dir.x).normalize();
        }
        q.org.addScaledVector(q.dir, T.s4.speed * dt); // 中心線は すすむ。そこから 左右に ゆれる
        q.pos.copy(q.org).addScaledVector(q.perp, q.amp * Math.sin(Math.PI * 2 * T.s4.hz * q.age + q.ph));
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 0.5, 0.5, 0xeaffff, 0xa0e0ff);
        add.emit(q.pos.x, q.pos.y, q.pos.z, 0, 0, 0, dt * 2, 1.0, 1.0, 0x60b0ff, 0x3070ff);
        for (let k = 0; k < 2; k++) add.emit(q.pos.x, q.pos.y, q.pos.z, vr(-0.15, 0.15), vr(-0.15, 0.15), vr(-0.15, 0.15), 0.55, 0.45, 0.08, 0x4aa8ff, 0x1020a0);
        if (vrng() < 0.35) add.emit(q.pos.x, q.pos.y, q.pos.z, vr(-0.5, 0.5), vr(-0.4, 0.4), vr(-0.5, 0.5), 0.9, 0.14, 0.04, 0x90d0ff, 0x2040c0);
        const hit = q.pos.distanceTo(chest) < T.s4.hitR;
        const ground = deps.solid(Math.floor(q.pos.x), Math.floor(q.pos.y), Math.floor(q.pos.z));
        if (hit) { const r = askParry('fireball', q.pos); if (r.result === 'success') { reflectProj(q); continue; } q.on = false; burst(q.pos, 1); stats.waveHit++; if (r.result === 'early') st2.parryEarly++; hurtPlayer(q.pos, r.result === 'early' ? r.amount : T.damage.heart); continue; }
        if (ground || d >= T.s4.range || q.age >= T.s4.lifeSec) { q.on = false; if (ground) burst(q.pos, 1); stats.waveMiss++; }
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
    q.perp.set(-q.dir.z, 0, q.dir.x).normalize(); q.amp = amp; q.ph = ph; q.reflected = false; stats.fired++;
  };

  // ---- 目が合った ときの 演出（赤面・！・ピピン） ----
  const headBone = model.getObjectByName('Head')!;
  const headTop = model.getObjectByName('head_end') ?? headBone;
  const bangTex = canvasTex(128, 128, (c) => {
    c.font = 'bold 120px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = 16; c.strokeStyle = '#fff'; c.strokeText('！', 64, 70);
    const g = c.createLinearGradient(0, 10, 0, 118); g.addColorStop(0, '#ff3030'); g.addColorStop(1, '#ffd020');
    c.fillStyle = g; c.fillText('！', 64, 70);
  });
  const bang = new Sprite(new SpriteMaterial({ map: bangTex, transparent: true, depthTest: false, depthWrite: false }));
  bang.visible = false; bang.renderOrder = 10; scene.add(bang);
  const hatchTex = canvasTex(128, 128, (c) => { // 頬染めの 斜線「////」
    c.lineCap = 'round';
    for (const [w, col] of [[22, '#fff'], [11, '#ff5a8a']] as const) {
      c.lineWidth = w; c.strokeStyle = col;
      for (let i = 0; i < 4; i++) { const x = 24 + i * 26; c.beginPath(); c.moveTo(x, 104); c.lineTo(x + 22, 24); c.stroke(); }
    }
  });
  const hatch = new Sprite(new SpriteMaterial({ map: hatchTex, transparent: true, depthTest: false, depthWrite: false }));
  hatch.visible = false; hatch.renderOrder = 10; scene.add(hatch);
  let shyT = -1; // 目が 合ってから の 秒
  const headC = new Vector3(), headT = new Vector3();
  const headCenter = (out: Vector3) => { headBone.getWorldPosition(out); headTop.getWorldPosition(headT); return out.lerp(headT, 0.5); };
  // 効果音（13 音。数は 調整表 sfx）。ファイルは 最初に まとめて 読みこむ
  const sfxPlayer = createWebAudioPlayer(deps.sfxOut);
  const sfx = createGirlSfx(sfxPlayer);
  sfxPlayer.preload();
  let blushPlayed = false;
  const beep = () => { // 目が 合った「ピピン！」(音は gashaGirlSfx.ts の eye_pipin)
    soundCount++; lastSoundT = t;
    sfx.eyePipin();
  };
  const setShy = (on: boolean) => {
    bang.visible = on; hatch.visible = false;
    if (!on) shyT = -1;
  };
  const updateShy = (dt: number) => {
    if (shyT < 0) return;
    shyT += dt;
    headCenter(headC);
    const yaw = pivot.rotation.y, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const k = shyT < 0.08 ? shyT / 0.08 * 1.3 : shyT < 0.18 ? 1.3 - 0.3 * ((shyT - 0.08) / 0.1) : 1; // ぴょこん
    const px = headC.x + rx * 0.5, py = headC.y + 0.4, pz = headC.z + rz * 0.5;
    if (shyT >= T.eye.bangSwapSec && !blushPlayed) { blushPlayed = true; sfx.eyeBlush(); }
    if (shyT < T.eye.bangSwapSec) { bang.visible = true; hatch.visible = false; bang.position.set(px, py + 0.1, pz); bang.scale.setScalar(0.7 * k); }
    else { // 0.4 秒 あとに「！」と 入れかわりで 頬染めの 斜線（ぷるぷる ふるえる）
      bang.visible = false; hatch.visible = true;
      const u = shyT - T.eye.bangSwapSec, pop = u < 0.08 ? u / 0.08 * 1.3 : u < 0.18 ? 1.3 - 0.3 * ((u - 0.08) / 0.1) : 1;
      hatch.position.set(px + Math.sin(shyT * 70) * 0.025, py + Math.cos(shyT * 83) * 0.02, pz); hatch.scale.setScalar(0.8 * pop);
    }
  };
  const viewPos = new Vector3(), viewDir = new Vector3();
  const checkEye = (): boolean => { // 少女の 頭が カメラの 向きの 約 12° 以内 かつ 間に ブロックが ない
    if (camMode === 'overview' || !pivot.visible) return false;
    const lookLike = camMode === 'look' || camMode === 'close';
    headCenter(headC);
    const p = deps.player();
    if (lookLike) viewPos.set(p.x, p.y + 1.6, p.z);
    else deps.camera.getWorldPosition(viewPos);
    const to = tmpV.copy(headC).sub(viewPos); const d = to.length(); to.divideScalar(d || 1);
    if (lookLike) viewDir.copy(to); else deps.camera.getWorldDirection(viewDir);
    if (Math.acos(Math.min(1, viewDir.dot(to))) > T.eye.angleDeg * D2R) return false;
    for (let s = 0.5; s < d - 0.5; s += 0.25) if (deps.solid(Math.floor(viewPos.x + to.x * s), Math.floor(viewPos.y + to.y * s), Math.floor(viewPos.z + to.z * s))) return false;
    return true;
  };
  let bigEl: HTMLDivElement | null = null;
  const showBig = (on: boolean) => {
    if (!bigEl) {
      bigEl = document.createElement('div');
      bigEl.style.cssText = 'position:fixed;left:0;right:0;top:40%;text-align:center;z-index:50;pointer-events:none;font:bold 56px/1.4 IPAGothic,sans-serif;color:#fff;text-shadow:0 0 10px #a040ff,0 0 4px #000,2px 2px 0 #000';
      bigEl.innerHTML = `${ruby('大', 'おお')}きな${ruby('姿', 'すがた')}にもどる`;
      document.body.appendChild(bigEl);
    }
    bigEl.style.display = on ? 'block' : 'none';
  };
  const nextWarp = () => { chooseWarp(); phase = 'vanish'; pt = 0; purpleBurst(10); lineBurst(); sfx.warpOut(); };
  /** 1 回の 出番が おわった とき。5 回分 おわったら 大きな 姿に もどる（試作） */
  const turnDone = (viaCancel: boolean) => {
    setShy(false);
    if (turn >= T.eye.turnsPerShow) { phase = dormant ? 'perchgo' : 'bigvanish'; pt = 0; purpleBurst(10); lineBurst(); sfx.warpOut(); return; }
    if (viaCancel) nextWarp(); else { phase = 'stand'; pt = 0; }
  };

  // ---- 少女の 流れ ----
  type Phase = 'dormant' | 'stand' | 'vanish' | 'gone' | 'appear' | 'cast' | 'shy' | 'bigvanish' | 'bigtext' | 'bigwait' | 'laugh' | 'orbit' | 'pose' | 'perchgo' | 'perch' | 'perchleave' | 'down' | 'crumble';
  let phase: Phase = dormant ? 'dormant' : 'stand', pt = 0, spell = 0;
  let side: 'left' | 'back' = 'back', dist = 4.5, ang = 0;
  let turn = 0, cancels = 0, eyeNow = false, soundCount = 0, lastSoundT = -1, bigCount = 0;
  let wave2Done = false;
  let orbSounds = 0, fbShots = 0, fired = false, mixerLeft = 0, castLen = clipDur(), forced = -1;
  let t = 0;
  const tele = new Vector3();
  const fwdOf = (p: { yawDeg: number }) => { const y = p.yawDeg * D2R; return { fx: Math.sin(y), fz: -Math.cos(y), rx: Math.cos(y), rz: Math.sin(y) }; };
  const faceTo = (p: { x: number; z: number }) => { pivot.rotation.y = Math.atan2(p.x - pivot.position.x, p.z - pivot.position.z); };
  const fade = (k: number) => { // k: 0 = 見える、1 = 消えた（さいごは 細い 光の 線に なって きえる）
    mats.forEach((m) => (m.opacity = 1 - k * k));
    const w = Math.max(0.03, 1 - 0.97 * k);
    pivot.scale.set(w, 1 + 0.15 * k, w);
  };
  const purpleBurst = (n: number) => {
    const c = pivot.position;
    for (let i = 0; i < n; i++) add.emit(c.x + vr(-0.5, 0.5), c.y + vr(0, H), c.z + vr(-0.5, 0.5), vr(-2, 2), vr(-1, 3), vr(-2, 2), vr(0.4, 0.9), 0.2, 0.05, 0xf0d8ff, 0x6020c0, -1.5, 0.5);
  };
  const lineBurst = () => { const c = pivot.position; for (let i = 0; i < 12; i++) add.emit(c.x, c.y + (i / 11) * H, c.z, 0, vr(-0.5, 0.5), 0, 0.2, 0.35, 0.05, 0xffffff, 0xa060ff); };
  const chooseWarp = () => {
    spell = forced >= 0 ? forced : Math.floor(rng() * SPELLS); forced = -1;
    if (spell === 0) { side = rng() < T.warp.s1.leftChance ? 'left' : 'back'; dist = T.warp.s1.distMin + (T.warp.s1.distMax - T.warp.s1.distMin) * rng(); }
    else if (spell === 1) { side = 'back'; dist = T.warp.s2.distMin + (T.warp.s2.distMax - T.warp.s2.distMin) * rng(); } // すぐ うしろ（急いで 前へ はしらないと 当たる）
    else { ang = (rng() * 2 - 1) * T.warp.far.fanDeg * D2R; dist = T.warp.far.distMin + (T.warp.far.distMax - T.warp.far.distMin) * rng(); }
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
    phase = 'cast'; pt = 0; fired = false; wave2Done = false; fbShots = 0; orbSounds = 0; castLen = clipDur(); sfx.cast();
    action.reset(); action.timeScale = T.cast.speed; action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.fadeIn(0.15).play();
    mixerLeft = 1e9;
  };
  const endCast = () => {
    action.fadeOut(0.15);
    mixerLeft = 0.2;
    turnDone(false);
  };
  const handPos = (out: Vector3) => hand.getWorldPosition(out);
  const hp = new Vector3(), dirV = new Vector3();
  const fireWave = (shift: number) => { // 前方 180° の 扇に 16 発（2 波目は 少し ずらした 角度）
    const p = deps.player();
    handPos(hp); chestOf(p, chest);
    const base = Math.atan2(chest.x - hp.x, chest.z - hp.z); // +Z 基準の 向き
    const pit = Math.atan2(chest.y - hp.y, Math.hypot(chest.x - hp.x, chest.z - hp.z));
    for (let i = 0; i < T.s4.count; i++) {
      const a = base + ((i + shift) / (T.s4.count - 1) - 0.5) * (T.s4.fanDeg * D2R);
      dirV.set(Math.sin(a) * Math.cos(pit), Math.sin(pit), Math.cos(a) * Math.cos(pit));
      spawnProj(1, hp, dirV, T.s4.ampl, i * 1.3 + shift * 2);
    }
    sfx.s4Wave(T.s4.count); // 16 発でも 1 波で 4〜6 回に 間引く
    purpleBurstAt(hp, 0x80c0ff);
  };
  const fire = () => {
    const p = deps.player();
    if (spell === 0) fireEruptions();
    else if (spell === 1) fireVortices();
    else if (spell === 3) fireWave(0);
    void p;
  };
  const purpleBurstAt = (c: Vector3, col: number) => { for (let i = 0; i < 10; i++) add.emit(c.x, c.y, c.z, vr(-1.5, 1.5), vr(-1, 1.5), vr(-1.5, 1.5), 0.5, 0.18, 0.04, 0xffffff, col); };
  const orbPos = (i: number, out: Vector3) => { // 少女の まわりに うかぶ 火の玉（前がわの 半円を 2 だんに ならべる）
    const tier = i % 2, k = Math.floor(i / 2);
    const a = ((k + tier * 0.5) / (T.s3.count / 2 - 1) - 0.5) * 2 * 120 * D2R + pivot.rotation.y;
    const r = 1.5 + 0.3 * tier + 0.1 * Math.sin(t * 2 + i);
    return out.set(pivot.position.x + Math.sin(a) * r, pivot.position.y + H * (0.58 + 0.24 * tier) + 0.15 * Math.sin(t * 3 + i * 1.7), pivot.position.z + Math.cos(a) * r);
  };
  const shootFireball = (i: number) => {
    const p = deps.player(); orbPos(i, hp); chestOf(p, chest);
    const h = Math.atan2(chest.x - hp.x, chest.z - hp.z) + (i % 2 ? 1 : -1) * vr(0.1, 0.4);
    const pit = T.s3.pitchRad;
    dirV.set(Math.sin(h) * Math.cos(pit), Math.sin(pit), Math.cos(h) * Math.cos(pit));
    spawnProj(0, hp, dirV); sfx.s3Fire();
    add.emit(hp.x, hp.y, hp.z, 0, 0, 0, 0.2, 1.6, 0.3, 0xfff0c0, 0xff7010);
  };

  // ---- 立ち姿の ゆらゆら（ゾンビらしく 傾いて ふらつく。骨で つける。詠唱・赤面の 間は 使わない） ----
  const axF = new Vector3(), axR = new Vector3();
  const wob = (a: number, f1: number, f2: number, ph: number) => a * D2R * (0.6 * Math.sin(Math.PI * 2 * f1 * t + ph) + 0.4 * Math.sin(Math.PI * 2 * f2 * t + ph * 1.7 + 1));
  const bn = (n: string) => model.getObjectByName(n) as Bone | undefined;
  const idleNames = ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const idleBones = new Map<string, Bone>();
  idleNames.forEach((n) => { const b = bn(n); if (b) idleBones.set(n, b); });
  const feet = ['LeftToeBase', 'RightToeBase', 'LeftFoot', 'RightFoot'].map((n) => bn(n)).filter((b): b is Bone => !!b);
  const feetLow = () => { let m = 1e9; for (const f of feet) m = Math.min(m, f.getWorldPosition(tmpV).y); return m - pivot.position.y; };
  let footBase = NaN;
  const axUp = new Vector3(0, 1, 0);
  const idleSway = () => {
    restorePose(); model.position.y = y0; model.position.x = 0;
    pivot.updateMatrixWorld(true);
    if (Number.isNaN(footBase)) footBase = feetLow();
    const yaw = pivot.rotation.y;
    axF.set(Math.sin(yaw), 0, Math.cos(yaw)); axR.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const rot = (n: string, axis: Vector3, rad: number) => { const b = idleBones.get(n); if (b) rotateWorld(b, axis, rad); };
    const d = D2R;
    // かまえ（ねこ背・頭を 前へ・片足に 体重・ひざを まげて 内また・左右 ひだりみぎ ちがう うで）
    rot('Hips', axF, -5 * d + wob(3, 0.31, 0.47, 0.5)); // 腰が 片側へ 出る ＋ 重心が ふらっと
    rot('Spine', axR, 5 * d + wob(3, 0.37, 0.43, 2)); rot('Spine', axF, wob(7, 0.33, 0.49, 1));
    rot('Spine01', axR, 6 * d + wob(3, 0.35, 0.47, 4)); rot('Spine01', axF, wob(7, 0.41, 0.31, 3));
    rot('Spine02', axR, 6 * d + wob(3, 0.4, 0.33, 6)); rot('Spine02', axF, wob(6, 0.3, 0.45, 5));
    rot('neck', axR, 8 * d); rot('neck', axF, 15 * d + wob(2, 0.3, 0.5, 7)); // 首を かしげたまま、前へ
    rot('Head', axR, 10 * d + wob(3, 0.37, 0.5, 9)); rot('Head', axF, wob(6, 0.31, 0.43, 8));
    rot('RightArm', axR, wob(5, 0.4, 0.3, 10)); rot('RightForeArm', axUp, 14 * d); rot('RightForeArm', axR, wob(4, 0.45, 0.35, 11));
    rot('RightHand', axR, 35 * d + wob(14, 0.5, 0.37, 12)); // 手首を 下へ おって ぶらっと
    rot('LeftArm', axR, wob(9, 0.35, 0.48, 13)); rot('LeftForeArm', axR, 25 * d + wob(6, 0.42, 0.3, 14)); rot('LeftHand', axR, 15 * d);
    // 足: ひざを かるく まげて 内また、右足に 体重
    rot('LeftUpLeg', axR, -16 * d); rot('LeftLeg', axR, 30 * d); rot('LeftFoot', axR, -14 * d); rot('LeftUpLeg', axF, 7 * d);
    rot('RightUpLeg', axR, -10 * d); rot('RightLeg', axR, 18 * d); rot('RightFoot', axR, -8 * d); rot('RightUpLeg', axF, -7 * d);
    pivot.updateMatrixWorld(true);
    // 足の うらを 地面から うかせない（腰を さげる）
    model.position.y = y0 + (footBase - feetLow()) + 0.03 * (0.6 * Math.sin(t * 1.9) + 0.4 * Math.sin(t * 2.9 + 1));
  };

  // ---- 登場(笑い声 → ワープで 飛びまわる → 決めポーズ)と、かたに 座って 休む ----
  let intro: IntroSeq | null = null;
  let poseT = 0, perchT = 0, perchOn = false;
  const gw = new Vector3();
  const hipsBone = bn('Hips');
  const ensureFootBase = () => { if (Number.isNaN(footBase)) { restorePose(); model.position.y = y0; pivot.updateMatrixWorld(true); footBase = feetLow(); } };
  /** 足の うらを 地面に つける(ポーズを つけた あと) */
  const groundFeet = () => { pivot.updateMatrixWorld(true); model.position.y = y0 + (footBase - feetLow()); pivot.updateMatrixWorld(true); };
  const groundAt = (x: number, z: number) => deps.groundY(Math.floor(x), Math.floor(z)) + 1;
  const poseBones = () => (POSES[T.intro.poseName] ?? POSES.c!).bones;
  const warpTo = (x: number, z: number) => {
    if (pivot.visible) { purpleBurst(8); lineBurst(); }
    pivot.position.set(x, groundAt(x, z), z);
    pivot.visible = true; fade(0);
    faceTo(deps.player());
    purpleBurst(14); sfx.warpIn();
  };
  const onIntro = (e: IntroEvent) => {
    const p = deps.player(), I = T.intro;
    if (e.kind === 'laugh') { phase = 'laugh'; pt = 0; pivot.visible = false; sfx.laugh(); }
    else if (e.kind === 'warp') {
      phase = 'orbit'; pt = 0; ensureFootBase(); restorePose(); model.position.y = y0;
      if (pivot.visible) sfx.warpOut();
      const s = introSpot(p, introAngleDeg(e.index, I.warps), I.radius);
      warpTo(s.x, s.z);
      groundFeet();
    } else if (e.kind === 'pose') {
      phase = 'pose'; pt = 0; poseT = 0; ensureFootBase();
      if (pivot.visible) sfx.warpOut();
      const s = introSpot(p, 0, I.poseDist);
      warpTo(s.x, s.z);
    } else { // done: 戦いへ(BGM「災厄」が 流れる)
      intro = null;
      bgm.uncut(); bgm.request('girl', true);
      chooseWarp(); phase = 'vanish'; pt = 0; purpleBurst(10); lineBurst(); sfx.warpOut();
    }
  };
  const perchBox: { name: string; c: number[]; ax: number[]; half: number[] } = { name: 'girl', c: [0, 0, 0], ax: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [1, 1, 1] };
  const sitNow: Record<string, [number, number, number]> = {};
  /** とどめの あと: 大きな 姿の かたに 座って いたか(かたの 動きに ついて いく) */
  let downPerched = false;
  const updatePerch = (dt: number) => {
    perchT += dt;
    const P = T.perch;
    const isDown = phase === 'down' || phase === 'crumble';
    if (isDown && downPerched) { const sp = opts.perchSpot?.() ?? null; if (sp) pivot.position.set(sp.x, sp.y, sp.z); }
    faceTo(deps.player());
    for (const k of Object.keys(SIT_DELTA)) { const v = SIT_DELTA[k]!; const q = sitNow[k] ?? (sitNow[k] = [0, 0, 0]); q[0] = v[0]; q[1] = v[1]; q[2] = v[2]; }
    const sw = isDown ? 0 : P.swayDeg * Math.sin((perchT / Math.max(0.1, P.swaySec)) * Math.PI * 2); // とどめの あとは 足も 動かさない
    sitNow.LeftLeg![0] = SIT_DELTA.LeftLeg![0] + sw; sitNow.RightLeg![0] = SIT_DELTA.RightLeg![0] - sw;
    applyDelta(bareBase, sitNow, clamp01(perchT / Math.max(0.01, isDown ? T.finish.sitBlendSec : P.blendSec)));
    pivot.updateMatrixWorld(true);
    // お尻を かたの 上に(足は ぶらさげる)
    if (hipsBone) { hipsBone.getWorldPosition(gw); model.position.y += (pivot.position.y + T.perch.hipUp - gw.y); pivot.updateMatrixWorld(true); }
    if (perchOn) {
      perchBox.c[0] = pivot.position.x; perchBox.c[1] = pivot.position.y + P.hitUp; perchBox.c[2] = pivot.position.z;
      perchBox.half[0] = P.hitHalf[0]; perchBox.half[1] = P.hitHalf[1]; perchBox.half[2] = P.hitHalf[2];
    }
  };
  const perchBegin = () => {
    const sp = opts.perchSpot?.() ?? null;
    if (sp) pivot.position.set(sp.x, sp.y, sp.z); else pivot.position.y = pivot.position.y; // 場所が なければ その 場に 座る
    pivot.visible = true; perchT = 0; perchOn = true; pt = 0;
    restorePose(); model.position.y = y0; model.position.x = 0;
    purpleBurst(24); lineBurst(); sfx.warpIn(); fade(1);
    bgm.request('girl', false); // 休んでいる 間は 戦いの 曲を 止める
    phase = 'perch';
    updatePerch(0);
    opts.setHitBox?.(perchBox);
  };
  const perchEnd = () => {
    perchOn = false; opts.setHitBox?.(null);
    restorePose(); model.position.y = y0; model.position.x = 0;
    turn = 0; cancels = 0; chooseWarp(); phase = 'perchleave'; pt = 0; purpleBurst(10); lineBurst(); sfx.warpOut();
  };

  /** とどめ: 魔法・弾・輪・赤面・文字を ぜんぶ 消して、その場に 座りこむ(無敵。当たりの 箱も はずす) */
  const downBegin = () => {
    if (phase === 'dormant' || phase === 'down' || phase === 'crumble') return;
    const wasPerch = phase === 'perch' || phase === 'perchgo' || phase === 'perchleave';
    action.stop(); mixer.stopAllAction(); mixerLeft = 0; model.rotation.x = 0; flinchT = 0;
    setShy(false); showBig(false);
    intro = null; perchOn = false; opts.setHitBox?.(null);
    for (const e of erups) { e.e.t = -1; e.e.root.visible = false; }
    for (const v of vortices) { v.v.t = -1; v.v.root.visible = false; v.showWarn(false); }
    for (const q of projs) q.on = false;
    for (const b of bursts) { b.on = false; b.mesh.visible = false; }
    forced = -1; reflectWait = 0; holdStand = false;
    bgm.uncut(); bgm.request('girl', false);
    sfxPlayer.stopAll?.();
    restorePose(); model.position.y = y0; model.position.x = 0;
    const p = deps.player();
    const sp = wasPerch ? opts.perchSpot?.() ?? null : null;
    downPerched = !!sp;
    if (sp) pivot.position.set(sp.x, sp.y, sp.z);
    else if (!pivot.visible) { const s = introSpot(p, 0, T.intro.poseDist); pivot.position.set(s.x, groundAt(s.x, s.z), s.z); } // まだ 姿を 見せて いなければ プレイヤーの 前に 座る
    else pivot.position.y = groundAt(pivot.position.x, pivot.position.z);
    pivot.visible = true; fade(0);
    purpleBurst(12);
    phase = 'down'; pt = 0; perchT = 0;
    updatePerch(0);
  };
  /** コアが こわれた: 座った まま 透けて、粉に なって 消えて いく */
  const crumbleBegin = () => {
    if (phase !== 'down') return;
    phase = 'crumble'; pt = 0;
  };
  let crumbleAcc = 0;
  const updateCrumble = (dt: number) => {
    const F = T.finish, k = clamp01(pt / Math.max(0.01, F.fadeSec));
    mats.forEach((m) => (m.opacity = 1 - k * k));
    crumbleAcc += F.crumbleSparksPerSec * dt;
    const c = pivot.position;
    while (crumbleAcc >= 1 && k < 1) {
      crumbleAcc -= 1;
      add.emit(c.x + vr(-0.5, 0.5), c.y + vr(0, H * 0.7), c.z + vr(-0.5, 0.5), vr(-0.6, 0.6), -F.crumbleFall * vr(0.5, 1), vr(-0.6, 0.6), vr(0.6, 1.2), 0.16, 0.04, F.crumbleColors[0], F.crumbleColors[1]);
    }
    if (k >= 1) pivot.visible = false;
  };

  // ---- 毎ステップ ----
  let camMode: 'overview' | 'default' | 'look' | 'close' | 'idle' | 'idleSide' = 'default';
  let holdStand = false;
  const camTarget = { pos: new Vector3(), look: new Vector3(), init: false };
  
  deps.onUpdate((dt) => {
    bgmStep();
    if (phase === 'dormant') return; // ねかせて いる 間は 何も しない
    t += dt; pt += dt;
    const frozen = flinchT > 0;
    if (frozen) { flinchT -= dt; pt -= dt; const u = 1 - Math.max(0, flinchT) / flinchTotal; model.rotation.x = -T.parry.flinchTiltRad * Math.sin(Math.PI * u); if (flinchT <= 0) model.rotation.x = 0; } // 短く 止まって 小さく のけぞる
    const p = deps.player();
    if (phase === 'stand') {
      faceTo(p); idleSway();
      if (holdStand) pt = 0;
      // はね返した 弾が 飛んでいる 間は 次の ワープに 入らず 待つ（上限 parry.reflectWaitMaxSec）
      if (pt >= T.timing.standSec && projs.some((q) => q.on && q.reflected) && reflectWait < T.parry.reflectWaitMaxSec) { reflectWait += dt; pt = T.timing.standSec - dt; }
      if (pt >= T.timing.standSec) { reflectWait = 0; nextWarp(); }
    } else if (phase === 'vanish') {
      fade(clamp01(pt / T.timing.vanishSec));
      if (pt >= T.timing.vanishSec) { phase = 'gone'; pt = 0; fade(1); pivot.visible = false; }
    } else if (phase === 'gone') { // 何も いない 時間（「どこいった？」）
      if (pt >= T.timing.goneSec) { teleport(); pivot.visible = true; bgm.request('girl', true); phase = 'appear'; pt = 0; turn++; fade(1); purpleBurst(24); sfx.warpIn(); }
    } else if (phase === 'appear') {
      faceTo(p); idleSway(); fade(1 - clamp01(pt / T.timing.appearSec));
      if (pt >= T.timing.appearSec) { fade(0); startCast(); }
    } else if (phase === 'shy') {
      faceTo(p);
      if (pt >= T.eye.holdSec) turnDone(true); // はずかしくて その場で とまる
    } else if (phase === 'bigvanish') {
      fade(clamp01(pt / T.timing.vanishSec));
      if (pt >= T.timing.vanishSec) { pivot.visible = false; phase = 'bigtext'; pt = 0; showBig(true); bgm.request('girl', false); }
    } else if (phase === 'bigtext') {
      if (pt >= T.eye.bigTextSec) { showBig(false); phase = 'bigwait'; pt = 0; }
    } else if (phase === 'bigwait') {
      if (pt >= T.eye.bigWaitSec) { turn = 0; cancels = 0; bigCount++; chooseWarp(); phase = 'gone'; pt = T.timing.goneSec; }
    } else if (phase === 'laugh' || phase === 'orbit' || phase === 'pose') {
      if (intro) for (const e of intro.update(dt)) onIntro(e);
      if (phase === 'orbit' || phase === 'pose') faceTo(p);
      if (phase === 'pose') {
        poseT += dt;
        blendPose(standBase, poseBones(), clamp01(poseT / Math.max(0.01, T.intro.poseBlendSec)));
        groundFeet();
      }
    } else if (phase === 'perchgo') {
      fade(clamp01(pt / T.timing.vanishSec));
      if (pt >= T.timing.vanishSec) { pivot.visible = false; perchBegin(); }
    } else if (phase === 'perch') {
      updatePerch(dt);
      fade(1 - clamp01(pt / T.timing.appearSec));
      if (pt >= T.eye.bigWaitSec) perchEnd();
    } else if (phase === 'down') {
      updatePerch(dt);
    } else if (phase === 'crumble') {
      updatePerch(dt); updateCrumble(dt);
    } else if (phase === 'perchleave') {
      fade(clamp01(pt / T.timing.vanishSec));
      if (pt >= T.timing.vanishSec) { phase = 'gone'; pt = T.timing.goneSec; fade(1); pivot.visible = false; }
    } else {
      faceTo(p);
      if (spell === 2) castLen = Math.max(clipDur(), T.cast.fireAt * clipDur() + T.s3.count * T.s3.shotGap + 0.4);
      if (spell === 3) castLen = Math.max(clipDur(), T.cast.fireAt * clipDur() + T.s4.secondWaveSec + 0.4);
      if (!fired && pt >= T.cast.fireAt * clipDur()) { fired = true; fire(); }
      if (spell === 3 && fired && !wave2Done && pt >= T.cast.fireAt * clipDur() + T.s4.secondWaveSec) { wave2Done = true; fireWave(T.s4.secondShift); }
      if (spell === 2 && fired) {
        const due = Math.floor((pt - T.cast.fireAt * clipDur()) / T.s3.shotGap + 1e-6) + 1;
        while (fbShots < Math.min(T.s3.count, due)) shootFireball(fbShots++);
      }
      if (spell === 2) { // 火の玉が 0.1 秒おきに ぽっと 出て ふわふわ うかぶ
        const shown = Math.min(T.s3.count, Math.floor((pt - T.s3.orbStartSec) / T.s3.orbGap) + 1);
        while (orbSounds < shown) { orbSounds++; sfx.s3Spawn(); } // 火の玉が 1 つ 出るたびに「ぽっ」
        for (let i = fbShots; i < shown; i++) {
          orbPos(i, hp);
          if (pt - T.s3.orbStartSec - i * T.s3.orbGap < dt * 1.5) add.emit(hp.x, hp.y, hp.z, 0, 0, 0, 0.2, 1.6, 0.3, 0xfff0c0, 0xff7010);
          add.emit(hp.x, hp.y, hp.z, 0, 0, 0, dt * 2, 0.55, 0.55, 0xfff6c8, 0xffe080);
          add.emit(hp.x, hp.y, hp.z, 0, 0, 0, dt * 2, 1.2, 1.2, 0xff8a20, 0xff6010);
        }
      }
      handPos(hp);
      for (let k = 0; k < 2; k++) add.emit(hp.x + vr(-0.2, 0.2), hp.y + vr(-0.2, 0.2), hp.z + vr(-0.2, 0.2), vr(-0.3, 0.3), vr(0.2, 0.9), vr(-0.3, 0.3), 0.5, 0.14, 0.03, 0xf0d8ff, 0x7030d0);
      if (pt >= castLen) endCast();
    }
    if (mixerLeft > 0 && !frozen) {
      mixer.update(dt); pivot.updateMatrixWorld(true);
      mixerLeft -= dt;
      if (mixerLeft <= 0) { action.stop(); mixer.stopAllAction(); restorePose(); }
    }
    pivot.updateMatrixWorld(true);
    // 目が 合った？（出てから 0.5 秒いない。止められるのは 2 回まで）
    eyeNow = checkEye();
    if (eyeNow && cancels < T.eye.maxCancels && ((phase === 'appear' && pt < T.eye.windowSec) || (phase === 'cast' && pt < T.eye.windowSec - T.timing.appearSec))) {
      cancels++;
      if (phase === 'cast') { action.fadeOut(0.1); mixerLeft = 0.2; }
      phase = 'shy'; pt = 0; fade(0); if (mixerLeft <= 0) { restorePose(); model.position.set(model.position.x, y0, model.position.z); } shyT = 0; setShy(true); shyT = 0; blushPlayed = false; beep();
    }
    updateShy(dt);
    // 詠唱が はじまったら 足もとに うすい 予告の 輪（どこまで にげれば いいか）
    const warn = phase === 'cast' && spell === 1 && !fired;
    showVortexWarn(warn); warnMat.opacity = 0.3 + 0.1 * Math.sin(t * 8);
    erups.forEach((e) => e.update(dt)); vortices.forEach((v) => v.update(dt)); updateProjs(dt);
    // 魔法 1: 輪の 中に いる あいだ ずっと（むてき時間ごと）
    if (t >= nextSetHit) {
      let src: { x: number; y: number; z: number } | null = null, isRing = false;
      for (const e of erups) if (e.hitActive() && Math.hypot(p.x - e.e.x, p.z - e.e.z) < e.e.rad && Math.abs(p.y - e.e.y) < 3) { src = { x: e.e.x, y: p.y, z: e.e.z }; isRing = true; break; }
      if (!src) for (const v of vortices) if (v.hits(p.x, p.z)) { src = { x: v.v.x, y: p.y, z: v.v.z }; break; }
      if (src) {
        const r = setHit(src);
        if (r === 'hit') { if (isRing) stats.ringHits++; else stats.vortexHits++; }
        if (r !== 'retry') nextSetHit = t + T.parry.setCooldownSec;
      }
    }
    // 魔法 2: 渦の 中に いる あいだ ずっと（むてき時間ごと）。渦と 渦の すき間は 安全
    add.update(dt); smoke.update(dt);
    // 俯瞰カメラの 目標（ふたりの まんなかを 見る）
    const gp = pivot.position, f = fwdOf(p);
    const wMid = Math.hypot(p.x - gp.x, p.z - gp.z) > 8 ? 0.46 : 0.5; // 遠い ときは プレイヤー寄り（扇が ひろがって くるのが 見える）
    let mx = p.x + (gp.x - p.x) * wMid, mz = p.z + (gp.z - p.z) * wMid;
    const my = p.y + 1;
    if (spell === 0) { const f0 = fwdOf(p); mx = p.x + f0.fx * 2.5; mz = p.z + f0.fz * 2.5; } // 魔法 1: 輪が 出る 足もと〜前を まんなかに
    const sep = Math.hypot(p.x - gp.x, p.z - gp.z), ex = spell === 1 ? 12 : spell === 0 ? 7 : Math.max(0, sep - 5) * (spell === 3 ? 1.7 : 1); // 180° の 扇は ひろいので 引く
    const tp = new Vector3(mx + f.rx * (3.6 + 0.3 * ex) + f.fx * (2 + 0.2 * ex), my + 4.5 + 0.4 * ex, mz + f.rz * (3.6 + 0.3 * ex) + f.fz * (2 + 0.2 * ex));
    const tl = new Vector3(mx, my, mz);
    if (!camTarget.init) { camTarget.pos.copy(tp); camTarget.look.copy(tl); camTarget.init = true; }
    else { camTarget.pos.lerp(tp, 0.15); camTarget.look.lerp(tl, 0.15); }
  });
  const upOff = new Vector3();
  const baseFov = (deps.camera as PerspectiveCamera).fov ?? 70;
  deps.onBeforeRender(() => {
    if (phase === 'dormant') return;
    const cam = deps.camera as PerspectiveCamera;
    const px = (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / (2 * Math.tan((cam.fov * D2R) / 2));
    add.mat.uniforms.uPx!.value = px; smoke.mat.uniforms.uPx!.value = px;
    const wantFov = baseFov;
    if (camMode === 'idleSide') { const q = pivot.rotation.y; cam.position.set(pivot.position.x + Math.cos(q) * 4.6, pivot.position.y + 1.7, pivot.position.z - Math.sin(q) * 4.6); cam.lookAt(pivot.position.x, pivot.position.y + 1.5, pivot.position.z); cam.updateMatrixWorld(true); }
    if (camMode === 'idle') { const q = pivot.rotation.y; cam.position.set(pivot.position.x + Math.sin(q) * 3.8 + Math.cos(q) * 1.0, pivot.position.y + 1.9, pivot.position.z + Math.cos(q) * 3.8 - Math.sin(q) * 1.0); cam.lookAt(pivot.position.x, pivot.position.y + 1.5, pivot.position.z); cam.updateMatrixWorld(true); }
    if (camMode !== 'default' && cam.fov !== wantFov) { cam.fov = wantFov; cam.updateProjectionMatrix(); } // ふだんの 画角は ゲームに まかせる
    if ((camMode === 'look' || camMode === 'close') && pivot.visible) { const p = deps.player(); headCenter(headC);
      cam.position.set(p.x, p.y + 1.6, p.z);
      if (camMode === 'close') { upOff.copy(cam.position).sub(headC); upOff.y = 0; cam.position.copy(headC).addScaledVector(upOff.normalize(), 1.7); cam.position.y = headC.y + 0.1; } // 顔の すぐ 前まで 近づく
      cam.lookAt(headC.x, headC.y + (camMode === 'close' ? 0.15 : 0), headC.z); cam.updateMatrixWorld(true); }
    if (camMode === 'overview') { cam.position.copy(camTarget.pos); cam.lookAt(camTarget.look); cam.updateMatrixWorld(true); }
  });

  // ---- BGM「災厄」（少女が 出ている 間 ループ。大きな 姿の「神々の 戯れ」と 共通の 係 gashaBgm.ts が 流す。ファイルが なければ 音なし） ----
  const bgm = sharedGashaBgm({ bgmOut: deps.bgmOut, suppressBgm: deps.suppressBgm });
  bgm.preload('saiyaku'); // 少女が 出る 瞬間に 曲が とぎれない ように 先に 読みこむ（FIX-BRIEF-2 §3-4）
  const bgmStep = () => bgm.step();

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
  /** ねかせる とき・止める とき: 少女・魔法・弾・文字・BGM の 頼みを ぜんぶ 消す */
  const sleep = (): void => {
    action.stop(); mixer.stopAllAction(); mixerLeft = 0; restorePose(); model.rotation.x = 0; flinchT = 0;
    fade(0);
    pivot.visible = false;
    setShy(false); showBig(false);
    intro = null; perchOn = false; opts.setHitBox?.(null); bgm.uncut();
    for (const e of erups) { e.e.t = -1; e.e.root.visible = false; }
    for (const v of vortices) { v.v.t = -1; v.v.root.visible = false; v.showWarn(false); }
    for (const q of projs) q.on = false;
    for (const b of bursts) { b.on = false; b.mesh.visible = false; }
    add.clear(); smoke.clear();
    add.points.visible = smoke.points.visible = false;
    forced = -1; reflectWait = 0; holdStand = false; downPerched = false; crumbleAcc = 0;
    bgm.request('girl', false);
    sfxPlayer.stopAll?.(); // 遅れて 鳴らす 予約の 効果音(間欠泉の 噴出など)も 止める
  };
  if (dormant) sleep();
  const warn0 = () => phase === 'cast' && spell === 1 && !fired;
  const handle: GashaGirlHandle = {
    tune: (o) => applyTune(o),
    forceParry: (r) => { parryForce = r; },
    place, figures: [pivot],
    labels: (riky, w, h) => {
      const pts = [new Vector3(pivot.position.x, pivot.position.y + H + 0.3, pivot.position.z), new Vector3(riky.x, riky.y + 2.1, riky.z)];
      return pts.map((v) => { v.project(deps.camera); return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }; });
    },
    phase: () => phase,
    setSeed: (n) => { rs = n >>> 0; vs = (Math.imul(n, 7919) + 13) >>> 0; },
    warpNow: (s) => { if (s !== undefined) forced = (s - 1 + SPELLS) % SPELLS; if (phase === 'stand') pt = 2.0; },
    camera: (m) => { camMode = m; camTarget.init = false; },
    resetTurns: () => { turn = 0; cancels = 0; bigCount = 0; setShy(false); showBig(false); },
    holdStand: (on) => { holdStand = on; },
    standNow: () => { if (phase === 'stand') pt = 0; },
    nextSpell: (n) => { forced = (n - 1 + SPELLS) % SPELLS; },
    predictSide: () => (mulberry(rs)[1] < 0.5 ? 'left' : 'back'),
    info: () => ({
      bgmFile: bgm.info('saiyaku').file, bgmStarted: bgm.info('saiyaku').started, bgmDur: bgm.info('saiyaku').duration, bgmLoop: bgm.info('saiyaku').loop,
      bgmLoops: bgm.info('saiyaku').loops, bgmFade: bgm.info('saiyaku').fade, bgmCtx: bgm.info('saiyaku').ctx, bgmPlaying: bgm.status().playing ?? 'none', bgmGirlLock: bgm.status().girlLock,
      turn, cancels, eyeContact: eyeNow, soundCount, lastSoundT, bigCount, shy: shyT >= 0, warnRing: warn0(), camMode, camFov: (deps.camera as PerspectiveCamera).fov, parried: st2.parried, parryEarly: st2.parryEarly, reflected: st2.reflected, reflectHits: st2.reflectHits, flinch: flinchT > 0, hitActive: erups.some((e) => e.hitActive()), eruptionR: Math.max(...erups.map((e) => (e.e.t >= 0 ? e.e.rad : 0))), eruptionMaxR: T.s1.radius, playerHp: deps.hp(), playerMaxHp: deps.maxHp(), phase, spell: spell + 1, forced, castT: pt, side, dist, eruptionT: Math.max(...erups.map((e) => e.e.t)), vortexT: Math.max(...vortices.map((v) => v.v.t)), vortexCount: vortices.filter((v) => v.v.t >= 0).length,
      fireballs: projs.filter((q) => q.on && q.kind === 0).length, waves: projs.filter((q) => q.on && q.kind === 1).length,
      ...stats, girlX: pivot.position.x, girlZ: pivot.position.z,
    }),
  };
  (window as unknown as { __gashaGirl: GashaGirlHandle }).__gashaGirl = handle;
  void Color;
  const controller: GirlController = {
    summon: () => {
      if (!dormant || phase !== 'dormant') return;
      add.points.visible = smoke.points.visible = true;
      turn = 0; cancels = 0; reflectWait = 0;
      chooseWarp();
      intro = new IntroSeq(T.intro);
      phase = 'laugh'; pt = 0; pivot.visible = false;
      for (const e of intro.start()) onIntro(e); // 笑い声(少女は まだ 見えない)→ ワープで 飛びまわる → 決めポーズ → 戦い
    },
    dismiss: () => {
      if (!dormant || phase === 'dormant') return;
      phase = 'dormant';
      sleep();
    },
    finish: () => { if (dormant) downBegin(); },
    crumble: () => { if (dormant) crumbleBegin(); },
    active: () => phase !== 'dormant',
    stage: () => (phase === 'dormant' ? 'off' : phase === 'down' || phase === 'crumble' ? phase : phase === 'laugh' || phase === 'orbit' || phase === 'pose' ? phase : phase === 'perchgo' || phase === 'perch' || phase === 'perchleave' ? 'perch' : 'girl'),
    handle,
  };
  return controller;
}
