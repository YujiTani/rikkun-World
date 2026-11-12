// HOUSE-2C（#364・仕様 3.4 版 docs/design/HOUSE-2.md §2.5〜§2.7・§3.5・§6.2 AC15〜AC21）ユニットテスト用の 道具（テスト専用。本番の コードからは 使わない）。
// 2C で 足される 物は 型の 上で まだ 無い ので、ここで 名前と 形を 約束する（本番に 足す 所は 下の 表。足したら この ファイルの 取り出しは そのまま 動く）。
// ほかの 道具は src/house/recipes/lookKit.ts（2B の 約束）・recipeKit.ts（2A の 約束）。
//
// ---- 2C の 約束（tester が 決めた 名前。開発は これに そろえる。変えるなら この ファイルと 使う テストを 一緒に 直す）----
//   【新しい ファイル】src/house/placedLooks.ts   手で 置いた 家の 物の 案の 記録（§2.7）。世界に 1 つ。
//     type Facing = 'n' | 'e' | 's' | 'w'      前が 向く 方位（n ＝ −z・s ＝ ＋z・e ＝ ＋x・w ＝ −x。家の 戸の かべが 南 ＝ ＋z と 同じ きめ）
//     class PlacedLooks（BlockWatcher〔house/blockWatch.ts〕を かねる）
//       set(x, y, z, style, facing, block)   書く（block ＝ 置いた lk_ ブロックの id）。同じ マスは あとの 行。
//       get(x, y, z) → { style, facing } | null   1 マスの 答え。**記録の 数に よらない 仕事**（Map など。ぜんぶ 見ない）
//       size                  記録の 数（今 ある 記録）
//       erase(x, y, z)        建築士さんが その マスを 置きかえた とき（同じ id を 置いても 消す）。
//       cellChanged(x, y, z, id)   watchBlocks の 知らせ。その マスに 記録が あれば 消す。ただし id が lk_door_tetsu の 4 つ
//                              （kindBlocks('door', 'tetsu_*')）の どれかで、前の ブロックも その 4 つの どれかだった とき〔あける・しめる〕は 消さない。
//                              前の ブロックは set の block（restore では blockAt）。save には のせない。
//       boxFilled(x0, y0, z0, x1, y1, z1, id)   箱の 中の 記録を 同じ きまりで 消す（fill）。blockChanged・blocksChanged は 何も しない。
//       save() → [x, y, z, style, facing][]   保存の 行（キー placedLooks の 中身。並びは きめない）
//       restore(rows: unknown, blockAt: (x, y, z) => BlockId | 'outside')   読む。行で ない・形の おかしい 行・
//                              その マスの ブロックが 案の ある lk_ ブロック〔やね・かべ（柱 のぞく）・まど・と・えんとつ・のれん・はなだん〕で ない 行は すてる。
//                              同じ マスが 2 行 なら あとの 行。rows が 配列で なければ 記録 なし。
//       probes                get が 見た 記録の 数の 合計（見張り。AC18b ⑦。1 回の get で 記録の 数が ふえても 1 マス 分しか ふえない）
//     resolveLook(d: { block: BlockId | 'outside'; placed: PlacedLooks; book: { lookAt(x, y, z): string | null } }, x, y, z) → string | null
//       しゅるいの id（'kawara_shiro' など）。順は ① 置いた ときの 記録 → ② 家の 記録（その マスの ブロックが その しゅるいの ブロックの とき だけ）→ ③ その 形の むら。
//       案の ある lk_ ブロック で なければ null。
//   【HouseSystem】`sys.placedLooks: PlacedLooks`（世界に 1 つ。serialize() の 中の キー `placedLooks`、load() で 読む。load は 今の 世界の ブロックを 見て 合わない 行を すてる）。
//       窓口 `house.lookOf(x, y, z)`（= resolveLook を 世界の ブロックで）・`house.placedLook(x, y, z)`（= placedLooks.get）。
//       建築士さんが 家を 建てる とき（builder）は その マスの 記録を erase する。
//   【DigM4Deps】`placedLooks?: () => PlacedLooks | null`（houseLook と 同じ つなぎ方）。
//       置く とき: 案の ある 形の アイテム（`<ばしょ>_<形>_<案>`）を 置く → その 形の lk_ ブロックを 置き、記録を 書く（style ＝ アイテムの 案・facing ＝ 置く マスから 見て プレイヤーの いる 方位。
//                  家具と 同じ きめ方〔4 つに まるめる〕。てつの と は 下・上の 2 マス とも）。案の ない 物〔しゃちほこ・あかり〕は 書かない。
//       ほる とき: 記録の 案で アイテムを きめて（dugItemAt の 前に 見る。順は ①→②→③）から 消す（block が かわる ので cellChanged でも 消える）。
//   【dig/dugItems.ts】`dugItemAt(book, id, x, y, z, placed?)`  最後の 引数に 置いた ときの 記録（PlacedLooks | null）。あれば ① の 順で。
//   【src/world/render/houseLookPieces.ts】`placedLookPieces(id, placed: { style, facing } | null)` → LookPiece[]
//       手で 置いた 物の 面。ななめの やね（のきが facing がわ）・のれん・はなだん（前が facing がわ）は 向きで かわる。null は 今の lookPieces(id, null)（立方体）と 同じ。
//   【src/craft/CraftSystem.ts】CraftDeps `houseLearned?: () => readonly string[]`（おぼえた レシピの id〔house.recipes().learned〕。なければ 1 つも おぼえて いない）。
//       `craft.unlocked(id): boolean`（家の 物の 作り方 以外は いつも true、はじめから の 13 も true、レシピで ふえる 物は その レシピを おぼえて いる ときだけ true）。
//       `craft.make(id)`・`craft.status(id)` は unlocked で ない 作り方では ok: false（持ち物 不変）。
//       作り方の id ＝ できる アイテムの id。CRAFT_RECIPES の うしろに 家の 物 ・ BAKE_RECIPES の うしろに maneki（かまど。ねんりょう 1・60 ステップ）。
//   【src/house/recipes/mats.ts】`HAND_MATS: { house_roof: { item, count }, house_door: { item, count } }`（エディターの 表の「手で つくる とき」の 材料。たいらの やね・いえの と）。
//   【src/ui/craftModel.ts】`craftViewCards(craft: { recipes(), status(id), unlocked(id) }, inv: { count(item) }, looks?: CraftLooks, opt?: CardOptions) → CardView[]`
//       つくる の 一覧（`craft.ui().tiles` の もと）: unlocked の 物・材料を 1 しゅるい 以上 持つ 物・案の ある 形は カード 1 まい（id ＝ むらの 作り方の id。
//       output.item ＝ えらんで いる 案の アイテム）・ならびは 作れる → 足りない・その 中は 作り方の 表の 順（家の 物は いちばん うしろ）。CraftPanel も これを 使う。
//   【新しい ファイル】src/ui/craftLooks.ts   案の ボタンの えらび（パネルごとに 1 つ。保存しない）
//     class CraftLooks
//       view(card: string) → { items: ItemId[]; selected: ItemId } | null   案の ある カードの 案の ボタン（むら → おしろ → こうざん）。案の ない カードは null
//       pick(card: string, item: ItemId) → boolean   えらぶ。card の 案の 1 つ で なければ false（作らない）
//       recipeOf(card: string) → string              えらんで いる 案の 作り方の id（案の ない カードは card）
//     houseCardOf(recipeId: string) → string        案の ある 形の 3 つの 作り方 → むらの 作り方の id。ほかは そのまま
//   【画面】craft.ui().detail.looks（= CraftLooks.view）・`craft.pickLook(item)`（今 出て いる カードの 案で なければ false）・data-testid `cp-looks`・`cp-look-<item>`。
//   【図鑑】アイテムの source（ItemDef.source）。AC19 の 文。
//   【テストの 窓口】e2e は `window.__rikkun` の craft / house だけ（e2e/house2c.spec.ts・e2e/helpers/houseCraft.ts）。
//
// 注意: 新しい ファイルは 型の 上で まだ 無い ので、`need()` で 実行時に 読む（なければ 読みやすい 文で 落ちる）。
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BlockId, ItemId, Recipe } from '../../contracts';
import { HOUSE_BLOCK_IDS } from '../../world/blocks/houseBlocks';
import { HOUSE_FURNITURE_IDS } from '../../content/items/ids';
import { FURN_ORDER, FURNITURE, type FurnKind } from '../editor/furniture';
import { needOf, type NeedShape } from '../editor/model';
import { FLOWER_ROW } from './mats';
import * as matsMod from './mats';
import * as craftModelMod from '../../ui/craftModel';
import * as renderMod from '../../world/render/houseLookPieces';
import { LIGHT_DEFAULT, LIGHT_KINDS, PART_FORMS, isStyleless, PARTS, STYLES, kindItem, kindsOfForm, type Part, type Style } from './kinds';
import { kindBlocks } from './kinds';
import { RECIPE_IDS, recipeButtons, type RecipeId } from './table';
import type { CardView } from '../../ui/craftModel';
import { CraftSystemImpl } from '../../craft/CraftSystem';
import { InventoryImpl } from '../../inventory/Inventory';

export type Facing = 'n' | 'e' | 's' | 'w';
export const FACINGS: readonly Facing[] = ['s', 'w', 'n', 'e'];
export interface PlacedLookRec {
  style: Style;
  facing: Facing;
}
export interface PlacedLooksLike {
  set(x: number, y: number, z: number, style: Style, facing: Facing, block: BlockId): void;
  get(x: number, y: number, z: number): PlacedLookRec | null;
  readonly size: number;
  erase(x: number, y: number, z: number): void;
  cellChanged(x: number, y: number, z: number, id: BlockId): void;
  boxFilled(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): void;
  save(): Array<[number, number, number, Style, Facing]>;
  restore(rows: unknown, blockAt: (x: number, y: number, z: number) => BlockId | 'outside'): void;
  readonly probes: number;
}
export type PlacedLooksCtor = new () => PlacedLooksLike;
export interface PlacedLooksMod {
  PlacedLooks: PlacedLooksCtor;
  resolveLook(d: { block: BlockId | 'outside'; placed: PlacedLooksLike; book: { lookAt(x: number, y: number, z: number): string | null } }, x: number, y: number, z: number): string | null;
}
export interface CraftLooksLike {
  view(card: string): { items: ItemId[]; selected: ItemId } | null;
  pick(card: string, item: ItemId): boolean;
  recipeOf(card: string): string;
}
export interface CraftLooksMod {
  CraftLooks: new () => CraftLooksLike;
  houseCardOf(recipeId: string): string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
/** 新しい ファイルを 実行時に 読む（まだ 無い 間は 読みやすい 文で 落ちる）。rel は src からの 道（拡張子 なし） */
async function need<T>(rel: string): Promise<T> {
  const file = path.resolve(here, '../..', `${rel}.ts`);
  try {
    return (await import(/* @vite-ignore */ file)) as T;
  } catch (e) {
    throw new Error(`src/${rel}.ts が まだ ない か 読めない（2C の 約束。src/house/recipes/craftKit.ts の 先頭）: ${String(e)}`);
  }
}
export const loadPlaced = (): Promise<PlacedLooksMod> => need<PlacedLooksMod>('house/placedLooks');
export const loadCraftLooks = (): Promise<CraftLooksMod> => need<CraftLooksMod>('ui/craftLooks');

// ---------------------------------------------------------------- 表から 作る 一覧（数を 書かない。#311）

/** 案の ある 形（やね 4・かべ 3・まど 2・と 1・えんとつ・のれん・はなだん）。しゃちほこ ・あかりは 案が ない */
export interface StyledForm {
  part: Part;
  form: string;
  /** 'kawara_mura' の ような しゅるい id（むら → おしろ → こうざん） */
  kinds: string[];
  /** その しゅるいの アイテム（kindItem。むら → おしろ → こうざん） */
  items: ItemId[];
  /** 形の ブロックの id（3 案 とも 同じ。戸は 4 つ） */
  blocks: BlockId[];
}
export function styledForms(): StyledForm[] {
  const out: StyledForm[] = [];
  for (const part of PARTS) {
    for (const form of PART_FORMS[part]) {
      const kinds = kindsOfForm(form);
      if (kinds.length !== STYLES.length) continue; // しゃちほこ
      out.push({ part, form, kinds, items: kinds.map((k) => kindItem(part, k)!), blocks: kindBlocks(part, kinds[0]!) });
    }
  }
  return out;
}
/** まねきねこ（やく の 一覧） */
const MANEKI: ItemId = 'maneki';
/** 案の ない 新しい 物: しゃちほこ・あかり 2（アイテムの id） */
export function unstyledItems(): ItemId[] {
  const shachi = kindItem('deco', 'shachi')!;
  const lights = LIGHT_KINDS.filter((k) => k !== LIGHT_DEFAULT).map((k) => kindItem('light', k)!);
  return [shachi, ...lights];
}
/** 1 版の 家の 物 13（家の ブロック 5 ・家具 8。まねきねこ は のぞく）。ならびは 5 → 8（エディターの ② の 順） */
export function firstVersionItems(): ItemId[] {
  const furn = FURN_ORDER.filter((k): k is FurnKind => (HOUSE_FURNITURE_IDS as readonly string[]).includes(k) && k !== MANEKI);
  return [...HOUSE_BLOCK_IDS, ...furn] as ItemId[];
}
/** レシピで ふえる 物（アイテム → おぼえる レシピ）。表（table.ts）の ならびの まま。つくる の 物（形・あかり）。まねきねこ・後ろの 文字は のぞく */
export function gatedCraftItems(): Array<{ item: ItemId; recipe: RecipeId }> {
  const out: Array<{ item: ItemId; recipe: RecipeId }> = [];
  for (const id of RECIPE_IDS) {
    for (const b of recipeButtons(id)) {
      const m = /^(roof|wall|window|door|deco)-(.+)$/.exec(b);
      if (m) out.push({ item: kindItem(m[1] as Part, m[2]!)!, recipe: id });
      else if (b.startsWith('light-')) out.push({ item: kindItem('light', b.slice(6))!, recipe: id });
    }
  }
  return out;
}
export const maneki = (): { item: ItemId; recipe: RecipeId } => ({ item: MANEKI, recipe: 'furniture_maneki' });

// ---------------------------------------------------------------- 材料の 期待（エディターの 表から 計算。AC16・AC17）

/** 材料 1 行 */
export interface Need {
  item: ItemId;
  count: number;
}
/** 「1 回 ぶん」の 期待（材料 → できる 数）。数は ぜんぶ エディターの 表（needOf・FURNITURE・HAND_MATS）から 作る */
export interface Want {
  inputs: Need[];
  out: number;
}

const BASE: NeedShape = { w: 5, d: 5, windows: 4, furniture: [], roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern' };
const matMap = (over: Partial<NeedShape>): Map<ItemId, number> => new Map(needOf({ ...BASE, ...over }, () => 0).map((r) => [r.item, r.need]));
/** 2 つの 形の ちがい（over − base。ふえた 物だけ） */
function delta(over: Partial<NeedShape>, base: Partial<NeedShape> = {}): Map<ItemId, number> {
  const a = matMap(over);
  const b = matMap(base);
  const out = new Map<ItemId, number>();
  for (const [k, v] of a) if (v - (b.get(k) ?? 0) > 0) out.set(k, v - (b.get(k) ?? 0));
  return out;
}
/** 外まわり 1 周（P）・窓の 数（n）は BASE から。P ＝ ki の かべの き の 数 */
const P = matMap({}).get('log')!;
const N = BASE.windows;
/** しゃちほこは 1 つの 家に 2 ひき（仕様 §4.1。「エディターは 2 ひき で きん 2」） */
const SHACHI_PIECES = 2;
/** はなだんの 形（窓 1 つ ごとに 1 こ） */
const HANADAN = 'hanadan';

/** 1 つ ぶんの 量 q（マス・窓・ひき あたり）から 「1 回」の 期待を 作る。q が 1 より 小さい 物は 1 回で 1 ÷ q こ できる（さんかく 2・きん 4） */
function wantOf(perUnit: Map<ItemId, number>, units: number): Want {
  const qs = [...perUnit].map(([item, n]) => ({ item, q: n / units }));
  const out = Math.max(1, ...qs.map((x) => Math.round(1 / x.q)));
  return { inputs: qs.map((x) => ({ item: x.item, count: x.q * out })), out };
}

/** 1 版の 物の 作り方（家具は エディターの 1 こ ぶん。ゆか・かべ・まど・やね・と は 1 マス ぶん・手で つくる とき） */
export function firstVersionWant(item: ItemId): Want {
  const hand = (matsMod as unknown as { HAND_MATS?: Record<string, Need> }).HAND_MATS;
  const handOf = (k: 'house_roof' | 'house_door'): Need => {
    if (!hand?.[k]) throw new Error('HAND_MATS が まだ ない（2C の 約束。src/house/recipes/mats.ts）');
    return hand[k]!;
  };
  const special: Readonly<Record<string, () => Want>> = {
    house_floor: () => wantOf(new Map([['stone' as ItemId, BASE.w * BASE.d]]), BASE.w * BASE.d),
    house_wall: () => wantOf(new Map([['log' as ItemId, P]]), P),
    house_roof: () => ({ inputs: [{ item: handOf('house_roof').item, count: handOf('house_roof').count }], out: 1 }),
    shoji: () => wantOf(delta({}, { windowKind: 'none' }), N),
    house_door: () => ({ inputs: [{ item: handOf('house_door').item, count: handOf('house_door').count }], out: 1 }),
  };
  const f = special[item];
  if (f) return f();
  const furn = FURNITURE[item as FurnKind];
  if (!furn) throw new Error(`1 版の 物 では ない: ${item}`);
  return { inputs: furn.mats.map(([i, n]) => ({ item: i, count: n })), out: 1 };
}

/** レシピで ふえる 物（形・あかり）の 作り方。まねきねこ（かまど）は 別（FURNITURE.maneki）。やく ときは ねんりょう 1 */
export function gatedWant(part: Part | 'light', form: string): Want {
  const byPart: Record<Part | 'light', () => Want> = {
    roof: () => wantOf(delta({ roof: `${form}_mura` as never }, { roof: 'flat' }), P),
    wall: () => wantOf(delta({ wall: `${form}_mura` as never }, { wall: 'ki' }), P),
    window: () => wantOf(delta({ windowKind: `${form}_mura` as never }, { windowKind: 'none' }), N),
    door: () => wantOf(delta({ door: `${form}_mura` as never }, { door: 'ie' }), 1),
    deco: () => {
      const kind = isStyleless(form) ? form : `${form}_mura`;
      const units = form === HANADAN ? N : isStyleless(form) ? SHACHI_PIECES : 1;
      return wantOf(delta({ deco: [kind] as never }), units);
    },
    light: () => wantOf(delta({ light: form as never }, { light: LIGHT_DEFAULT }), 1),
  };
  return byPart[part]();
}

/** 持ち物に その 材料 1 回 ぶんを 入れる ための 行（はなは 3 いろの どれでも。FLOWER_ROW） */
export const withoutFlowerRow = (w: Want): Need[] => w.inputs.filter((i) => i.item !== FLOWER_ROW);

// ---------------------------------------------------------------- 作る 側の 取り出し（まだ 無い 窓口は 読みやすい 文で 落とす）

export interface UnlockCraft {
  recipes(): Recipe[];
  status(id: string): { craftable: boolean; missing: Array<{ item: ItemId; count: number }> };
  make(id: string): { ok: boolean; reason: string | null };
  unlocked(id: string): boolean;
}
export function craftViewCards(craft: UnlockCraft, inv: { count(item: ItemId): number }, looks?: CraftLooksLike): CardView[] {
  const f = (craftModelMod as unknown as Record<string, unknown>).craftViewCards;
  if (typeof f !== 'function') throw new Error('craftViewCards が まだ ない（2C の 約束。src/ui/craftModel.ts）');
  return (f as (c: UnlockCraft, i: unknown, l?: CraftLooksLike) => CardView[])(craft, inv, looks);
}
export interface PlacedPieces {
  pos: number[];
}
export function placedLookPieces(id: string, placed: PlacedLookRec | null): readonly PlacedPieces[] {
  const f = (renderMod as unknown as Record<string, unknown>).placedLookPieces;
  if (typeof f !== 'function') throw new Error('placedLookPieces が まだ ない（2C の 約束。src/world/render/houseLookPieces.ts）');
  return (f as (i: string, p: PlacedLookRec | null) => readonly PlacedPieces[])(id, placed);
}

// ---------------------------------------------------------------- 作る 係の 準備（houseLearned ＝ 2C の 約束）

class CraftWorld {
  private readonly blocks = new Map<string, BlockId>();
  readonly size = { x: 16, y: 16, z: 16 };
  isLoaded(): boolean {
    return true;
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(): boolean {
    return false;
  }
}
export type HouseCraft = CraftSystemImpl & { unlocked(id: string): boolean };
/** 作る 係（かまどは (3,5,3)）。おぼえた レシピは `known.ids` を かえて 動かす */
export function craftRig(learned: string[] = []) {
  const world = new CraftWorld();
  world.setBlock(3, 5, 3, 'furnace');
  const inv = new InventoryImpl();
  const known = { ids: learned };
  const craft = new CraftSystemImpl({
    world,
    inventory: inv,
    drops: { scatter: () => 0 },
    houseLearned: () => known.ids,
  } as unknown as ConstructorParameters<typeof CraftSystemImpl>[0]) as HouseCraft;
  const step = (n: number) => {
    for (let i = 0; i < n; i++) craft.update();
  };
  return { world, inv, craft, step, known, view: craft as unknown as UnlockCraft };
}
export type CraftRig = ReturnType<typeof craftRig>;

/** ふつうの ゲームの watchBlocks の かわり: world の setBlock の あとで placed の cellChanged を 呼ぶ（建築士さんの 置きかえ・ほる・テストの setBlock ぜんぶ） */
export function watchPlaced(world: { setBlock(x: number, y: number, z: number, id: BlockId): boolean }, placed: PlacedLooksLike): void {
  const orig = world.setBlock.bind(world);
  world.setBlock = (x, y, z, id) => {
    const ok = orig(x, y, z, id);
    if (ok) placed.cellChanged(x, y, z, id);
    return ok;
  };
}
