// HOUSE-1B せっけいずを 作る（できた！の ④〜⑥ と 作る 所）。DOM・three なし。仕様 docs/design/HOUSE-1.md §2.4 の 3・§2.5・§2.7。
//   1E: くらは ない。かみ・ふでは もちもの ＋ 近くの たんす（「つくる」と 同じ きょり・数え方）から。
//   かみ 1 まい: もちものに あれば もちものから、なければ 近くの たんす（近い 順）から（もちものの 最後の 1 まいで マスが あき、できた！が「いっぱい」で 止まらない ため）。
//   ふで: もちもの・近くの たんすの どこかに あれば よい（手に 持たなくて よい）。何本か あるときは いちばん へって いる ふでから（同じ なら たんす〔近い 順〕→ もちもの）。
//   たいきゅうが 0 に なった ふでは 消える（道具が こわれる ときと 同じ。たんすの ふでは たんすから 消える）。
import type { Inventory, ItemId, Vec3 } from '../../contracts';
import { W2_SETTING_DEFAULTS } from '../../contracts';
import { addStack, copyStack, maxDurability } from '../../tools/durability';
import { Materials, type MaterialSource } from '../materials';
import type { SheetPort } from './controller';
import type { EditorState } from './model';

export type SheetBag = Pick<Inventory, 'size' | 'slots' | 'count' | 'remove' | 'add' | 'setSlot' | 'wearSlot' | 'durability'>;

export interface SheetDeps extends MaterialSource {
  bag: SheetBag;
  /** せっけいずの 中身を しまって 番号を 決める（house/state.ts） */
  register: (draft: Readonly<EditorState>) => number;
  /** せっけいずが 持ち物に 入った（拾った 知らせ） */
  gave?: (item: ItemId) => void;
  /** 今の 設定 `toolDurability`（ふでの 新品の たいきゅうを その 時に 読む。なければ はじめの 値） */
  durability?: () => Readonly<Partial<Record<ItemId, number>>>;
}

const PAPER: ItemId = 'paper';
/** ふで（別の スレッドが 足した 道具）・せっけいず（この 票が 足す アイテム） */
export const FUDE: ItemId = 'fude';
export const SHEET: ItemId = 'sekkeizu';


/** 使う ふで 1 本: もちものの マス か、たんす at の マス i。left ＝ のこりの たいきゅう */
type Fude = { left: number } & ({ slot: number } | { at: Vec3; i: number });

/** かみが 入って いる いちばん うしろの マス（`remove` は うしろの マスから へらす） */
function lastPaperSlot(bag: SheetBag): number {
  const slots = bag.slots();
  for (let i = bag.size - 1; i >= 0; i--) if (slots[i]?.item === PAPER) return i;
  return -1;
}

export function createSheetPort(d: SheetDeps): SheetPort {
  const { bag } = d;
  const mat = new Materials(bag, d);
  /** ふでの 新品の たいきゅう（たんすの ふでの のこりを 数える ため。もちものの ふでは もちものが 数える）。呼ぶ たびに 今の 設定から */
  const fudeMax = (): number => maxDurability(FUDE, d.durability?.() ?? W2_SETTING_DEFAULTS.toolDurability) ?? 1;

  /** いちばん へって いる ふで。同じ へり方なら 先に 見た 方（たんす〔近い 順・マスの 順〕→ もちもの〔マスの 順〕）。なければ null */
  function leastFude(): Fude | null {
    let best: Fude | null = null;
    const max = fudeMax();
    for (const at of mat.near()) {
      const slots = d.tansu?.get(at.x, at.y, at.z)?.slots ?? [];
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s?.item !== FUDE) continue;
        const left = Math.max(1, max - (s.wear ?? 0));
        if (!best || left < best.left) best = { left, at, i };
      }
    }
    const held = bag.slots();
    for (let slot = 0; slot < held.length; slot++) {
      if (held[slot]?.item !== FUDE) continue;
      const left = bag.durability(slot)?.left ?? Number.POSITIVE_INFINITY;
      if (!best || left < best.left) best = { left, slot };
    }
    return best;
  }

  /** ふでの たいきゅうを 1 へらす。0 に なれば 消える（もちもの・たんす どちらも） */
  function wear(f: Fude): void {
    if ('slot' in f) {
      bag.wearSlot(f.slot, 1);
      return;
    }
    const s = d.tansu?.get(f.at.x, f.at.y, f.at.z)?.slots[f.i];
    if (!s || s.item !== FUDE) return;
    const left = f.left - 1;
    d.tansu?.set(f.at.x, f.at.y, f.at.z, f.i, left <= 0 ? null : copyStack({ ...s, wear: fudeMax() - left }));
  }

  return {
    problem(): 'paper' | 'fude' | 'full' | null {
      const paperInBag = bag.count(PAPER);
      if (mat.have(PAPER) < 1) return 'paper'; // ④ もちもの ＋ 近くの たんす
      const fude = leastFude();
      if (!fude) return 'fude'; // ⑤
      // ⑥ かみ・ふでを 使った あとで もちものに 空きが 1 つ ある か（さいごの かみ 1 まい・こわれる ふでの マスが あく。たんすから 取る 分は もちものの マスに 関わらない）
      let free = bag.slots().filter((s) => s === null).length;
      if (paperInBag > 0 && bag.slots()[lastPaperSlot(bag)]?.count === 1) free++;
      if ('slot' in fude && fude.left <= 1) free++;
      return free >= 1 ? null : 'full';
    },
    make(draft: Readonly<EditorState>): void {
      const fude = leastFude();
      if (!fude) return;
      if (bag.count(PAPER) > 0) bag.remove(PAPER, 1);
      else mat.takeFromTansu(PAPER, 1);
      wear(fude);
      const number = d.register(draft);
      if (addStack(bag as Inventory, { item: SHEET, count: 1, plan: number }) === 0) d.gave?.(SHEET);
    },
  };
}
