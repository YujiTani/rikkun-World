import type { BlockId, ItemId } from '../../contracts';
// HOUSE-2A（#364）家の ①「そと」・あかりの しゅるい（ID と 名前の 型）。仕様 docs/design/HOUSE-2.md §2.3（むら・おしろ・こうざん）・§4.1。DOM・three なし。
// 形（かわら・しっくい…）は レシピで ふえる。1 つの 形に 3 つの 案（むら・おしろ・こうざん）が あり、しゅるいの id は `<形>_<案>`。
// いつもの 物（たいら・き・しょうじ・いえの と・ちょうちん）と 「なし」は はじめから えらべる。足す ときは ここと table.ts の 表（Record で 型が 落ちる）。

/** 案（むら ＝ A・おしろ ＝ B・こうざん ＝ C）。ポップアップの 行の 順 */
export const STYLES = ['mura', 'shiro', 'kozan'] as const;
export type Style = (typeof STYLES)[number];
/** 案の 名前（しゅるいの 名前の 前に つく） */
const STYLE_NAME: Readonly<Record<Style, string>> = { mura: 'むらの', shiro: 'おしろの', kozan: 'こうざんの' };

/** ①「そと」の ばしょ（左から。かざりは かざりを 1 つ おぼえる まで 出ない） */
export const PARTS = ['roof', 'wall', 'window', 'door', 'deco'] as const;
export type Part = (typeof PARTS)[number];

/** ばしょごとの 形の ならび（ポップアップの 行の 中の 順。§2.3 の 表）。しゃちほこ は 案が なく おしろの 行だけ */
export const PART_FORMS = {
  roof: ['sankaku', 'kawara', 'wara', 'kin'],
  wall: ['shikkui', 'renga', 'ishi'],
  window: ['suisho', 'maru'],
  door: ['tetsu'],
  deco: ['entotsu', 'noren', 'hanadan', 'shachi'],
} as const satisfies Record<Part, readonly string[]>;

type FormOf<P extends Part> = (typeof PART_FORMS)[P][number];
type Styled<F extends string> = `${F}_${Style}`;

export type RoofKind = 'none' | 'flat' | Styled<FormOf<'roof'>>;
export type WallKind = 'none' | 'ki' | Styled<FormOf<'wall'>>;
export type WindowKind = 'none' | 'shoji' | Styled<FormOf<'window'>>;
export type DoorKind = 'ie' | Styled<FormOf<'door'>>;
/** かざり: しゃちほこ は 案が ない（id は 'shachi' 1 つ）。ほかは `<形>_<案>` */
export type DecoKind = Styled<Exclude<FormOf<'deco'>, 'shachi'>> | 'shachi';
/** あかりの ならび（左から。ちょうちんは はじめから、ほかは レシピで） */
/** すいしょうの まど・あかり（名前の 定数。ブロック・アイテムの suisho とは べつの 意味） */
export const WINDOW_FORM_SUISHO = 'suisho' as const;
export const LIGHT_KIND_SUISHO = 'suisho' as const;
export const LIGHT_KINDS = ['lantern', 'hotaru', 'suisho'] as const;
export type LightKind = (typeof LIGHT_KINDS)[number];

/** ばしょごとの しゅるい（edit の kind・見本・保存の 値） */
export interface KindOf {
  roof: RoofKind;
  wall: WallKind;
  window: WindowKind;
  door: DoorKind;
  deco: DecoKind;
}

/** 案が ない 形（id は 形の まま） */
const STYLELESS: readonly string[] = ['shachi'];
export const isStyleless = (form: string): boolean => STYLELESS.includes(form);

/** 形の しゅるい id（しゃちほこ は 1 つ） */
export function kindsOfForm(form: string): string[] {
  return isStyleless(form) ? [form] : STYLES.map((s) => `${form}_${s}`);
}

/** ばしょごとの 「いつもの 行」（はじめから ある 物。左から。やね・かべ・まどは「なし」が いちばん 左、と・かざりに なしは ない） */
export const USUAL = {
  roof: ['none', 'flat'],
  wall: ['none', 'ki'],
  window: ['none', 'shoji'],
  door: ['ie'],
  deco: [],
} as const satisfies Record<Part, readonly string[]>;

/** はじめの 物（作りかけ・古い セーブの 読みかえ） */
export const DEFAULT_KIND = { roof: 'flat', wall: 'ki', window: 'shoji', door: 'ie' } as const satisfies Partial<KindOf>;
export const LIGHT_DEFAULT: LightKind = 'lantern';

/** ばしょの 名前（ヘルプの ばしょの ボタン） */
export const PART_NAME: Readonly<Record<Part, string>> = { roof: 'やね', wall: 'かべ', window: 'まど', door: 'と', deco: 'かざり' };

/** 形の 名前（案の 名前の あとに つく。しゃちほこ は 案が ないので そのまま） */
export const FORM_NAME: Readonly<Record<FormOf<Part>, string>> = {
  sankaku: 'さんかくの やね', kawara: 'かわらの やね', wara: 'わらぶきの やね', kin: 'きんの やね',
  shikkui: 'しっくいの かべ', renga: 'レンガの かべ', ishi: 'いしの かべ',
  suisho: 'すいしょうの まど', maru: 'まるい しょうじ',
  tetsu: 'てつの と',
  entotsu: 'レンガの えんとつ', noren: 'のれん', hanadan: 'はなだん', shachi: 'きんの しゃちほこ',
};
/** いつもの 物の 名前 */
const USUAL_NAME: Readonly<Record<string, string>> = { none: 'なし', flat: 'たいら', ki: 'き', shoji: 'しょうじ', ie: 'いえの と' };
/** あかりの 名前 */
export const LIGHT_NAME: Readonly<Record<LightKind, string>> = { lantern: 'ちょうちん', hotaru: 'ほたるいしの あかり', suisho: 'すいしょう ランプ' };

const STYLED = /^(.+)_(mura|shiro|kozan)$/;
/** しゅるい id → { 形, 案 }（案が なければ style は null） */
export function splitKind(kind: string): { form: string; style: Style | null } {
  const m = STYLED.exec(kind);
  return m ? { form: m[1]!, style: m[2] as Style } : { form: kind, style: null };
}

/** しゅるいの 名前（「こうざんの すいしょうの まど」。いつもの 物は そのまま） */
export function kindName(kind: string): string {
  const { form, style } = splitKind(kind);
  if (style) return `${STYLE_NAME[style]} ${(FORM_NAME as Record<string, string>)[form] ?? form}`;
  return (FORM_NAME as Record<string, string>)[kind] ?? USUAL_NAME[kind] ?? kind;
}

/** ばしょ part の 形（`sankaku` など）か。ほかの ばしょの 形は false */
const isFormOf = (part: Part, form: string): boolean => (PART_FORMS[part] as readonly string[]).includes(form);

/** しゅるい id の 形が 属する ばしょ（しゅるいの id が ばしょの 物か しらべる 用） */
function kindsOfPart(part: Part): string[] {
  return [...(USUAL[part] as readonly string[]), ...PART_FORMS[part].flatMap(kindsOfForm)];
}

/** 全部の 知られた しゅるい id（ばしょごと） */
export const ALL_KINDS: Readonly<Record<Part, readonly string[]>> = {
  roof: kindsOfPart('roof'), wall: kindsOfPart('wall'), window: kindsOfPart('window'), door: kindsOfPart('door'), deco: kindsOfPart('deco'),
};

/**
 * 保存の 古い 形の id を 今の 形に（2A の 前の 試作は 案が ない `kawara` など → 案 むら）。知らない id は null。
 * deco の しゃちほこ は そのまま。いつもの 物も そのまま
 */
export function normalizeKind(part: Part, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const all = ALL_KINDS[part];
  if (all.includes(raw)) return raw;
  if (isFormOf(part, raw) && !isStyleless(raw)) return `${raw}_mura`;
  return null;
}

// ---- HOUSE-2B（#364）: しゅるい → 世界に 置く ブロックと ほると 手に 入る アイテム（ブロックの 番号は 形ごと。案は 家の 記録から 場所で 引く）
/** 家の しゅるいを もつ ばしょ（あかりも） */
export type LookPart = Part | 'light';

/** いつもの 物と「なし」の ブロック・アイテム（ばしょ → しゅるい → 答え）。「なし」の かべは 4 すみの 柱（アイテムは なし） */
const USUAL_BLOCKS: Readonly<Record<LookPart, Readonly<Record<string, readonly string[]>>>> = {
  roof: { none: [], flat: ['house_roof'] },
  wall: { none: ['lk_wall_pillar'], ki: ['house_wall'] },
  window: { none: [], shoji: ['shoji'] },
  door: { ie: ['house_door', 'house_door_top', 'house_door_open', 'house_door_open_top'] },
  deco: {},
  light: { lantern: ['lantern'] },
};
const USUAL_ITEM: Readonly<Record<LookPart, Readonly<Record<string, string | null>>>> = {
  roof: { none: null, flat: 'house_roof' },
  wall: { none: null, ki: 'house_wall' },
  window: { none: null, shoji: 'shoji' },
  door: { ie: 'house_door' },
  deco: {},
  light: { lantern: 'lantern' },
};
/** 形ごとの ブロックの 名前の 前（`lk_<ばしょ>_<形>`。やね・かべ・まど・かざり。とは 戸の 4 つ） */
const lkId = (part: LookPart, form: string): string => `lk_${part}_${form}`;
const LK_DOOR = ['lk_door_tetsu', 'lk_door_tetsu_top', 'lk_door_tetsu_open', 'lk_door_tetsu_open_top'] as const;

/** その しゅるいの 世界の ブロック id ぜんぶ（やね・まどの なしは []。かべの なしは 柱）。知らない しゅるいは 投げる（だまって 空に しない） */
export function kindBlocks(part: LookPart, kind: string): BlockId[] {
  const usual = USUAL_BLOCKS[part][kind];
  if (usual) return [...usual] as BlockId[];
  if (part === 'door') return [...LK_DOOR] as BlockId[];
  if (part === 'light') return [`lk_light_${kind}`] as BlockId[];
  return [lkId(part, splitKind(kind).form)] as BlockId[];
}

/** ほると 手に 入る アイテム（案ごとに 別）。やね・まどの なし と かべの なし（柱）は null */
export function kindItem(part: LookPart, kind: string): ItemId | null {
  const u = USUAL_ITEM[part][kind];
  if (u !== undefined) return u as ItemId | null;
  return `${part}_${kind}` as ItemId;
}

/** あかりの しゅるい 全部（ALL_KINDS と そろえて 引く 用） */
const kindsOfLookPart = (part: LookPart): readonly string[] => (part === 'light' ? LIGHT_KINDS : ALL_KINDS[part]);

/** ブロック id → その ブロックを 使う しゅるいの うち さいしょの 1 つ（家の 記録が ない とき の 代わりの 案。むら） */
const FIRST_KIND_OF_BLOCK: ReadonlyMap<string, { part: LookPart; kind: string }> = (() => {
  const m = new Map<string, { part: LookPart; kind: string }>();
  for (const part of [...PARTS, 'light'] as const) for (const kind of kindsOfLookPart(part)) for (const b of kindBlocks(part, kind)) if (!m.has(b)) m.set(b, { part, kind });
  return m;
})();
export function firstKindOfBlock(id: string): { part: LookPart; kind: string } | null {
  return FIRST_KIND_OF_BLOCK.get(id) ?? null;
}

/** 家の 記録の しゅるい id → その しゅるいの ブロックの ばしょ（ほる とき ブロックが しゅるいと あって いるか 見る） */
export function partOfLook(kind: string): LookPart | null {
  for (const part of [...PARTS, 'light'] as const) if (kindsOfLookPart(part).includes(kind)) return part;
  return null;
}

/** やねの 上に のる かざりの 形（家の 箱が 1 段 高く なる。仕様 §4.2）。のれん・はなだんは かべに つく ので 高さは かわらない */
const ROOF_TOP_FORMS: readonly string[] = ['entotsu', 'shachi'];
export const isRoofTopDeco = (kind: string): boolean => ROOF_TOP_FORMS.includes(splitKind(kind).form);
