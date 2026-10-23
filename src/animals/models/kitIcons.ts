/**
 * こたつ の 天板 の 上 の たまご の 表示（LIVE-2.1 §3.2・§2.4・AC12）。
 * 状態 は 純粋 な 関数 で 決める（`kitIconState`・`kitIconsFor`）。絵 は 小さな ドット絵 を 自分 で 作る（`rasterKitIcon`）ので
 * 画像 ファイル も canvas も いらない（node の テスト でも 動く）。光らない・点滅 しない。
 * つなぎ込み: 毎フレーム `kitIconsFor(animals.kits(), …)` の 答え を `AnimalRenderer.setKitIcons()` に わたし、
 * 同じ 答え を `animals.fx().kitIcons` に 出す。
 */

/** こたつ 1 台 の たまご の 上限・1 台 の わく の 数 */
export const KIT_SLOTS = 3;
/** 出る はんい（水平、マス） */
export const KIT_ICON_RANGE = 8;
/** 1 わく の 絵 の 大きさ（点）と、わく の すきま */
export const SLOT_W = 16;
export const SLOT_H = 20;
export const SLOT_GAP = 3;
export const ICON_W = KIT_SLOTS * SLOT_W + (KIT_SLOTS - 1) * SLOT_GAP;
export const ICON_H = SLOT_H;
/** 1 マス = 32 点 （わく 1 つ = 0.5 マス、すきま 0.1 マス ほど） */
export const ICON_PER_BLOCK = 32;

export type KitEggKind = 'egg' | 'gold';
export type Wobble = 0 | 1 | 2;

/** こたつ に 入って いる たまご 1 こ（`animals.kits()[].eggs[i]`）。`hatchT` = かえる 動き の すすみ 0〜1（なければ かえって いない） */
export interface KitEggLike {
  egg: KitEggKind;
  left: number;
  hatchT?: number;
}

/** `animals.kits()` の 1 行 の うち 絵 に いる もの */
export interface KitLike {
  x: number;
  y: number;
  z: number;
  /** 2 = 2×2。なければ 1（古い 1 マス こたつ） */
  size?: 1 | 2;
  eggs: readonly KitEggLike[];
}

export interface KitIconSlot {
  egg: KitEggKind | null;
  /** あたため の すすみ 0〜1（下 から うまる） */
  fill: number;
  wobble: Wobble;
}

/** `fx().kitIcons` の 1 行（こたつ ごと。slots は いつも 3） */
export interface KitIconRow {
  x: number;
  y: number;
  z: number;
  size: 1 | 2;
  slots: KitIconSlot[];
}

/** ゆれ の 段: のこり 2/3 以上 = じっと・1/3 以上 = ときどき・それ より 少ない = よく ゆれる ＋ ひび（LIVE-2 §3.5 の 区間） */
export function eggWobble(left: number, total: number): Wobble {
  return left * 3 >= total * 2 ? 0 : left * 3 >= total ? 1 : 2;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 1 台 ぶん の 3 わく。入った 順。かえる 動き の ぽんっ（1/3 から）で その 絵 は 消える */
export function kitIconState(eggs: readonly KitEggLike[], total: number): KitIconSlot[] {
  const out: KitIconSlot[] = [];
  for (let i = 0; i < KIT_SLOTS; i++) {
    const e = eggs[i];
    if (!e || (e.hatchT !== undefined && e.hatchT >= 1 / 3)) {
      out.push({ egg: null, fill: 0, wobble: 0 });
      continue;
    }
    const hatching = e.hatchT !== undefined && e.hatchT > 0;
    out.push({ egg: e.egg, fill: clamp01(1 - e.left / Math.max(1, total)), wobble: hatching ? 2 : eggWobble(e.left, total) });
  }
  return out;
}

export interface KitIconCtx {
  /** 見て いる 目 の 水平 の 位置 */
  eye: { x: number; z: number };
  /** `kitHatchTicks`（初期値 7,200） */
  total: number;
  /** ねらって いる こたつ の 本体 の マス と、`egg`・`kin_tamago` を 持って いる か。ねらって いなければ null */
  aim: { x: number; z: number; holdingEgg: boolean } | null;
}

/**
 * 出す こたつ の 行。たまご が 1 こ 以上 入って いて 水平 8 以内、または
 * たまご を 持って その こたつ を ねらって いる とき（から でも 3 わく を 出す）。
 * `kits` は たまご が 入って いる こたつ だけ でなく、ねらった から の こたつ を ふくんでも よい
 */
export function kitIconsFor(kits: readonly KitLike[], c: KitIconCtx): KitIconRow[] {
  const out: KitIconRow[] = [];
  for (const k of kits) {
    const size = k.size ?? 1;
    const cx = k.x + (size === 2 ? 1 : 0.5);
    const cz = k.z + (size === 2 ? 1 : 0.5);
    const aimed = !!c.aim && c.aim.holdingEgg && c.aim.x === k.x && c.aim.z === k.z;
    const near = k.eggs.length > 0 && Math.hypot(cx - c.eye.x, cz - c.eye.z) <= KIT_ICON_RANGE;
    if (!aimed && !near) continue;
    out.push({ x: k.x, y: k.y, z: k.z, size, slots: aimed && k.eggs.length === 0 ? kitIconState([], c.total) : kitIconState(k.eggs, c.total) });
  }
  return out;
}

/** うまり の 段（絵 を 作り直す 回数 を へらす）。1/8 ごと */
const FILL_STEPS = 8;

/** 同じ 見た目 なら 同じ 文字（絵 の 作り直し の 目印） */
export function kitIconKey(slots: readonly KitIconSlot[]): string {
  return slots.map((s) => (s.egg === null ? '-' : `${s.egg[0]}${Math.floor(s.fill * FILL_STEPS)}${s.wobble}`)).join('|');
}

// 色（RGBA）。たまご = あたたかい クリーム、金 = きん、ふち = こい ちゃいろ
const COLOR = {
  egg: [255, 243, 214],
  gold: [255, 211, 74],
  edge: [96, 66, 40],
  goldEdge: [150, 100, 20],
  crack: [70, 46, 28],
} as const;

/** 傾き（度）: 0 じっと／1 ときどき／2 よく ゆれる */
const TILT_DEG: Record<Wobble, number> = { 0: 0, 1: 7, 2: 13 };

/** たまご の 形（1 わく の 中、ふち の 太さ 1 点）。中心 (8,10.5)、よこ 6.2、たて 8.6、下 が ふくらむ */
function eggRadius(dx: number, dy: number): number {
  // dy < 0 が 上。上 は とがり ぎみ、下 は まるい
  const ry = dy < 0 ? 8.8 : 8.2;
  const rx = dy < 0 ? 5.4 : 6.4;
  return Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
}

/** 3 わく ぶん の 絵（RGBA、`ICON_W`×`ICON_H`、上 から 下）。入った わく は 下 から うまり、から の わく は 点線 の ふち だけ */
export function rasterKitIcon(slots: readonly KitIconSlot[]): Uint8Array {
  const px = new Uint8Array(ICON_W * ICON_H * 4);
  const put = (x: number, y: number, c: readonly number[], a: number): void => {
    if (x < 0 || y < 0 || x >= ICON_W || y >= ICON_H) return;
    const i = (y * ICON_W + x) * 4;
    px[i] = c[0]!;
    px[i + 1] = c[1]!;
    px[i + 2] = c[2]!;
    px[i + 3] = a;
  };
  for (let s = 0; s < KIT_SLOTS; s++) {
    const slot = slots[s] ?? { egg: null, fill: 0, wobble: 0 as Wobble };
    const ox = s * (SLOT_W + SLOT_GAP);
    const ang = (TILT_DEG[slot.wobble] * Math.PI) / 180;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const body = slot.egg === 'gold' ? COLOR.gold : COLOR.egg;
    const edge = slot.egg === 'gold' ? COLOR.goldEdge : COLOR.edge;
    // うまった 高さ（下 から。ふち の 内がわ）
    const fillTop = SLOT_H - 2 - Math.round(slot.fill * FILL_STEPS) * ((SLOT_H - 4) / FILL_STEPS);
    for (let y = 0; y < SLOT_H; y++) {
      for (let x = 0; x < SLOT_W; x++) {
        // 中心 から 回して たまご の 形 を はかる（下 の 中心 を 軸 に かたむく）
        const rx = x + 0.5 - SLOT_W / 2;
        const ry = y + 0.5 - 10.5;
        const ux = rx * ca + ry * sa;
        const uy = -rx * sa + ry * ca;
        const r = eggRadius(ux, uy);
        if (r > 1) continue;
        const rim = r > 0.8; // ふち
        if (slot.egg === null) {
          if (rim && (x + y) % 2 === 0) put(ox + x, y, COLOR.edge, 110); // うすい 点線
          continue;
        }
        if (rim) {
          put(ox + x, y, edge, 255);
        } else if (y >= fillTop) {
          put(ox + x, y, body, 255);
        }
      }
    }
    // ひび（よく ゆれる 段）
    if (slot.egg !== null && slot.wobble === 2) {
      const zig = [0, 1, 0, -1, 0, 1, 0];
      for (let i = 0; i < zig.length; i++) put(ox + 8 + zig[i]!, 6 + i, COLOR.crack, 255);
    }
  }
  return px;
}
