import type { ItemId, ItemStack } from '../contracts';

export const HOTBAR_SIZE = 9;

export interface CellView {
  index: number;
  item: ItemId | null;
  /** 2 こ以上のときだけ数字、それ以外は空 */
  countText: string;
  selected: boolean;
}

/** ホットバー 9 マスの見え方（DOM なしでテストできる） */
export function hotbarCells(slots: ReadonlyArray<ItemStack | null>, selected: number): CellView[] {
  const out: CellView[] = [];
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const s = slots[i] ?? null;
    out.push({
      index: i,
      item: s ? s.item : null,
      countText: s && s.count >= 2 ? String(s.count) : '',
      selected: i === selected,
    });
  }
  return out;
}

/** 前より増えたマス（同じアイテムの数が増えた、または空・ちがうアイテムだったマスに入った） */
export function gainedSlots(
  prev: ReadonlyArray<ItemStack | null>,
  next: ReadonlyArray<ItemStack | null>,
  limit = HOTBAR_SIZE,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < limit; i++) {
    const a = prev[i] ?? null;
    const b = next[i] ?? null;
    if (!b) continue;
    if (!a || a.item !== b.item || b.count > a.count) out.push(i);
  }
  return out;
}

/** マスのコピー（前の状態と比べるため） */
export function snapshotSlots(slots: ReadonlyArray<ItemStack | null>): Array<ItemStack | null> {
  return slots.map((s) => (s ? { item: s.item, count: s.count } : null));
}

/** #264: 休みの おおいを 出す マス（ratio = のこりの わり 0〜1、seconds = のこりの 秒。切り上げ） */
export interface CooldownCell {
  index: number;
  ratio: number;
  seconds: number;
}

/**
 * #264: シャイニングの 休みの のこり（0〜1）を 出す マス。休みは プレイヤーに 1 つ なので、
 * LoL の ように アイコンの 上に 円の おおい（時計まわりに へる）と のこりの 秒を 出す（yuzu 2026-10-23）。
 * 休みの ある ためわざの 武器（cooldownOf が 数を 返す）が 入って いる マス 全部に 出す。休みでなければ 空。
 */
export function cooldownCells(
  slots: ReadonlyArray<ItemStack | null>,
  cooldownOf: (item: ItemId) => number | null | undefined,
  left: number,
): CooldownCell[] {
  const out: CooldownCell[] = [];
  if (!(left > 0)) return out;
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const s = slots[i];
    const total = s && s.count > 0 ? cooldownOf(s.item) : null;
    if (total && total > 0) out.push({ index: i, ratio: Math.min(1, left / total), seconds: Math.ceil(left / 60) });
  }
  return out;
}
