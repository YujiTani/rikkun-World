import { describe, expect, it } from 'vitest';
import type { BlockId, Rarity } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { DIG_DEFAULTS } from '../../dig/config';
import { blockFamily } from '../../dig/toolFamily';
import { EMISSION, OPACITY } from '../light/opacity';
import { BLOCK_INDEX, BLOCK_TYPES, isOpaqueIndex } from './blockTypes';

/**
 * MINE-1C（docs/design/MINE-1.md §4.4・§3.1・受け入れ基準 C3〔ブロックの 値〕・C8〔こわれない〕）: 坑道の わくと 宝箱の ブロック。
 *
 *   こうどうの わく〔`kodo_waku`。仕様の id 案〕: 固さ 5・すでから〔段 0〕・き〔おの〕・ノーマル・光 0・固い・持てない〔登録表に 無い〕。
 *   宝箱〔`takarabako_1`〜`_4` が 本体、`_open` が あいた 本体。のこりの マスの id は developer〕: こわれない〔`breakable: false`。`start_torch` と 同じ〕・
 *   名前は 4 段 × あいた／あいて いない〔2 マス とも 同じ 名前〕・持てない〔登録表に 無い〕・番号は 今の いちばん 後ろより 後ろ〔保存の ため〕。
 *   番号は 1 マス 1 バイト〔256 まで〕なので ふやしすぎない。件数は 決め打ちしない〔#311〕。
 *   ほって こわれて 出る 物〔き 1〕は src/dig/mineDig1c.test.ts。
 */

/** MINE-1B までの ブロックの 数〔ここ 以降が 1C の 番号。1B の 終わりの id は chalk_mark 系の 最後〕。1 か所に 書く */
const LAST_1B_ID = 'chalk_mark';

const IDX = BLOCK_INDEX as unknown as Record<string, number | undefined>;
const typeOf = (id: string) => BLOCK_TYPES.find((t) => t.id === (id as BlockId));
const dig = DIG_DEFAULTS as unknown as {
  hardness: Record<string, number | null | undefined>;
  harvestLevel: Record<string, number | undefined>;
  rarity: Record<string, Rarity | undefined>;
};

const CHEST_NAMES: readonly string[] = ['きの たからばこ', 'てつの たからばこ', 'うるしの たからばこ', 'ミラクルの たからばこ'];
const CHEST_OPEN_NAMES: readonly string[] = CHEST_NAMES.map((n) => `あいた ${n}`);
const MAIN_IDS = ['takarabako_1', 'takarabako_2', 'takarabako_3', 'takarabako_4'] as const;
const OPEN_IDS = MAIN_IDS.map((id) => `${id}_open`);

describe('C3: こうどうの わく', () => {
  it('ブロックが ある・名前「こうどうの わく」・固い・こわせる・光 0・光を 通さない・不透明', () => {
    const t = typeOf('kodo_waku');
    expect(t, 'kodo_waku の ブロック').toBeDefined();
    expect(t!.name).toBe('こうどうの わく');
    expect(t!.solid).toBe(true);
    expect(t!.breakable).toBe(true);
    const i = IDX.kodo_waku!;
    expect(EMISSION[i]).toBe(0);
    expect(OPACITY[i]).toBe(15);
    expect(isOpaqueIndex(i)).toBe(true);
  });

  it('固さ 5・掘れる 段階 0〔すでから〕・なかま き〔おの〕・めずらしさ ノーマル', () => {
    expect(dig.hardness.kodo_waku).toBe(5);
    expect(dig.harvestLevel.kodo_waku).toBe(0);
    expect(blockFamily('kodo_waku' as BlockId)).toBe('log');
    expect(dig.rarity.kodo_waku).toBe('common');
  });

  it('持てない: 登録表〔アイテム〕に 無い〔ブロックは ある。ブロックが ないだけで 通さない〕', () => {
    expect(typeOf('kodo_waku'), 'kodo_waku の ブロック').toBeDefined();
    expect('kodo_waku' in ITEM_DEFS).toBe(false);
  });
});

describe('C8: 宝箱の ブロック', () => {
  const chestBlocks = BLOCK_TYPES.filter((t) => t.name.endsWith('たからばこ'));

  it('本体の id 8 つ〔4 段 ×（あいてない／あいた）〕が ある・名前は 4 段 ×（あいてない／あいた）の 8 とおり だけ・2 マス とも 同じ 名前', () => {
    for (const id of [...MAIN_IDS, ...OPEN_IDS]) expect(typeOf(id), id).toBeDefined();
    MAIN_IDS.forEach((id, k) => expect(typeOf(id)!.name, id).toBe(CHEST_NAMES[k]));
    OPEN_IDS.forEach((id, k) => expect(typeOf(id)!.name, id).toBe(CHEST_OPEN_NAMES[k]));
    const allowed = new Set([...CHEST_NAMES, ...CHEST_OPEN_NAMES]);
    for (const t of chestBlocks) expect(allowed.has(t.name), `${t.id} の 名前 ${t.name}`).toBe(true);
    for (const n of allowed) expect(chestBlocks.filter((t) => t.name === n).length, `${n} の ブロック〔本体 ＋ のこりの マス〕`).toBeGreaterThanOrEqual(2);
  });

  it('ほっても こわれない〔breakable false。今の start_torch と 同じ あつかい〕。固い ブロックでも 通れる ブロックでも よい が、光は 0・登録表に 無い〔持てない〕', () => {
    expect(chestBlocks.length).toBeGreaterThanOrEqual(8);
    for (const t of chestBlocks) {
      expect(t.breakable, `${t.id} は こわれない`).toBe(false);
      expect(EMISSION[IDX[t.id]!], `${t.id} の 光`).toBe(0);
      expect(t.id in ITEM_DEFS, `${t.id} は 持てない`).toBe(false);
    }
    expect(typeOf('start_torch')!.breakable).toBe(false);
  });

  it('番号: 今の いちばん 後ろ〔MINE-1B の チョークの しるし〕より 後ろ・ぜんぶ 重ならず 256 まで', () => {
    const last1b = Math.max(...BLOCK_TYPES.map((t, i) => (t.id.startsWith(LAST_1B_ID) ? i : -1)));
    expect(last1b, `${LAST_1B_ID} の ブロック`).toBeGreaterThan(0);
    for (const id of ['kodo_waku', ...MAIN_IDS, ...OPEN_IDS]) expect(IDX[id], `${id} の 番号`).toBeGreaterThan(last1b);
    for (const t of chestBlocks) expect(IDX[t.id]!, t.id).toBeGreaterThan(last1b);
    expect(BLOCK_TYPES.length).toBeLessThanOrEqual(256);
    const ids = BLOCK_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
