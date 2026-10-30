// HOUSE-1B せっけいずを 作る（できた！の ④〜⑥ と 作る 所）。DOM・three なし。仕様 docs/design/HOUSE-1.md §2.5・§2.7。
//   かみ 1 まい: 持ち物に あれば 持ち物から、なければ くらから。ふで: 持ち物の どこかに あれば よい（手に 持たなくて よい）。
//   何本か あるときは いちばん へって いる ふでから。たんすの 中の ふでは 使わない。たいきゅうが 0 に なった ふでは 消える（道具が こわれる ときと 同じ）。
import type { Inventory, ItemId } from '../../contracts';
import { addStack } from '../../tools/durability';
import type { SheetPort } from './controller';
import type { EditorState } from './model';

export type SheetBag = Pick<Inventory, 'size' | 'slots' | 'count' | 'remove' | 'add' | 'setSlot' | 'wearSlot' | 'durability'>;

/** くらの うち、かみを 使う ときに 必要な 口 */
interface SheetKura {
  count(item: ItemId): number;
  /** 使って へらす。へらせた 数 */
  consume(item: ItemId, n: number): number;
}

export interface SheetDeps {
  bag: SheetBag;
  kura: SheetKura;
  /** せっけいずの 中身を しまって 番号を 決める（house/state.ts） */
  register: (draft: Readonly<EditorState>) => number;
  /** せっけいずが 持ち物に 入った（拾った 知らせ） */
  gave?: (item: ItemId) => void;
}

const PAPER: ItemId = 'paper';
/** ふで（別の スレッドが 足した 道具）・せっけいず（この 票が 足す アイテム） */
export const FUDE: ItemId = 'fude';
export const SHEET: ItemId = 'sekkeizu';

/** 持ち物の ふで（いちばん へって いる 1 本。同じ へり方なら 前の マス）。なければ null */
function leastFude(bag: SheetBag): { slot: number; left: number } | null {
  let best: { slot: number; left: number } | null = null;
  bag.slots().forEach((s, slot) => {
    if (s?.item !== FUDE) return;
    const left = bag.durability(slot)?.left ?? Number.POSITIVE_INFINITY;
    if (!best || left < best.left) best = { slot, left };
  });
  return best;
}

/** かみが 入って いる いちばん うしろの マス（`remove` は うしろの マスから へらす） */
function lastPaperSlot(bag: SheetBag): number {
  const slots = bag.slots();
  for (let i = bag.size - 1; i >= 0; i--) if (slots[i]?.item === PAPER) return i;
  return -1;
}

export function createSheetPort(d: SheetDeps): SheetPort {
  const { bag, kura } = d;
  return {
    problem(): 'paper' | 'fude' | 'full' | null {
      const paperInBag = bag.count(PAPER);
      if (paperInBag + kura.count(PAPER) < 1) return 'paper'; // ④
      const fude = leastFude(bag);
      if (!fude) return 'fude'; // ⑤
      // ⑥ かみ・ふでを 使った あとで 空きが 1 つ ある か（さいごの かみ 1 まい・こわれる ふでの マスが あく）
      let free = bag.slots().filter((s) => s === null).length;
      if (paperInBag > 0 && bag.slots()[lastPaperSlot(bag)]?.count === 1) free++;
      if (fude.left <= 1) free++;
      return free >= 1 ? null : 'full';
    },
    make(draft: Readonly<EditorState>): void {
      const fude = leastFude(bag);
      if (!fude) return;
      if (bag.count(PAPER) > 0) bag.remove(PAPER, 1);
      else kura.consume(PAPER, 1);
      bag.wearSlot(fude.slot, 1);
      const number = d.register(draft);
      if (addStack(bag as Inventory, { item: SHEET, count: 1, plan: number }) === 0) d.gave?.(SHEET);
    },
  };
}
