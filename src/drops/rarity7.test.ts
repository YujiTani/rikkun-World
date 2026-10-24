import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ItemId, Rarity } from '../contracts';
import { createDigConfig, DIG_DEFAULTS } from '../dig/config';
import { createSettingsHook } from '../game/settings';
import { ITEM_TYPES } from '../inventory/items';
import { PALETTE_HEX } from '../ui/theme/palette';
import { GEM_SHAPES, gemShape } from '../ui/gemArt';
import {
  ITEM_RARITY_SETTINGS,
  RARITY_COLOR,
  RARITY_ORDER,
  RARITY_TIERS,
  isRarity,
  itemRarity,
  rarityAtLeast,
  rarityIndex,
  rarityTier,
  resetItemRarity,
} from './rarity';

afterEach(() => resetItemRarity());

const ids = ['common', 'uncommon', 'rare', 'superRare', 'epic', 'mythic', 'legendary'] as const;

describe('RARITY-7 表', () => {
  it('AC1 7 行・id・星・dropMax・RARITY_ORDER', () => {
    expect(RARITY_TIERS).toHaveLength(7);
    expect(RARITY_TIERS.map((t) => t.id)).toEqual([...ids]);
    expect(RARITY_TIERS.map((t) => t.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(RARITY_TIERS.map((t) => t.stars)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(RARITY_TIERS.map((t) => t.dropMax)).toEqual([4, 3, 2, 1, 1, 1, 1]);
    expect(RARITY_ORDER).toEqual(RARITY_TIERS.map((t) => t.id));
    ids.forEach((id, i) => {
      expect(rarityIndex(id)).toBe(i);
      expect(rarityTier(id)).toBe(RARITY_TIERS[i]);
      expect(isRarity(id)).toBe(true);
    });
    expect(isRarity('banana')).toBe(false);
    expect(isRarity(3)).toBe(false);
  });

  it('AC2 色は 7 つぜんぶちがい、palette.ts・tokens.css・RARITY_COLOR と同じ', () => {
    const css = readFileSync(resolve(__dirname, '../ui/theme/tokens.css'), 'utf8');
    expect(new Set(RARITY_TIERS.map((t) => t.color)).size).toBe(7);
    for (const t of RARITY_TIERS) {
      const hex = `#${t.color.toString(16).padStart(6, '0')}`;
      expect(t.cssVar).toBe(`--rk-rarity-${t.index}`);
      expect(PALETTE_HEX[t.cssVar], t.id).toBe(hex);
      expect(css, t.id).toMatch(new RegExp(`${t.cssVar}:\\s*${hex}\\b`, 'i'));
      expect(RARITY_COLOR[t.id]).toBe(t.color);
    }
  });

  it('AC3 gemShape(i) は表の gem と同じ。7 以上・負は 0〜6 におさめる', () => {
    RARITY_TIERS.forEach((t, i) => {
      expect(gemShape(i)).toBe(t.gem);
      expect(GEM_SHAPES[i]).toBe(t.gem);
    });
    expect(new Set(RARITY_TIERS.map((t) => t.gem)).size).toBe(7);
  });

  it('AC4 ことば: ぜんぶちがい・かなだけ・空白をのぞき 9 文字以下', () => {
    expect(new Set(RARITY_TIERS.map((t) => t.word)).size).toBe(7);
    for (const t of RARITY_TIERS) {
      expect(t.word, t.id).toMatch(/^[ぁ-ゖァ-ヺー ]+$/);
      expect(t.word.replace(/ /g, '').length, t.id).toBeLessThanOrEqual(9);
    }
  });
});

describe('RARITY-7 当てはめ・設定', () => {
  it('AC6 rarityAtLeast は全アイテム × 7 段で式と同じ', () => {
    expect(ITEM_TYPES).toHaveLength(91); // NINJA-1（#299）: 黒頭巾・忍び装束・忍びの手甲 +3（足袋は #293 で 済み）。 // #293 試作: 忍者の足袋 +1・間欠泉の つち +1。 LIVE-3: momo_nama・momo_yaki +2。GOLD-1: きん 10 こ（kin・きんの そうび 8・はらぱんみみず）。 LIVE-2: こたつ・とりごや・きん の たまご +3。WEAPON-7 PR1: 雷神剣 +1・PR2: 風神剣 +1・PR3: 虹 +1。 FLORA-75: のばな +1・LIVE-1: たまご +1・むし・むしとりあみ +2。#184: 12 の国の 7 こ（ゆき・もみじ・まつ・はな 3・たけ）が ふえた
    for (const it of ITEM_TYPES) {
      for (const t of ids) {
        expect(rarityAtLeast(it.id, t), `${it.id}/${t}`).toBe(rarityIndex(itemRarity(it.id)) >= rarityIndex(t));
      }
      expect(rarityAtLeast(it.id, 'common')).toBe(true);
    }
  });

  it('AC7 案 A: 5〜6 段目は 0 こ、7 段目は 2 こ（WEAPON-7 PR2 まで: 雷神剣・風神剣。PR3 で ＋1）、各段のこ数', () => {
    const n: Record<string, number> = {};
    for (const it of ITEM_TYPES) {
      const r = itemRarity(it.id);
      expect(isRarity(r)).toBe(true);
      n[r] = (n[r] ?? 0) + 1;
    }
    expect(n).toEqual({ common: 41, uncommon: 19, rare: 10, superRare: 3, epic: 11, legendary: 7 }); // NINJA-1: 忍者装備 4 つ（足袋は #293 から）が legendary で 3 つ ふえた。LIVE-2: こたつ・とりごや uncommon、きん の たまご epic。#293: 間欠泉の つち uncommon・忍者の足袋 legendary。 // 雷神剣・風神剣・虹（WEAPON-7 PR1・PR2・PR3）が legendary
    expect(itemRarity('crystal_katana')).toBe('superRare');
  });

  it('AC8 ブロックでもある 14 こで itemRarity の初期値と ほる設定 rarity が同じ', () => {
    const blocks = ['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'furnace', 'kawara', 'brick', 'torch', 'tansu', 'sprinkler'];
    for (const b of blocks) expect(itemRarity(b as ItemId), b).toBe((createDigConfig().rarity as Record<string, Rarity>)[b]);
    expect(DIG_DEFAULTS.dropMax).toEqual({ common: 4, uncommon: 3, rare: 2, superRare: 1, epic: 1, mythic: 1, legendary: 1 });
  });

  it('AC9 settings: itemRarity の上書き・不正はError・reset で初期値', () => {
    const hook = createSettingsHook({} as never, {} as never, [ITEM_RARITY_SETTINGS, createDigConfig()]);
    hook.set('itemRarity', { katana: 'legendary' });
    expect(itemRarity('katana')).toBe('legendary');
    expect(() => hook.set('itemRarity', { katana: 'banana' })).toThrow();
    expect(() => hook.set('itemRarity', { nanika: 'rare' })).toThrow();
    expect(() => hook.set('rarity', { dirt: 'banana' })).toThrow();
    expect(itemRarity('katana')).toBe('legendary');
    expect((hook.get('rarity') as Record<string, string>).dirt).toBe('common');
    resetItemRarity();
    expect(itemRarity('katana')).toBe('rare');
  });
});

describe('RARITY-7 画面・光・音・強さ', () => {
  it('AC5 ツールチップ・せつめい・rarityCss が 7 段ぜんぶ表と同じ', async () => {
    const { STARS, rarityCss } = await import('../ui/tooltipModel');
    const { createItemInfo, defaultInfoNumbers } = await import('../craft/info/build');
    const { ALL_RECIPES } = await import('../craft/recipes');
    for (const t of RARITY_TIERS) {
      expect(STARS[t.id]).toBe(t.stars);
      expect(rarityCss(t.id)).toBe(`#${t.color.toString(16).padStart(6, '0')}`);
      const info = createItemInfo({ recipes: () => ALL_RECIPES, nameOf: (i) => i, numbers: () => defaultInfoNumbers(), rarityOf: () => t.id }).info('katana');
      expect(info.stars).toBe(t.stars);
      expect(info.rarityWord).toBe(t.word);
    }
  });

  it('AC12 光の柱・着地の光: 7 段ぜんぶに値、5〜7 段目は 4 段目いか、ゆれは 3 回/秒 未満', async () => {
    const { SPARKLE, SPARKLE_CFG, sparkleCount } = await import('../fx/dropSparkle');
    for (const t of RARITY_TIERS) {
      expect(SPARKLE[t.id], t.id).toBeDefined();
      expect(SPARKLE_CFG.flashCount[t.id]).toBeGreaterThan(0);
      expect(SPARKLE_CFG.flashRadius[t.id]).toBeGreaterThan(0);
      if (t.index >= 4) {
        expect(sparkleCount(t.id)).toBeLessThanOrEqual(sparkleCount('superRare'));
        expect(SPARKLE_CFG.flashCount[t.id]).toBeLessThanOrEqual(SPARKLE_CFG.flashCount.superRare);
        expect(SPARKLE[t.id].width).toBeLessThanOrEqual(SPARKLE.superRare.width);
        expect(SPARKLE[t.id].opacity).toBeLessThanOrEqual(SPARKLE.superRare.opacity);
      }
    }
    expect(SPARKLE_CFG.pulseHz).toBeLessThan(3);
  });

  it('AC12 ひろう音: index 3 以上は dropSuperRare', async () => {
    const { dropSoundOf } = await import('../fx/combatFx');
    const want = ['dropCommon', 'dropUncommon', 'dropRare', 'dropSuperRare', 'dropSuperRare', 'dropSuperRare', 'dropSuperRare'];
    RARITY_TIERS.forEach((t, i) => expect(dropSoundOf(t.id)).toBe(want[i]));
  });

  it('AC13 めずらしさを変えても つよさ（stats）は同じ', async () => {
    const { createItemInfo, defaultInfoNumbers } = await import('../craft/info/build');
    const { ALL_RECIPES } = await import('../craft/recipes');
    const mk = () => createItemInfo({ recipes: () => ALL_RECIPES, nameOf: (i) => i, numbers: () => defaultInfoNumbers() });
    for (const item of ['crystal_katana', 'katana', 'iron_pickaxe', 'kabuto'] as ItemId[]) {
      const before = mk().info(item).stats;
      ITEM_RARITY_SETTINGS.itemRarity[item] = 'legendary';
      expect(mk().info(item).stats, item).toEqual(before);
    }
  });

  it('光の輪は 7 段あっても 1 つの InstancedMesh（描画 1 回）', async () => {
    const THREE = await import('three');
    const { BagVisuals } = await import('../fx/bagVisuals');
    const v = new BagVisuals(new THREE.Scene());
    const bags = RARITY_TIERS.map((t, i) => ({ id: i + 1, batch: i + 1, rarity: t.id, position: { x: i * 3, y: 9, z: 2 }, slots: [{ item: 'dirt' as ItemId, count: 1 }], ticksLeft: 100 }));
    v.update(1 / 60, bags);
    expect(v.ringCount()).toBe(7);
    const rings = v.group.children.filter((c) => (c as unknown as { isInstancedMesh?: boolean }).isInstancedMesh === true);
    expect(rings).toHaveLength(1);
  });
});
