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

// ================================================================ M6（マスの一覧・せつめい パネル・つくった出来事）

import type { CraftEvent, CraftMadeEvent, ItemId as ItemIdM6 } from '../contracts';
import type { ItemInfoData, StatRow } from '../craft/info';

/** つくる／やく の 1 マス（`craft.ui().tiles`） */
export interface TileView {
  id: string;
  /** できるもの（絵） */
  item: ItemIdM6;
  glowing: boolean;
  /** 足りない（灰色・不透明度 35%） */
  dim: boolean;
  /** つくった ことがある */
  made: boolean;
  /** 働きが あとのもの */
  later: boolean;
  /** できる数（2 こ以上のとき ×N） */
  count: number;
  selected: boolean;
  /** かまど で待っている数（やく だけ） */
  queued: number;
}

export function buildTiles(cards: readonly CardView[], selected: string | null, madeOf: (id: string) => boolean): TileView[] {
  return cards.map((c) => ({
    id: c.id,
    item: c.output.item,
    glowing: c.glowing,
    dim: !c.glowing,
    made: madeOf(c.id),
    later: !c.works,
    count: c.output.count,
    selected: c.id === selected,
    queued: c.queued,
  }));
}

/** 開いたときに えらぶマス: 前に えらんでいたマス → つくれる いちばん前 → 1 つ目 */
export function pickSelection(cards: readonly CardView[], previous: string | null): string | null {
  if (previous && cards.some((c) => c.id === previous)) return previous;
  return cards.find((c) => c.glowing)?.id ?? cards[0]?.id ?? null;
}

export interface DetailMaterial {
  item: ItemIdM6;
  have: number;
  need: number;
  ok: boolean;
}

/** せつめい パネルの 中身（`craft.ui().detail`） */
export interface DetailView {
  /** 中身を出しているマス */
  id: string;
  item: ItemIdM6;
  name: string;
  rarity: ItemInfoData['rarity'];
  stars: number;
  rarityWord: string;
  use: string;
  how: string;
  buttons: ItemInfoData['buttons'];
  later: string | null;
  stats: StatRow[];
  materials: DetailMaterial[];
  fuel: { next: ItemIdM6 | null; counts: Record<string, number> } | null;
  /** できる数（2 こ以上のとき ×N を出す） */
  count: number;
  /** いつも えらんでいるマスのもの */
  button: { enabled: boolean; label: string };
  hint: string | null;
}

export const HINT_SELECT = 'クリック で えらぶ';

/** つくる／やく ボタンの 文字とおせるか（えらんでいるマスで決める） */
export function buttonState(sel: CardView, bake: boolean, fuelNext: ItemIdM6 | null): { enabled: boolean; label: string } {
  const matsOk = sel.redItems.length === 0;
  if (!matsOk) return { enabled: false, label: 'ざいりょう が たりない' };
  if (bake && fuelNext === null) return { enabled: false, label: 'ねんりょう が たりない' };
  return { enabled: true, label: bake ? 'やく' : 'つくる' };
}

export function buildDetail(o: {
  shown: CardView;
  selected: CardView;
  info: ItemInfoData;
  bake: boolean;
  fuelCounts: Record<string, number> | null;
  fuelNext: ItemIdM6 | null;
}): DetailView {
  const { shown, selected, info } = o;
  return {
    id: shown.id,
    item: shown.output.item,
    name: info.name,
    rarity: info.rarity,
    stars: info.stars,
    rarityWord: info.rarityWord,
    use: info.use,
    how: info.how,
    buttons: info.buttons,
    later: info.later,
    stats: info.stats,
    materials: shown.materials.map((m) => ({ item: m.item, have: m.have, need: m.need, ok: !m.red })),
    fuel: o.bake && o.fuelCounts ? { next: o.fuelNext, counts: o.fuelCounts } : null,
    count: shown.output.count,
    button: buttonState(selected, o.bake, o.fuelNext),
    hint: shown.id !== selected.id ? HINT_SELECT : null,
  };
}

export interface MadeTrackerOptions {
  /** コンボが続く画面ステップ（`craftComboTicks`） */
  comboTicks: number;
  comboMax: number;
  /** その レシピを はじめて作った・焼いたか（記録を 足す前に聞く） */
  isFirstMade(kind: 'craft' | 'bake', recipe: string): boolean;
}

/**
 * `CraftEvent` の craft / bakeDone を「つくった」出来事（`CraftMadeEvent`）にする（A → B,C。M6 §2.4）。
 * コンボは 前に作ってから `comboTicks` 画面ステップ以内に また作ると +1（はじめは 1、最大 `comboMax`）。
 * `craftFail` で 0。画面ステップは `advance()` で進める（1 ステップで `1 ÷ timeScale`。止まっているあいだは呼ばない）。
 * **記録（C）に足す前に** `handle()` を呼ぶこと（`first` を決めるため）。
 */
export class CraftMadeTracker {
  private clock = 0;
  private lastAt = -Infinity;
  private combo_ = 0;
  private readonly listeners: ((e: CraftMadeEvent) => void)[] = [];

  constructor(private readonly o: MadeTrackerOptions) {}

  onMade(fn: (e: CraftMadeEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** 画面ステップを進める */
  advance(screenSteps: number): void {
    this.clock += screenSteps;
  }

  combo(): number {
    return this.combo_;
  }

  /** つくった・焼けた なら出来事を返す（listener にも渡す）。それ以外は null（craftFail は コンボを 0 に） */
  handle(ev: CraftEvent): CraftMadeEvent | null {
    if (ev.type === 'craftFail') {
      this.combo_ = 0;
      return null;
    }
    let kind: 'craft' | 'bake';
    let item: ItemIdM6;
    let recipe: string;
    let count: number;
    if (ev.type === 'craft') {
      kind = 'craft';
      item = ev.item;
      recipe = ev.recipe;
      count = ev.count;
    } else if (ev.type === 'bakeDone') {
      kind = 'bake';
      item = ev.item;
      recipe = ev.recipe;
      count = ev.count;
    } else return null;
    const first = this.o.isFirstMade(kind, recipe);
    this.combo_ = this.clock - this.lastAt <= this.o.comboTicks ? Math.min(this.o.comboMax, this.combo_ + 1) : 1;
    this.lastAt = this.clock;
    const out: CraftMadeEvent = { kind, tick: ev.tick, recipe, item, count, first, combo: this.combo_ };
    for (const fn of this.listeners) fn(out);
    return out;
  }
}
