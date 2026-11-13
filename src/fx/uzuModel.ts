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
  /** うず 1 つの あわの 数（個）。6〜8 */
  beads: 7,
  /** うずの 半径（マス）。ブロックの 半分(0.5)より 少し 大きい ＝ 直径 1.2 マス */
  radius: 0.6,
  /** 1 周に かかる 時間（秒） */
  period: 2,
  /** あわの 列の ながさ（先頭から いちばん うしろ までの 角度、ラジアン）。1.5π = 4 分の 3 周 */
  tail: Math.PI * 1.5,
  /** らせん: うしろの あわ 1 つ ごとに 半径が かわる 量（マス）。わきどころは うしろが 内がわ（外へ ひろがる）、たきつぼは 外がわ（内へ すいこむ） */
  spiral: 0.045,
  /** 上下の ゆれの はば（マス）と 1 回の ゆれの 長さ（秒） */
  bob: 0.06,
  bobPeriod: 1.3,
  /** あわの 大きさ（箱の 1 辺、マス）。先頭が これ・いちばん うしろは これ × tailScale */
  size: 0.2,
  tailScale: 0.4,
  /** ふえる・消える 時間（秒）。消える ときは ふっと 小さくなる */
  fadeIn: 0.25,
  fadeOut: 0.3,
  /** ちかくの ブロックを さがす 間（秒）。この 間ごとに、まわりの 立方体 だけを しらべる */
  refresh: 0.25,
  /** しらべる 立方体の 候補の 上限（個。これより 多くは おぼえない） */
  maxCandidates: 128,
  /** 描く 順（大きい ほど あと）。水の ブロックの 上に かさねて 見せる */
  renderOrder: 5,
  /** 色（0xRRGGBB）: 先頭の あわ → いちばん うしろの あわ */
  waterHead: 0xffffff,
  waterTail: 0x7fd8ff,
  magmaHead: 0xffee70,
  magmaTail: 0xff7a1a,
  /** 向きの 案（試作。yuzu が えらんだら 1 つ 消す）: 'flat' = 水平の うず、'ring' = たての 輪（ブロックの 手前の 面で くるくる） */
  look: 'flat' as UzuLook,
} as const;

export type UzuLook = 'flat' | 'ring';

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

export interface UzuSpot {
  x: number;
  y: number;
  z: number;
  kind: UzuKind;
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
  /** 大きさの わりあい（先頭 1 〜 いちばん うしろ tailScale） */
  scale: number;
}

const TAU = Math.PI * 2;

/** あわ i（0 = 先頭）の 位置と 大きさ。位置は ブロックの 左下手前の すみから（まん中は 0.5）。phase は うずごとの ずれ（0〜1） */
export function uzuBead(look: UzuLook, kind: UzuKind, phase: number, time: number, i: number, axis: 0 | 1, out: UzuBead): UzuBead {
  const last = UZU.beads - 1;
  const u = i / last; // 0 = 先頭、1 = いちばん うしろ
  const theta = TAU * (time / UZU.period + phase) - u * UZU.tail;
  const r = UZU.radius - kind.dir * UZU.spiral * i;
  const bob = UZU.bob * Math.sin(TAU * (time / UZU.bobPeriod + phase) + i * 1.1);
  const c = Math.cos(theta) * r;
  const s = Math.sin(theta) * r;
  if (look === 'flat') {
    out.x = 0.5 + c;
    out.y = 0.5 + bob;
    out.z = 0.5 + s;
  } else if (axis === 0) {
    // 手前が x の 向き: z と y の 面で 回る
    out.x = 0.5 + bob;
    out.y = 0.5 + s;
    out.z = 0.5 + c;
  } else {
    out.x = 0.5 + c;
    out.y = 0.5 + s;
    out.z = 0.5 + bob;
  }
  out.scale = 1 - (1 - UZU.tailScale) * u;
  return out;
}

const lerpHex = (a: number, b: number, t: number): number => {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
};

/** あわ i の 色（0xRRGGBB）。先頭は しろ（マグマは きいろ）、うしろほど 水いろ（オレンジ） */
export function uzuBeadColor(magma: boolean, i: number): number {
  const t = i / (UZU.beads - 1);
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
  /** たての 輪案の 向き（0 = x が 手前、1 = z が 手前）。出た ときに 近い 人の ほうへ きめる */
  axis: 0 | 1;
}

const blank = (): UzuEntry => ({ used: false, want: false, grow: 0, spot: { x: 0, y: 0, z: 0, kind: { magma: false, dir: 1 } }, phase: 0, axis: 0 });

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
      let e = this.entries.find((x) => x.used && x.spot.x === s.x && x.spot.y === s.y && x.spot.z === s.z);
      if (!e) {
        e = this.entries.find((x) => !x.used);
        if (!e) continue; // 消えかけが 場所を ふさいで いる。次の 回に
        e.used = true;
        e.grow = 0;
        e.phase = createRng(this.seed ^ Math.imul(s.x, 73856093) ^ Math.imul(s.y, 19349663) ^ Math.imul(s.z, 83492791))();
        let near = foci[0];
        for (const f of foci) if (!near || dist2(s, f) < dist2(s, near)) near = f;
        e.axis = near && Math.abs(near.x - (s.x + 0.5)) >= Math.abs(near.z - (s.z + 0.5)) ? 0 : 1;
      }
      e.spot.x = s.x;
      e.spot.y = s.y;
      e.spot.z = s.z;
      e.spot.kind = s.kind;
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
