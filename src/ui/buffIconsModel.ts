import type { ItemId } from '../contracts';

/**
 * WEAPON-8 §2.4: 速さバフの アイコンの 出かた（ぽん・うすく なる）。1 ステップに 1 回 `step`。
 * 出る: 12 ステップで 大きさ 0.6 → 1.0。消える: 8 ステップで こさ 1 → 0。点滅しない。「動きを減らす」は すぐ 出て、次の ステップに 消える。
 */
/** アイコンの しゅるい（`[data-buff="…"]`）。板の 中の 並び順は この 順（左から）。LEGEND-4: ジャンプ力アップ `jumpUp` を 足した（PR3 で `airJump`・`slowFall`・`safeLand`） */
export type BuffId = 'speed' | 'jumpUp' | 'airJump' | 'slowFall' | 'safeLand';
/** 板の 中の 並び順（左から。LEGEND-4 §3.4） */
export const BUFF_ORDER: readonly BuffId[] = ['speed', 'jumpUp', 'airJump', 'slowFall', 'safeLand'];
/** 手に 持つ 物が 出す アイコン（倍率に よらない もの。LEGEND-4 PR3） */
const HELD_BUFFS: Partial<Record<string, readonly BuffId[]>> = { tenshi_yumi: ['airJump', 'slowFall', 'safeLand'] };
/** 足の そうびが 出す アイコン（忍びの 足袋 = 着地ダメージ 無効） */
const LEGS_BUFFS: Partial<Record<string, readonly BuffId[]>> = { ninja_tabi: ['safeLand'] };
export interface BuffWanted {
  id: BuffId;
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

/** `buffsOf` が 読む 倍率の 出どころ（1P・2P とも 同じ 口を わたす） */
export interface BuffSources {
  /** 手に 持つ 物の 速さの 倍率（`legendMoveMulOf`） */
  moveMul(held: ItemId | null): number;
  /** ジャンプの 高さの 倍率（手に 持つ 物 × 足の そうび。`jumpHeightWith(legs, base, held) / base`。大きい ほう 1 つ） */
  jumpMul(held: ItemId | null, legs: ItemId | null): number;
}

/**
 * 今 出す アイコン（板の 並び順 = speed → jumpUp）。同じ id は 出どころが 2 つ あっても 1 つ（黒龍 ＋ わらじ でも jumpUp 1 つ）。
 * jumpUp の `item` は 倍率の もとに なった 方（手に 持つ 物が 黒龍の ように 高く する ときは それ、なければ 足の そうび）
 */
export function buffsOf(held: ItemId | null, legs: ItemId | null, src: BuffSources): BuffWanted[] {
  const out = buffsOfHeld(held, (i) => src.moveMul(i));
  const jump = src.jumpMul(held, legs);
  if (jump > 1) out.push({ id: 'jumpUp', item: held !== null && src.jumpMul(held, null) >= jump ? held : (legs ?? held)!, mul: jump });
  for (const [item, table] of [[held, HELD_BUFFS], [legs, LEGS_BUFFS]] as const) {
    for (const id of (item !== null ? table[item] : undefined) ?? []) if (!out.some((o) => o.id === id)) out.push({ id, item: item!, mul: 1 });
  }
  return out.sort((a, b) => BUFF_ORDER.indexOf(a.id) - BUFF_ORDER.indexOf(b.id));
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
    entries.sort((a, b) => BUFF_ORDER.indexOf(a.row.id) - BUFF_ORDER.indexOf(b.row.id));
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
