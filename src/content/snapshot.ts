import {
  LEGENDARY_DEFAULTS, LIVE_SETTING_DEFAULTS, M6_SETTING_DEFAULTS, M7_SETTING_DEFAULTS, W2_SETTING_DEFAULTS, CRAFT2_SETTING_DEFAULTS,
  type YokaiKind,
} from '../contracts';
import { ARMOR_SLOT_OF, CRAFT_DEFAULTS } from '../craft/config';
import { ITEM_INFO } from '../craft/info/table';
import { YOKAI_NAME } from '../craft/info/table';
import { ALL_RECIPES } from '../craft/recipes';
import { DIG_DEFAULTS } from '../dig/config';
import { itemRarity } from '../drops/rarity';
import { TOOL_NUMBERS } from '../fx/craftConfig';
import { ITEM_TYPES } from '../inventory/items';
import { LEVEL_DEFAULTS } from '../level/config';
import { TOOL_DEFAULTS } from '../tools/config';
import { BLADE_ITEMS, BLADE_LIKE_ITEMS } from '../tools/bladeSets';
import { itemClassOf } from '../tools/durability';
import { itemCategory } from '../ui/itemCategory';
import { COUNTRY_TABLE } from '../world/gen/countryTable';
import { KIND_AI, ATTACK_DAMAGE, YOKAI_DROPS, createYokaiConfig } from '../yokai/ai/config';
import { SENSE } from '../yokai/ai/senseTuning';
import { STRENGTH_LEVELS, YOKAI_STATS, yokaiStats, yokaiStrength } from '../yokai/stats';
import { YOKAI_VARIANT_COLORS } from '../yokai/variants';

/**
 * 内容の写し（#310）。全アイテム・全妖怪の値を、既存の表から「読んで」ひとつの形に集める。
 * 値の写しは持たない。表を 1 か所にまとめる整理のあとも、この出力が変わらないことで同じ値だと確かめる。
 */

/** 値を再帰的にキー順へそろえる（Set は並べた配列、関数は捨てる。Infinity・NaN・undefined は JSON で null になって区別できないので文字にする） */
export function norm(v: unknown, depth = 0): unknown {
  if (typeof v === 'number' && !Number.isFinite(v)) return Number.isNaN(v) ? 'NaN' : v > 0 ? 'Infinity' : '-Infinity';
  if (v === undefined) return 'undefined';
  if (v instanceof Set) return [...v].map((x) => norm(x, depth + 1)).sort();
  if (v instanceof Map) return norm(Object.fromEntries(v), depth);
  if (Array.isArray(v)) return v.map((x) => norm(x, depth + 1));
  if (v && typeof v === 'object') {
    if (depth > 8) return '…';
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x !== 'function') o[k] = norm(x, depth + 1);
    }
    return o;
  }
  return v;
}

/** 表から「キーが id と同じ」ところを探し、見つけた道すじ → 値 を足す（Set・配列は含まれるかどうか） */
function pick(out: Record<string, unknown>, src: string, root: unknown, id: string): void {
  const seen = new WeakSet<object>();
  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > 6 || v === null || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (v instanceof Set) { if (v.has(id)) out[`${src}${path}`] = true; return; }
    if (Array.isArray(v)) {
      if (v.includes(id)) out[`${src}${path}`] = true;
      v.forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
      return;
    }
    for (const [k, x] of Object.entries(v)) {
      if (k === id) out[`${src}${path}.${k}`] = norm(x);
      else walk(x, `${path}.${k}`, depth + 1);
    }
  };
  walk(root, '', 0);
}

/** アイテムの id を「キー」に持つ設定の表（出どころの名前つき） */
const ITEM_SOURCES: Record<string, unknown> = {
  TOOL_DEFAULTS, TOOL_NUMBERS, CRAFT_DEFAULTS, ARMOR_SLOT_OF, ITEM_INFO, DIG_DEFAULTS,
  M6: M6_SETTING_DEFAULTS, M7: M7_SETTING_DEFAULTS, W2: W2_SETTING_DEFAULTS, LIVE: LIVE_SETTING_DEFAULTS, CRAFT2: CRAFT2_SETTING_DEFAULTS,
  LEGENDARY: LEGENDARY_DEFAULTS, BLADES: BLADE_LIKE_ITEMS, BLADE_ITEMS, BLADE_TRAIL_ITEMS: BLADE_ITEMS,
};

/** 妖怪の種類を「キー」に持つ表 */
const YOKAI_SOURCES: Record<string, unknown> = {
  YOKAI_STATS, KIND_AI, ATTACK_DAMAGE, YOKAI_DROPS, SENSE, XP: LEVEL_DEFAULTS.xp, YOKAI_NAME,
  VARIANT: YOKAI_VARIANT_COLORS, WEIGHTS: createYokaiConfig().yokaiWeights,
};

export function buildContentSnapshot(): object {
  const items: Record<string, unknown> = {};
  for (const t of ITEM_TYPES) {
    const e: Record<string, unknown> = {
      name: t.name, maxStack: t.maxStack, placeBlock: t.placeBlock,
      rarity: itemRarity(t.id), category: itemCategory(t.id), durabilityClass: itemClassOf(t.id),
    };
    for (const [src, tbl] of Object.entries(ITEM_SOURCES)) pick(e, src, tbl, t.id);
    e.recipes = ALL_RECIPES.filter((r) => r.output.item === t.id || r.inputs.some((i) => i.item === t.id)).map((r) => norm(r));
    items[t.id] = norm(e);
  }
  const yokai: Record<string, unknown> = {};
  for (const kind of Object.keys(YOKAI_STATS) as YokaiKind[]) {
    const e: Record<string, unknown> = {
      // 強さ（段階 × 色ちがいの M）と、肩書きごとの数
      strength: Object.fromEntries(STRENGTH_LEVELS.map((lv) => [lv, yokaiStrength(kind, 1, 'none', lv)])),
      titles: Object.fromEntries((['none', 'oyabun', 'taisho', 'nushi'] as const).map((t) => [t, yokaiStats(kind, t)])),
      countryWeights: Object.fromEntries(COUNTRY_TABLE.map((r) => [r.kind, r.yokai[kind] ?? null])),
    };
    for (const [src, tbl] of Object.entries(YOKAI_SOURCES)) pick(e, src, tbl, kind);
    yokai[kind] = norm(e);
  }
  return { items, yokai, levelConfig: norm({ perLevel: LEVEL_DEFAULTS.perLevel, maxLevel: LEVEL_DEFAULTS.maxLevel }) };
}
