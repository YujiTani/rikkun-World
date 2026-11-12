import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { DIG_DEFAULTS } from '../../dig/config';
import { itemRarity } from '../../drops/rarity';
import { ITEM_TYPES, itemType } from '../../inventory/items';
import { CATEGORY_ITEMS } from '../../ui/itemCategory';
import { itemIconPixels } from '../../ui/itemIcon';
import { findUnrubiedKanji } from '../../ui/text';
import { BLOCK_INDEX, BLOCK_TYPES } from '../../world/blocks/blockTypes';
import { EMISSION } from '../../world/light/opacity';
import { SEEDS_20, hook1c } from '../../world/gen/mineShaftKit';
import { LOOKS, hookF, needYakataHook, tableOf, type Look } from '../../world/gen/mineYakataKit';
import { itemDef } from './registry';

/**
 * MINE-1F F10・F11（docs/design/MINE-1F.md §4.6・§4.4・§6.2）: 新しい ブロック 8 こ〔2 組 × 4〕・アイテム・宝箱の 表。
 * id は 表〔`yakataTable().lookBlocks`〕から 読む〔#311。id の 文字を ここに 写さない〕。値の 数〔固さ 3・段階 1・光 9 など〕は 仕様の 表の とおり。
 * 1E の あとの 番号の 数 212〔1E の あとの ブロック。ここは 1F の 前の 数〕・1F で 足す 8 こ は その 後ろ〔212〜219〕。
 */

const IDX = BLOCK_INDEX as unknown as Record<string, number | undefined>;
const dig = DIG_DEFAULTS as unknown as { hardness: Record<string, number | null | undefined>; harvestLevel: Record<string, number | undefined> };
/** 1F の 前〔1E の あと〕の ブロックの 数 */
const BLOCKS_THROUGH_1E = 212;
/** 1E の あとまでの id を 番号の 順に つないだ 文字の ハッシュ〔FNV-1a 32 ビット。main の 1E 入りで はかった もの〕 */
const IDS_THROUGH_1E_FNV = 'c826eaa1';
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
};
const norm = (s: string): string => s.replace(/\s+/g, '');
const I = (id: string): ItemId => id as ItemId;

type Part = 'kabe' | 'yuka' | 'dan' | 'taimatsu';
const PARTS: readonly Part[] = ['kabe', 'yuka', 'dan', 'taimatsu'];
/** 仕様 §4.6 の 表〔組 × 部品〕: 名前・説明 */
const TEXT: Record<Look, Record<Part, { name: string; use: string }>> = {
  maou: {
    kabe: { name: 'まおうの かべ', use: 'まおうの しろ の かべ。おける' },
    yuka: { name: 'まおうの ゆか', use: 'まおうの しろ の ゆか。おける' },
    dan: { name: 'まおうの だん', use: 'まおうの しろ の さいだん の いし。おける' },
    taimatsu: { name: 'むらさきの たいまつ', use: 'むらさき に もえる ふしぎな たいまつ。おくと あかり に なる' },
  },
  otera: {
    kabe: { name: 'おてらの いしがき', use: 'よるの おてら の いしがき。おける' },
    yuka: { name: 'おてらの いしだたみ', use: 'よるの おてら の いしだたみ。おける' },
    dan: { name: 'おてらの だん', use: 'よるの おてら の さいだん の いし。おける' },
    taimatsu: { name: 'おにびの たいまつ', use: 'あおじろい おにび の たいまつ。おくと あかり に なる' },
  },
};

const ids = (): { id: string; look: Look; part: Part }[] => {
  const T = tableOf(SEEDS_20[0]!);
  return LOOKS.flatMap((look) => PARTS.map((part) => ({ id: T.lookBlocks[look][part] as string, look, part })));
};

describe('F10: 新しい ブロックの 値〔§4.6 の 表〕', () => {
  it('8 つ・かさならない・ブロックの 表に あり 名前が 表の とおり', () => {
    const rows = ids();
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.id)).size).toBe(8);
    for (const r of rows) {
      const t = BLOCK_TYPES.find((b) => b.id === r.id);
      expect(t, `${r.id} の ブロック`).toBeDefined();
      expect(norm(t!.name), `${r.id} の 名前`).toContain(norm(TEXT[r.look][r.part].name));
      expect(t!.breakable, `${r.id} が こわせる`).toBe(true);
    }
  });

  it('固さ 3・いしの つるはしから〔段階 1〕・光 0／たいまつは 固さ 0・すでから・光 9', () => {
    for (const r of ids()) {
      const torch = r.part === 'taimatsu';
      expect(dig.hardness[r.id], `${r.id} の 固さ`).toBe(torch ? 0 : 3);
      expect(dig.harvestLevel[r.id], `${r.id} の 段階`).toBe(torch ? 0 : 1);
      expect(EMISSION[IDX[r.id]!], `${r.id} の 光`).toBe(torch ? 9 : 0);
      expect(BLOCK_TYPES.find((b) => b.id === r.id)!.solid, `${r.id} が 固いか`).toBe(!torch);
    }
  });

  it('2 組の 値は 名前・絵 いがい 同じ', () => {
    const by = (look: Look): unknown[] => ids().filter((r) => r.look === look).map((r) => [dig.hardness[r.id], dig.harvestLevel[r.id], EMISSION[IDX[r.id]!], BLOCK_TYPES.find((b) => b.id === r.id)!.solid]);
    expect(by('maou')).toEqual(by('otera'));
  });

  it('番号は 1E の あとの 後ろ・今の 番号は かわらない・足した のは 8 こ（まきもの・まねきねこの 後ろ）・合計 256 以下', () => {
    for (const r of ids()) {
      const i = IDX[r.id];
      expect(i, `${r.id} の 番号`).toBeTypeOf('number');
      expect(i!, r.id).toBeGreaterThanOrEqual(BLOCKS_THROUGH_1E);
      expect(i!).toBeLessThan(256);
      expect(BLOCK_TYPES[i!]?.id).toBe(r.id);
    }
    expect(fnv(BLOCK_TYPES.slice(0, BLOCKS_THROUGH_1E).map((b) => b.id).join(',')), '1E の あとまでの 並び').toBe(IDS_THROUGH_1E_FNV);
    expect(BLOCK_TYPES.length - BLOCKS_THROUGH_1E, '1F で 足した id').toBeLessThanOrEqual(8 + 5 + 20 + 5); // 最後の 5 ＝ VOX-I-4a（#187）の 国だけの 物 5 こ（やかたの 前）、5 ＝ HOUSE-2A（#364）が やかたの 前に 足した まきもの 1 ＋ まねきねこ 4（向き）、20 ＝ HOUSE-2B の 形ごとの ブロック 20
    expect(BLOCK_TYPES.length).toBeLessThanOrEqual(256);
  });
});

describe('F10: アイテム〔登録表・説明・source・かさね 64・めずらしさ・分け〕', () => {
  it('登録表と 種類表に あり、説明・source・図鑑・絵・ルビが ある', () => {
    for (const r of ids()) {
      const d = itemDef(r.id);
      expect(d, `${r.id} の 登録`).toBeDefined();
      const t = itemType(I(r.id));
      expect(t, `${r.id} の 種類表`).toBeDefined();
      expect(norm(t!.name)).toContain(norm(TEXT[r.look][r.part].name));
      expect(t!.maxStack, `${r.id} の かさね`).toBe(64);
      expect((d as { placeBlock?: string }).placeBlock, `${r.id} は 置ける〔placeBlock〕`).toBe(r.id);
      expect(ITEM_TYPES.some((x) => x.id === r.id)).toBe(true);
      expect(norm(d!.source ?? ''), `${r.id} の source`).toContain(norm('ようかいの やかた を かちぬいて ほる'));
      expect(d!.zukan.trim().length, `${r.id} の zukan`).toBeGreaterThan(0);
      expect(itemIconPixels(I(r.id)), `${r.id} の 絵`).toBeTruthy();
      expect(findUnrubiedKanji(`${t!.name}${d!.zukan}${d!.source ?? ''}`), `${r.id} の ルビ`).toEqual([]);
    }
  });

  it('めずらしさ: かべ・ゆか・だんは レア〔uncommon〕・たいまつは スーパーレア〔rare〕', () => {
    for (const r of ids()) expect(itemRarity(I(r.id)), r.id).toBe(r.part === 'taimatsu' ? 'rare' : 'uncommon');
  });

  it('分け: かべ・ゆか・だん ＝ たてもの〔build〕・たいまつ ＝ あかり〔light〕', () => {
    for (const r of ids()) {
      const inBuild = CATEGORY_ITEMS.build.includes(I(r.id));
      const inLight = CATEGORY_ITEMS.light.includes(I(r.id));
      expect(r.part === 'taimatsu' ? inLight : inBuild, `${r.id} の 分け`).toBe(true);
    }
  });

  it('宝箱の くじの 箱〔chestPool〕に 入らず、のぞく 表〔chestExcluded〕に 理由つきで 8 こ とも ある', () => {
    const h = hook1c(SEEDS_20[0]!);
    const pooled = new Set(Object.values(h.chestPool()).flat() as string[]);
    for (const r of ids()) {
      expect(pooled.has(r.id), `${r.id} が くじの 箱に ある`).toBe(false);
      const ex = h.chestExcluded().find((e) => e.item === r.id);
      expect(ex, `${r.id} が のぞく 表に ある`).toBeDefined();
      expect(norm(ex!.reason)).toContain(norm('やかたを かちぬいた しるし。宝箱から 出ない'));
    }
  });
});

describe('F11: 宝箱の 表 yakata〔C16 と 同じ 形〕', () => {
  it('段 4 つ・chance の 合計 1・段 4 が 1・placeChance 1・祭壇の 上', () => {
    const h = hookF(SEEDS_20[0]!);
    needYakataHook(h, ['chestTable']);
    const t = h.chestTable('yakata') as unknown as { tiers: { chance: number }[]; placeChance: number };
    expect(t.tiers, '段').toHaveLength(4);
    expect(t.tiers.reduce((s, x) => s + x.chance, 0)).toBeCloseTo(1, 9);
    expect(t.tiers[3]!.chance).toBe(1);
    expect(t.placeChance).toBe(1);
    expect(JSON.stringify(h.chestTable('kodo')), 'ほかの 表と 同じ 形').toContain('tiers');
  });
});
