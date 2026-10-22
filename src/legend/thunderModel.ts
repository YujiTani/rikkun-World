import { makeRng } from '../fx/sfxVary';

/**
 * ART-PIPE-1（docs/design/ART-PIPE-1.md 1.1）: 雷 B「ひかりの たま」の 時間と 動き（DOM・three を 知らない）。
 * F は 落雷の F（はなした ステップが F1）。雷の 絵は F2〜32 の 8 コマ、F8 に 着地。1 点 = 1/8 ブロック。
 */

/** 1 点 = 1/8 ブロック */
export const PT = 1 / 8;

export const BOLT = {
  /** 絵の コマの 数（1 枚の 横）・雷の 形の 数・重ねの 数 */
  frames: 8,
  variants: 4,
  layers: 3,
  /** 雷が 出はじめる F */
  startF: 2,
  /** 着地の コマ（F8〜9） */
  landFrame: 2,
  /** 1 コマの 絵の 大きさ（点）と 絵ぜんたい */
  cellW: 64,
  cellH: 256,
  sheetW: 1024,
  sheetH: 1024,
  /** 板の 大きさ（ブロック） */
  width: 64 * PT,
  height: 256 * PT,
  /** 板の 下の はしは S.y − 3 点 */
  drop: 3 * PT,
  /** カメラへ 向かう 水平の 向きの 奥行き（奥・中・手前） */
  layerOffsets: [-0.3, 0, 0.3],
  /** カメラが S の 水平 これ未満 なら 向きを 前の ままに する */
  nearDist: 0.5,
} as const;

/** 各コマの ステップ数（予兆・のびる・着地・玉・ふくらむ・しぼむ・のこり・きえかけ）。合わせて 31 */
const FRAME_STEPS = [4, 2, 2, 6, 6, 4, 4, 3] as const;
const FRAME_START: number[] = (() => {
  const out: number[] = [];
  let f: number = BOLT.startF;
  for (const n of FRAME_STEPS) {
    out.push(f);
    f += n;
  }
  return out;
})();
const BOLT_END_F = BOLT.startF + FRAME_STEPS.reduce((a, b) => a + b, 0); // 33（この F から 出ない）

/** その F の 雷の コマ（0〜7）。出ていない F は -1 */
export function boltFrameOf(F: number): number {
  if (F < BOLT.startF || F >= BOLT_END_F) return -1;
  for (let k = FRAME_START.length - 1; k >= 0; k--) if (F >= FRAME_START[k]!) return k;
  return -1;
}

/** 形 v（0〜3）・コマ・重ね の 絵の 場所（点）。形 2・3 は 形 0・1 の 左右 反転 */
export function boltCell(variant: number, frame: number, layer: number): { x: number; y: number; flip: boolean } {
  const v = variant & 3;
  return { x: ((v % 2) * BOLT.frames + frame) * BOLT.cellW, y: layer * BOLT.cellH, flip: v >= 2 };
}

/** n 回目の 落雷の 形（0〜3）。シード付き。同じ 順で 同じ 形 */
export function boltVariantOf(seed: number, n: number): number {
  let x = (Math.imul(n + 1, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  return (x >>> 7) % 4;
}

interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * たて軸だけで カメラへ 向く 板 3 まいの 向きと 位置。おもて = (sin yaw, 0, cos yaw)。
 * カメラが S の 水平 0.5 未満 なら 向きは 前の ステップの まま（なければ 0）。
 */
export function boltBillboard(
  S: V3,
  cam: V3,
  prev: { yaw: number } | null,
): { yaw: number; near: boolean; layers: { layer: 0 | 1 | 2; center: V3 }[] } {
  const dx = cam.x - S.x;
  const dz = cam.z - S.z;
  const near = Math.hypot(dx, dz) < BOLT.nearDist;
  const yaw = near ? (prev?.yaw ?? 0) : Math.atan2(dx, dz);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const layers = BOLT.layerOffsets.map((o, i) => ({
    layer: i as 0 | 1 | 2,
    center: { x: S.x + fx * o, y: S.y - BOLT.drop, z: S.z + fz * o },
  }));
  return { yaw, near, layers };
}

/** ささる 所（A 案）: 板と 面の 深さの 差 d（ブロック）の かけ率。1/8 ごとに 切り下げ・0・1/4・2/4・3/4・1 の 5 つ */
export function sinkFade(d: number): number {
  if (!(d > 0)) return 0;
  return Math.min(1, Math.floor(d / PT + 1e-9) / 4);
}

/** 絵の 読み方（3 まいとも Nearest・ミップマップなし・sRGB。足し算・深さを 書かない・読む） */
export const THUNDER_ASSETS = {
  sheet: { file: 'thunder_b_sheet.png', width: 1024, height: 1024, filter: 'nearest', mipmaps: false, colorSpace: 'srgb' },
  ground: { file: 'thunder_b_ground.png', width: 256, height: 128, filter: 'nearest', mipmaps: false, colorSpace: 'srgb' },
  spark: { file: 'thunder_b_spark.png', width: 16, height: 4, filter: 'nearest', mipmaps: false, colorSpace: 'srgb' },
  blending: 'additive',
  depthWrite: false,
  depthTest: true,
} as const;

const LAND_F = 8;

export const RING = {
  fromF: LAND_F,
  steps: 20,
  /** 絵の 外の 円の 半径（攻撃の はんい）・板ぜんたいの 大きさ */
  outerRadius: 5,
  plateSize: 12,
  lift: 0.03,
  /** F8〜17 =「出る」、F18〜27 =「きえる」 */
  appearSteps: 10,
} as const;

/** 着地の わ（F8〜27）。出ていない F は null */
export function landingRing(F: number): { scale: number; radius: number; alpha: number; image: 'appear' | 'vanish' } | null {
  const a = F - RING.fromF;
  if (a < 0 || a >= RING.steps) return null;
  const grow = Math.min(1, a / 10);
  const scale = 0.35 + 0.65 * (1 - (1 - grow) ** 2);
  return { scale, radius: RING.outerRadius * scale, alpha: 0.9 * (1 - a / RING.steps), image: a < RING.appearSteps ? 'appear' : 'vanish' };
}

export const SPARKS = {
  count: 32,
  /** のぼる 高さ（マス） */
  riseMin: 2,
  riseMax: 3,
  lifeMin: 50,
  lifeMax: 80,
  /** 水平に ひろがる はんい（マス） */
  spreadMax: 2.2,
} as const;

export interface Spark {
  /** 向き（ラジアン）と 広がり（マス） */
  angle: number;
  spread: number;
  /** のぼる 高さ（マス）と 生きる ステップ */
  rise: number;
  life: number;
  /** 色: 0 白・1 白っぽい 黄色 */
  tone: 0 | 1;
}

/** 着地で まきあがる 光の つぶ。シード付き（同じ シードで 同じ） */
export function makeSparks(seed: number): Spark[] {
  const r = makeRng(seed >>> 0);
  const out: Spark[] = [];
  for (let i = 0; i < SPARKS.count; i++) {
    out.push({
      angle: r() * Math.PI * 2,
      spread: 0.2 + r() * (SPARKS.spreadMax - 0.2),
      rise: SPARKS.riseMin + r() * (SPARKS.riseMax - SPARKS.riseMin),
      life: Math.round(SPARKS.lifeMin + r() * (SPARKS.lifeMax - SPARKS.lifeMin)),
      tone: r() < 0.5 ? 0 : 1,
    });
  }
  return out;
}

/** つぶの ようす（着地から t ステップ）。上へ ふわっと のぼって（はじめ はやく 終わり ゆっくり）、明るさは 下がる だけ */
export function sparkAt(s: Spark, t: number): { dx: number; dy: number; dz: number; alpha: number } {
  const u = Math.min(1, Math.max(0, t / s.life));
  const e = 1 - (1 - u) ** 2;
  // 明るさ: ほとんど そのまま → 終わりに かけて すーっと 0（点滅なし。下がる だけ）
  const alpha = u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.5);
  const dist = s.spread * e;
  return { dx: Math.cos(s.angle) * dist, dy: s.rise * e, dz: Math.sin(s.angle) * dist, alpha: u >= 1 ? 0 : alpha };
}

/** つぶの 絵: 寿命の 45% 未満 = ＋、80% 未満 = Y1 の 1 点、のこり = Y3 の 1 点 */
export function sparkShape(s: Spark, t: number): 'plus' | 'y1' | 'y3' {
  const u = t / s.life;
  return u < 0.45 ? 'plus' : u < 0.8 ? 'y1' : 'y3';
}

// ── まわりを 明るく ──

export const GLOW = {
  color: 0xfff8dc,
  /** まん中 = S + 上へ これ */
  up: 1.75,
  /** ここまで 量 そのまま・zero で 0（まっすぐ） */
  full: 5,
  zero: 8,
} as const;

/** その F の まわりの 明るさの 量。うごきを へらす は 0.5 倍・空が 見えない（sky = false）は 0 */
export function glowAmount(F: number, opts: { reduced?: boolean; sky?: boolean } = {}): number {
  if (opts.sky === false) return 0;
  const a = F >= 6 && F <= 7 ? 0.1 : F >= 8 && F <= 9 ? 0.35 : F >= 10 && F <= 15 ? 0.25 : F >= 16 && F <= 21 ? 0.12 : 0;
  return opts.reduced ? a * 0.5 : a;
}

/** まん中からの きょりの とどき（5 まで 1、8 で 0） */
export function glowReach(dist: number): number {
  return Math.min(1, Math.max(0, (GLOW.zero - dist) / (GLOW.zero - GLOW.full)));
}

/** 面に 足される 光の 量（今の 光の 量に よらない） */
export function glowAdded(amount: number, reach: number): number {
  return amount * reach;
}

// ── 落雷 1 回の 時間 ──

export interface ThunderView {
  active: boolean;
  F: number;
  S: V3 | null;
  bolt: { visible: boolean; frame: number; variant: number; flipped: boolean };
  ring: { scale: number; radius: number; alpha: number; image: 'appear' | 'vanish' } | null;
  sparks: { alive: number };
  amount: number;
}

/** 落雷の 最後の F（つぶの 寿命 いちばん 長い 80 → F8 + 80 = F88） */
const LAST_F = LAND_F + SPARKS.lifeMax;

/** 落雷 1 回の 見た目の 時間。start で F = 1、step で F + 1、view で その F の ようす。F89 から active は false */
export class ThunderTimeline {
  private readonly sparks: Spark[];
  private S: V3 | null = null;
  private variant = 0;
  private sky = true;
  private F = 0;

  constructor(seed: number) {
    this.sparks = makeSparks(seed);
  }

  /** 新しい 落雷を 始める。途中でも 始めから（前の 分は 消す） */
  start(o: { S: V3; variant: number; skyVisible: boolean }): void {
    this.S = { ...o.S };
    this.variant = o.variant & 3;
    this.sky = o.skyVisible;
    this.F = 1;
  }

  step(): void {
    if (this.F > 0) this.F++;
  }

  get sparkList(): readonly Spark[] {
    return this.sparks;
  }

  view(reduced = false): ThunderView {
    const F = this.F;
    const active = F >= 1 && F <= LAST_F;
    if (!active) {
      return { active: false, F, S: null, bolt: { visible: false, frame: -1, variant: this.variant, flipped: false }, ring: null, sparks: { alive: 0 }, amount: 0 };
    }
    const frame = boltFrameOf(F);
    let alive = 0;
    if (!reduced && F >= LAND_F) for (const s of this.sparks) if (sparkAt(s, F - LAND_F).alpha > 0) alive++;
    return {
      active,
      F,
      S: this.S,
      bolt: { visible: frame >= 0, frame, variant: this.variant, flipped: this.variant >= 2 },
      ring: landingRing(F),
      sparks: { alive },
      amount: glowAmount(F, { reduced, sky: this.sky }),
    };
  }
}
