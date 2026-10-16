import type { DamageKind, ItemClass, ItemId, Rarity, Recipe, YokaiKind } from '../../contracts';
import { M6_SETTING_DEFAULTS, M7_SETTING_DEFAULTS, W2_SETTING_DEFAULTS, seedKindOfItem, vegKindOfItem, type CropKind } from '../../contracts';
import { DIG_DEFAULTS } from '../../dig/config';
import { itemRarity, rarityTier } from '../../drops/rarity';
import { createCombatConfig } from '../../combat/config';
import { TOOL_DEFAULTS } from '../../tools/config';
import { itemClassOf } from '../../tools/durability';
import { YOKAI_DROPS } from '../../yokai/ai/config';
import { CRAFT_DEFAULTS } from '../config';
import { ALL_RECIPES } from '../recipes';
import { ARMOR_KIND, CLASS_TEXT, ITEM_INFO, ORB_SOURCE, STAT_MAX, YOKAI_NAME, type ButtonKey } from './table';

export interface StatRow {
  key: string;
  label: string;
  value: number | string;
  max?: number;
  /** メーターの右の くらべ（`すで は 1`） */
  compare?: string;
}

/** `craft.info(item)` の形（M6 §6.1）。画面・ツールチップと同じデータ */
export interface ItemInfoData {
  item: ItemId;
  name: string;
  rarity: Rarity;
  stars: number;
  rarityWord: string;
  use: string;
  how: string;
  buttons: ButtonKey[];
  later: string | null;
  source: string;
  usedIn: string[];
  sourceYokai: YokaiKind[];
  stats: StatRow[];
  /** WEAPON-2 §4.6 (8): なかま と その 文（`つかうと へって、0 で こわれる` など） */
  itemClass: ItemClass;
  classText: string;
}

/** 説明の数の元（設定。画面を開くたびに読み直す） */
export interface InfoNumbers {
  toolPower: Partial<Record<string, number>>;
  toolLevel: Partial<Record<string, number>>;
  weaponDamage: Partial<Record<string, number>>;
  weaponReach: Partial<Record<string, number>>;
  weaponTicks: Partial<Record<string, number>>;
  arrowDamage: number;
  arrowRange: number;
  armorValue: Partial<Record<string, Record<DamageKind, number>>>;
  punchDamage: number;
  punchReach: number;
  punchTicks: number;
  handPower: number;
  handLevel: number;
  harvestLevel(item: string): number;
  tansuSlots: number;
  /** M7: かわいた はたけ で 0 → 3 に かかる にち（なければ 初期値） */
  farmGrowDays?: Readonly<Record<CropKind, number>>;
  /** M7-2: じょうろ の 入る 回数（なければ 初期値） */
  farmCanCapacity?: Readonly<Record<string, number>>;
  /** WEAPON-2: 新品の たいきゅう（設定 `toolDurability`。なければ 初期値） */
  toolDurability?: Partial<Record<ItemId, number>>;
}

export interface InfoDeps {
  recipes(): readonly Recipe[];
  nameOf(item: ItemId): string;
  numbers(): InfoNumbers;
  rarityOf?(item: ItemId): Rarity;
  dropTable?: Readonly<Record<YokaiKind, readonly { item: ItemId }[]>>;
  /** WEAPON-2: なかま（なければ `itemClassOf`） */
  classOf?: (item: ItemId) => ItemClass;
}

/** 初期値の数（設定がつながっていないとき・テスト用） */
export function defaultInfoNumbers(): InfoNumbers {
  const c = createCombatConfig() as unknown as { punchDamage: number; punchReach: number; punchTicks: number };
  return {
    toolPower: TOOL_DEFAULTS.toolPower,
    toolLevel: TOOL_DEFAULTS.toolLevel,
    weaponDamage: TOOL_DEFAULTS.weaponDamage,
    weaponReach: TOOL_DEFAULTS.weaponReach,
    weaponTicks: TOOL_DEFAULTS.weaponTicks,
    arrowDamage: TOOL_DEFAULTS.arrowDamage,
    arrowRange: TOOL_DEFAULTS.arrowRange,
    armorValue: CRAFT_DEFAULTS.armorValue,
    punchDamage: c.punchDamage,
    punchReach: c.punchReach,
    punchTicks: c.punchTicks,
    handPower: DIG_DEFAULTS.handPower,
    handLevel: DIG_DEFAULTS.handLevel,
    harvestLevel: (item) => (DIG_DEFAULTS.harvestLevel as Record<string, number>)[item] ?? 0,
    tansuSlots: M6_SETTING_DEFAULTS.tansuSlots,
  };
}

const PICKAXES = ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe'];

/** 「なにに つかう」の 1 行目（ツールチップの `desc`）。表だけから作る */
export function descOf(item: ItemId): string {
  return ITEM_INFO[item]?.use ?? '';
}

/** 数を文字に（4.5 → `4.5`、3 → `3`） */
const numText = (n: number) => String(Math.round(n * 100) / 100);

export interface ItemInfoSource {
  info(item: ItemId): ItemInfoData;
  /** 説明の表に載っているアイテムの id（表の順） */
  items(): string[];
}

export function createItemInfo(d: InfoDeps): ItemInfoSource {
  const rarityOf = d.rarityOf ?? itemRarity;
  const drops = d.dropTable ?? YOKAI_DROPS;

  const sourceYokai = (item: ItemId): YokaiKind[] =>
    (Object.keys(drops) as YokaiKind[]).filter((k) => drops[k].some((r) => r.item === item));

  const sourceText = (item: ItemId, n: InfoNumbers): string => {
    if (item === 'yokai_orb') return ORB_SOURCE;
    const parts: string[] = [];
    const row = ITEM_INFO[item];
    if (row?.dig) {
      let note = '';
      const need = n.harvestLevel(item);
      if (need > n.handLevel) {
        const p = PICKAXES.find((id) => (n.toolLevel[id] ?? n.handLevel) >= need);
        if (p) note = `（${d.nameOf(p as ItemId)} から）`;
      }
      parts.push(`${d.nameOf(item)} を ほる${note}`);
    }
    // M7: たね・やさい の 手に入れかた（くさ・やせい・ふるい はたけ・妖怪）
    if (seedKindOfItem(item) !== null) parts.push('くさ を こわす・やせいの やさい・ふるい はたけ の たんす');
    if (vegKindOfItem(item) !== null) parts.push('はたけ で しゅうかく・やせいの やさい');
    const ys = sourceYokai(item);
    if (ys.length > 0) parts.push(`${ys.map((k) => YOKAI_NAME[k]).join('・')} が おとす`);
    if (item === 'water_bucket') parts.push(`${d.nameOf('bucket')} で みず を くむ`);
    for (const r of d.recipes()) {
      if (r.output.item !== item) continue;
      if (r.station === 'furnace') {
        const i = r.inputs[0];
        parts.push(`${d.nameOf(i.item)} ${i.count} を かまど で やく`);
      } else {
        parts.push(`${r.inputs.map((i) => `${d.nameOf(i.item)} ${i.count}`).join('・')} で つくる`);
      }
    }
    return parts.join('・');
  };

  const classOf = d.classOf ?? itemClassOf;
  /** たいきゅうで へる 道具は `たいきゅう 250`（新品の 値。メーターは 使わない） */
  const durRow = (item: ItemId, n: InfoNumbers): StatRow[] => {
    const v = (n.toolDurability ?? W2_SETTING_DEFAULTS.toolDurability)[item];
    return typeof v === 'number' && v > 0 ? [{ key: 'durability', label: 'たいきゅう', value: v }] : [];
  };

  const statRows = (item: ItemId, n: InfoNumbers): StatRow[] => {
    const seed = seedKindOfItem(item);
    if (seed !== null) {
      // そだつ はやさ（トマト 3・たまねぎ／なす 2・かぼちゃ 1。最大 3）
      const days = (n.farmGrowDays ?? M7_SETTING_DEFAULTS.farmGrowDays.dry)[seed];
      return [{ key: 'grow', label: 'そだつ はやさ', value: days <= 1.35 ? 3 : days <= 2.25 ? 2 : 1, max: 3 }];
    }
    const kind = ITEM_INFO[item]?.stats;
    if (!kind) return [];
    switch (kind) {
      case 'pickaxe':
        return [
          {
            key: 'dig',
            label: 'ほる つよさ',
            value: n.toolPower[item] ?? n.handPower,
            max: STAT_MAX.dig,
            compare: `すで は ${numText(n.handPower)}`,
          },
          {
            key: 'iron',
            label: 'てつ を ほれる',
            value: (n.toolLevel[item] ?? n.handLevel) >= n.harvestLevel('iron_ore') ? '○' : '×',
          },
          ...durRow(item, n),
        ];
      case 'blade': {
        const ticks = n.weaponTicks[item] ?? n.punchTicks;
        return [
          {
            key: 'damage',
            label: 'たたく つよさ',
            value: n.weaponDamage[item] ?? n.punchDamage,
            max: STAT_MAX.damage,
            compare: `すで は ${numText(n.punchDamage)}`,
          },
          { key: 'reach', label: 'とどく', value: n.weaponReach[item] ?? n.punchReach },
          { key: 'speed', label: 'はやさ', value: ticks <= 30 ? 'ふつう' : 'ゆっくり' },
          ...durRow(item, n),
        ];
      }
      case 'bow':
        return [
          { key: 'damage', label: 'や の つよさ', value: '1〜3' },
          ...durRow(item, n),
          { key: 'draw', label: 'ながく ひくほど', value: 'とおくへ とぶ' },
        ];
      case 'arrow':
        return [{ key: 'damage', label: 'つよさ', value: n.arrowDamage, max: STAT_MAX.damage }];
      case 'armor': {
        const k = ARMOR_KIND[item] ?? 'normal';
        return [{ key: 'guard', label: 'まもる つよさ', value: n.armorValue[item]?.[k] ?? 0, max: STAT_MAX.guard }, ...durRow(item, n)];
      }
      case 'can':
        return [{ key: 'capacity', label: 'まける かず', value: ((n.farmCanCapacity ?? M7_SETTING_DEFAULTS.farmCanCapacity) as Readonly<Record<string, number>>)[item] ?? 0 }];
      case 'tansu':
        return [{ key: 'slots', label: 'しまえる マス', value: n.tansuSlots }];
    }
  };

  return {
    items: () => Object.keys(ITEM_INFO),
    info(item: ItemId): ItemInfoData {
      const n = d.numbers();
      const row = ITEM_INFO[item];
      const rarity = rarityOf(item);
      return {
        item,
        name: d.nameOf(item),
        rarity,
        stars: rarityTier(rarity).stars,
        rarityWord: rarityTier(rarity).word,
        use: row?.use ?? '',
        how: row?.how ?? '',
        buttons: row ? [...row.buttons] : [],
        later: row?.later ?? null,
        source: sourceText(item, n),
        usedIn: d.recipes().filter((r) => r.inputs.some((i) => i.item === item)).map((r) => r.id),
        sourceYokai: sourceYokai(item),
        stats: statRows(item, n),
        itemClass: classOf(item),
        classText: CLASS_TEXT[classOf(item)],
      };
    },
  };
}

/** 初期値と M4 のレシピで作る（設定がつながっていないとき・テスト用） */
export function createDefaultItemInfo(nameOf: (item: ItemId) => string): ItemInfoSource {
  return createItemInfo({ recipes: () => ALL_RECIPES, nameOf, numbers: defaultInfoNumbers });
}
