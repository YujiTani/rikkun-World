import * as THREE from 'three';
import type { M7Settings, PetResult, Vec3 } from '../contracts';

/**
 * 畑の キラキラ・ハート・なでた ゆれ（M7-2 §3.4・§4.5）。
 * 中身（`FarmSparkle`）は 描かない。つぶの 一覧 を 持ち、毎ステップ `step()`。見た目は `FarmSparkleView` が
 * 2 つの Points（星・ハート）で 描く（描画 +2。光の しくみ には 入れない・夜でも 同じ 明るさ）。乱数は 使わない（場所 から 決める）。
 */

export const SPARKLE_STEPS = {
  /** 星: 40 ステップ で 0.4 マス のぼり、さいご 15 ステップ で 消える */
  starLife: 40,
  starRise: 0.4,
  starFade: 15,
  starSize: 0.12,
  /** ハート（なでた） */
  petHeartLife: 40,
  petHeartRise: 0.6,
  petHeartSize: 0.15,
  /** ハート（ごきげん） */
  moodHeartLife: 60,
  moodHeartRise: 0.5,
  moodHeartSize: 0.1,
  /** なでた ゆれ */
  swayLife: 24,
  swayDeg: 10,
  swayCycles: 2,
  /** 作物 の 一覧 を 作り直す 間 */
  refreshEvery: 15,
  /** なでた ハート の 同時 上限（ごきげん の ハート 32 とは 別） */
  petHeartMax: 32,
} as const;

type SparkleSettings = Pick<
  M7Settings,
  'farmSparkleEvery' | 'farmSparkleRange' | 'farmSparkleMax' | 'farmHeartEvery' | 'farmHeartRange' | 'farmHeartMax'
>;

export interface FarmSparkleDeps {
  settings: SparkleSettings;
  /** 作物・やせいの やさい の 一覧（stage を 持つ。`farm.crops()` が 合う。15 ステップ に 1 回 だけ 呼ぶ） */
  crops(): ReadonlyArray<{ x: number; y: number; z: number; stage: number }>;
  /** そのマス の 今の 段階（作物 でなければ null。しゅうかく 直後 の 星 を 出さない ため） */
  stageAt(x: number, y: number, z: number): number | null;
  /** ごきげん の 作物 を 1 つ ずつ 見る（`Pet.forEach` が 合う） */
  happy(fn: (x: number, y: number, z: number) => void): void;
}

export type ParticleKind = 'star' | 'heart';

/** 場所 から ずらし を 決める（0 以上 の 整数。乱数 では ない） */
export function placeHash(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const CAP = 256;

export class FarmSparkle {
  // つぶ の 並び（struct of arrays。リング）
  private readonly kind = new Uint8Array(CAP); // 0 星 1 ハート(なでた) 2 ハート(ごきげん)
  private readonly px = new Float32Array(CAP);
  private readonly py = new Float32Array(CAP);
  private readonly pz = new Float32Array(CAP);
  private readonly age = new Int16Array(CAP);
  private readonly life = new Int16Array(CAP); // 0 = 使っていない
  private cursor = 0;

  private cache: Array<{ x: number; y: number; z: number; off: number; heartOff: number }> = [];
  private cacheAt = -Infinity;
  private readonly due: number[] = [];
  private tickNow = 0;
  private emitIndex = 0;

  private readonly swayMap = new Map<number, { x: number; y: number; z: number; left: number }>();
  private eyeX = 0;
  private eyeY = 0;
  private eyeZ = 0;
  private readonly onHappy = (x: number, y: number, z: number): void => this.moodHeart(x, y, z);

  /** これまで に 出た 数（`farm.fx()` の counts。`reset()` で 0） */
  readonly counts = { star: 0, heart: 0 };

  constructor(private readonly d: FarmSparkleDeps) {}

  // ---------------------------------------------------------------- 出来事

  /** なでた（ハート 3 つ〈ごきげん に なった〉か 1 つ、ゆれ 24 ステップ） */
  onPet(x: number, y: number, z: number, result: PetResult): void {
    const n = result === 'happy' ? 3 : 1;
    for (let i = 0; i < n; i++) {
      const h = placeHash(x + i * 31, y, z + this.emitIndex++);
      const jx = ((h & 255) / 255 - 0.5) * 0.5;
      const jz = (((h >>> 8) & 255) / 255 - 0.5) * 0.5;
      // 3 つ は 少しずつ ずらして のぼる（同じ 場所 に かさならない）
      this.spawn(1, x + 0.5 + jx, y + 0.6 + i * 0.12, z + 0.5 + jz, SPARKLE_STEPS.petHeartLife);
    }
    this.swayMap.set(this.swayKey(x, y, z), { x, y, z, left: SPARKLE_STEPS.swayLife });
  }

  // ---------------------------------------------------------------- 毎ステップ

  /** 1 ステップ。`tick` = 農業 の ステップ、`eye` = 目 の 位置 */
  step(tick: number, eye: Vec3): void {
    this.tickNow = tick;
    this.eyeX = eye.x;
    this.eyeY = eye.y;
    this.eyeZ = eye.z;
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] === 0) continue;
      if (++this.age[i] >= this.life[i]) this.life[i] = 0;
    }
    if (this.swayMap.size > 0) for (const [k, s] of this.swayMap) if (--s.left <= 0) this.swayMap.delete(k);
    this.stars(tick);
    this.d.happy(this.onHappy);
  }

  private stars(tick: number): void {
    const s = this.d.settings;
    if (tick - this.cacheAt >= SPARKLE_STEPS.refreshEvery || tick < this.cacheAt) {
      this.cacheAt = tick;
      this.cache = [];
      for (const c of this.d.crops()) {
        if (c.stage !== 3) continue;
        const h = placeHash(c.x, c.y, c.z);
        this.cache.push({ x: c.x, y: c.y, z: c.z, off: h % Math.max(1, s.farmSparkleEvery), heartOff: 0 });
      }
    }
    const every = Math.max(1, s.farmSparkleEvery);
    const r2 = s.farmSparkleRange * s.farmSparkleRange;
    this.due.length = 0;
    for (let i = 0; i < this.cache.length; i++) {
      const c = this.cache[i];
      if ((tick + c.off) % every !== 0) continue;
      const dx = c.x + 0.5 - this.eyeX;
      const dy = c.y + 0.5 - this.eyeY;
      const dz = c.z + 0.5 - this.eyeZ;
      if (dx * dx + dy * dy + dz * dz > r2) continue;
      this.due.push(i);
    }
    if (this.due.length === 0) return;
    // 同時 に 多い ときは 近い 作物 を 先に
    if (this.due.length > 1) this.due.sort(this.byDistance);
    let active = this.active(0);
    for (const i of this.due) {
      if (active >= s.farmSparkleMax) break;
      const c = this.cache[i];
      if (this.d.stageAt(c.x, c.y, c.z) !== 3) continue;
      const h = placeHash(c.x * 7 + this.emitIndex++, c.y, c.z);
      const jx = ((h & 255) / 255 - 0.5) * 0.6;
      const jz = (((h >>> 8) & 255) / 255 - 0.5) * 0.6;
      const jy = ((h >>> 16) & 255) / 255 * 0.6;
      this.spawn(0, c.x + 0.5 + jx, c.y + 0.2 + jy, c.z + 0.5 + jz, SPARKLE_STEPS.starLife);
      active++;
    }
  }

  private readonly byDistance = (a: number, b: number): number => this.dist2(a) - this.dist2(b);

  private dist2(i: number): number {
    const c = this.cache[i];
    const dx = c.x + 0.5 - this.eyeX;
    const dy = c.y + 0.5 - this.eyeY;
    const dz = c.z + 0.5 - this.eyeZ;
    return dx * dx + dy * dy + dz * dz;
  }

  private moodHeart(x: number, y: number, z: number): void {
    const s = this.d.settings;
    const every = Math.max(1, s.farmHeartEvery);
    if ((this.tickNow + (placeHash(x, y, z) % every)) % every !== 0) return;
    const dx = x + 0.5 - this.eyeX;
    const dy = y + 0.5 - this.eyeY;
    const dz = z + 0.5 - this.eyeZ;
    if (dx * dx + dy * dy + dz * dz > s.farmHeartRange * s.farmHeartRange) return;
    if (this.active(2) >= s.farmHeartMax) return;
    this.spawn(2, x + 0.5, y + 0.7, z + 0.5, SPARKLE_STEPS.moodHeartLife);
  }

  private spawn(kind: 0 | 1 | 2, x: number, y: number, z: number, life: number): void {
    // 空いている 所 を さがす（リング。なければ いちばん 古い 所 を 上書き）
    let slot = -1;
    for (let k = 0; k < CAP; k++) {
      const i = (this.cursor + k) % CAP;
      if (this.life[i] === 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) slot = this.cursor;
    this.cursor = (slot + 1) % CAP;
    this.kind[slot] = kind;
    this.px[slot] = x;
    this.py[slot] = y;
    this.pz[slot] = z;
    this.age[slot] = 0;
    this.life[slot] = life;
    if (kind === 0) this.counts.star++;
    else this.counts.heart++;
  }

  /** いま 出ている つぶ の 数（kind: 0 星・1 なでた ハート・2 ごきげん ハート。-1 = ぜんぶ） */
  active(kind: -1 | 0 | 1 | 2 = -1): number {
    let n = 0;
    for (let i = 0; i < CAP; i++) if (this.life[i] !== 0 && (kind < 0 || this.kind[i] === kind)) n++;
    return n;
  }

  // ---------------------------------------------------------------- なでた ゆれ

  private swayKey(x: number, y: number, z: number): number {
    return (x * 4096 + z) * 512 + y;
  }

  /** ゆれ の のこり ステップ（無ければ 0）。`farm.look().sway` */
  sway(x: number, y: number, z: number): number {
    return this.swayMap.get(this.swayKey(x, y, z))?.left ?? 0;
  }

  /** 作物 の 板 の かたむき（度）。左右 ±10° で 2 往復（24 ステップ） */
  swayAngleDeg(x: number, y: number, z: number): number {
    const left = this.sway(x, y, z);
    if (left <= 0) return 0;
    const t = 1 - left / SPARKLE_STEPS.swayLife;
    return SPARKLE_STEPS.swayDeg * Math.sin(2 * Math.PI * SPARKLE_STEPS.swayCycles * t);
  }

  /** ゆれている 作物 を 1 つ ずつ 見る（角度つき）。見た目（`WorldRenderer.setSwaySource`）が 使う */
  forEachSway(fn: (x: number, y: number, z: number, deg: number) => void): void {
    for (const s of this.swayMap.values()) fn(s.x, s.y, s.z, this.swayAngleDeg(s.x, s.y, s.z));
  }

  // ---------------------------------------------------------------- テストの窓口

  /** 今 出ている つぶ（`farm.fx()`。テスト用。作る） */
  list(): Array<{ kind: ParticleKind; x: number; y: number; z: number }> {
    const out: Array<{ kind: ParticleKind; x: number; y: number; z: number }> = [];
    for (let i = 0; i < CAP; i++) if (this.life[i] !== 0) out.push({ kind: this.kind[i] === 0 ? 'star' : 'heart', x: this.px[i], y: this.py[i], z: this.pz[i] });
    return out;
  }

  /** `farm.fxReset()` */
  reset(): void {
    this.counts.star = 0;
    this.counts.heart = 0;
  }

  // ---------------------------------------------------------------- 見た目 へ

  /** つぶ を 描く 配列 へ 書く。戻り値 = 書いた 数 */
  write(
    kinds: number,
    out: { pos: Float32Array; col: Float32Array; size: Float32Array },
    cap: number,
  ): number {
    // kinds: 0 = 星 だけ、1 = ハート（なでた・ごきげん）
    let n = 0;
    for (let i = 0; i < CAP && n < cap; i++) {
      if (this.life[i] === 0) continue;
      const k = this.kind[i];
      if ((kinds === 0) !== (k === 0)) continue;
      const t = this.age[i] / this.life[i];
      const rise = k === 0 ? SPARKLE_STEPS.starRise : k === 1 ? SPARKLE_STEPS.petHeartRise : SPARKLE_STEPS.moodHeartRise;
      const remain = this.life[i] - this.age[i];
      // さいご 15 ステップ（星）／ のこり 1/3（ハート）で うすく
      const fadeLen = k === 0 ? SPARKLE_STEPS.starFade : this.life[i] / 3;
      const a = remain >= fadeLen ? 1 : remain / fadeLen;
      const j = n * 3;
      out.pos[j] = this.px[i];
      out.pos[j + 1] = this.py[i] + rise * t;
      out.pos[j + 2] = this.pz[i];
      // 星: 白 → 黄 の ゆらぎ。ハート: ピンク。うすく = 暗く（加算 ブレンド）
      if (k === 0) {
        out.col[j] = a;
        out.col[j + 1] = a * (0.88 + 0.12 * Math.sin(this.age[i] * 0.5));
        out.col[j + 2] = a * 0.7;
      } else {
        out.col[j] = a;
        out.col[j + 1] = a * 0.5;
        out.col[j + 2] = a * 0.67;
      }
      out.size[n] = k === 0 ? SPARKLE_STEPS.starSize : k === 1 ? SPARKLE_STEPS.petHeartSize : SPARKLE_STEPS.moodHeartSize;
      n++;
    }
    return n;
  }
}

// -------------------------------------------------------------------- 描く（Points 2 つ）

const STAR_ROWS = [
  '................',
  '.......##.......',
  '.......##.......',
  '.......##.......',
  '.......##.......',
  '.......##.......',
  '.....######.....',
  '.#############..',
  '.#############..',
  '.....######.....',
  '.......##.......',
  '.......##.......',
  '.......##.......',
  '.......##.......',
  '................',
  '................',
];
const HEART_ROWS = [
  '................',
  '................',
  '..####....####..',
  '.######..######.',
  '################',
  '################',
  '################',
  '################',
  '.##############.',
  '..############..',
  '...##########...',
  '....########....',
  '.....######.....',
  '......####......',
  '.......##.......',
  '................',
];

function glyphTexture(rows: readonly string[], core: boolean): THREE.DataTexture {
  const N = 16;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const on = rows[y][x] === '#';
      const o = (y * N + x) * 4;
      // 星 は まん中 を 白、まわり を 黄色 っぽく（色 は 頂点色 で かける）
      const v = core && on && Math.abs(x - 7.5) < 2.5 && Math.abs(y - 7.5) < 2.5 ? 255 : on ? 215 : 0;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = on ? 255 : 0;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

interface Layer {
  points: THREE.Points;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  posAttr: THREE.BufferAttribute;
  colAttr: THREE.BufferAttribute;
  sizeAttr: THREE.BufferAttribute;
}

function makeLayer(cap: number, map: THREE.Texture): Layer {
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  const size = new Float32Array(cap);
  const g = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', posAttr);
  g.setAttribute('color', colAttr);
  g.setAttribute('aSize', sizeAttr);
  g.setDrawRange(0, 0);
  const m = new THREE.PointsMaterial({
    size: 1,
    map,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
    alphaTest: 0.5,
  });
  // つぶ ごと の 大きさ（`size` に かける）
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aSize;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
  };
  m.userData.noDim = true; // 夜でも 同じ 明るさ・光の しくみ に 入れない
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.visible = false;
  return { points, pos, col, size, posAttr, colAttr, sizeAttr };
}

/**
 * 描く 係。星 の Points と ハート の Points の 2 つ（描画 +2）。`update()` を 毎フレーム
 * （または 毎ステップ）呼ぶ。つぶ が 1 つ も なければ 描かない。
 */
export class FarmSparkleView {
  private readonly stars = makeLayer(SPARKLE_CAP.stars, glyphTexture(STAR_ROWS, true));
  private readonly hearts = makeLayer(SPARKLE_CAP.hearts, glyphTexture(HEART_ROWS, false));

  constructor(private readonly model: FarmSparkle) {}

  addTo(parent: THREE.Object3D): void {
    parent.add(this.stars.points, this.hearts.points);
  }

  removeFrom(parent: THREE.Object3D): void {
    parent.remove(this.stars.points, this.hearts.points);
  }

  update(): void {
    this.fill(this.stars, 0, SPARKLE_CAP.stars);
    this.fill(this.hearts, 1, SPARKLE_CAP.hearts);
  }

  private fill(l: Layer, kinds: number, cap: number): void {
    const n = this.model.write(kinds, l, cap);
    l.points.visible = n > 0;
    if (n === 0) return;
    l.posAttr.needsUpdate = true;
    l.colAttr.needsUpdate = true;
    l.sizeAttr.needsUpdate = true;
    l.points.geometry.setDrawRange(0, n);
  }
}

/** Points の 大きさ（星 は 設定 の 上限 96 より 少し 大きく） */
const SPARKLE_CAP = { stars: 128, hearts: 96 } as const;
