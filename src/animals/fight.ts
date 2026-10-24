/**
 * LIVE-4（docs/design/LIVE-4.md 版 2.1）: マッチョ が いっしょ に たたかう ための 小さな 計算（AnimalManager から 呼ぶ）。
 * 世界 にも 時計 にも さわらない 純粋 な 関数 だけ。パンチ の 時間 は 刀 の 突き（`bladeTech.thrust`）を 読む。
 */
import type { MachoCause } from '../contracts';

/** 決まった 数（§2.2・§2.3・§2.4・§4.1。設定 に しない もの） */
export const FIGHT = {
  /** 「！」 を 出す ステップ */
  bangTicks: 20,
  /** かちポーズ の ステップ */
  flexTicks: 30,
  /** はしり はじめて これ だけ とどかない と おうえん */
  cheerAfter: 180,
  /** プレイヤー から これ より はなれた 妖怪 は あきらめる（水平） */
  farDist: 16,
  /** 高さ の ちがい の 上限（足もと どうし） */
  dyMax: 2,
  /** 何回 に 1 回 が きりあげ か */
  upperEvery: 3,
  /** 当たる コマ で とどいて いる か 見る とき の ゆとり（走って 止まる 位置 の ずれ） */
  hitSlack: 0.25,
  /** パタパタ（落ちて いる）と みなす 落ちた 高さ。1 段 おりる くらい は たたかえる */
  flutterDrop: 1.2,
} as const;

export interface ThrustFrames {
  startup: number;
  active: number;
  recovery: number;
}

/** 1 回 の パンチ: 当たる コマ（0 が とどいた ステップ）と ながさ。刀 の 突き と 同じ（ため + 1 で 当たる） */
export function punchPlan(t: ThrustFrames): { hitAt: number; total: number } {
  const startup = Math.max(0, Math.round(t.startup));
  const total = Math.max(startup + 1, startup + Math.max(0, Math.round(t.active)) + Math.max(0, Math.round(t.recovery)));
  return { hitAt: startup + 1, total };
}

/** 次 の パンチ が きりあげ か（`hits` = この ねらい で 当てた 数。3 回目・6 回目 … が きりあげ） */
export function isUpperPunch(hits: number): boolean {
  return (hits + 1) % FIGHT.upperEvery === 0;
}

/** 刀 の `techDamage` と 同じ 丸め（0.01 の 位） */
export function round2(n: number): number {
  return Math.round(n * 100 + 1e-7) / 100;
}

/** パンチ の ダメージ: ふつう = `atk`、きりあげ = `atk` × `bladeDamageMul.kiriage` */
export function punchDamage(atk: number, upper: boolean, kiriageMul: number): number {
  return upper ? round2(atk * kiriageMul) : atk;
}

/** たたかう 子 を えらぶ: なかま に なった 順（同じ なら id の 小さい 方）に `max` わ まで */
export function pickFighters(cands: readonly { id: number; joinNo: number }[], max: number): number[] {
  const n = Math.max(0, Math.floor(max));
  if (n === 0 || cands.length === 0) return [];
  const sorted = [...cands].sort((a, b) => a.joinNo - b.joinNo || a.id - b.id);
  return sorted.slice(0, n).map((c) => c.id);
}

/**
 * その ステップ の きっかけ から ねらう 妖怪 を 1 体 きめる（§2.2）。
 * りっくん が たたいた（`hit`）が さき（さいご の 1 体）。なければ りっくん が たたかれた（`hurt`）の うち id の いちばん 小さい 妖怪。
 */
export function resolveCue(hit: readonly number[], hurt: readonly number[]): { yokai: number; cause: MachoCause } | null {
  if (hit.length > 0) return { yokai: hit[hit.length - 1]!, cause: 'playerHit' };
  if (hurt.length > 0) return { yokai: Math.min(...hurt), cause: 'playerHurt' };
  return null;
}

/** とどく か: 当たり の 箱 の ふち まで の 水平 の 距離 が `reach`（＋ゆとり）以内 で、足もと の 高さ の ちがい が 2 マス 以内 */
export function inReach(dh: number, dy: number, radius: number, reach: number, slack = 0): boolean {
  return dh - radius <= reach + slack + 1e-9 && Math.abs(dy) <= FIGHT.dyMax + 1e-9;
}
