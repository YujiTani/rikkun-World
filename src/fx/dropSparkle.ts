import * as THREE from 'three';
import type { Rarity } from '../contracts';
import { RARITY_COLOR } from '../drops/rarity';

/** 光の柱のキラキラ（めずらしさごと）。値はここに置く */
export interface SparkleSpec {
  /** 1 秒に のぼる つぶの数 */
  rate: number;
  /** 柱のはば（マス） */
  width: number;
  /** 柱の濃さ（ふつう 0.3） */
  opacity: number;
  /** 柱の明るさが 1 秒に 1 回ゆっくりゆれる */
  pulse: boolean;
  /** にじ色に ゆっくり 色が流れる */
  rainbow: boolean;
  /** 星形のつぶ */
  stars: boolean;
}

export const SPARKLE: Record<Rarity, SparkleSpec> = {
  common: { rate: 2, width: 0.12, opacity: 0.3, pulse: false, rainbow: false, stars: false },
  uncommon: { rate: 4, width: 0.12, opacity: 0.3, pulse: false, rainbow: false, stars: false },
  rare: { rate: 7, width: 0.18, opacity: 0.42, pulse: true, rainbow: false, stars: false },
  superRare: { rate: 12, width: 0.28, opacity: 0.42, pulse: true, rainbow: false, stars: true },
  // 5〜7 段目（RARITY-7 §4.5）: つぶ・はば・こさ・ゆれは 4 段目と同じ。色は 案 A の段の色。にじ色に流れるのは 7 段目だけ（今の 4 段目のにじは 7 段目に うつした）
  epic: { rate: 12, width: 0.28, opacity: 0.42, pulse: true, rainbow: false, stars: true },
  mythic: { rate: 12, width: 0.28, opacity: 0.42, pulse: true, rainbow: false, stars: true },
  legendary: { rate: 12, width: 0.28, opacity: 0.42, pulse: true, rainbow: true, stars: true },
};

export const SPARKLE_CFG = {
  /** つぶが のぼってから消えるまで（秒） */
  life: 2.5,
  /** のぼる高さ */
  height: 6,
  /** 明るさのゆれ（回/秒）。3 回/秒 未満 */
  pulseHz: 1,
  pulseDepth: 0.25,
  /** にじ色が ひとまわりする秒数 */
  rainbowSeconds: 10,
  /** 着地の ぱっと光る: つぶの数（めずらしさごと）・長さ・広がり */
  flashCount: { common: 4, uncommon: 6, rare: 9, superRare: 14, epic: 14, mythic: 14, legendary: 14 } as Record<Rarity, number>,
  flashSeconds: 0.45,
  flashRadius: { common: 0.35, uncommon: 0.45, rare: 0.6, superRare: 0.85, epic: 0.85, mythic: 0.85, legendary: 0.85 } as Record<Rarity, number>,
  maxDots: 1200,
  maxStars: 600,
  maxFlashes: 24,
} as const;

/** 1 本の柱の つぶの数（rate × life） */
export function sparkleCount(r: Rarity): number {
  return Math.round(SPARKLE[r].rate * SPARKLE_CFG.life);
}

/** 柱の濃さ（ゆれがあれば 1 秒に 1 回ゆっくり） */
export function pillarOpacity(r: Rarity, time: number): number {
  const s = SPARKLE[r];
  return s.pulse ? s.opacity * (1 - SPARKLE_CFG.pulseDepth + SPARKLE_CFG.pulseDepth * Math.sin(2 * Math.PI * SPARKLE_CFG.pulseHz * time)) : s.opacity;
}

/** にじ色の色相 0〜1 */
export function rainbowHue(time: number, offset = 0): number {
  const h = (time / SPARKLE_CFG.rainbowSeconds + offset) % 1;
  return h < 0 ? h + 1 : h;
}

/**
 * WEAPON-7 §2.3: 7 段目（legendary）の 袋 そのものの 色の 色相 0〜1。にじ色に ゆっくり 変わる（光の柱・わ と 同じ 流れ。点滅なし）。
 * 柱とは 少し ずらして 袋が 柱に とけない ように する
 */
export function bagBodyHue(time: number): number {
  return rainbowHue(time, 0.5);
}

function makeTexture(star: boolean): THREE.DataTexture {
  const N = 16;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - N / 2) / (N / 2);
      const dy = (y + 0.5 - N / 2) / (N / 2);
      const d = Math.hypot(dx, dy);
      // 星 = 十字に のびる光 + 中心
      const a = star ? Math.max(0, 1 - d) * 0.6 + Math.max(0, 1 - Math.min(Math.abs(dx), Math.abs(dy)) * 6) * Math.max(0, 1 - d * 0.95) : Math.max(0, 1 - d);
      const o = (y * N + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.min(255, Math.round(a * 255));
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

interface Layer {
  points: THREE.Points;
  pos: Float32Array;
  col: Float32Array;
  n: number;
  cap: number;
}

function makeLayer(cap: number, star: boolean, size: number): Layer {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const m = new THREE.PointsMaterial({
    size,
    map: makeTexture(star),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  m.userData.noDim = true;
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 4;
  return { points, pos, col, n: 0, cap };
}

const C = new THREE.Color();
const BASE = new THREE.Color();

/**
 * キラキラの つぶ。まるい つぶ用と 星形用の Points が 1 つずつ（落とし物が何こでも 描画は +2）。
 * 毎フレーム begin() → addPillar()/addFlash() → end()。配列は使いまわす
 */
export class SparkleLayer {
  readonly dots = makeLayer(SPARKLE_CFG.maxDots, false, 0.3);
  readonly stars = makeLayer(SPARKLE_CFG.maxStars, true, 0.5);
  /** 着地の ぱっと光る（ぐるぐる使いまわし） */
  private readonly fx = new Float32Array(SPARKLE_CFG.maxFlashes);
  private readonly fy = new Float32Array(SPARKLE_CFG.maxFlashes);
  private readonly fz = new Float32Array(SPARKLE_CFG.maxFlashes);
  private readonly ft = new Float32Array(SPARKLE_CFG.maxFlashes).fill(-1);
  private readonly fr: Rarity[] = new Array(SPARKLE_CFG.maxFlashes).fill('common');
  private fi = 0;

  addTo(parent: THREE.Object3D): void {
    parent.add(this.dots.points, this.stars.points);
  }

  removeFrom(parent: THREE.Object3D): void {
    parent.remove(this.dots.points, this.stars.points);
  }

  /** 着地の ぱっと光る を 1 つ始める */
  flash(x: number, y: number, z: number, r: Rarity): void {
    const i = this.fi++ % SPARKLE_CFG.maxFlashes;
    this.fx[i] = x;
    this.fy[i] = y;
    this.fz[i] = z;
    this.fr[i] = r;
    this.ft[i] = 0;
  }

  /** いま光っている 着地フラッシュの数 */
  activeFlashes(): number {
    let n = 0;
    for (let i = 0; i < this.ft.length; i++) if (this.ft[i]! >= 0) n++;
    return n;
  }

  begin(dt: number): void {
    this.dots.n = 0;
    this.stars.n = 0;
    for (let i = 0; i < this.ft.length; i++) if (this.ft[i]! >= 0) this.ft[i] = this.ft[i]! + dt >= SPARKLE_CFG.flashSeconds ? -1 : this.ft[i]! + dt;
  }

  private put(l: Layer, x: number, y: number, z: number, r: number, g: number, b: number, fade: number): void {
    if (l.n >= l.cap) return;
    const i = l.n++ * 3;
    l.pos[i] = x;
    l.pos[i + 1] = y;
    l.pos[i + 2] = z;
    l.col[i] = r * fade;
    l.col[i + 1] = g * fade;
    l.col[i + 2] = b * fade;
  }

  /** 1 本の柱の キラキラ。(x, baseY, z) は 柱の根もと */
  addPillar(x: number, baseY: number, z: number, rarity: Rarity, time: number, salt: number): void {
    const spec = SPARKLE[rarity];
    const n = sparkleCount(rarity);
    const layer = spec.stars ? this.stars : this.dots;
    BASE.setHex(RARITY_COLOR[rarity]);
    for (let j = 0; j < n; j++) {
      const phase = (time / SPARKLE_CFG.life + j / n + salt) % 1;
      const ang = j * 2.399 + phase * 4;
      const rad = spec.width * 0.5 + 0.08 + 0.12 * Math.sin(j * 1.7 + phase * 6);
      if (spec.rainbow) C.setHSL(rainbowHue(time, j / n), 0.75, 0.65);
      else C.copy(BASE);
      // 柱の色 + 白 のまじり
      C.lerp(WHITE, 0.25 + 0.35 * ((j * 0.618) % 1));
      this.put(layer, x + Math.cos(ang) * rad, baseY + 0.3 + phase * SPARKLE_CFG.height, z + Math.sin(ang) * rad, C.r, C.g, C.b, Math.sin(phase * Math.PI));
    }
  }

  /** 1 フレーム分の 着地フラッシュを つぶにして入れる */
  addFlashes(): void {
    for (let i = 0; i < this.ft.length; i++) {
      const t = this.ft[i]!;
      if (t < 0) continue;
      const rar = this.fr[i]!;
      const k = t / SPARKLE_CFG.flashSeconds;
      const n = SPARKLE_CFG.flashCount[rar];
      const rad = SPARKLE_CFG.flashRadius[rar] * Math.sqrt(k);
      const layer = SPARKLE[rar].stars ? this.stars : this.dots;
      BASE.setHex(RARITY_COLOR[rar]).lerp(WHITE, 0.5);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + i;
        this.put(layer, this.fx[i]! + Math.cos(a) * rad, this.fy[i]! + 0.25 + k * 0.35, this.fz[i]! + Math.sin(a) * rad, BASE.r, BASE.g, BASE.b, 1 - k);
      }
    }
  }

  end(): void {
    for (const l of [this.dots, this.stars]) {
      l.points.geometry.setDrawRange(0, l.n);
      l.points.geometry.attributes.position!.needsUpdate = true;
      l.points.geometry.attributes.color!.needsUpdate = true;
      l.points.visible = l.n > 0;
    }
  }

  dispose(): void {
    for (const l of [this.dots, this.stars]) {
      l.points.geometry.dispose();
      (l.points.material as THREE.PointsMaterial).map?.dispose();
      (l.points.material as THREE.PointsMaterial).dispose();
    }
  }
}

const WHITE = new THREE.Color(1, 1, 1);
