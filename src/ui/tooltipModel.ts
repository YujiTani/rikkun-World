import type { ItemId, Rarity, Recipe } from '../contracts';
import { CRAFT_UI_SETTINGS, TOOL_NUMBERS, type CraftUiSettings, type ToolNumbers } from '../fx/craftConfig';
import { RARITY_COLOR } from '../drops/rarity';

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
}

export const STARS: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, superRare: 4 };

/** めずらしさの色（'#rrggbb'） */
export function rarityCss(r: Rarity): string {
  return `#${RARITY_COLOR[r].toString(16).padStart(6, '0')}`;
}

const PICKAXES = ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe'];
const BLADES = ['bokuto', 'katana', 'naginata', 'crystal_katana'];

/** ツールチップの中身（M4 §2.13 の表の順。当てはまるものだけ） */
export function buildTooltip(item: ItemId, d: TooltipDeps): TooltipData {
  const tools = d.tools ?? TOOL_NUMBERS;
  const ui = d.ui ?? CRAFT_UI_SETTINGS;
  const lines: string[] = [];
  const icons: TooltipIcon[] = [];
  const add = (text: string, icon: TooltipIcon) => {
    lines.push(text);
    icons.push(icon);
  };
  if (PICKAXES.includes(item)) {
    add(`ほる つよさ ${tools.toolPower[item] ?? 1}`, item);
    if ((tools.toolLevel[item] ?? 0) >= 1) add('てつ も ほれる', 'iron_ore');
  }
  if (BLADES.includes(item)) {
    add(`たたく つよさ ${tools.weaponDamage[item] ?? 1}`, item);
    if (item === 'naginata') add('とおくまで とどく', item);
  }
  if (item === 'yumi') {
    add('や を とばす', 'ya');
    add(`たたく つよさ ${tools.arrowDamage}`, 'ya');
  }
  if (item === 'ya') add('ゆみ で とばす', 'yumi');
  if (item === 'kabuto') add('たま から まもる', item);
  if (item === 'yoroi' || item === 'kote') add('こうげき から まもる', item);
  if (item === 'suneate') add('おちても いたくない', item);
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
  return { item, name: d.nameOf(item), rarity, stars: STARS[rarity], lines, icons };
}

/** ★ を数だけ並べた文字 */
export function starText(stars: number): string {
  return '★'.repeat(stars);
}
