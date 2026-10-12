import type { CraftSystem, Inventory, ItemId, ItemStack, Recipe } from '../contracts';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';

/** 材料 1 種: 要る数だけ「まる」。持っている数だけ みどり、足りない分は 赤いわくの白いまる */
export interface MaterialView {
  item: ItemId;
  need: number;
  have: number;
  /** 足りない（絵のうしろがうすい赤） */
  red: boolean;
  /** まる。true = みどり（持っている） */
  dots: boolean[];
}

export interface CardView {
  id: string;
  output: ItemStack;
  works: boolean;
  /** 黄色く光る（つくれる／やける） */
  glowing: boolean;
  materials: MaterialView[];
  /** 足りない材料（status().missing と同じ順・同じ意味） */
  redItems: ItemId[];
  /** 数が 2 こ以上なら `×4`、1 こなら '' */
  countLabel: string;
  /** そのレシピで待っている数（かまど のカードだけ） */
  queued: number;
}

export function materialViews(inputs: readonly ItemStack[], countOf: (item: ItemId) => number): MaterialView[] {
  return inputs.map((i) => {
    const have = countOf(i.item);
    const shown = Math.min(have, i.count);
    return {
      item: i.item,
      need: i.count,
      have,
      red: have < i.count,
      dots: Array.from({ length: i.count }, (_, k) => k < shown),
    };
  });
}

/** 今使うねんりょう（せきたん → あぶら → き の順で、持っている最初のもの）。無ければ null */
export function nextFuel(countOf: (item: ItemId) => number, cfg: CraftUiSettings = CRAFT_UI_SETTINGS): ItemId | null {
  for (const f of cfg.fuelOrder) if (countOf(f as ItemId) > 0) return f as ItemId;
  return null;
}

export interface CardOptions {
  /** やく カードか（ねんりょうが無ければ光らない） */
  bake?: boolean;
  /** その かまど で待っているレシピごとの数 */
  queued?: ReadonlyMap<string, number> | Record<string, number>;
  cfg?: CraftUiSettings;
}

/** カードの表示用データ。材料の数え方は 持ち物 36 マスの合計（カーソルは数えない） */
export function buildCards(
  recipes: readonly Recipe[],
  craft: Pick<CraftSystem, 'status'>,
  inv: Pick<Inventory, 'count'>,
  opt: CardOptions = {},
): CardView[] {
  const countOf = (item: ItemId) => inv.count(item);
  const fuelOk = !opt.bake || nextFuel(countOf, opt.cfg) !== null;
  return recipes.map((r) => {
    const st = craft.status(r.id);
    const q = opt.queued instanceof Map ? opt.queued.get(r.id) : (opt.queued as Record<string, number> | undefined)?.[r.id];
    return {
      id: r.id,
      output: r.output,
      works: r.works,
      glowing: st.craftable && fuelOk,
      materials: materialViews(r.inputs, countOf),
      redItems: st.missing.map((m) => m.item),
      countLabel: r.output.count >= 2 ? `×${r.output.count}` : '',
      queued: q ?? 0,
    };
  });
}

/** 「つくれる マーク」を出すか: つくる のカードが 1 まい以上 光っている */
export function anyCraftable(cards: readonly CardView[]): boolean {
  return cards.some((c) => c.glowing);
}

/** 今の持ち物で つくる のレシピが 1 つでも作れるか（つくれる マーク・`hintVisible`） */
export function anyCraftNow(craft: Pick<CraftSystem, 'recipes' | 'status'> & { canCraftAny?(): boolean }, _inv?: unknown): boolean {
  if (craft.canCraftAny) return craft.canCraftAny(); // 配列を作らない速い道（毎ステップ呼ばれる）
  for (const r of craft.recipes()) if (r.station === 'craft' && craft.status(r.id).craftable) return true;
  return false;
}

/** つくれる マークが「0 → 1 まい以上」になった瞬間だけ はねる */
export class HintModel {
  private was = false;
  private hopLeft = 0;

  constructor(private readonly hopSeconds: number = CRAFT_UI_SETTINGS.hintHopSeconds) {}

  /** 毎ステップ。visible は今出すか */
  update(visible: boolean, dt: number): { visible: boolean; hop: number } {
    if (visible && !this.was) this.hopLeft = this.hopSeconds;
    this.was = visible;
    let hop = 0;
    if (this.hopLeft > 0) {
      this.hopLeft = Math.max(0, this.hopLeft - dt);
      const k = 1 - this.hopLeft / this.hopSeconds;
      hop = Math.sin(k * Math.PI);
    }
    return { visible, hop };
  }
}
