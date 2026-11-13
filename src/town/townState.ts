import { TownPlan, type TownRecord, type XZ } from './townPlan';

/**
 * TOWN-1 1B-1: いま 開いて いる 世界の 街（1 つ）。`generateChunk` が 読む（街が ない 世界・テストでは null）。
 * 起動で 1 回 `activateTown(seed, 記録, スタート)` して、世界を 閉じる ときや 街なしの 世界で `deactivateTown()`。
 * 世界の 作り（生成）から この ファイルへ 一方向 だけ（townPlace など 重い 計算は ここに 入れない）。
 */
let active: { seed: number; plan: TownPlan } | null = null;

/** この 世界の 街を 使う（以後の generateChunk が 書く）。すでに 作った 列は かわらない ので 世界を 作る 前に よぶ */
export function activateTown(seed: number, rec: TownRecord, spawn: XZ | null): TownPlan {
  const plan = new TownPlan(rec, spawn);
  active = { seed, plan };
  return plan;
}

/** 街を 使わない（街なしの 世界・別の 世界を 開く 前） */
export function deactivateTown(): void {
  active = null;
}

/** そのシードの 街（なければ null） */
export function activeTownPlan(seed: number): TownPlan | null {
  return active !== null && active.seed === seed ? active.plan : null;
}

/** いま 開いて いる 街（シードを 問わない。窓口・安全地帯の しらべ用） */
export function currentTown(): TownPlan | null {
  return active?.plan ?? null;
}
