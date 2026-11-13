import { createRng } from '../world/gen/random';

/**
 * 「あわのうず」: わきどころ・たきつぼ（マグマ版も）に 近づくと、ブロックの まわりを 小さい あわが くるくる 回る。
 * 水と 同じ 見た目に した ので、どれが その ブロックか 分かる ための 目じるし（回収して 自分の 滝を 作る 遊び）。
 * ここは 計算だけ（絵は uzuFx.ts）。しぶき（splashModel.ts）と 同じ 作り。
 */

export const UZU = {
  /** 出す 距離（マス）: プレイヤー（1P・2P どちらか）が ブロックの まん中から これ いないに いる とき */
  range: 6,
  /** 同時に 出す うずの 上限（個）。ちかい ほうから */
  maxShown: 12,
  /** うず 1 つの つぶの 数（個。18〜24）と、うずまきの 腕の 数（本）。つぶの 数は 腕の 数で わりきれる */
  beads: 21,
  arms: 3,
  /** うずの 半径（マス）。ブロックの 中に おさまる（半分 0.5 より 小さい） */
  radius: 0.38,
  /** うずまきの ねじれ（ラジアン）: 中心から 外までで 腕が まわりこむ 角度。1.2π */
  twist: Math.PI * 1.2,
  /** 全体が 回る 1 周の 時間（秒） */
  period: 2,
  /** つぶが 中心と 外を 1 往復（わきどころは 外へ・たきつぼは 内へ）する 時間（秒） */
  flow: 1.6,
  /** つぶの 大きさ（箱の 1 辺、マス）: いちばん 大きい とき 0.09・いちばん 小さい とき 0.06（先頭が 大きく うしろほど 小さい） */
  sizeMax: 0.09,
  sizeMin: 0.06,
  /** ピクセルらしい カクカク: 位置を 1/gridDiv マスの 格子に まるめる・動きは 1 秒 fps コマ */
  gridDiv: 18,
  fps: 12,
  /** マグマ版（ブロックが すけない）は 輪の かわりに 吹き出し: 何秒ごとに（ブロックごとに 場所から ずらす）・つぶの 数（個。8〜12）・つぶの 寿命と 出はじめの ばらつき（秒。合計 約 0.6 秒）・いちばん 高く 上がる 高さ（マス）・左右の ひろがり（マス） */
  ventEvery: 2.5,
  ventBeads: 10,
  ventLife: 0.45,
  ventDelay: 0.15,
  ventPeak: 0.5,
  ventSpread: 0.3,
  /** 中心と 外の ふちで ふっと 小さくなる はば（0〜1 の うち） */
  edge: 0.2,
  /** ふえる・消える 時間（秒）。消える ときは ふっと 小さくなる */
  fadeIn: 0.25,
  fadeOut: 0.3,
  /** ちかくの ブロックを さがす 間（秒）。向きの 追いかけも この 間ごと */
  refresh: 0.25,
  /** しらべる 立方体の 候補の 上限（個。これより 多くは おぼえない） */
  maxCandidates: 128,
  /** 描く 順（大きい ほど あと）。水の ブロックの 中の つぶが 水に かくれない ように */
  renderOrder: 5,
  /** 色（0xRRGGBB）: 先頭（あかるい） → うしろ */
  waterHead: 0xffffff,
  waterTail: 0x7fd8ff,
  magmaHead: 0xffee70,
  magmaTail: 0xff7a1a,
} as const;

export interface UzuKind {
  /** マグマ版（オレンジ〜黄） */
  magma: boolean;
  /** 1 = 外へ ひろがる（わきどころ）、-1 = 内へ すいこむ（たきつぼ） */
  dir: 1 | -1;
}

const KINDS: Readonly<Record<string, UzuKind>> = {
  wakimizu: { magma: false, dir: 1 },
  takitsubo: { magma: false, dir: -1 },
  magma_wakimizu: { magma: true, dir: 1 },
  magma_takitsubo: { magma: true, dir: -1 },
};

/** ブロックの id が 対象なら その 種類、ちがうなら null */
export function uzuKindOf(id: string): UzuKind | null {
  return KINDS[id] ?? null;
}

/** 吹き出す 向き（0 = +x、1 = -x、2 = +z、3 = -z、4 = 上）。-1 = どこも ふさがって いて 出さない */
export type UzuVent = -1 | 0 | 1 | 2 | 3 | 4;

/** open の ビット: まわりの 1 マスが 空気・水の 見た目なら 立てる（+x 1、-x 2、+z 4、-z 8、上 16） */
export const OPEN_UP = 16;
const OPEN_SIDE = [1, 2, 4, 8] as const;

/** マグマの 吹き出す 面: 上が あいて いれば 上、ふさがって いれば プレイヤー側（face）の よこ、それも だめなら ほかの よこ */
export function uzuVentOf(open: number, face: UzuFace): UzuVent {
  if (open & OPEN_UP) return 4;
  if (open & OPEN_SIDE[face]) return face;
  for (let f = 0; f < 4; f++) if (open & OPEN_SIDE[f]!) return f as UzuFace;
  return -1;
}

export interface UzuSpot {
  x: number;
  y: number;
  z: number;
  kind: UzuKind;
  /** まわりの あき（OPEN_* の ビット）。マグマ版だけ つかう */
  open: number;
}

export interface UzuPoint {
  x: number;
  y: number;
  z: number;
}

export interface UzuBead {
  /** ブロックの 左下手前の すみ からの 位置（まん中が 0.5） */
  x: number;
  y: number;
  z: number;
  /** 大きさ（マスの 1 辺。ふちでは 0 まで 小さくなる） */
  size: number;
  /** 先頭の あかるさ（0 = うしろ 〜 1 = 先頭） */
  lead: number;
}

const TAU = Math.PI * 2;

/** 輪が 向く 面（0 = +x、1 = -x、2 = +z、3 = -z） */
export type UzuFace = 0 | 1 | 2 | 3;

const snap = (v: number): number => Math.round(v * UZU.gridDiv) / UZU.gridDiv;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 水の うず: つぶ i の 位置・大きさ。時間は 1 秒 12 コマに そろえ、面の 中の 位置は 1/18 マスの 格子に まるめる。ブロックの 中に おさまる */
export function uzuBead(kind: UzuKind, phase: number, time: number, i: number, face: UzuFace, out: UzuBead): UzuBead {
  const t = Math.floor(time * UZU.fps) / UZU.fps;
  const per = UZU.beads / UZU.arms;
  const arm = i % UZU.arms;
  const k = Math.floor(i / UZU.arms);
  const flow = (k / per + (kind.dir * t) / UZU.flow + phase) % 1;
  const rho = flow < 0 ? flow + 1 : flow; // 0 = 中心、1 = ふち
  const theta = TAU * (arm / UZU.arms + t / UZU.period) + UZU.twist * rho;
  const r = UZU.radius * rho;
  const lead = kind.dir === 1 ? rho : 1 - rho;
  const edge = smooth(Math.min(1, rho / UZU.edge, (1 - rho) / UZU.edge));
  const flip = face === 1 || face === 2 ? -1 : 1; // どの 面から 見ても 同じ 向きに 回って 見える
  const u = snap(0.5 + flip * Math.cos(theta) * r);
  const v = snap(0.5 + Math.sin(theta) * r);
  if (face < 2) {
    out.x = 0.5;
    out.y = v;
    out.z = u;
  } else {
    out.x = u;
    out.y = v;
    out.z = 0.5;
  }
  out.lead = lead;
  out.size = (UZU.sizeMin + (UZU.sizeMax - UZU.sizeMin) * lead) * edge;
  return out;
}

const hash01 = (i: number, salt: number): number => ((Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0) / 4294967296;

/** マグマの 吹き出し: つぶ i の 位置・大きさ。しばらくごとに 面から 0.5 マスぶん 吹き出して、おちながら 小さく 消える（出ていない 間は size 0）。12 コマ・1/18 の 格子 */
export function uzuVentBead(phase: number, time: number, i: number, vent: UzuVent, out: UzuBead): UzuBead {
  out.size = 0;
  out.lead = 0;
  if (vent < 0) return out;
  const t = Math.floor(time * UZU.fps) / UZU.fps;
  const c = (t + phase * UZU.ventEvery) % UZU.ventEvery;
  const u = (c - hash01(i, 1) * UZU.ventDelay) / UZU.ventLife; // 0 = 出た ところ、1 = 消える
  if (u < 0 || u >= 1) return out;
  const h = 4 * UZU.ventPeak * (0.6 + 0.4 * hash01(i, 4)) * u * (1 - u); // 上がって おちる（山なり）
  const spread = UZU.ventSpread * (0.4 + 0.6 * u);
  const a = snap(0.5 + (hash01(i, 2) - 0.5) * 2 * spread);
  const b = snap(0.5 + (hash01(i, 3) - 0.5) * 2 * spread);
  const up = snap(h);
  if (vent === 4) {
    out.x = a;
    out.y = 1 + up;
    out.z = b;
  } else if (vent < 2) {
    out.x = vent === 0 ? 1 + up : -up;
    out.y = a;
    out.z = b;
  } else {
    out.x = a;
    out.y = b;
    out.z = vent === 2 ? 1 + up : -up;
  }
  out.lead = 1 - u;
  out.size = UZU.sizeMin + (UZU.sizeMax - UZU.sizeMin) * (1 - u);
  return out;
}

/** 1 つの うずの つぶの 数（水: 輪の つぶ、マグマ: 吹き出しの つぶ） */
export const uzuCount = (kind: UzuKind): number => (kind.magma ? UZU.ventBeads : UZU.beads);

const lerpHex = (a: number, b: number, t: number): number => {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
};

/** つぶの 色（0xRRGGBB）。lead 1 = 先頭は しろ（マグマは きいろ）、うしろほど 水いろ（オレンジ）で うすく */
export function uzuBeadColor(magma: boolean, lead: number): number {
  const t = 1 - Math.min(1, Math.max(0, lead));
  return magma ? lerpHex(UZU.magmaHead, UZU.magmaTail, t) : lerpHex(UZU.waterHead, UZU.waterTail, t);
}

export interface UzuEntry {
  used: boolean;
  /** いま 出したい か（はなれたら false → 小さくなって 消える） */
  want: boolean;
  /** 0（なし）〜 1（ぜんぶ）の 出かた */
  grow: number;
  spot: UzuSpot;
  /** うずごとの 位置の ずれ（0〜1）。シードと 場所から きまる */
  phase: number;
  /** 輪の 向き。いちばん 近い プレイヤーの ほうへ（4 方向。sync ごとに 追う） */
  face: UzuFace;
  /** マグマの 吹き出す 向き */
  vent: UzuVent;
}

const blank = (): UzuEntry => ({ used: false, want: false, grow: 0, spot: { x: 0, y: 0, z: 0, kind: { magma: false, dir: 1 }, open: 0 }, phase: 0, face: 0, vent: -1 });

const dist2 = (s: UzuSpot, p: UzuPoint): number => (s.x + 0.5 - p.x) ** 2 + (s.y + 0.5 - p.y) ** 2 + (s.z + 0.5 - p.z) ** 2;

/** 出ている うずの 一覧（使いまわし。上限 maxShown 個ぶんの 入れ物を はじめに 作る） */
export class UzuField {
  readonly entries: UzuEntry[] = Array.from({ length: UZU.maxShown }, blank);
  private readonly order: { spot: UzuSpot; d: number }[] = [];

  constructor(private readonly seed: number) {}

  /** 見えている（grow > 0）うずの 数 */
  shown(): number {
    let n = 0;
    for (const e of this.entries) if (e.used && e.grow > 0) n++;
    return n;
  }

  /** 候補の ブロックと プレイヤー（0 人でも よい）から、どれを 出す/消すか きめる。0.25 秒おきくらいに 呼ぶ */
  sync(cands: readonly UzuSpot[], foci: readonly UzuPoint[], count: number = cands.length): void {
    const r2 = UZU.range * UZU.range;
    this.order.length = 0;
    for (let c = 0; c < count; c++) {
      const s = cands[c]!;
      let best = Infinity;
      for (const f of foci) best = Math.min(best, dist2(s, f));
      if (best <= r2) this.order.push({ spot: s, d: best });
    }
    this.order.sort((a, b) => a.d - b.d);
    for (const e of this.entries) e.want = false;
    for (let k = 0; k < this.order.length && k < UZU.maxShown; k++) {
      const s = this.order[k]!.spot;
      if (s.kind.magma && uzuVentOf(s.open, 0) < 0) continue; // どの 面も ふさがって いる
      let e = this.entries.find((x) => x.used && x.spot.x === s.x && x.spot.y === s.y && x.spot.z === s.z);
      if (!e) {
        e = this.entries.find((x) => !x.used);
        if (!e) continue; // 消えかけが 場所を ふさいで いる。次の 回に
        e.used = true;
        e.grow = 0;
        e.phase = createRng(this.seed ^ Math.imul(s.x, 73856093) ^ Math.imul(s.y, 19349663) ^ Math.imul(s.z, 83492791))();
      }
      let near = foci[0];
      for (const f of foci) if (!near || dist2(s, f) < dist2(s, near)) near = f;
      if (near) {
        const dx = near.x - (s.x + 0.5);
        const dz = near.z - (s.z + 0.5);
        e.face = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 1) : dz >= 0 ? 2 : 3;
      }
      e.spot.x = s.x;
      e.spot.y = s.y;
      e.spot.z = s.z;
      e.spot.kind = s.kind;
      e.spot.open = s.open;
      e.vent = uzuVentOf(s.open, e.face);
      e.want = true;
    }
  }

  /** dt 秒 すすめる（出かたの 変化・消えた ものの かたづけ） */
  step(dt: number): void {
    for (const e of this.entries) {
      if (!e.used) continue;
      if (e.want) e.grow = Math.min(1, e.grow + dt / UZU.fadeIn);
      else {
        e.grow = Math.max(0, e.grow - dt / UZU.fadeOut);
        if (e.grow === 0) e.used = false;
      }
    }
  }
}
