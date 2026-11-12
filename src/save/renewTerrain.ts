import { addInto } from '../inventory/Inventory';
import type { ItemId } from '../contracts';
import { SAVE_GEN, TERRAIN_RENEW_GEN } from './gens';
import type { StoredMeta } from './backend';

/**
 * 地形の 作りが かわった 世代の 古い セーブを 開く とき（新しい 景色 = 木 v2・山 v2・目じるし を 既定に した 版。docs: default-on brief）。
 * 保存した 列（ほった・置いた 所）は すてて 新しい 地形に する。持ち物・そうび・おぼえた レシピ・実績・統計・設定・時刻などは 残す。
 *
 * 消える 物（場所に ひもづく 物）: ほった・置いた 列、たんすの 中身（持ち物へ もどせる 分は もどす。入りきらない 分は 消える）、
 *   はたけ（作物・じょうろ・おいた 小屋）、にわとり・どうぶつ、おとしもの ぶくろ、かまどの 中、建築士さんの 最初の 場所（建てた 家は 地形と いっしょに 消える。
 *   せっけいず・おぼえた レシピ・道具は 残る）、プレイヤーの 場所（はじまりの 場所に 立つ）、はじまりの 坑道の 場所・古い 列の 一覧（新しい 地形で さがしなおす）。
 */

/** 古い 世代か（版が ない・数でない meta も 古い 扱い） */
export function needsTerrainRenew(meta: StoredMeta): boolean {
  const g = meta.gen;
  return !(typeof g === 'number' && Number.isInteger(g) && g >= TERRAIN_RENEW_GEN);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** たんすの 中身を 持ち物の マスへ。入りきらなかった 数を 返す */
function moveStorageToInventory(meta: StoredMeta): number {
  const inv = meta.inventory;
  const boxes = meta.storage;
  if (!isObj(inv) || !Array.isArray(inv.slots) || !Array.isArray(boxes)) return 0;
  const slots = inv.slots as Array<Record<string, unknown> | null>;
  let lost = 0;
  for (const box of boxes) {
    const bs = isObj(box) && Array.isArray(box.slots) ? (box.slots as Array<Record<string, unknown> | null>) : [];
    for (const s of bs) {
      if (!s || typeof s.item !== 'string' || typeof s.count !== 'number') continue;
      lost += addInto(slots as never, s.item as ItemId, s.count, 0, slots.length, Number(s.wear ?? 0), Number(s.water ?? 0), Number(s.power ?? 0), Number(s.plan ?? 0));
    }
  }
  return lost;
}

/** 古い 世代の meta から、新しい 地形で 開く meta を 作る（もとは かえない） */
export function renewTerrainMeta(old: StoredMeta): { meta: StoredMeta; lostItems: number } {
  const meta: StoredMeta = structuredClone(old);
  const lostItems = moveStorageToInventory(meta);
  meta.gen = SAVE_GEN;
  for (const k of ['player', 'spawn', 'oldCols', 'shaftStart', 'storage', 'farm', 'animals']) delete meta[k];
  meta.bags = [];
  meta.furnaces = [];
  const h = meta.house;
  if (isObj(h)) meta.house = { ...h, first: null };
  return { meta, lostItems };
}
