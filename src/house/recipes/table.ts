// HOUSE-2A（#364）レシピの 表（1 か所）。仕様 docs/design/HOUSE-2.md §4.1。DOM・three なし。
// 1 まいの レシピで 出る 物（gives）を 決める。ボタンの id・名前・材料は ここと kinds.ts・mats.ts から 出る（足す ときは ここに 1 行 ＋ mats.ts）。
// 並び ＝ 窓口 recipes().all の 並び（§4.1 の 表の 番号の 順）。かわらの やね（roof_kawara）が 1 まい目（pick.ts）。
import { FORM_NAME, LIGHT_NAME, kindsOfForm, type LightKind, type LookPart, type Part } from './kinds';

/** 1 まいで 出る 物 */
type Gives =
  | { t: 'form'; part: Part; form: string }
  | { t: 'light'; kind: Exclude<LightKind, 'lantern'> }
  | { t: 'furniture'; kind: 'maneki' }
  | { t: 'suffix'; index: number };

export interface RecipeDef {
  /** テロップの 名前（ぜんぶ ひらがな・カタカナ。案の 名前は つけない） */
  name: string;
  gives: Gives;
}

const form = (part: Part, f: keyof typeof FORM_NAME): RecipeDef => ({ name: FORM_NAME[f], gives: { t: 'form', part, form: f } });
const light = (kind: Exclude<LightKind, 'lantern'>): RecipeDef => ({ name: LIGHT_NAME[kind], gives: { t: 'light', kind } });
/** 後ろの 文字（SUFFIXES の 番号。editor/tuning.ts の 5・6・7） */
const suffix = (name: string, index: number): RecipeDef => ({ name, gives: { t: 'suffix', index } });

const RECIPES = {
  roof_kawara: form('roof', 'kawara'),
  roof_sankaku: form('roof', 'sankaku'),
  roof_wara: form('roof', 'wara'),
  roof_kin: form('roof', 'kin'),
  wall_shikkui: form('wall', 'shikkui'),
  wall_renga: form('wall', 'renga'),
  wall_ishi: form('wall', 'ishi'),
  window_suisho: form('window', 'suisho'),
  window_maru: form('window', 'maru'),
  door_tetsu: form('door', 'tetsu'),
  chimney_renga: form('deco', 'entotsu'),
  deco_noren: form('deco', 'noren'),
  deco_hanadan: form('deco', 'hanadan'),
  deco_shachi: form('deco', 'shachi'),
  light_hotaru: light('hotaru'),
  light_suisho: light('suisho'),
  furniture_maneki: { name: 'まねきねこ', gives: { t: 'furniture', kind: 'maneki' } },
  suffix_shiro: suffix('のしろ', 5),
  suffix_goten: suffix('ごてん', 6),
  suffix_toride: suffix('のとりで', 7),
} as const satisfies Record<string, RecipeDef>;

export type RecipeId = keyof typeof RECIPES;
export const RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];
export const isRecipeId = (x: unknown): x is RecipeId => typeof x === 'string' && Object.prototype.hasOwnProperty.call(RECIPES, x);
const def = (id: RecipeId): RecipeDef => RECIPES[id];
/** そのレシピが つくる 後ろの 文字の 名前 など、テロップの 名前 */
export const recipeName = (id: RecipeId): string => def(id).name;

/** そのレシピで 出る ボタンの id の 列（<ばしょ>-<kind>・light-<kind>・furniture-maneki・suffix-<番号>。むら・おしろ・こうざんの 順） */
export function recipeButtons(id: RecipeId): string[] {
  const g: Gives = def(id).gives;
  switch (g.t) {
    case 'form': return kindsOfForm(g.form).map((k) => `${g.part}-${k}`);
    case 'light': return [`light-${g.kind}`];
    case 'furniture': return [`furniture-${g.kind}`];
    case 'suffix': return [`suffix-${g.index}`];
    default: return g satisfies never;
  }
}

/** ① の しゅるい（レシピの 形）が なにの レシピか。light・furniture・suffix は 別の 表（log.ts の ok） */
export function recipeOfForm(part: Part, f: string): RecipeId | null {
  return RECIPE_IDS.find((id) => { const g: Gives = def(id).gives; return g.t === 'form' && g.part === part && g.form === f; }) ?? null;
}
export function recipeOfLight(kind: string): RecipeId | null {
  return RECIPE_IDS.find((id) => { const g: Gives = def(id).gives; return g.t === 'light' && g.kind === kind; }) ?? null;
}
export function recipeOfFurniture(kind: string): RecipeId | null {
  return RECIPE_IDS.find((id) => { const g: Gives = def(id).gives; return g.t === 'furniture' && g.kind === kind; }) ?? null;
}
export function recipeOfSuffix(index: number): RecipeId | null {
  return RECIPE_IDS.find((id) => { const g: Gives = def(id).gives; return g.t === 'suffix' && g.index === index; }) ?? null;
}
/** かざりの レシピ（おぼえた 物が 1 つでも あれば ばしょ「かざり」が 出る） */
export const DECO_RECIPES: readonly RecipeId[] = RECIPE_IDS.filter((id) => { const g: Gives = def(id).gives; return g.t === 'form' && g.part === 'deco'; });

/** そのレシピで「つくる」に ふえる 物（ばしょ・しゅるい id。むら・おしろ・こうざんの 順）。まねきねこ（かまどで やく）・後ろの 文字（作らない）は 空 */
export function recipeLooks(id: RecipeId): Array<{ part: LookPart; kind: string }> {
  const g: Gives = def(id).gives;
  switch (g.t) {
    case 'form': return kindsOfForm(g.form).map((kind) => ({ part: g.part, kind }));
    case 'light': return [{ part: 'light', kind: g.kind }];
    case 'furniture': return [];
    case 'suffix': return [];
    default: return g satisfies never;
  }
}
