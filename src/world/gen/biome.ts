import { SEA_Y, type BlockId } from '../../contracts';
import { GEN_CONFIG as C, COUNTRY_KINDS, MOUNTAIN_KINDS, type CountryDef, type CountryKind } from './config';
import { hash01, subSeed, valueNoise } from './random';

/**
 * 12 の国（VOX-I-1。docs/design/VOX-I.md §3）。升目の点（ボロノイ）・山のわく・国ごとの高さ・地面のブロック・かっぱの いけ・たけやぶ の道。
 * すべて (seed, x, z) だけで決まる純粋な計算で、作る順・ほかの列に関係しない（`clearTerrainCache()` で覚えを捨てても同じ答え）。
 */

export { COUNTRY_KINDS, MOUNTAIN_KINDS };
export type { CountryKind };
export { columnCounts } from './plants';

const B = C.biome;
const MT = B.mountain;
const A = C.anchor;
const DEFS = C.countries;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 山でない升目の国の表（でこぼこ 2 段 × しめり 4 列）。上の段 = でこぼこ b < 0.5 */
const TABLE: readonly (readonly CountryKind[])[] = [
  ['sunahama', 'kappa', 'harappa', 'hana'],
  ['susuki', 'take', 'ookina', 'mori'],
];
/** 山の種類（山の点の しめり m の順位で 4 列） */
const MOUNTAIN_ROW: readonly CountryKind[] = ['iwayama', 'tengu', 'momiji', 'yuki'];

/** 値ノイズの値 → 0〜1 の順位（C.biome.rankTable。表の間は直線） */
function rankOf(v: number): number {
  const t = B.rankTable;
  const n = t.length - 1;
  if (v <= t[0]!) return 0;
  if (v >= t[n]!) return 1;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! <= v) lo = mid;
    else hi = mid;
  }
  const d = t[hi]! - t[lo]!;
  return (lo + (d > 0 ? (v - t[lo]!) / d : 0)) / n;
}

export interface Cell {
  /** 升目の番号（山は 2×2 の左上） */
  i: number;
  j: number;
  px: number;
  pz: number;
  kind: CountryKind;
  mountain: boolean;
  startForced: boolean;
  /** 点の しめり・でこぼこ の順位（0〜1） */
  m: number;
  b: number;
  /** かっぱの ぬま: 点が陸か（-1 = まだ調べていない） */
  land: number;
}

export interface MountainFrame {
  start: boolean;
  candidates: { i: number; j: number; above: number }[];
  mountain: { i: number; j: number; px: number; pz: number; kind: CountryKind } | null;
}

export interface MountainShape {
  m: number;
  d: number;
  kind: CountryKind;
  px: number;
  pz: number;
}

export interface Pond {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  mandatory: boolean;
  /** 水面の高さ（まわり 1 マスの へりと同じ）と 深さ */
  level: number;
  depth: number;
}

export interface PondsOfCell {
  pointOnLand: boolean;
  ponds: Pond[];
}

export interface GroundInfo {
  h: number;
  base: number;
  lift: number;
  top: BlockId;
}

interface HeightOut {
  h: number;
  base: number;
  lift: number;
}

/**
 * 国をまぜる はば（距離の差 Δd の）。Δd は 1 ブロックで 最大 2 かわるので、まぜる はばは 片がわ blend(14) ブロックぶん = 2 × blend。
 * こうすると 国の数が 1 ブロックで かわる量は（landShift 16 の すなはま でも）約 1.14 以下になる（VOX-I §3.9）
 */
const MIX_RANGE = 2 * B.blend;
/** 大陸の高さを 上げ下げする landShift（すなはま −16）だけは もっと広く まぜる（海べの坂が 1 ブロックで 1 段以内になる ＝ 海から歩いて上がれる） */
const MIX_RANGE_SHIFT = 6 * B.blend;

const cellKey = (i: number, j: number): number => (i + 50000) * 100003 + (j + 50000);

export class CountryMap {
  private readonly cells = new Map<number, Cell>();
  private readonly frames = new Map<number, MountainFrame & { cell: Cell | null }>();
  private readonly pondCache = new Map<number, PondsOfCell>();
  private readonly takeCache = new Map<number, Set<number>>();
  private readonly sPoint: number;
  private readonly sMoist: number;
  private readonly sBump: number;
  private readonly sC1: number;
  private readonly sC2: number;
  private readonly sMtn: number;
  private readonly sHill: number;
  private readonly sBumpH: number;
  private readonly sRough: number;
  private readonly sCliff: number;
  private readonly sPond: number;
  private readonly sPath: number;
  private startNearest: [number, number] | null = null;
  // nearest() の答え（読んだらすぐ ローカルに写す。入れ子で書きかわる）
  private n1!: Cell;
  private n2!: Cell;
  private nd1 = 0;
  private nd2 = 0;
  /** 国のまぜ具合: 近い点ごとに r = 1 − (距離 − いちばん近い距離) ÷ blend（0 以下は なし）を 国ごとに足して 1 に そろえたもの */
  private readonly wKind: CountryKind[] = [];
  private readonly wVal: number[] = [];
  private nW = 0;
  private readonly candC: Cell[] = [];
  private readonly candD: number[] = [];
  private nCand = 0;
  private readonly hOut: HeightOut = { h: 0, base: 0, lift: 0 };
  private readonly ptOut: HeightOut = { h: 0, base: 0, lift: 0 };

  constructor(readonly seed: number) {
    this.sPoint = subSeed(seed, 101);
    this.sMoist = subSeed(seed, 102);
    this.sBump = subSeed(seed, 103);
    this.sC1 = subSeed(seed, 1);
    this.sC2 = subSeed(seed, 2);
    this.sMtn = subSeed(seed, 3);
    this.sHill = subSeed(seed, 4);
    this.sBumpH = subSeed(seed, 6);
    this.sRough = subSeed(seed, 8);
    this.sCliff = subSeed(seed, 7);
    this.sPond = subSeed(seed, 301);
    this.sPath = subSeed(seed, 302);
  }

  // ------------------------------------------------------------ 升目と点

  /** しめり・でこぼこ の順位（点または升目のまん中で読む） */
  rankAt(x: number, z: number): { m: number; b: number } {
    return { m: rankOf(valueNoise(this.sMoist, x, z, B.noiseScale)), b: rankOf(valueNoise(this.sBump, x, z, B.noiseScale)) };
  }

  /** 山でない升目の点 */
  private rawPoint(i: number, j: number): [number, number] {
    return [
      A.x + B.cell * i + B.pointMin + Math.floor(hash01(this.sPoint, i, j, 1) * B.pointSpan),
      A.z + B.cell * j + B.pointMin + Math.floor(hash01(this.sPoint, i, j, 2) * B.pointSpan),
    ];
  }

  /** anchor を角にもつ 4 升目のうち 点が anchor に いちばん近い升目 */
  private startNearestCell(): [number, number] {
    if (this.startNearest) return this.startNearest;
    let best: [number, number] = [0, 0];
    let bestD = Infinity;
    for (const [i, j] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
      const [x, z] = this.rawPoint(i, j);
      const d = Math.hypot(x - A.x, z - A.z);
      if (d < bestD) {
        bestD = d;
        best = [i, j];
      }
    }
    this.startNearest = best;
    return best;
  }

  /** 大陸の高さ（国をまぜる前。海から） */
  continentAbove(x: number, z: number): number {
    const H = C.height;
    const c = valueNoise(this.sC1, x, z, H.continent.big) * H.continent.bigWeight + valueNoise(this.sC2, x, z, H.continent.small) * H.continent.smallWeight;
    return clamp((c - H.landCenter) * H.landScale, H.minAbove, H.maxAbove);
  }

  /** 山のわく (fx, fz)。わくの番号 = floor((i + 2) / 4) */
  frame(fx: number, fz: number): MountainFrame & { cell: Cell | null } {
    const key = cellKey(fx, fz);
    const hit = this.frames.get(key);
    if (hit) return hit;
    const start = fx === 0 && fz === 0;
    const candidates: { i: number; j: number; above: number; px: number; pz: number }[] = [];
    let best = -1;
    for (let q = 0; q < 4; q++) {
      const i = MT.frame * fx - MT.shift + (q & 1);
      const j = MT.frame * fz - MT.shift + (q >> 1);
      const jit = 2 * MT.jitter + 1;
      const px = A.x + B.cell * (i + 1) + Math.floor(hash01(this.sPoint, fx, fz, 30 + q) * jit) - MT.jitter;
      const pz = A.z + B.cell * (j + 1) + Math.floor(hash01(this.sPoint, fx, fz, 40 + q) * jit) - MT.jitter;
      candidates.push({ i, j, above: this.continentAbove(px, pz), px, pz });
      if (best < 0 || candidates[q]!.above > candidates[best]!.above) best = q;
    }
    let cell: Cell | null = null;
    let mountain: MountainFrame['mountain'] = null;
    if (!start && candidates[best]!.above >= MT.minBase) {
      const c = candidates[best]!;
      const r = this.rankAt(c.px, c.pz);
      const kind = MOUNTAIN_ROW[Math.min(3, Math.floor(r.m * 4))]!;
      cell = { i: c.i, j: c.j, px: c.px, pz: c.pz, kind, mountain: true, startForced: false, m: r.m, b: r.b, land: -1 };
      mountain = { i: c.i, j: c.j, px: c.px, pz: c.pz, kind };
    }
    const f = { start, candidates: candidates.map((c) => ({ i: c.i, j: c.j, above: c.above })), mountain, cell };
    this.frames.set(key, f);
    return f;
  }

  mountainFrame(fx: number, fz: number): MountainFrame {
    const f = this.frame(fx, fz);
    return { start: f.start, candidates: f.candidates.map((c) => ({ ...c })), mountain: f.mountain ? { ...f.mountain } : null };
  }

  cell(i: number, j: number): Cell {
    const key = cellKey(i, j);
    const hit = this.cells.get(key);
    if (hit) return hit;
    const f = this.frame(Math.floor((i + MT.shift) / MT.frame), Math.floor((j + MT.shift) / MT.frame));
    let c: Cell;
    if (f.cell && i >= f.cell.i && i <= f.cell.i + 1 && j >= f.cell.j && j <= f.cell.j + 1) c = f.cell;
    else {
      const [px, pz] = this.rawPoint(i, j);
      const r = this.rankAt(A.x + B.cell * i + B.cell / 2, A.z + B.cell * j + B.cell / 2);
      let kind = TABLE[r.b >= 0.5 ? 1 : 0]![Math.min(3, Math.floor(r.m * 4))]!;
      let forced = Math.hypot(px - A.x, pz - A.z) <= B.startForce;
      if (i >= -1 && i <= 0 && j >= -1 && j <= 0) {
        const [bi, bj] = this.startNearestCell();
        if (i === bi && j === bj) forced = true;
      }
      if (forced) kind = 'harappa';
      c = { i, j, px, pz, kind, mountain: false, startForced: forced, m: r.m, b: r.b, land: -1 };
    }
    this.cells.set(key, c);
    return c;
  }

  // ------------------------------------------------------------ いちばん近い 2 点

  private consider(c: Cell, x: number, z: number): void {
    for (let k = 0; k < this.nCand; k++) if (this.candC[k] === c) return;
    this.candC[this.nCand] = c;
    this.candD[this.nCand] = Math.hypot(c.px - x, c.pz - z);
    this.nCand++;
  }

  /** いちばん近い点 n1 と 2 番目 n2（距離 nd1・nd2）、いちばん近い ちがう国の点 nk。結果は すぐ ローカルに写すこと */
  private nearest(x: number, z: number): void {
    const i0 = Math.floor((x - A.x) / B.cell);
    const j0 = Math.floor((z - A.z) / B.cell);
    this.nCand = 0;
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) this.consider(this.cell(i, j), x, z);
    // 山の点は 2×2 升目で 1 つ。3×3 の外の升目の山も しらべる（わく 2×2 こ）
    const f0 = Math.floor(i0 / MT.frame);
    const f1 = Math.floor((i0 + MT.frame) / MT.frame);
    const g0 = Math.floor(j0 / MT.frame);
    const g1 = Math.floor((j0 + MT.frame) / MT.frame);
    for (let g = g0; g <= g1; g++) {
      for (let f = f0; f <= f1; f++) {
        const fr = this.frame(f, g);
        if (fr.cell) this.consider(fr.cell, x, z);
      }
    }
    let k1 = 0;
    for (let k = 1; k < this.nCand; k++) if (this.candD[k]! < this.candD[k1]!) k1 = k;
    let k2 = -1;
    for (let k = 0; k < this.nCand; k++) if (k !== k1 && (k2 < 0 || this.candD[k]! < this.candD[k2]!)) k2 = k;
    this.n1 = this.candC[k1]!;
    this.nd1 = this.candD[k1]!;
    this.n2 = this.candC[k2]!;
    this.nd2 = this.candD[k2]!;
    // 国ごとの重み
    this.nW = 0;
    let total = 0;
    for (let k = 0; k < this.nCand; k++) {
      const r = 1 - (this.candD[k]! - this.nd1) / MIX_RANGE;
      if (r <= 0) continue;
      total += r;
      const kind = this.candC[k]!.kind;
      let w = 0;
      while (w < this.nW && this.wKind[w] !== kind) w++;
      if (w === this.nW) {
        this.wKind[w] = kind;
        this.wVal[w] = 0;
        this.nW++;
      }
      this.wVal[w] = this.wVal[w]! + r;
    }
    for (let w = 0; w < this.nW; w++) this.wVal[w] = this.wVal[w]! / total;
  }

  /** (x,z) の国 */
  countryAt(x: number, z: number): { kind: CountryKind; cx: number; cz: number; e: number; mountain: boolean } {
    this.nearest(x, z);
    const c = this.n1;
    return { kind: c.kind, cx: c.i, cz: c.j, e: this.nd2 - this.nd1, mountain: c.mountain };
  }

  /** (x,z) のまわりの国（高さ・木・地面のために 軽く読む）。out に書く */
  sampleInto(x: number, z: number, out: BiomeSample): BiomeSample {
    this.nearest(x, z);
    const c1 = this.n1;
    out.kind = c1.kind;
    // いちばん近い国の重み a と、ほかで いちばん重い国（木の数・小ブロックの地面のような 形に関わらない物は これで まぜる）
    let a = 0;
    let k2: CountryKind = c1.kind;
    let w2 = 0;
    for (let w = 0; w < this.nW; w++) {
      if (this.wKind[w] === c1.kind) a = this.wVal[w]!;
      else if (this.wVal[w]! > w2) {
        w2 = this.wVal[w]!;
        k2 = this.wKind[w]!;
      }
    }
    out.kind2 = k2;
    out.a = k2 === c1.kind ? 1 : a / (a + w2);
    out.cx = c1.i;
    out.cz = c1.j;
    out.e = this.nd2 - this.nd1;
    out.mountain = c1.mountain;
    return out;
  }

  // ------------------------------------------------------------ 山の形

  /** (x,z) に とどく 山（山の点から maxReach 以内）の うち いちばん近い山の形 */
  mountainShape(x: number, z: number): MountainShape | null {
    const i0 = Math.floor((x - A.x) / B.cell);
    const j0 = Math.floor((z - A.z) / B.cell);
    let best: MountainShape | null = null;
    // 山の点から maxReach(200) 以内 → 升目 ±2。わくは 2×2 こ
    const f0 = Math.floor((i0 - 2 + MT.shift) / MT.frame);
    const f1 = Math.floor((i0 + 2 + MT.shift) / MT.frame);
    const g0 = Math.floor((j0 - 2 + MT.shift) / MT.frame);
    const g1 = Math.floor((j0 + 2 + MT.shift) / MT.frame);
    let rough = NaN;
    for (let g = g0; g <= g1; g++) {
      for (let f = f0; f <= f1; f++) {
        const fr = this.frame(f, g);
        const c = fr.cell;
        if (!c) continue;
        const d = Math.hypot(x - c.px, z - c.pz);
        if (d > MT.maxReach || (best !== null && d >= best.d)) continue;
        if (Number.isNaN(rough)) rough = (valueNoise(this.sRough, x, z, MT.roughScale) - 0.5) * 2 * MT.roughAmp;
        const mt = DEFS[c.kind].mountain!;
        const m = Math.round(SEA_Y + mt.top - mt.k * Math.max(0, d - mt.plateau) + rough);
        best = { m, d, kind: c.kind, px: c.px, pz: c.pz };
      }
    }
    return best;
  }

  // ------------------------------------------------------------ 高さ

  /** かっぱの ぬま の升目の点が 陸（ふつうの高さが 海から +2 以上）か */
  private pointLand(c: Cell): boolean {
    if (c.land < 0) {
      this.groundInto(c.px, c.pz, this.ptOut, true);
      c.land = this.ptOut.base >= SEA_Y + 2 ? 1 : 0;
    }
    return c.land === 1;
  }

  /** 生成の高さ。noLift = 山の形・かっぱの持ち上げをかける前（base）だけ */
  private groundInto(x: number, z: number, o: HeightOut, noLift: boolean): void {
    const H = C.height;
    this.nearest(x, z);
    const c1 = this.n1;
    const e = this.nd2 - this.nd1;
    const nW = this.nW;
    const n1 = DEFS[c1.kind];
    // 国ごとの数を 重みでまぜる（ふつうの所は 1 つの国だけ）
    // landShift は 広いはばで まぜる
    let shift = 0;
    let shiftTotal = 0;
    for (let k = 0; k < this.nCand; k++) {
      const r = 1 - (this.candD[k]! - this.nd1) / MIX_RANGE_SHIFT;
      if (r <= 0) continue;
      shift += (DEFS[this.candC[k]!.kind].landShift ?? 0) * r;
      shiftTotal += r;
    }
    shift /= shiftTotal;
    let hillV: number;
    let bumpV: number;
    let cliffV: number;
    if (nW === 1) {
      hillV = n1.hill;
      bumpV = n1.bump;
      cliffV = n1.cliff;
    } else {
      hillV = 0;
      bumpV = 0;
      cliffV = 0;
      for (let w = 0; w < nW; w++) {
        const d = DEFS[this.wKind[w]!];
        const f = this.wVal[w]!;
        hillV += d.hill * f;
        bumpV += d.bump * f;
        cliffV += d.cliff * f;
      }
    }

    const c = valueNoise(this.sC1, x, z, H.continent.big) * H.continent.bigWeight + valueNoise(this.sC2, x, z, H.continent.small) * H.continent.smallWeight;
    const hb0 = clamp(SEA_Y + (c - H.landCenter) * H.landScale + shift, SEA_Y + H.minAbove, SEA_Y + H.maxAbove);
    const d = Math.hypot(x - A.x, z - A.z);
    const w = d <= H.startRadius ? 1 : d >= H.farRadius ? 0 : 1 - smoothstep(H.startRadius, H.farRadius, d);
    const hb = hb0 * (1 - w) + (SEA_Y + H.startAbove) * w;
    const L = clamp((hb - SEA_Y) / H.landRamp, 0, 1);
    let v = hb;
    const bump = valueNoise(this.sBumpH, x, z, H.bumpScale) - 0.5;
    if (L > 0) {
      if (w < 1) {
        const nm = valueNoise(this.sMtn, x, z, H.mountain.scale);
        v += smoothstep(H.mountain.from, H.mountain.to, nm) * H.mountain.peak * L * (1 - w);
      }
      let nh: number;
      if (nW === 1) nh = valueNoise(this.sHill, x, z, n1.hillScale);
      else {
        nh = 0;
        for (let q = 0; q < nW; q++) nh += valueNoise(this.sHill, x, z, DEFS[this.wKind[q]!].hillScale) * this.wVal[q]!;
      }
      v += (nh - 0.5) * 2 * hillV * L;
      v += bump * 2 * bumpV * (0.3 + 0.7 * L);
    } else {
      v += bump * 2 * bumpV * 0.3;
    }
    let h = Math.round(v);
    if (L >= H.cliff.minL && w === 0) {
      if (cliffV > 0 && noiseRank(valueNoise(this.sCliff, x, z, H.cliff.scale)) > 1 - cliffV) h -= ((h % H.cliff.step) + H.cliff.step) % H.cliff.step;
    }
    const base = clamp(h, SEA_Y + H.minAbove2, H.max);
    let lifted = h;
    if (!noLift) {
      const f = n1.landFloor;
      if (f) {
        // 浅い所（海から −4〜+2）を +2 の ぬま に近づける。持ち上げる量 = (2 − 高さ) × e の重み × 深さの重み。
        // 深さの重み: 丸める前の高さが −4.5 で 0 → 浅くなるほど 1（−4 より深い列は 0 のまま。急な壁を作らず、海から歩いて上がれる）。
        // 丸める前の高さで 計算して 1 回だけ 丸める → となりあう列の差は 1 以内
        const rel = v - SEA_Y;
        if (rel >= f.onlyFrom - 0.5 && rel < f.above) {
          const wE = clamp((e - f.eFrom) / (f.eTo - f.eFrom), 0, 1);
          const wD = clamp((rel - (f.onlyFrom - 0.5)) / f.taper, 0, 1);
          lifted += Math.round(v + (f.above - rel) * wE * wD) - Math.round(v);
        }
        // 点が 陸の升目は 点のまわり 18×18 を 深さに関係なく +2 まで（e ≥ 30 の内がわ）
        const half = f.mustArea / 2;
        if (x >= c1.px - half && x < c1.px + half && z >= c1.pz - half && z < c1.pz + half && this.pointLand(c1)) lifted = Math.max(lifted, SEA_Y + f.above);
      }
    }
    const liftedC = clamp(lifted, SEA_Y + H.minAbove2, H.max);
    let hh = liftedC;
    if (!noLift) {
      const M = this.mountainShape(x, z);
      if (M !== null && M.m > hh) hh = clamp(M.m, SEA_Y + H.minAbove2, H.max);
    }
    o.h = hh;
    o.base = base;
    o.lift = liftedC - base;
  }

  /** 生成の高さ H（広場・岩山・いけ の前） */
  height(x: number, z: number): number {
    this.groundInto(x, z, this.hOut, false);
    return this.hOut.h;
  }

  /** 山の形・かっぱの持ち上げの前の高さ（スタートの広場・岩山の前） */
  baseHeight(x: number, z: number): number {
    this.groundInto(x, z, this.hOut, true);
    return this.hOut.base;
  }

  /** 地面のいちばん上のブロック。h は 生成の高さ。国は 3×3 のかたまりのまん中で決める（境目が ギザギザしない） */
  topBlock(x: number, z: number, h: number): BlockId {
    if (h < SEA_Y + C.strata.landFrom) return 'sand';
    this.nearest(Math.floor(x / 3) * 3 + 1, Math.floor(z / 3) * 3 + 1);
    const def = DEFS[this.n1.kind];
    const rel = h - SEA_Y;
    if (def.snowFrom !== undefined) return rel >= def.snowFrom ? 'snow' : 'grass';
    if (rel >= (def.stoneFrom ?? C.strata.stoneTopFrom)) return 'stone';
    if (def.sandBelowOnMountain !== undefined) {
      // 6 版: すなはま の地面は 高さに関係なく すな。「+10 未満」は 山の形が かかる列（M ≥ ふつうの高さ）だけ
      if (rel < def.sandBelowOnMountain) return 'sand';
      const M = this.mountainShape(x, z);
      return M !== null && M.m >= h ? 'grass' : 'sand';
    }
    return 'grass';
  }

  groundAt(x: number, z: number): GroundInfo {
    this.groundInto(x, z, this.hOut, false);
    const o = this.hOut;
    const info = { h: o.h, base: o.base, lift: o.lift, top: 'grass' as BlockId };
    info.top = this.topBlock(x, z, info.h);
    return info;
  }

  // ------------------------------------------------------------ かっぱの ぬま の いけ（§3.8）

  pondsOfCell(i: number, j: number): PondsOfCell {
    const key = cellKey(i, j);
    const hit = this.pondCache.get(key);
    if (hit) return hit;
    const cell = this.cell(i, j);
    const P = DEFS.kappa.pond!;
    const out: PondsOfCell = { pointOnLand: false, ponds: [] };
    if (cell.kind === 'kappa' && !cell.mountain) {
      const land = this.pointLand(cell);
      out.pointOnLand = land;
      const s = this.sPond;
      const n = P.count[0] + Math.floor(hash01(s, i, j, 1) * (P.count[1] - P.count[0] + 1));
      const slots = 6;
      const ox = cell.px - (slots * P.slot) / 2;
      const oz = cell.pz - (slots * P.slot) / 2;
      const mustQ: number[] = [];
      const restQ: number[] = [];
      for (let q = 0; q < slots * slots; q++) {
        const sa = q % slots;
        const sb = Math.floor(q / slots);
        if ((sa === 2 || sa === 3) && (sb === 2 || sb === 3)) mustQ.push(q);
        else restQ.push(q);
      }
      restQ.sort((p, q) => hash01(s, i, j, 100 + p) - hash01(s, i, j, 100 + q));
      const tmp: BiomeSample = newSample();
      for (const q of [...mustQ, ...restQ]) {
        const isMust = land && mustQ.includes(q);
        if (!isMust && out.ponds.length >= n) break;
        const sx = ox + P.slot * (q % slots);
        const sz = oz + P.slot * Math.floor(q / slots);
        if (!isMust) {
          // ほかの区画は 区画ぜんぶが e ≥ 30 の 陸のときだけ
          let ok = true;
          for (let dz = 0; dz <= P.slot - 1 && ok; dz += 4) {
            for (let dx = 0; dx <= P.slot - 1 && ok; dx += 4) {
              if (this.sampleInto(sx + dx, sz + dz, tmp).e < P.eMin || this.height(sx + dx, sz + dz) < SEA_Y + 2) ok = false;
            }
          }
          if (!ok) continue;
        }
        const wx = P.width[0] + Math.floor(hash01(s, i, j, 200 + q) * (P.width[1] - P.width[0] + 1));
        const wz = P.width[0] + Math.floor(hash01(s, i, j, 300 + q) * (P.width[1] - P.width[0] + 1));
        const x0 = sx + 1 + Math.floor(hash01(s, i, j, 400 + q) * (P.slot - wx - 1));
        const z0 = sz + 1 + Math.floor(hash01(s, i, j, 500 + q) * (P.slot - wz - 1));
        const depth = P.depth[0] + Math.floor(hash01(s, i, j, 600 + q) * (P.depth[1] - P.depth[0] + 1));
        const level = this.height(Math.floor(x0 + wx / 2), Math.floor(z0 + wz / 2));
        out.ponds.push({ x0, z0, x1: x0 + wx - 1, z1: z0 + wz - 1, mandatory: isMust, level, depth });
      }
    }
    this.pondCache.set(key, out);
    return out;
  }

  /** (x,z) が いけの中（inner）か、まわりの 1 マス（ring）か。level = へりの高さ、depth = 水の深さ */
  pondAt(x: number, z: number): { kind: 'inner' | 'ring'; level: number; depth: number } | null {
    const i = Math.floor((x - A.x) / B.cell);
    const j = Math.floor((z - A.z) / B.cell);
    const cell = this.cell(i, j);
    if (cell.kind !== 'kappa' || cell.mountain) return null;
    for (const p of this.pondsOfCell(i, j).ponds) {
      if (x < p.x0 - 1 || x > p.x1 + 1 || z < p.z0 - 1 || z > p.z1 + 1) continue;
      const rx = (p.x1 - p.x0 + 1) / 2;
      const rz = (p.z1 - p.z0 + 1) / 2;
      const dx = x + 0.5 - (p.x0 + rx);
      const dz = z + 0.5 - (p.z0 + rz);
      if ((dx * dx) / (rx * rx) + (dz * dz) / (rz * rz) <= 1) return { kind: 'inner', level: p.level, depth: p.depth };
      const ax = rx + 1;
      const az = rz + 1;
      if ((dx * dx) / (ax * ax) + (dz * dz) / (az * az) <= 1) return { kind: 'ring', level: p.level, depth: p.depth };
    }
    return null;
  }

  // ------------------------------------------------------------ たけやぶ の道（§3.8）

  /** 升目 (i,j) の たけやぶ の道のマス。点から 升目の外まで つながる（はば 2〜3 の くねくね道） */
  takeSet(i: number, j: number): Set<number> {
    const key = cellKey(i, j);
    const hit = this.takeCache.get(key);
    if (hit) return hit;
    const set = new Set<number>();
    const cell = this.cell(i, j);
    const D = DEFS.take;
    if (cell.kind === 'take' && !cell.mountain) {
      const s = this.sPath;
      const width = D.path![0] + Math.floor(hash01(s, i, j, 1) * (D.path![1] - D.path![0] + 1));
      const dir = Math.floor(hash01(s, i, j, 2) * 4);
      const sign = dir & 1 ? 1 : -1;
      const alongX = dir < 2;
      // 点から 87 マス進めば どの向きでも 升目の外に出る（点は 升目のはしから 28 以上）
      let lat = 0;
      let drift = hash01(s, i, j, 3) < 0.5 ? -1 : 1;
      for (let k = -2; k <= 88; k++) {
        const r = hash01(s, i, j, 10 + k + 2);
        if (r < 0.18) lat += drift;
        if (r > 0.93) drift = -drift;
        lat = clamp(lat, -12, 12);
        const ax = alongX ? cell.px + sign * k : cell.px + lat;
        const az = alongX ? cell.pz + lat : cell.pz + sign * k;
        for (let dz = 0; dz < width; dz++) for (let dx = 0; dx < width; dx++) set.add(pathKey(ax + dx - 1, az + dz - 1));
      }
    }
    this.takeCache.set(key, set);
    return set;
  }

  /** (x,z) が たけやぶ の道か（いちばん近い 2 つの点の どちらかの道） */
  onTakePath(x: number, z: number, s: BiomeSample): boolean {
    if (s.kind !== 'take' && s.kind2 !== 'take') return false;
    this.nearest(x, z);
    const c1 = this.n1;
    const c2 = this.n2;
    if (c1.kind === 'take' && this.takeSet(c1.i, c1.j).has(pathKey(x, z))) return true;
    return c2.kind === 'take' && this.takeSet(c2.i, c2.j).has(pathKey(x, z));
  }
}

const pathKey = (x: number, z: number): number => (x + 100000) * 200003 + (z + 100000);

export interface BiomeSample {
  /** いちばん近い点の国と、2 番目の国 */
  kind: CountryKind;
  kind2: CountryKind;
  /** いちばん近い点の升目 */
  cx: number;
  cz: number;
  /** 2 番目に近い点までの距離 − いちばん近い点までの距離 */
  e: number;
  /** いちばん近い国の重み（0.5〜1。境目 e < blend で 0.5 から 1 へ） */
  a: number;
  mountain: boolean;
}

export const newSample = (): BiomeSample => ({ kind: 'harappa', kind2: 'harappa', cx: 0, cz: 0, e: 0, a: 1, mountain: false });

// 値ノイズの順位（崖の割合を「面積の割合」にする。VOX-B から変えない）
let cliffTable: Float32Array | null = null;
function noiseRank(v: number): number {
  if (cliffTable === null) {
    const n = 16384;
    const t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = valueNoise(777, (i % 128) * 61.3, Math.floor(i / 128) * 57.7, 96);
    t.sort();
    cliffTable = t;
  }
  const t = cliffTable;
  let lo = 0;
  let hi = t.length;
  while (hi - lo > 0) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo / t.length;
}

// ------------------------------------------------------------------ seed ごとの使いまわし

const maps = new Map<number, CountryMap>();
const MAX_MAPS = 6;

export function countryMapFor(seed: number): CountryMap {
  const key = seed | 0;
  let m = maps.get(key);
  if (m === undefined) {
    if (maps.size >= MAX_MAPS) maps.delete(maps.keys().next().value as number);
    m = new CountryMap(key);
    maps.set(key, m);
  } else {
    maps.delete(key);
    maps.set(key, m);
  }
  return m;
}

/** テスト用: 覚えているものを全部すてる */
export function clearCountryCache(): void {
  maps.clear();
}

export function defOf(kind: CountryKind): CountryDef {
  return DEFS[kind];
}

// ------------------------------------------------------------------ 純粋な窓口（テストと ゲームの hook が使う）

export function countryAt(seed: number, x: number, z: number): { kind: CountryKind; cx: number; cz: number; e: number; mountain: boolean } {
  return countryMapFor(seed).countryAt(x, z);
}

export function countryCell(seed: number, i: number, j: number): { px: number; pz: number; kind: CountryKind; mountain: boolean; startForced: boolean } {
  const c = countryMapFor(seed).cell(i, j);
  return { px: c.px, pz: c.pz, kind: c.kind, mountain: c.mountain, startForced: c.startForced };
}

export function mountainFrame(seed: number, fx: number, fz: number): MountainFrame {
  return countryMapFor(seed).mountainFrame(fx, fz);
}

export function groundAt(seed: number, x: number, z: number): GroundInfo {
  return countryMapFor(seed).groundAt(x, z);
}

export function mountainShapeAt(seed: number, x: number, z: number): MountainShape | null {
  return countryMapFor(seed).mountainShape(x, z);
}

export function pondsOf(seed: number, i: number, j: number): { pointOnLand: boolean; ponds: { x0: number; z0: number; x1: number; z1: number; mandatory: boolean }[] } {
  const r = countryMapFor(seed).pondsOfCell(i, j);
  return { pointOnLand: r.pointOnLand, ponds: r.ponds.map((p) => ({ x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, mandatory: p.mandatory })) };
}

export function takePath(seed: number, cx: number, cz: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const k of countryMapFor(seed).takeSet(cx, cz)) out.push({ x: Math.floor(k / 200003) - 100000, z: (k % 200003) - 100000 });
  return out;
}
