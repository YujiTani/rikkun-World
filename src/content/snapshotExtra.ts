import { createCraft2Settings, createLiveSettings, createM6Settings, createM7Settings, createW2Settings } from '../contracts';
import { ACHIEVEMENT_DEFS, BAKE_RECIPE_NAMES, CATEGORY_ORDER, CRAFT_RECIPE_NAMES } from '../achievements/defs';
import { DEFAULT_CAMERA_CONFIG } from '../camera/config';
import { createCombatConfig } from '../combat/config';
import { CRAFT_DEFAULTS, ARMOR_SLOTS, createCraftConfig } from '../craft/config';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { BAKE_RECIPES, CRAFT_RECIPES, baseRecipeId } from '../craft/recipes';
import { DIG_DEFAULTS, FARM_BREAK_DROP, NO_DROP_BLOCKS, createDigConfig } from '../dig/config';
import { DROP } from '../drops/DropField';
import { ITEM_RARITY_SETTINGS, RARITY_ORDER, RARITY_TIERS, defaultDropMax } from '../drops/rarity';
import { createAudioSettings } from '../fx/audioConfig';
import { FX_SETTINGS } from '../fx/config';
import { CRAFT_UI_SETTINGS } from '../fx/craftConfig';
import { RELEASE } from '../gasha/releaseTuning';
import { ITEM_TYPES } from '../inventory/items';
import { LEVEL_DEFAULTS } from '../level/config';
import { PLAYER_DEFAULTS } from '../player/config';
import { TUNE as GASHA_BIG } from '../gasha/gashaBigTuning';
import { TUNE as GASHA_GIRL } from '../gasha/gashaGirlTuning';
import { BLOCK_IDS_V1 } from '../save/blockIdsV1';
import { createScreenSettings } from '../screen/config';
import { createTimeSettings } from '../time/config';
import { createToolConfig } from '../tools/config';
import { BOOK_CHAPTERS, BOOK_ITEMS } from '../ui/book/bookData';
import { CLOCK_PHASES } from '../ui/clockModel';
import { CATEGORY_ITEMS, ITEM_CATEGORIES } from '../ui/itemCategory';
import { BLOCK_INDEX, BLOCK_TYPES } from '../world/blocks/blockTypes';
import { COUNTRY_TABLE } from '../world/gen/countryTable';
import { DEFAULT_MICRO_R } from '../world/render/voxel/tier';
import { AI_CONST, ATTACK_DAMAGE, KIND_AI, YOKAI_DROPS, createYokaiConfig } from '../yokai/ai/config';
import { SENSE } from '../yokai/ai/senseTuning';
import { YOKAI_DRAW_ORDER } from '../yokai/countryPick';
import { YOKAI_ORDER } from '../yokai';
import { STRENGTH_LEVELS, STRENGTH_MUL, YOKAI_STATS } from '../yokai/stats';
import { norm } from './snapshot';

/**
 * 内容の写し・その 2（#310 段階 0c）。`snapshot.ts`（アイテム・妖怪ごとの値）で拾えない「表まるごと」「並び順」「設定の初期値」「id の一覧」を写す。
 * これも値の写しは持たず、既存の表を「読んで」集める。ファイルごとに __snapshots__/ の JSON と比べる。
 */

const sorted = (a: readonly string[]): string[] => [...a].sort();

/** 1. ブロック */
export function buildBlocksSnapshot(): object {
  return norm({
    // 配列の順番が内部の番号（保存データに入る）。並びは そのまま残す
    BLOCK_TYPES,
    BLOCK_INDEX,
    BLOCK_IDS_V1,
    DIG_DEFAULTS,
    FARM_BREAK_DROP,
    NO_DROP_BLOCKS,
    // CraftSystem.fixedDrop(id) が読む表
    fixedDrop: CRAFT_DEFAULTS.fixedDrop,
  }) as object;
}

/** 2. ドロップ */
export function buildDropsSnapshot(): object {
  return norm({
    RARITY_TIERS,
    dropMax: defaultDropMax(),
    itemRarity: ITEM_RARITY_SETTINGS.itemRarity,
    DROP,
    YOKAI_DROPS,
    nushiDrops: createW2Settings().nushiDrops,
  }) as object;
}

/** 3. 妖怪・ボスの数（調整表） */
export function buildTuningSnapshot(): object {
  return norm({
    AI_CONST,
    KIND_AI,
    ATTACK_DAMAGE,
    SENSE,
    YOKAI_STATS,
    STRENGTH_MUL,
    LEVEL_DEFAULTS,
    COUNTRY_TABLE,
    NINJA_TUNING,
    RELEASE,
    gashaBig: GASHA_BIG,
    gashaGirl: GASHA_GIRL,
  }) as object;
}

/** 4. 並び順（配列のまま。順番が写る） */
export function buildOrderSnapshot(): object {
  const o = {
    ITEM_TYPES: ITEM_TYPES.map((t) => t.id),
    CRAFT_RECIPES: CRAFT_RECIPES.map((r) => r.id),
    BAKE_RECIPES: BAKE_RECIPES.map((r) => r.id),
    ITEM_CATEGORIES,
    CATEGORY_ITEMS,
    fuelOrder: CRAFT_DEFAULTS.fuelOrder,
    ARMOR_SLOTS,
    BOOK_CHAPTERS: BOOK_CHAPTERS.map((c) => c.id),
    BOOK_ITEMS: BOOK_ITEMS.map((i) => `${i.chapter}/${i.id}`),
    ACHIEVEMENT_CATEGORY_ORDER: CATEGORY_ORDER,
    ACHIEVEMENT_DEFS: ACHIEVEMENT_DEFS.map((d) => d.id),
    CRAFT_RECIPE_NAMES,
    BAKE_RECIPE_NAMES,
    RARITY_ORDER,
    YOKAI_ORDER,
    YOKAI_DRAW_ORDER,
    STRENGTH_LEVELS,
  };
  return norm(o) as object; // norm は配列の順を変えない
}

/**
 * 5. 設定フック（`__rikkun.settings`）の入れ物の初期値。src/main.ts の createSettingsHook に渡す順。
 * main.ts を読みこむと描画が動くので、それぞれを作る関数・定数を直接読む。
 * main.ts でしか作っていない入れ物（dig の名前の絞りこみ・hint・aimCfg・renderer.config）は、同じ形を ここに書き写している（main.ts を変えたら ここも直す）。
 */
export function buildSettingsSnapshot(): object {
  const digNames = ['reach', 'hardness', 'harvestLevel', 'handPower', 'handLevel', 'digCooldown', 'placeRepeatTicks', 'digDecayRate', 'crackStages', 'rarity', 'dropMax'] as const;
  const dig = createDigConfig();
  const craft = createCraftConfig();
  const craftUi = { ...CRAFT_UI_SETTINGS };
  return norm({
    // createSettingsHook の第 1・2 引数
    player: PLAYER_DEFAULTS,
    camera: DEFAULT_CAMERA_CONFIG,
    // extras（main.ts の並び）
    dig: Object.fromEntries(digNames.map((n) => [n, dig[n]])),
    itemRarity: ITEM_RARITY_SETTINGS,
    craft: Object.fromEntries(Object.entries(craft).filter(([k]) => k !== 'fuelOrder')),
    tool: createToolConfig(),
    craftUi: Object.fromEntries(Object.entries(craftUi).filter(([k]) => !['bakeTicks', 'pickupLogTicks', 'pickupLogMax', 'fuelOrder'].includes(k))),
    craft2: createCraft2Settings(),
    screen: createScreenSettings(),
    m6: createM6Settings(),
    m7: createM7Settings(),
    w2: createW2Settings(),
    hint: { actionHint: true },
    aimCfg: { aimAssistDeg: 4 },
    live: createLiveSettings(),
    clockPhases: { clockPhases: CLOCK_PHASES },
    fx: FX_SETTINGS,
    audio: createAudioSettings(),
    combat: createCombatConfig(),
    yokai: createYokaiConfig(),
    time: createTimeSettings(),
    renderer: { microRadius: DEFAULT_MICRO_R },
  }) as object;
}

/** 6. id の一覧（保存される文字列の形）。並びは order.json。ここは中身だけを並べかえて比べる */
export function buildIdsSnapshot(): object {
  const stat = new Set<string>(ACHIEVEMENT_DEFS.map((d) => d.stat));
  // 実績の定義に出てこなくても、遊ぶと記録される形（AchievementSystem が `<種類>:<id>` で書く）
  for (const r of CRAFT_RECIPES) stat.add(`craft:${baseRecipeId(r.id)}`);
  for (const r of BAKE_RECIPES) stat.add(`bake:${r.id}`);
  for (const t of BLOCK_TYPES) if (t.id !== 'air') { stat.add(`break:${t.id}`); stat.add(`place:${t.id}`); }
  for (const t of ITEM_TYPES) stat.add(`obtain:${t.id}`);
  for (const k of Object.keys(YOKAI_STATS)) stat.add(`defeat:${k}`);
  return {
    itemIds: sorted(ITEM_TYPES.map((t) => t.id)),
    recipeIds: sorted([...CRAFT_RECIPES, ...BAKE_RECIPES].map((r) => r.id)),
    baseRecipeOf: Object.fromEntries([...CRAFT_RECIPES, ...BAKE_RECIPES].filter((r) => baseRecipeId(r.id) !== r.id).map((r) => [r.id, baseRecipeId(r.id)]).sort(([a], [b]) => (a < b ? -1 : 1))),
    blockIds: sorted(BLOCK_TYPES.map((t) => t.id)),
    achievementIds: sorted(ACHIEVEMENT_DEFS.map((d) => d.id)),
    statKeys: sorted([...stat]),
  };
}
