// CHAR-4: 刃の軌跡の 純粋な 決まり（three.js なし）。docs/design/CHAR-4.md §4.2〜§4.5
import { W2_SETTING_DEFAULTS, type BladeTech, type BladeTechFrames, type BladeTrailStyle, type ItemId, type W2Settings } from '../contracts';
import { TECH_PHASES } from '../char/techCurves';
import pathJson from './bladePath.json';

/** 軌跡を 出す 刀（`BLADE_ITEMS` と 同じ。fx から tools へ 依存しないよう ここにも 持つ） */
export const BLADE_TRAIL_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>(['bokuto', 'katana', 'crystal_katana', 'raijin_ken', 'fujin_ken']);

export type PathVec = readonly [number, number, number];
export interface PathPoint {
  /** つば [右, 上, 前]（m、絵の 大きさ） */
  base: PathVec;
  /** 刃先 [右, 上, 前]（m、絵の 大きさ） */
  tip: PathVec;
}

const FILE_KEY = { thrust: 'katana_thrust', kesa: 'katana_kesa', kiriage: 'katana_kiriage' } as const;
const raw = pathJson as unknown as Record<string, { perTick: PathPoint[] }>;
/** 刃先の 通り道の データ（`art/char-sheets/blade_path.json` の 写し）。番号 = 絵の 時 τ */
export const bladePathData: Readonly<Record<BladeTech, readonly PathPoint[]>> = {
  thrust: raw[FILE_KEY.thrust]!.perTick,
  kesa: raw[FILE_KEY.kesa]!.perTick,
  kiriage: raw[FILE_KEY.kiriage]!.perTick,
};

/** 絵の 大きさ ÷ 絵の span の 倍率 k = 1.8 ÷ modelH（`atlas.json` の modelH = 1.7。ユニットテストが 実物と くらべる） */
export const TRAIL_MODEL_H = 1.7;
export const TRAIL_K = 1.8 / TRAIL_MODEL_H;

/** 絵の わざの 長さ（初期の 設定と 同じ） */
const PICTURE: Record<BladeTech, BladeTechFrames> = TECH_PHASES;

/** 設定の 時刻 t（わざの ステップ f の おわり = f）→ 絵の 時 τ（§4.2）。出だし・当たり・もどりを 順に たどる（new しない） */
export function timeToTau(tech: BladeTech, lengths: BladeTechFrames, t: number): number {
  const ph = PICTURE[tech];
  // 出だし
  let base = lengths.startup;
  if (t <= base) return (t * ph.startup) / lengths.startup;
  // 当たり
  const t1 = base;
  base += lengths.active;
  if (t <= base) return ph.startup + ((t - t1) * ph.active) / lengths.active;
  // もどり
  return t <= base + lengths.recovery ? ph.startup + ph.active + ((t - base) * ph.recovery) / lengths.recovery : ph.startup + ph.active + ph.recovery;
}

/** 絵の 時 τ → 設定の 時刻 */
export function tauToTime(tech: BladeTech, lengths: BladeTechFrames, tau: number): number {
  const ph = PICTURE[tech];
  if (tau <= ph.startup) return (tau * lengths.startup) / ph.startup;
  const p1 = ph.startup;
  if (tau <= p1 + ph.active) return lengths.startup + ((tau - p1) * lengths.active) / ph.active;
  const p2 = p1 + ph.active;
  if (tau <= p2 + ph.recovery) return lengths.startup + lengths.active + ((tau - p2) * lengths.recovery) / ph.recovery;
  return lengths.startup + lengths.active + lengths.recovery;
}

/**
 * τ での 刃先（か つば）の データの 点 [右, 上, 前]。整数の τ は データそのまま。
 * それ以外は となりの 4 つの 点を 通る なめらかな 曲線（見本 render.py の `cr`）。`out` に 書く
 */
export function pathPoint(tech: BladeTech, tau: number, which: 'tip' | 'base', out: number[]): void {
  const P = bladePathData[tech];
  const last = P.length - 1;
  const i = Math.floor(tau);
  const u = tau - i;
  const g = (j: number): PathVec => P[Math.max(0, Math.min(last, j))]![which];
  const p1 = g(i);
  if (u === 0) {
    out[0] = p1[0];
    out[1] = p1[1];
    out[2] = p1[2];
    return;
  }
  const p0 = g(i - 1);
  const p2 = g(i + 1);
  const p3 = g(i + 2);
  const u2 = u * u;
  const u3 = u2 * u;
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * (2 * p1[k]! + (-p0[k]! + p2[k]!) * u + (2 * p0[k]! - 5 * p1[k]! + 4 * p2[k]! - p3[k]!) * u2 + (-p0[k]! + 3 * p1[k]! - 3 * p2[k]! + p3[k]!) * u3);
  }
}

/** 区切りの まん中の 時刻の 年れい → 消えぐあい（1・0.75・0.5・0.25、`life` 以上は 0）。年れいだけで 決まる（§4.4） */
export function fadeOfAge(age: number, fadeAges: readonly number[], life = 9): number {
  if (age >= life) return 0;
  return age < fadeAges[0]! ? 1 : age < fadeAges[1]! ? 0.75 : age < fadeAges[2]! ? 0.5 : 0.25;
}

/** 武器の 色の 行（表に ない 刀は かたなの 行。§4.5） */
export function trailRow(settings: Pick<W2Settings, 'bladeTrail'>, item: ItemId | null): BladeTrailStyle {
  return (item ? settings.bladeTrail[item] : undefined) ?? settings.bladeTrail.katana ?? W2_SETTING_DEFAULTS.bladeTrail.katana!;
}

const colorsCache = new WeakMap<object, { body: number; shine: number }>();

/**
 * キャラの絵の 刃の 2 色（色見本の 20・21 番に ぬる）。刀（`BLADE_TRAIL_ITEMS`）を 持っている ときだけ。弓・素手・ほかは null（§4.6）。
 * 表の 行ごとに 入れ物を 使いまわす（毎ステップ new しない。値が 変われば 中身を 書きかえる）
 */
export function bladeColorsOf(settings: Pick<W2Settings, 'bladeTrail'>, item: ItemId | null): { body: number; shine: number } | null {
  if (!item || !BLADE_TRAIL_ITEMS.has(item)) return null;
  const row = trailRow(settings, item);
  let c = colorsCache.get(row);
  if (!c) {
    c = { body: row.blade, shine: row.bladeShine };
    colorsCache.set(row, c);
  } else if (c.body !== row.blade || c.shine !== row.bladeShine) {
    c.body = row.blade;
    c.shine = row.bladeShine;
  }
  return c;
}
