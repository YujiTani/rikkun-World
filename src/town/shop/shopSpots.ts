import { CHEST_RIGHT, type ChestCompass } from '../../world/blocks/chestBlock';
import { BUILDING_SITES, SHOP_BOX_SPOTS } from '../townSites';

/**
 * よろずやの たからばこの 置き場（TOWN-1-shop §4.3b・TOWN-1.md §6.1 `shop.spots()`。1.5）。数は townSites の SHOP_BOX_SPOTS 1 か所。
 * 2 マスの 宝箱（坑道と 同じ。本体 ＝ 前から 見て 左・のこり ＝ 右〔CHEST_RIGHT〕）を 戸口の 前の 行に ならべる。
 */

export interface Cell {
  x: number;
  y: number;
  z: number;
}

export interface ShopSpot {
  /** 本体の マス */
  main: Cell;
  /** [本体, のこり] */
  cells: [Cell, Cell];
  /** 前（手前 ＝ ひろばの ほう） */
  front: ChestCompass;
  /** 前に 立つ マス */
  stand: Cell;
}

/** 街の 中の ローカル (u, v) → 世界の マス と、その マスの 足もとの 高さ（地面か 台の 上の 空気の y） */
export interface SpotPlanCtx {
  toWorld(u: number, v: number): { x: number; z: number };
  feetY(u: number, v: number): number;
}

/** 世界の 向き（1 マスの ずれ）→ 東西南北 */
function compassOf(dx: number, dz: number): ChestCompass {
  if (dz < 0) return 'n';
  if (dx > 0) return 'e';
  if (dz > 0) return 's';
  return 'w';
}

/** 置き場 4 か所（えらぶ 順） */
export function planShopSpots(ctx: SpotPlanCtx): ShopSpot[] {
  const yoro = BUILDING_SITES.find((b) => b.kind === 'yorozuya')!;
  const v = yoro.door.v + SHOP_BOX_SPOTS.row;
  const vs = yoro.door.v + SHOP_BOX_SPOTS.stand;
  return SHOP_BOX_SPOTS.du.map((du) => {
    const u = yoro.door.u + du;
    const here = ctx.toWorld(u, v);
    const ahead = ctx.toWorld(u, v + 1);
    const front = compassOf(ahead.x - here.x, ahead.z - here.z);
    const y = ctx.feetY(u, v);
    const a = { x: here.x, y, z: here.z };
    const bw = ctx.toWorld(u + 1, v);
    const b = { x: bw.x, y: ctx.feetY(u + 1, v), z: bw.z };
    const [rx, rz] = CHEST_RIGHT[front];
    const aIsMain = b.x - a.x === rx && b.z - a.z === rz;
    const main = aIsMain ? a : b;
    const rest = aIsMain ? b : a;
    // 前に 立つ マス: 本体の 前（ねらって 右クリックで あける 所）
    const um = aIsMain ? u : u + 1;
    const sw = ctx.toWorld(um, vs);
    return { main, cells: [main, rest], front, stand: { x: sw.x, y: ctx.feetY(um, vs), z: sw.z } };
  });
}

/** マスが 置き場の 2 マスの どれかなら その 番号（ちがえば −1） */
export function spotIndexAt(spots: readonly ShopSpot[], x: number, y: number, z: number): number {
  return spots.findIndex((s) => s.cells.some((c) => c.x === x && c.y === y && c.z === z));
}
