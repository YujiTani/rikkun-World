// HOUSE-2A（#364・仕様 3.3 版）ユニットテスト用の 道具（テスト専用。本番の コードからは 使わない）。
// 窓口 `house.recipes()`・`learn()`・`found()`・`read()`・`recipeBand()`・`recipeKinds()` と、エディターの 新しい 項目は 型の 上で まだ 無い ので、ここで 形を 約束する
// （約束の 本文は e2e/helpers/house.ts の「2A の 約束」。レシピの 数は どこにも 書かない: 数える ときは recipes().all から）。
import type { ItemId } from '../../contracts';
import { houseRig } from '../houseRig';

export type Rig = ReturnType<typeof houseRig>;

/** 3.3 版: レシピの まきもの（アイテム）。まだ 登録表に 無い 間は 型に 無い ので ここで 書く */
export const SCROLL = 'recipe_scroll' as ItemId;
export type Who = 1 | 2;

export interface RecipeHook {
  /** nextPick ＝ 今 まきものを 使ったら おぼえる 物（ぜんぶ おぼえて いれば null）。3.3 版 */
  recipes(): { learned: string[]; fresh: string[]; all: string[]; nextPick: string | null };
  /** そのレシピで 出る ボタンの id の 列（例 roof_kawara → ['roof-kawara_mura', 'roof-kawara_shiro', 'roof-kawara_kozan']）。数は 書かずに 使う */
  recipeKinds(id: string): string[];
  /** テスト用の 近道（まきものを 使わずに おぼえる）。AC1b の テストでは 使わない */
  learn(id: string): boolean;
  /** 坑道の 宝箱の わく・まきものを 手に 入れた（3.3 版）: who の 持ち物に recipe_scroll 1 まい（いっぱいなら 足もとへ）。おぼえない。返り値は ない */
  found(at: { x: number; y: number; z: number }, who?: Who): void;
  /** 手に もって 右クリックした ときの 本体（3.3 版）: who の 持ち物の まきものを 1 まい へらして 1 つ おぼえる。持って いなければ false で 何も おきない */
  read(who?: Who): boolean;
  recipeBand(): { text: string; ticksLeft: number } | null;
}
export const rh = (r: Rig): RecipeHook => r.hook as unknown as RecipeHook;

/** 文字から 空白を 取る */
export const squash = (s: string): string => s.replace(/\s+/g, '');
/** 持ち物の まきもの の 数 */
export const scrolls = (r: Rig, bag: { count(item: ItemId): number } = r.bag): number => bag.count(SCROLL);
/** 持ち物を いっぱいに する（石の 山で 空きが なくなるまで） */
export function fillBag(r: Rig, bag: { add(item: ItemId, n: number): number; slots(): readonly unknown[] } = r.bag): void {
  let guard = 0;
  while (bag.add('stone', 64) === 0 && guard++ < 1000);
  if (!bag.slots().every((s) => s !== null)) throw new Error('持ち物が いっぱいに ならない');
}
/** おぼえた／手に 入れた テロップが 消えるまで 進める */
export function bandOut(r: Rig): void {
  let n = 0;
  while (rh(r).recipeBand() && n++ < 5000) r.run(1);
  if (rh(r).recipeBand()) throw new Error('テロップが 消えない');
}

/** 窓口 editor() の 2A で 足される 部分（3 版: part は やめて popup） */
export interface Ed {
  step: 'soto' | 'naka' | 'namae';
  popup: string | null;
  /** ポップアップの 行ごとの ボタンの id（上から。開いて いない ときは []）。3.2 版 */
  popupRows: string[][];
  /** 名前の ヘルプ（のせて 12 コマで 出る）。3.2 版 */
  hoverTip: { id: string; lines: string[] } | null;
  roof: string;
  wall: string;
  windowKind: string;
  door: string;
  deco: string[];
  light: string;
  marks: string[];
  canUndo: boolean;
  canRedo: boolean;
  windows: number;
  size: { w: number; d: number };
  name: { front: string; back: string };
  confirm: string | null;
  furniture: { kind: string }[];
}
export const ed = (r: Rig): Ed => r.hook.editor() as unknown as Ed;
/** エディターが 閉じて いる ときも 呼べる 形（閉じて いたら null） */
export const edOrNull = (r: Rig): Ed | null => r.hook.editor() as unknown as Ed | null;

/**
 * 全レシピの id（表から。テストの 中に 数を 書かない）。窓口が まだ 無い ときは ENTRY の 名前（そのとき 1 まいごとの テストも 赤〔窓口が 無くて 落ちる〕に なる）。
 * 窓口の 表と ENTRY が ずれたら recipeEditor.test.ts の「ENTRY ＝ 表」が 落ちる
 */
export function allRecipes(): string[] {
  try {
    return rh(houseRig()).recipes().all;
  } catch {
    return Object.keys(ENTRY);
  }
}

// ---------------------------------------------------------------- 3 案と ばしょ（仕様 §2.3・§4.1）

/** 案（むら ＝ A・おしろ ＝ B・こうざん ＝ C）。ポップアップの 行の 順 */
export const STYLES = ['mura', 'shiro', 'kozan'] as const;
export type Style = (typeof STYLES)[number];
export type Part = 'roof' | 'wall' | 'window' | 'door' | 'deco';
/** ばしょの ならび（左から。かざりは かざりを 1 つ おぼえる まで 出ない） */
export const PARTS: readonly Part[] = ['roof', 'wall', 'window', 'door', 'deco'];
/** ばしょごとの 「いつもの 行」（はじめから ある 物。左から。やね・かべ・まどは「なし」が いちばん 左、と・かざりに なしは ない。3.2 版） */
export const USUAL: Readonly<Record<Part, string[]>> = { roof: ['none', 'flat'], wall: ['none', 'ki'], window: ['none', 'shoji'], door: ['ie'], deco: [] };
/** 「なし」を えらべる ばしょ（しゅるいの id は 'none'。press id は <ばしょ>-none） */
export const NONE_PARTS: readonly Part[] = ['roof', 'wall', 'window'];
/** 1 行に ならぶ 数の 上限（3.2 版。こえたら おなじ なかまの 中で 次の 行へ） */
export const ROW_MAX = 5;
/** ばしょごとの 形の ならび（ポップアップの 行の 中の 順。§2.3 の 表）。しゃちほこ は おしろの 行だけ */
export const FORMS: Readonly<Record<Part, string[]>> = {
  roof: ['sankaku', 'kawara', 'wara', 'kin'],
  wall: ['shikkui', 'renga', 'ishi'],
  window: ['suisho', 'maru'],
  door: ['tetsu'],
  deco: ['entotsu', 'noren', 'hanadan', 'shachi'],
};
/** 形 form の しゅるい id（しゃちほこ は 案が なく 1 つ） */
const kindsOfForm = (form: string): string[] => (form === 'shachi' ? ['shachi'] : STYLES.map((s) => `${form}_${s}`));
/** editor() の 項目名と edit の op（まどだけ ばしょの 名前と ちがう） */
const FIELD_OF: Readonly<Record<Part, 'roof' | 'wall' | 'windowKind' | 'door' | 'deco'>> = { roof: 'roof', wall: 'wall', window: 'windowKind', door: 'door', deco: 'deco' };
/** しゅるいの ボタンの id（<ばしょ>-<kind>） */
const KIND_BTN = /^(roof|wall|window|door|deco)-/;
/** ばしょの ボタンの 下に ある（ポップアップで かくれる）① の パネルの ボタン */
export const PANEL_BTN = /^(part-|width-|depth-|windows(Up|Down)$)/;

/**
 * ばしょ part の ポップアップの 行（`editor().popupRows` の 期待）。上から いつもの → むら → おしろ → こうざん。
 * 1 行に 1 つの なかま だけ・行の 中は §2.3 の 表の 順・1 行 ROW_MAX こまで（こえたら 同じ なかまの 次の 行）・空の 行は 出さない。
 * learnedForms ＝ おぼえた 形（'kawara' など）。しゃちほこ ('shachi') は おしろの 行にだけ 入る
 */
export function popupRowsOf(part: Part, learnedForms: readonly string[]): string[][] {
  const groups: string[][] = [USUAL[part].map((k) => `${part}-${k}`)];
  for (const style of STYLES) {
    const g: string[] = [];
    for (const form of FORMS[part]) {
      if (!learnedForms.includes(form)) continue;
      if (form === 'shachi') {
        if (style === 'shiro') g.push(`${part}-shachi`);
      } else g.push(`${part}-${form}_${style}`);
    }
    groups.push(g);
  }
  const rows: string[][] = [];
  for (const g of groups) for (let i = 0; i < g.length; i += ROW_MAX) rows.push(g.slice(i, i + ROW_MAX));
  return rows;
}
/** レシピ 1 まい ごとの えらび方: どの すすみの どの ばしょの どの ボタンを 押すと どの 窓口の 値が かわるか（仕様 §4.1。id の 約束は house.ts の 先頭） */
export interface Entry {
  step: 'soto' | 'naka' | 'namae';
  /** ① の ばしょ（① だけ。ポップアップを 開く ボタンは `part-<ばしょ>`） */
  part?: Part;
  /** editor() の 項目と、edit(op) の op（家具・後ろの 文字は なし） */
  field?: 'roof' | 'wall' | 'windowKind' | 'door' | 'deco' | 'light';
  /** このレシピで 出る しゅるいの id（edit の kind。むら・おしろ・こうざんの 順。しゃちほこ・あかりなどは 1 つ） */
  kinds: string[];
  /** 押す ボタンの id（kinds と 同じ 順。recipeKinds(id) と 同じ） */
  btns: string[];
}
const soto = (part: Part, form: string): Entry => {
  const kinds = kindsOfForm(form);
  return { step: 'soto', part, field: FIELD_OF[part], kinds, btns: kinds.map((k) => `${part}-${k}`) };
};
export const ENTRY: Readonly<Record<string, Entry>> = {
  roof_kawara: soto('roof', 'kawara'),
  roof_sankaku: soto('roof', 'sankaku'),
  roof_wara: soto('roof', 'wara'),
  roof_kin: soto('roof', 'kin'),
  wall_shikkui: soto('wall', 'shikkui'),
  wall_renga: soto('wall', 'renga'),
  wall_ishi: soto('wall', 'ishi'),
  window_suisho: soto('window', 'suisho'),
  window_maru: soto('window', 'maru'),
  door_tetsu: soto('door', 'tetsu'),
  chimney_renga: soto('deco', 'entotsu'),
  deco_noren: soto('deco', 'noren'),
  deco_hanadan: soto('deco', 'hanadan'),
  deco_shachi: soto('deco', 'shachi'),
  light_hotaru: { step: 'naka', field: 'light', kinds: ['hotaru'], btns: ['light-hotaru'] },
  light_suisho: { step: 'naka', field: 'light', kinds: ['suisho'], btns: ['light-suisho'] },
  furniture_maneki: { step: 'naka', kinds: ['maneki'], btns: ['furniture-maneki'] },
  suffix_shiro: { step: 'namae', kinds: [], btns: ['suffix-5'] },
  suffix_goten: { step: 'namae', kinds: [], btns: ['suffix-6'] },
  suffix_toride: { step: 'namae', kinds: [], btns: ['suffix-7'] },
};
/** ① の レシピの 形（'kawara' など。ENTRY の kinds の はじめから 案を とった 物。しゃちほこ は 'shachi'） */
export const formOf = (id: string): string => {
  const k = ENTRY[id]!.kinds[0]!;
  return k.replace(/_(mura|shiro|kozan)$/, '');
};
export const SUFFIX_NAME: Readonly<Record<string, string>> = { suffix_shiro: 'のしろ', suffix_goten: 'ごてん', suffix_toride: 'のとりで' };

/** 話しかけて エディターを 開く */
export function openEd(r: Rig): void {
  r.talk();
  r.sys.press('editor');
}
export const btnIds = (r: Rig): string[] => r.hook.menu().buttons.map((b) => b.id);
export const btnOn = (r: Rig, id: string): boolean | undefined => r.hook.menu().buttons.find((b) => b.id === id)?.enabled;
/** しゅるいの ボタン（<ばしょ>-<kind>）だけ。ポップアップが 開いて いない ときは 出ない */
export const kindBtns = (r: Rig): string[] => btnIds(r).filter((i) => KIND_BTN.test(i));
/** ばしょ part の ポップアップを 開く（ボタン part-<ばしょ> を 押す。開いたか たしかめる） */
export function openPopup(r: Rig, part: Part): void {
  r.sys.press(`part-${part}`);
  if (ed(r).popup !== part) throw new Error(`part-${part} を 押しても popup が ${part} に ならない（今は ${String(ed(r).popup)}）`);
}
/** すすみを 進める／もどす（next・prev を 押す。ポップアップが 開いて いたら 下の 帯の ボタンで とじる） */
export function goStep(r: Rig, step: 'soto' | 'naka' | 'namae'): void {
  const order = ['soto', 'naka', 'namae'];
  while (ed(r).step !== step) r.sys.press(order.indexOf(ed(r).step) < order.indexOf(step) ? 'next' : 'prev');
}
/** 全部の レシピを おぼえる */
export function learnAll(r: Rig): void {
  for (const id of rh(r).recipes().all) rh(r).learn(id);
}
/** もう 1 けん 建て はじめた 世界（はじめての 家の おまけは もう ない） */
export const notFirst = (r: Rig): void => r.sys.build.builder.load({ v: 1, active: null, pending: [], bonusUsed: true });
/** ひつような もの → { item: need }（はなは 3 いろ あわせて 'flower'。need 0 の 行は 数えない） */
export function needMap(r: Rig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of r.hook.need()) {
    if (row.need <= 0) continue;
    const k = row.item.startsWith('flower') ? 'flower' : row.item;
    out[k] = (out[k] ?? 0) + row.need;
  }
  return out;
}
