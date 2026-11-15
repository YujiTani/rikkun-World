import type { BuildingCell } from './townBuilder';
import { SHOP_SITES } from './townShops';

/**
 * TOWN-1 1B-2: 建物・やたいの 置き場所の 表（ローカル座標。`town.info().buildings`・`stalls` が 読む）。
 * 四角の 数は 各建物の 表（townBuildings.ts・townKajiya.ts・townDaiku.ts・townDojo.ts・townShops.ts）と 同じ。
 * door ＝ 戸口の 前の マス（地面の 上に 立つ 所）。数を かえる ときは 建物の 表と いっしょに 直す。
 */
export type BuildingKind = 'yorozuya' | 'kajiya' | 'daiku' | 'monoshiri' | 'machiya' | 'ochaya';

export interface BuildingSite {
  kind: BuildingKind;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  door: { u: number; v: number };
  /** 奥の 列（1 だん 高い 所）に 立って いるか */
  terrace: boolean;
}

export const BUILDING_SITES: readonly BuildingSite[] = [
  { kind: 'yorozuya', u0: 3, v0: 1, u1: 20, v1: 10, door: { u: 9, v: 11 }, terrace: true },
  { kind: 'kajiya', u0: 29, v0: 1, u1: 46, v1: 9, door: { u: 38, v: 11 }, terrace: true },
  { kind: 'daiku', u0: 47, v0: 0, u1: 73, v1: 9, door: { u: 58, v: 10 }, terrace: true },
  { kind: 'monoshiri', u0: 72, v0: 24, u1: 93, v1: 36, door: { u: 82, v: 37 }, terrace: false },
  { kind: 'machiya', u0: SHOP_SITES.machiyaA.u0, v0: SHOP_SITES.machiyaA.v0, u1: SHOP_SITES.machiyaA.u1, v1: SHOP_SITES.machiyaA.v1 + 1, door: { u: SHOP_SITES.machiyaA.door.u, v: SHOP_SITES.machiyaA.door.v + 1 }, terrace: false },
  { kind: 'machiya', u0: SHOP_SITES.machiyaB.u0, v0: SHOP_SITES.machiyaB.v0, u1: SHOP_SITES.machiyaB.u1, v1: SHOP_SITES.machiyaB.v1 + 1, door: { u: SHOP_SITES.machiyaB.door.u, v: SHOP_SITES.machiyaB.door.v + 1 }, terrace: false },
  { kind: 'ochaya', u0: SHOP_SITES.ochaya.u0, v0: SHOP_SITES.ochaya.v0, u1: SHOP_SITES.ochaya.u1, v1: SHOP_SITES.ochaya.v1 + 1, door: { u: SHOP_SITES.ochaya.door.u, v: SHOP_SITES.ochaya.door.v + 1 }, terrace: false },
];

/** 街の 人の しゅるい（TOWN-1.md §6.1 の `town.info().npcs`）。1C は よろずやさん（shop）だけ。ほかは 1D・1E で 足す */
export type NpcKind = 'shop' | 'architect' | 'monoshiri' | 'smith' | 'stall' | 'dango' | 'gohan';

export interface NpcSite {
  kind: NpcKind;
  /** 立つ マス（ローカル） */
  u: number;
  v: number;
  /** 奥の 列（1 だん 高い 所）の 建物の 中か。向きは いつも 手前（v が ふえる ほう） */
  terrace: boolean;
}

/**
 * TOWN-1 1C: 街の 人の 立つ 所（よろずやさん ＝ よろずやの 店の 中・のれんの まっすぐ おく 2 マス。戸口〔door v 11〕から 見て まっすぐ 前。
 * 前の しきい〔v 9〕に 立てば 2 マス 先で、あいだに 何も ない）。足もと ＝ 店の ゆかの 上
 */
export const NPC_SITES: readonly NpcSite[] = [{ kind: 'shop', u: 9, v: 7, terrace: true }];

export interface StallSite {
  kind: 'kaitori' | 'dango' | 'gohan' | 'deco';
  /** 前に 立つ マス */
  u: number;
  v: number;
  /** 話せる（人が 立つ。1E で 人が 入る）か */
  talk: boolean;
}

export const STALL_SITES: readonly StallSite[] = [
  { kind: 'dango', u: 39, v: 33, talk: true },
  { kind: 'gohan', u: 49, v: 33, talk: true },
  { kind: 'kaitori', u: 59, v: 34, talk: true },
  { kind: 'deco', u: Math.floor(SHOP_SITES.decoA.front.u), v: SHOP_SITES.decoA.front.v, talk: false },
  { kind: 'deco', u: Math.floor(SHOP_SITES.decoB.front.u), v: SHOP_SITES.decoB.front.v, talk: false },
];

/** 四角の 中の 建物の 高さ（地面の 上の ブロックの 数。いちばん 上の dy ＋ 1） */
export function heightOf(cells: readonly BuildingCell[], r: Pick<BuildingSite, 'u0' | 'v0' | 'u1' | 'v1'>): number {
  let h = 0;
  for (const c of cells) if (c.u >= r.u0 && c.u <= r.u1 && c.v >= r.v0 && c.v <= r.v1) h = Math.max(h, c.dy + 1);
  return h;
}
