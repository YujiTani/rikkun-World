import type { ItemId } from '../contracts';

/**
 * WEAPON-8 §2.4: 速さバフの アイコンの 出かた（ぽん・うすく なる）。1 ステップに 1 回 `step`。
 * 出る: 12 ステップで 大きさ 0.6 → 1.0。消える: 8 ステップで こさ 1 → 0。点滅しない。「動きを減らす」は すぐ 出て、次の ステップに 消える。
 */
export interface BuffWanted {
  id: 'speed';
  item: ItemId;
  mul: number;
}
export interface BuffRow extends BuffWanted {
  shown: boolean;
  scale: number;
  opacity: number;
}

export const BUFF_POP_STEPS = 12;
export const BUFF_POP_FROM = 0.6;
export const BUFF_FADE_STEPS = 8;

/** 手に 持つ 物の 速さの 倍率が 1 より 大きい 間だけ（今は 風神剣） */
export function buffsOfHeld(item: ItemId | null, moveMul: (item: ItemId | null) => number): BuffWanted[] {
  const mul = moveMul(item);
  return item !== null && mul > 1 ? [{ id: 'speed', item, mul }] : [];
}

interface Entry {
  row: BuffRow;
  age: number;
  /** 消えて から の ステップ数（出ている 間は -1） */
  leaving: number;
}

export interface BuffModel {
  step(wanted: readonly BuffWanted[], reduced: boolean): readonly BuffRow[];
  list(): readonly BuffRow[];
}

export function createBuffModel(): BuffModel {
  const entries: Entry[] = [];
  const rows: BuffRow[] = [];

  function rebuild(): void {
    rows.length = 0;
    for (const e of entries) rows.push(e.row);
  }

  return {
    step(wanted, reduced) {
      for (const w of wanted) {
        let e = entries.find((x) => x.row.id === w.id);
        if (!e) {
          e = { row: { id: w.id, item: w.item, mul: w.mul, shown: true, scale: reduced ? 1 : BUFF_POP_FROM, opacity: 1 }, age: 0, leaving: -1 };
          entries.push(e);
          continue;
        }
        if (e.leaving >= 0) {
          // 消えかけに また 持った: もう一度 ぽんと 出る
          e.leaving = -1;
          e.age = 0;
        } else e.age += 1;
        e.row.item = w.item;
        e.row.mul = w.mul;
        e.row.shown = true;
        e.row.opacity = 1;
        e.row.scale = reduced ? 1 : BUFF_POP_FROM + (1 - BUFF_POP_FROM) * Math.min(1, e.age / BUFF_POP_STEPS);
      }
      for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i]!;
        if (wanted.some((w) => w.id === e.row.id)) continue;
        e.leaving += 1;
        e.row.shown = false;
        if (reduced ? e.leaving >= 1 : e.leaving >= BUFF_FADE_STEPS) {
          entries.splice(i, 1);
          continue;
        }
        e.row.opacity = reduced ? 1 : 1 - e.leaving / BUFF_FADE_STEPS;
      }
      rebuild();
      return rows;
    },
    list: () => rows,
  };
}
