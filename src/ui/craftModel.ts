import type { CraftSystem, Inventory, ItemId, ItemStack, Recipe } from '../contracts';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from '../fx/craftConfig';

/** 材料 1 種: 要る数だけ「まる」。持っている数だけ みどり、足りない分は 赤いわくの白いまる */
export interface MaterialView {
  item: ItemId;
  need: number;
  have: number;
  /** 足りない（絵のうしろがうすい赤） */
  red: boolean;
  /** まる。true = ぬってある（持っている。たんす の分もふくむ） */
  dots: boolean[];
  /** CRAFT-2: `have` のうち たんす から使う分（0 なら もちもの だけ） */
  inTansu: number;
}

/** まるの ぬり方（CRAFT-2 §3.2）。順は もちもの（みどり）→ たんす（桐色）→ 足りない。`have` は たんす もふくむ数 */
export type DotSource = 'inv' | 'tansu' | 'none';
export function materialDotSources(need: number, have: number, inTansu: number): DotSource[] {
  const tansu = Math.max(0, Math.min(inTansu, have));
  const invHave = have - tansu;
  const inv = Math.min(need, invHave);
  const kiri = Math.min(need - inv, tansu);
  return Array.from({ length: need }, (_, k) => (k < inv ? 'inv' : k < inv + kiri ? 'tansu' : 'none'));
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
  /** ITEM-FX-1: 持ち物 全体で 1 つだけの 物（おまもり）を もう 持っている（作れない） */
  limit?: 'haveOne';
}

export function materialViews(inputs: readonly ItemStack[], countOf: (item: ItemId) => number, tansuOf?: (item: ItemId) => number): MaterialView[] {
  return inputs.map((i) => {
    const have = countOf(i.item);
    const shown = Math.min(have, i.count);
    return {
      item: i.item,
      need: i.count,
      have,
      red: have < i.count,
      dots: Array.from({ length: i.count }, (_, k) => k < shown),
      inTansu: Math.max(0, Math.min(tansuOf?.(i.item) ?? 0, have)),
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
  /** CRAFT-2: アイテムごとの「たんす にある数」。`inv.count` は たんす もふくむ数を返す（S が つなぐ） */
  tansuOf?: (item: ItemId) => number;
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
      materials: materialViews(r.inputs, countOf, opt.tansuOf),
      redItems: st.missing.map((m) => m.item),
      countLabel: r.output.count >= 2 ? `×${r.output.count}` : '',
      queued: q ?? 0,
      ...(st.limit ? { limit: st.limit } : {}),
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

/**
 * 一覧に出すレシピ（オーナー要望 その5。AC56）: 今の持ち物に 材料が 1 種類でも あるものだけ。
 * ならびは 作れる（光る）→ 足りない。その中は レシピ順のまま。
 */
export function visibleCards(cards: readonly CardView[]): CardView[] {
  const has = cards.filter((c) => c.materials.some((m) => m.have > 0));
  return [...has.filter((c) => c.glowing), ...has.filter((c) => !c.glowing)];
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
  /** CRAFT-2: `have` のうち たんす にある分 */
  inTansu: number;
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
  /** NINJA-1: 虹色の「とくべつな ちから」の 文（無ければ null） */
  special: string | null;
  how: string;
  buttons: ItemInfoData['buttons'];
  later: string | null;
  stats: StatRow[];
  /** WEAPON-2: なかま の 文（`つかうと へって、0 で こわれる` など） */
  classText: string;
  materials: DetailMaterial[];
  fuel: { next: ItemIdM6 | null; counts: Record<string, number>; inTansu: Record<string, number> } | null;
  /** できる数（2 こ以上のとき ×N を出す） */
  count: number;
  /** いつも えらんでいるマスのもの */
  button: { enabled: boolean; label: string };
  hint: string | null;
  /** CRAFT-PAGE: ページの 一覧（順に ◀ ▶ で めくる） */
  pages: PageDef[];
  /** 今のページ（`pages` の 何番目か） */
  page: number;
  /** 「つくる」が 使う 作り方（`materials`・`count` は この作り方の もの） */
  recipe: string;
}

// ================================================================ CRAFT-PAGE（#277）せつめい欄の ページめくり

export type PageKind = 'make' | 'desc' | 'stats';

export interface PageDef {
  kind: PageKind;
  /** ページ名（「つくりかた ②」「せつめい」「つよさ 1/2」） */
  name: string;
  /** make: この ページの 作り方（レシピ id） */
  recipe?: string;
  /** desc: このページに 出す 文（なにに つかうか / つかいかた）。ふりがな記号つき。長いときは 文で 区切って 何ページかに 分ける */
  use?: string;
  how?: string;
  /** desc: つかいかたの ボタンの絵を このページに 出す（つかいかたの 最初の ページ） */
  buttons?: boolean;
  /** stats: 出す stats の 範囲 [from, to) */
  from?: number;
  to?: number;
}

/** つよさ 1 ページに 出す 数（2 列 × 1 行。メーターつきで どの大きさの画面でも 1 ページに 収まる数） */
export const STATS_PER_PAGE = 2;

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

/**
 * ページの 順: つくりかた（1 つなら「ざいりょう」、ふたつ 以上なら「つくりかた ①②…」）→ せつめい → つよさ（ある物だけ。多ければ 分ける）。
 * ねんりょう（かまど）は ざいりょうの ページに 入る。
 */
/** せつめい 1 ページに 入れる 文字の数（いちばん小さい画面でも はみ出さない 長さ。ふりがなの ［漢字｜よみ］ は 漢字だけ数える） */
export const DESC_PAGE_CHARS = 68;

/** 文字の数（ふりがなの ［漢字｜よみ］ は 漢字だけ数える） */
export function plainLength(t: string): number {
  return t.replace(/［([^｜］]*)｜[^］]*］/g, '$1').length;
}

/**
 * せつめい（なにに つかう → つかいかた）を ページに 分ける。1 ページの 文字が `DESC_PAGE_CHARS` を こえそうなら 次のページへ
 * （つかいかたは「。」で 区切った 文の 単位で 動かす）。入りきるなら 1 ページ。
 */
export interface DescPage {
  use: string;
  how: string;
  buttons: boolean;
}

/**
 * せつめいを 「入るか」を 返す関数 `fits` で ページに 詰める（先頭から 順に 足して、入らなくなったら 次のページ）。
 * 文の 区切りは 使う分 →「。」ごとの つかいかた。何も入れなくても 1 ページは 必ず 出す。
 */
export function packDesc(use: string, how: string, fits: (page: DescPage) => boolean): DescPage[] {
  const sentences = how === '' ? [] : (how.match(/[^。]+。?/g) ?? [how]);
  const segs: { use?: string; how?: string; first?: boolean }[] = [];
  if (use !== '') segs.push({ use });
  sentences.forEach((sen, i) => segs.push({ how: sen, first: i === 0 }));
  const pages: DescPage[] = [];
  let cur: DescPage = { use: '', how: '', buttons: false };
  let empty = true;
  for (const seg of segs) {
    const cand: DescPage = { use: cur.use + (seg.use ?? ''), how: cur.how + (seg.how ?? ''), buttons: cur.buttons || !!seg.first };
    if (empty || fits(cand)) {
      cur = cand;
    } else {
      pages.push(cur);
      cur = { use: seg.use ?? '', how: seg.how ?? '', buttons: !!seg.first };
    }
    empty = false;
  }
  pages.push(cur);
  return pages;
}

/** 文字の数だけで 分ける（画面で 測る前の 仮の ページ分け。1 ページに `DESC_PAGE_CHARS` まで） */
export function splitDesc(use: string, how: string, limit: number = DESC_PAGE_CHARS): DescPage[] {
  return packDesc(use, how, (p) => plainLength(p.use) + plainLength(p.how) <= limit);
}

export function buildPageDefs(o: { recipes: readonly string[]; statCount: number; use?: string; how?: string; /** 画面で 測って 決めた せつめいの ページ（無ければ 文字の数で 仮に 分ける） */ desc?: readonly DescPage[]; perPage?: number }): PageDef[] {
  const per = o.perPage ?? STATS_PER_PAGE;
  const out: PageDef[] = o.recipes.map((recipe, i) => ({
    kind: 'make' as const,
    name: o.recipes.length === 1 ? 'ざいりょう' : `つくりかた ${CIRCLED[i] ?? String(i + 1)}`,
    recipe,
  }));
  const desc = o.desc ?? splitDesc(o.use ?? '', o.how ?? '');
  desc.forEach((d, i) => out.push({ kind: 'desc', name: desc.length === 1 ? 'せつめい' : `せつめい ${i + 1}/${desc.length}`, use: d.use, how: d.how, buttons: d.buttons }));
  // つよさ は 数が ある物だけ（分類の 文は つよさの 1 ページ目に。数が 無い物は せつめい に出す）
  if (o.statCount > 0) {
    const n = Math.ceil(o.statCount / per);
    for (let i = 0; i < n; i++) {
      out.push({ kind: 'stats', name: n === 1 ? 'つよさ' : `つよさ ${i + 1}/${n}`, from: i * per, to: Math.min(o.statCount, (i + 1) * per) });
    }
  }
  return out;
}

/** 今の材料で 作れる いちばん前の 作り方（無ければ null） */
export function firstCraftableVariant(variants: readonly CardView[]): string | null {
  return variants.find((v) => v.glowing)?.id ?? null;
}

/** 説明欄を 開いたとき（ちがうカードに うつったとき）の ページと 「つくる」の作り方: 作れる いちばん前、無ければ 1 ページ目 */
export function pageStart(pages: readonly PageDef[], variants: readonly CardView[]): { index: number; recipe: string } {
  const first = pages.find((p) => p.kind === 'make')?.recipe ?? variants[0]?.id ?? '';
  const c = firstCraftableVariant(variants);
  if (c === null) return { index: 0, recipe: first };
  const index = Math.max(0, pages.findIndex((p) => p.kind === 'make' && p.recipe === c));
  return { index, recipe: c };
}

export const HINT_SELECT = 'クリック で えらぶ';

/** つくる／やく ボタンの 文字とおせるか（えらんでいるマスで決める） */
export function buttonState(sel: CardView, bake: boolean, fuelNext: ItemIdM6 | null): { enabled: boolean; label: string } {
  if (sel.limit === 'haveOne') return { enabled: false, label: 'もう もっているよ' };
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
  /** CRAFT-2: ねんりょうごとの たんす の数 */
  fuelInTansu?: Record<string, number>;
  /** CRAFT-PAGE: shown の 作り方ごとの カード（無ければ shown だけ） */
  variants?: readonly CardView[];
  /** CRAFT-PAGE: 今の ページ と 「つくる」の作り方（無ければ 開いたときの ページ） */
  page?: { index: number; recipe: string };
  /** CRAFT-PAGE: selected の「つくる」が 使う 作り方のカード（無ければ selected） */
  selectedCard?: CardView;
  /** CRAFT-PAGE: 画面で 測った せつめいの ページ分け */
  desc?: readonly DescPage[];
}): DetailView {
  const { shown, selected, info } = o;
  const variants = o.variants && o.variants.length > 0 ? o.variants : [shown];
  const pages = buildPageDefs({ recipes: variants.map((v) => v.id), statCount: info.stats.length, use: info.use, how: info.how, desc: o.desc });
  const pg = o.page ?? pageStart(pages, variants);
  const cur = variants.find((v) => v.id === pg.recipe) ?? variants[0];
  return {
    id: shown.id,
    item: shown.output.item,
    name: info.name,
    rarity: info.rarity,
    stars: info.stars,
    rarityWord: info.rarityWord,
    use: info.use,
    special: info.special ?? null,
    how: info.how,
    buttons: info.buttons,
    later: info.later,
    stats: info.stats,
    classText: info.classText,
    materials: cur.materials.map((m) => ({ item: m.item, have: m.have, need: m.need, ok: !m.red, inTansu: m.inTansu })),
    fuel: o.bake && o.fuelCounts ? { next: o.fuelNext, counts: o.fuelCounts, inTansu: o.fuelInTansu ?? {} } : null,
    count: cur.output.count,
    button: buttonState(o.selectedCard ?? selected, o.bake, o.fuelNext),
    hint: shown.id !== selected.id ? HINT_SELECT : null,
    pages,
    page: Math.max(0, Math.min(pages.length - 1, pg.index)),
    recipe: cur.id,
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
