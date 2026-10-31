// HOUSE-1E 材料の もと（もちもの ＋ 近くの たんす）。仕様 docs/design/HOUSE-1.md §2.4・§2.8。DOM・three なし。
// くらは なくした。建てる 材料・せっけいずの かみ・ふでは、「つくる」と 同じ 数え方（CraftSystemImpl）・同じ きょり（設定 craftTansuRange、はじめ 40 マス）で
// プレイヤーの 足もとから 数える。数えるのは 画面を 開いた とき・押した とき だけ（呼ぶ 側が 毎ステップ 呼ばない。AC34 ⑤）。
import type { Inventory, ItemId, ItemStack, Vec3 } from '../contracts';

/** 数える 係（CraftSystemImpl が 合う）。total ＝ もちもの ＋ 範囲の 中の たんす、tansuInRange ＝ 範囲の 中の たんす（近い 順。同じ きょりは x → z → y） */
export interface CraftCount {
  total(item: ItemId): number;
  tansuInRange(): ReadonlyArray<Vec3>;
}

/** たんすの 中身を 取り出す・読む・書く 口（StorageSystem が 合う） */
export interface TansuStock {
  takeItem(x: number, y: number, z: number, item: ItemId, count: number): number;
  get(x: number, y: number, z: number): { slots: ReadonlyArray<ItemStack | null> } | null;
  set(x: number, y: number, z: number, i: number, stack: ItemStack | null): boolean;
}

/** 材料の もとの 口。どちらも 無ければ もちものだけ（たんすの 無い テスト・古い つなぎ方） */
export interface MaterialSource {
  craft?: CraftCount;
  tansu?: TansuStock;
}

/** 持ち物の うち 材料が 使う 口 */
type MaterialBag = Pick<Inventory, 'count' | 'remove'>;

export class Materials {
  constructor(
    private readonly bag: MaterialBag,
    private readonly d: MaterialSource = {},
  ) {}

  /** craft と tansu が そろって いる（片方 だけでは もちものだけ。数えた 分と へらす 分が ずれないように） */
  private get shared(): { craft: CraftCount; tansu: TansuStock } | null {
    return this.d.craft && this.d.tansu ? { craft: this.d.craft, tansu: this.d.tansu } : null;
  }

  /** ある ＝ もちもの ＋ 近くの たんす（なければ もちものだけ） */
  have(item: ItemId): number {
    const s = this.shared;
    return s ? s.craft.total(item) : this.bag.count(item);
  }

  /** 近くの たんす（近い 順）。なければ [] */
  near(): ReadonlyArray<Vec3> {
    return this.shared?.craft.tansuInRange() ?? [];
  }

  /** 近くの たんす だけから 取る（近い 順）。取れた 数 */
  takeFromTansu(item: ItemId, want: number): number {
    const s = this.shared;
    if (!s) return 0;
    let left = Math.floor(want);
    for (const t of s.craft.tansuInRange()) {
      if (left <= 0) break;
      left -= s.tansu.takeItem(t.x, t.y, t.z, item, left);
    }
    return Math.floor(want) - left;
  }

  /** 建てる 材料を へらす: 近くの たんす（近い 順）→ もちもの。手に 持って いる 物を 最後に のこす。へらせた 数 */
  consume(item: ItemId, n: number): number {
    const want = Math.floor(n);
    if (!(want > 0)) return 0;
    const fromTansu = this.takeFromTansu(item, want);
    return fromTansu + (want > fromTansu ? this.bag.remove(item, want - fromTansu) : 0);
  }
}
