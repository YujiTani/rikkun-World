/**
 * 描く順番を、機械の速さで 変わらないものにする。
 * three の ふつうの順（renderOrder → 材料の番号 → 近さ → 作った順）は、セクションごとの材料や メッシュを
 * 作った順（＝ 時間の予算で決まる）に 引きずられる。つなぎ目の 1 ピクセルで 手前になる方が ときどき 入れかわるので、
 * セクションのメッシュには場所で決まる鍵（userData.sortKey）をつけ、鍵のある物は 鍵の順に描く。
 */

export interface SortItem {
  id: number;
  groupOrder: number;
  renderOrder: number;
  material: { id: number };
  materialVariant: number;
  z: number;
  object: { userData: { sortKey?: number } };
}

/** セクション (cx, sy, cz) の メッシュの鍵。kind: 0 小ブロック／箱・1 絵（extras）・2 水 */
export function sectionSortKey(cx: number, sy: number, cz: number, kind: 0 | 1 | 2): number {
  return ((cz * 4096 + cx) * 32 + sy) * 4 + kind;
}

/** 列ぜんたいを遠くの かんたんメッシュで描くときの鍵（セクションの鍵の ぜんぶより あと） */
export function lodSortKey(cx: number, cz: number, water: boolean): number {
  return 1e12 + (cz * 4096 + cx) * 2 + (water ? 1 : 0);
}

/** 不透明の列の並べかた: グループ → renderOrder → 鍵 → three の ふつうの順 */
export function stableOpaqueSort(a: SortItem, b: SortItem): number {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  const ka = a.object.userData.sortKey ?? Infinity;
  const kb = b.object.userData.sortKey ?? Infinity;
  if (ka !== kb) return ka - kb;
  if (a.material.id !== b.material.id) return a.material.id - b.material.id;
  if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
  if (a.z !== b.z) return a.z - b.z;
  return a.id - b.id;
}

/** 半透明の列: グループ → renderOrder → 遠い順（three の ふつうと同じ）→ 鍵 → 作った順 */
export function stableTransparentSort(a: SortItem, b: SortItem): number {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
  if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
  if (a.z !== b.z) return b.z - a.z;
  const ka = a.object.userData.sortKey ?? Infinity;
  const kb = b.object.userData.sortKey ?? Infinity;
  if (ka !== kb) return ka - kb;
  return a.id - b.id;
}
