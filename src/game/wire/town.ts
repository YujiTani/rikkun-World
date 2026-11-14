// 街（TOWN-1 1B-1）の つなぎ: 起動で 置き場所を きめて 有効に する・テストの 窓口。
import type { StreamRestore } from '../../save/streamRestore';
import { colKey } from '../../world/stream/ring';
import { terrainFor } from '../../world/gen/terrain';
import { chooseTown } from '../../town/townPlace';
import { activateTown, currentTown, deactivateTown } from '../../town/townState';
import type { TownInfo, XZ } from '../../town/townPlan';
import type { ShaftWorld } from '../../world/gen/mineShafts';
import { townGuards } from '../../town/townGuard';
import { townPlanBlock, townRepairsNow } from './townRepair';

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
    /** 1.4: まだ もどって いない マス（保存と 同じ 中身）と まとまり。記録が なければ 空 */
    repairs: () => townRepairsNow()?.repairs() ?? { cells: [], groups: [] },
    /** 1.4（テストの 準備）: 妖怪の わざと 同じ 口で マスを かえて 記録する */
    damage: (cells: { x: number; y: number; z: number }[], to?: 'air' | 'stone'): number => townRepairsNow()?.damage(cells, to) ?? 0,
    /** 1.4: その マスの 設計・生成の 中身（もどった か くらべる） */
    planBlock: (x: number, y: number, z: number): string => townPlanBlock(x, y, z),
    /** 1.4: 妖怪の わざでも かわらない 所（あきち・石段・はしの 石がき）か */
    keeps: (x: number, y: number, z: number): boolean => townGuards(x, y, z),
  };
}

/** 足もとが わかない はんい（街 ＋ 8 マス）の 中か。1.3: 妖怪を 止めも ふせぎも しない。わく 場所の しらべ・テストの 窓口 だけ */
export const townSafe = (p: { x: number; z: number }): boolean => currentTown()?.inSafe(p.x, p.z) ?? false;
/** 足もとが 街の はんいの 中か（落ちても いたくない。AC42） */
export const townInside = (p: { x: number; z: number }): boolean => currentTown()?.inTown(p.x, p.z) ?? false;

