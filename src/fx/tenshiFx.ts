import * as THREE from 'three';
import type { ArrowInfo, Vec3 } from '../contracts';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { DotPoints } from './dotPoints';
import { createFeathers, flapScale, pickTrails, wingFrame } from './tenshiFxModel';

/**
 * 天使の弓の 絵（LEGEND-4 PR3 §6.3-11）: 背中の 白い つばさ（pixelfx wings-large）・矢の うしろの 羽の すじ（feather-trail）・空中ジャンプの 羽。見た目だけ。
 * 絵は スプライトシート（public/models/fx/tenshi_wings.png・tenshi_trail.png。出どころは THIRD-PARTY-NOTICES.md）。
 * 描画 3・三角形 14（つばさ 板 1 まい = 2、羽の すじ 3 本 × 十字 2 まい = 12、舞う 羽 = 点 48 まで）。上限は 描画 4・三角形 150・点 48（LEGEND-4 §3.7）。毎ステップ new しない。
 * つばさは うしろから 見る 1 まいの 板（背中の 後ろに 立てる）。矢の すじは ゲームの 十字の 板（docs/art/design/05-effects.md §17）。
 */
const T = LEGEND4_TUNING.tenshi;
/** 矢が ない とき の 空の 入れ物（使いまわす） */
const NO_TRAILS: never[] = [];
const BASE = './models/fx/';
/** つばさの シート: 5 れつ × 3 ぎょう（112×72 点） */
const WING = { cols: 5, rows: 3, w: 112, h: 72, originY: 42 };
/** 羽の すじの シート: 4 れつ × 3 ぎょう（112×32 点。矢の 先は 左から 92 点め） */
const TRAIL = { cols: 4, rows: 3, w: 112, h: 32, tipX: 92 };
/** つばさの 高さ（体の 背中の 高さ。足もとから） */
const BACK_Y = 1.15;
/** 背中から うしろへ（マス） */
const BACK_Z = 0.22;
const FEATHER_COLOR = new THREE.Color(0xf6f8ff);

function sheet(file: string): THREE.Texture {
  const t = new THREE.TextureLoader().load(`${BASE}${file}`);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** コマ k の uv（4 点: 左上・左下・右下・右上）を 書く */
function frameUv(uv: Float32Array, o: number, k: number, cols: number, rows: number): void {
  const c = k % cols;
  const r = Math.floor(k / cols);
  const u0 = c / cols;
  const u1 = (c + 1) / cols;
  const vt = 1 - r / rows;
  const vb = 1 - (r + 1) / rows;
  uv[o] = u0; uv[o + 1] = vt;
  uv[o + 2] = u0; uv[o + 3] = vb;
  uv[o + 4] = u1; uv[o + 5] = vb;
  uv[o + 6] = u1; uv[o + 7] = vt;
}

function makeMesh(verts: number, tex: THREE.Texture, index: number[], order: number): { mesh: THREE.Mesh; pos: THREE.BufferAttribute; uv: THREE.BufferAttribute; mat: THREE.MeshBasicMaterial } {
  const g = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
  const uv = new THREE.BufferAttribute(new Float32Array(verts * 2), 2);
  pos.setUsage(THREE.DynamicDrawUsage);
  uv.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pos);
  g.setAttribute('uv', uv);
  g.setIndex(index);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = order;
  mesh.visible = false;
  return { mesh, pos, uv, mat };
}

/** 1 ステップに 入れる 物 */
export interface TenshiFxIn {
  /** 足もとの 位置 */
  position: Vec3;
  /** 体の 向き（度。player.state.facingDeg） */
  facingDeg: number;
  /** 天使の弓を 持って いる */
  held: boolean;
  /** 一人称の 自分の 画面（つばさを 出さない） */
  hide: boolean;
  /** 動きを へらす（羽ばたき・舞う 羽・すじの うごきを 止める。形は 同じ） */
  reduced: boolean;
  /** その 人の 飛んで いる 矢 */
  arrows: readonly ArrowInfo[];
}

export class TenshiFx {
  private readonly group = new THREE.Group();
  private readonly wingTex = sheet('tenshi_wings.png');
  private readonly trailTex = sheet('tenshi_trail.png');
  private readonly wing = makeMesh(4, this.wingTex, [0, 1, 2, 0, 2, 3], 9);
  private readonly trail = makeMesh(T.trailMax * 8, this.trailTex, Array.from({ length: T.trailMax * 2 }, (_, q) => [q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3]).flat(), 8);
  private readonly dots = new DotPoints(T.featherPointsMax, { renderOrder: 9 });
  private readonly feathers = createFeathers();
  private tick = 0;
  private flap = 0;

  constructor(scene: THREE.Object3D) {
    this.group.add(this.wing.mesh, this.trail.mesh);
    scene.add(this.group, this.dots.points);
  }

  /** 空中ジャンプが 出た ステップに（足もとに 羽・つばさが 1 回 羽ばたく） */
  airJump(at: Vec3, reduced: boolean): void {
    if (reduced) return;
    this.flap = T.flapSteps;
    this.feathers.burst(at);
  }

  /** 1 ステップに 1 回 */
  step(i: TenshiFxIn): void {
    this.tick += 1;
    this.stepWings(i);
    this.stepTrails(i.arrows, i.held || i.arrows.length > 0);
    this.stepDots(i.reduced);
  }

  dispose(): void {
    for (const m of [this.wing, this.trail]) {
      m.mesh.geometry.dispose();
      m.mat.dispose();
    }
    this.wingTex.dispose();
    this.trailTex.dispose();
    this.dots.dispose();
    this.group.removeFromParent();
    this.dots.points.removeFromParent();
  }

  private stepWings(i: TenshiFxIn): void {
    const w = this.wing;
    if (!i.held || i.hide) {
      w.mesh.visible = false;
      this.flap = 0;
      return;
    }
    if (this.flap > 0) this.flap -= 1;
    const yaw = (i.facingDeg * Math.PI) / 180;
    const px = i.position.x - Math.sin(yaw) * BACK_Z;
    const pz = i.position.z + Math.cos(yaw) * BACK_Z;
    const rx = Math.cos(yaw); // 体の 右
    const rz = Math.sin(yaw);
    const half = T.wingWidth / 2;
    const px1 = T.wingWidth / WING.w; // 1 点の 大きさ
    const top = WING.originY * px1; // 背中の 点から 上の 絵の はし
    const bottom = (WING.h - WING.originY) * px1;
    const sy = i.reduced ? 1 : flapScale(this.flap);
    const y = i.position.y + BACK_Y;
    const p = w.pos.array as Float32Array;
    const set = (o: number, side: number, dy: number): void => {
      p[o] = px + rx * half * side;
      p[o + 1] = y + dy;
      p[o + 2] = pz + rz * half * side;
    };
    set(0, -1, top * sy);
    set(3, -1, -bottom);
    set(6, 1, -bottom);
    set(9, 1, top * sy);
    frameUv(w.uv.array as Float32Array, 0, i.reduced ? 0 : wingFrame(this.tick), WING.cols, WING.rows);
    w.pos.needsUpdate = true;
    w.uv.needsUpdate = true;
    w.mesh.visible = true;
  }

  private stepTrails(arrows: readonly ArrowInfo[], any: boolean): void {
    const t = this.trail;
    const list = any ? pickTrails(arrows) : NO_TRAILS;
    if (list.length === 0) {
      t.mesh.visible = false;
      return;
    }
    const p = t.pos.array as Float32Array;
    const uv = t.uv.array as Float32Array;
    p.fill(0);
    const L = T.trailLength;
    const back = L * (TRAIL.tipX / TRAIL.w);
    const front = L - back;
    const half = (L * TRAIL.h) / TRAIL.w / 2;
    const frame = Math.floor(this.tick / 2) % T.trailFrames;
    for (let n = 0; n < list.length; n++) {
      const a = list[n]!;
      const sp = Math.hypot(a.velocity.x, a.velocity.y, a.velocity.z) || 1;
      const dx = a.velocity.x / sp;
      const dy = a.velocity.y / sp;
      const dz = a.velocity.z / sp;
      // s = 向き × 上（真上・真下なら x 軸）、v = s × 向き（矢の 向きに そった たて板と 水平の 板）
      let sx = -dz;
      let sz = dx;
      let sl = Math.hypot(sx, sz);
      if (sl < 1e-3) {
        sx = 1;
        sz = 0;
        sl = 1;
      }
      sx /= sl;
      sz /= sl;
      const vx = -sz * dy;
      const vy = sz * dx - sx * dz;
      const vz = sx * dy;
      const ax = a.position.x - dx * back;
      const ay = a.position.y - dy * back;
      const az = a.position.z - dz * back;
      const bx = a.position.x + dx * front;
      const by = a.position.y + dy * front;
      const bz = a.position.z + dz * front;
      for (let q = 0; q < 2; q++) {
        const hx = (q === 0 ? vx : sx) * half;
        const hy = (q === 0 ? vy : 0) * half;
        const hz = (q === 0 ? vz : sz) * half;
        const o = (n * 2 + q) * 12;
        p[o] = ax + hx; p[o + 1] = ay + hy; p[o + 2] = az + hz;
        p[o + 3] = ax - hx; p[o + 4] = ay - hy; p[o + 5] = az - hz;
        p[o + 6] = bx - hx; p[o + 7] = by - hy; p[o + 8] = bz - hz;
        p[o + 9] = bx + hx; p[o + 10] = by + hy; p[o + 11] = bz + hz;
        frameUv(uv, (n * 2 + q) * 8, frame, TRAIL.cols, TRAIL.rows);
      }
    }
    t.pos.needsUpdate = true;
    t.uv.needsUpdate = true;
    t.mesh.visible = true;
  }

  private stepDots(reduced: boolean): void {
    if (reduced) this.feathers.clear();
    else this.feathers.step();
    this.dots.reset();
    for (const f of this.feathers.list()) this.dots.add(f.x, f.y, f.z, FEATHER_COLOR, 2);
    this.dots.done();
  }
}
