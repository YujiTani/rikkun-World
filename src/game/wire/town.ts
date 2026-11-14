// 街（TOWN-1 1B-1）の つなぎ: 起動で 置き場所を きめて 有効に する・テストの 窓口。
import type { StreamRestore } from '../../save/streamRestore';
import { colKey } from '../../world/stream/ring';
import { terrainFor } from '../../world/gen/terrain';
import { chooseTown } from '../../town/townPlace';
import { activateTown, currentTown, deactivateTown } from '../../town/townState';
import type { TownInfo, XZ } from '../../town/townPlan';
import type { ShaftWorld } from '../../world/gen/mineShafts';

/** URL に `?town=off` ＝ 街を 作らない（くらべ用・街と 関係ない テスト用） */
const townOffIn = (search: string): boolean => new URLSearchParams(search).get('town') === 'off';

/** はじまりの 坑道が 通る 列（道ぜんぶ ＋ 入口の 盛り土）。街を 置く 所から さける（なければ 空） */
function shaftColumns(shafts: ShaftWorld | undefined): XZ[] {
  const st = shafts?.start()?.plan.shaft;
  if (shafts === undefined || st === undefined) return [];
  const out: XZ[] = shafts.path(st.id).map((c) => ({ x: c.x, z: c.z }));
  const m = st.mound;
  if (m !== null) {
    const r = (m.width >> 1) + 1;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) out.push({ x: m.x + dx, z: m.z + dz });
  }
  return out;
}

/**
 * 世界を 作る 前に 1 回 よぶ。記録が 保存に あれば それを 使い、なければ きめて restored に おぼえる（meta に 書かれる）。
 * 前の セーブの 列（プレイヤーの 物）と かかる 所は さける。
 */
export function bootTown(seed: number, restored: StreamRestore, search: string, shafts?: ShaftWorld): void {
  deactivateTown();
  if (townOffIn(search)) return;
  if (restored.town === undefined) restored.town = chooseTown(seed, { occupied: (cx, cz) => restored.keys.has(colKey(cx, cz)), avoid: shaftColumns(shafts) });
  if (restored.town !== null) {
    const sp = terrainFor(seed).spawn();
    activateTown(seed, restored.town, { x: sp.x, z: sp.z });
  }
}

/** `window.__rikkun.town`（TOWN-1 §6.1）。街が ない ときは info が null */
export function createTownHook() {
  return {
    info: (): TownInfo | null => currentTown()?.info() ?? null,
    inSafe: (x: number, _y: number, z: number): boolean => currentTown()?.inSafe(x, z) ?? false,
    inTown: (x: number, _y: number, z: number): boolean => currentTown()?.inTown(x, z) ?? false,
    /** 街の けむりの つぶ（1B-2 で 入る。いまは 0） */
    smoke: (): number => 0,
  };
}

/** 足もとが 安全の はんいの 中か（妖怪の こうげきを ふせぐ） */
export const townSafe = (p: { x: number; z: number }): boolean => currentTown()?.inSafe(p.x, p.z) ?? false;
/** 足もとが 街の はんいの 中か（落ちても いたくない。AC42） */
export const townInside = (p: { x: number; z: number }): boolean => currentTown()?.inTown(p.x, p.z) ?? false;

/** そこの ブロックは こわせない・置けない（街の はんいの 中で、あきちの 外。AC9・AC7b） */
export const townLocked = (x: number, z: number): boolean => {
  const t = currentTown();
  return t !== null && t.inTown(x, z) && !t.inLot(x, z);
};
