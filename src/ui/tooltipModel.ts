import { isBowItem } from '../content/items/ids';
import { LIVE_SETTING_DEFAULTS, seedKindOfItem, vegKindOfItem, type ItemId, type ItemStack, type Rarity, type Recipe } from '../contracts';
import { CRAFT_UI_SETTINGS, TOOL_NUMBERS, type CraftUiSettings, type ToolNumbers } from '../fx/craftConfig';
import { RARITY_COLOR, RARITY_TIERS } from '../drops/rarity';
import { ITEM_INFO, SPECIAL_HEAD } from '../craft/info/table';
import { planNameOf } from '../inventory/planName';
import { BLADE_LIKE_ITEMS } from '../tools/bladeSets';
import { wearView } from './wearGauge';

/** ツールチップの行につく小さな絵。アイテムの id か、かなづち・時計 */
export type TooltipIcon = ItemId | 'hammer' | 'clock';

export interface TooltipData {
  item: ItemId;
  name: string;
  rarity: Rarity;
  stars: number;
  lines: string[];
  /** lines と同じ数の絵 */
  icons: TooltipIcon[];
  /** M6: 名前の下の「なにに つかう」の文（説明の表と同じ。見せるのは 1 行目まで） */
  desc: string;
  /** NINJA-1: 虹色の「とくべつな ちから」の 文（レジェンダリーの 物だけ。無ければ null） */
  special: string | null;
  /** 虹色の 見出し（`とくべつな ちから`） */
  specialHead: string;
}

export interface TooltipDeps {
  nameOf(item: ItemId): string;
  rarityOf(item: ItemId): Rarity;
  /** 置けるか（placeBlock が null でない） */
  placeable(item: ItemId): boolean;
  /** つくる 18 こ + やく 4 こ（CraftSystem.recipes()） */
  recipes(): readonly Recipe[];
  tools?: ToolNumbers;
  ui?: CraftUiSettings;
  /** LIVE-3: やいた もも にく で もどる 体力（なければ 既定） */
  meatHeal?: () => number;
}

export const STARS: Record<Rarity, number> = Object.fromEntries(RARITY_TIERS.map((t) => [t.id, t.stars])) as Record<Rarity, number>;

/** めずらしさの色（'#rrggbb'） */
export function rarityCss(r: Rarity): string {
  return `#${RARITY_COLOR[r].toString(16).padStart(6, '0')}`;
}

const isPickaxe = (item: string): boolean => item.endsWith('_pickaxe');
const isAxe = (item: string): boolean => item.endsWith('_axe');

/** ツールチップの中身（M4 §2.13 の表の順。当てはまるものだけ） */
export function buildTooltip(item: ItemId, d: TooltipDeps, stack?: ItemStack | null): TooltipData {
  const tools = d.tools ?? TOOL_NUMBERS;
  const ui = d.ui ?? CRAFT_UI_SETTINGS;
  const lines: string[] = [];
  const icons: TooltipIcon[] = [];
  const add = (text: string, icon: TooltipIcon) => {
    lines.push(text);
    icons.push(icon);
  };
  if (isPickaxe(item)) {
    add(`ほる つよさ ${tools.toolPower[item] ?? 1}`, item);
    if ((tools.toolLevel[item] ?? 0) >= 1) add('てつ も ほれる', 'iron_ore');
    add('いし に つよい', item); // BAL-D §5: あう道具の 1 行
  }
  if (isAxe(item)) {
    add(`ほる つよさ ${tools.toolPower[item] ?? 1}`, item);
    add('き に つよい', item);
  }
  if (BLADE_LIKE_ITEMS.has(item)) {
    // WEAPON-7 PR3: 虹は その 1 本の つよさ（ヌシが おとした ときに 決まる）
    const own = stack && stack.item === item && typeof stack.power === 'number' ? stack.power : null;
    add(`たたく つよさ ${own ?? tools.weaponDamage[item] ?? 1}`, item);
    if (item === 'naginata') add('とおくまで とどく', item);
  }
  if (isBowItem(item)) {
    add('や を とばす', 'ya');
    add(`たたく つよさ ${tools.arrowDamage}`, 'ya');
  }
  if (item === 'ya') add('ゆみ で とばす', 'yumi');
  if (item.endsWith('kabuto')) add('たま から まもる', item);
  if (item.endsWith('yoroi') || item.endsWith('kote')) add('こうげき から まもる', item);
  if (item.endsWith('suneate')) add('おちても いたくない', item);
  if (item === 'ninja_zukin') add('たま から まもる', item);
  if (item === 'ninja_shozoku' || item === 'ninja_tekko') add('こうげき から まもる', item);
  if (item === 'samurai_jingasa') add('たま から まもる', item);
  if (item === 'samurai_haori' || item === 'samurai_tekko') add('こうげき から まもる', item);
  if (item === 'samurai_geta') add('おちても いたくない', item);
  // 足袋の「おちても いたく ない」は とくべつな ちから（special）へ うつった
  if (item === 'kuwa') {
    add(`ほる つよさ ${tools.toolPower[item] ?? 1}`, item);
    add('つち に つよい', item);
    add('はたけ を つくる', item);
  }
  if (item === 'watering_can' || item === 'long_watering_can') add('はたけ に みず を まく', item);
  if (item === 'bucket') add('みず を くむ', item);
  if (item === 'water_bucket') add('みず を おく', item);
  if (item === 'sprinkler') add('まわり の はたけ を しめらせる', item);
  if (seedKindOfItem(item) !== null) add('はたけ に まく', item);
  if (item === 'mushi') add('にわとり に あげる', item);
  if (item === 'mushi_ami') add('き から むし を とる', item);
  if (item === 'toriya') add('おける', item); // 5×5 の 小屋 に なる（ブロック では ない）
  if (vegKindOfItem(item) !== null || item === 'egg') add('たべると ハート が もどる', item);
  if (item === 'momo_yaki') add(`もどる ハート ${(d.meatHeal?.() ?? LIVE_SETTING_DEFAULTS.meatHeal) / 2}`, item); // LIVE-3: 10 = ハート 5 こ
  // WEAPON-2 §4.6 (8): たいきゅうで へる 道具は 「たいきゅう のこり / 新品」（へった 量が 分からない ときは 新品）
  const wv = wearView(stack && stack.item === item ? stack : { item, count: 1 });
  if (wv) add(`たいきゅう ${wv.left} / ${wv.max}`, item);
  if (d.placeable(item)) add('おける', item);
  if (item === 'furnace') add('みぎクリック で やく', 'furnace');
  if (ui.fuelOrder.includes(item)) add('ねんりょう に なる', 'furnace');
  const recipes = d.recipes();
  if (recipes.some((r) => r.station === 'furnace' && r.inputs.some((i) => i.item === item))) {
    add('かまど で やける', 'furnace');
  }
  if (recipes.some((r) => r.station === 'craft' && r.inputs.some((i) => i.item === item))) {
    add('つくる ざいりょう', 'hammer');
  }
  if (recipes.some((r) => r.output.item === item && !r.works)) add('もうすぐ つかえる', 'clock');
  const rarity = d.rarityOf(item);
  const name = (stack && stack.item === item ? planNameOf(stack) : null) ?? d.nameOf(item); // HOUSE-1B: せっけいずは「<名前>の せっけいず」
  return { item, name, rarity, stars: STARS[rarity], lines, icons, desc: ITEM_INFO[item]?.use ?? '', special: ITEM_INFO[item]?.special ?? null, specialHead: SPECIAL_HEAD };
}

/** ★ を数だけ並べた文字 */
export function starText(stars: number): string {
  return '★'.repeat(stars);
}
