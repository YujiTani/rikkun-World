import { describe, expect, it } from 'vitest';
import type { BlockId, Rarity } from '../../contracts';
import { DIG_DEFAULTS } from '../../dig/config';
import { blockFamily, type ToolFamily } from '../../dig/toolFamily';
import { EMISSION, OPACITY } from '../light/opacity';
import { BLOCK_INDEX, BLOCK_TYPES, isOpaqueIndex } from './blockTypes';

/**
 * MINE-1B（docs/design/MINE-1.md §4.4・受け入れ基準 B1）: 新しい ブロックの 値。
 * 期待の 数は 仕様の 表（§4.4）を そのまま 書き写した もの（式からは 作らない）。id は 仕様の 案（ダイヤの `diamond_ore` は KONGO-1 と そろえた 決まりの id）。
 * 掘ると 出る 物と 数・掘れる 道具・しらせは src/dig/mineDig.test.ts（B1〜B3）、光の ひろがりは src/world/light/hotaruishi.test.ts（B5）、
 * アイテムの 登録は src/content/items/mine1b.test.ts（B7）。
 *
 * ・番号は 今の いちばん 後ろ より 後ろ（保存の ため。今の 番号は かわらない）。ブロックの 番号は 1 マス 1 バイト（256 まで）
 * ・登録表の 数は 決め打ちしない〔#311〕。下の 凍らせた 一覧は「1A までの ゲームの ブロック」で、足りなく なる〔消す・並びかえる〕と 保存が こわれる
 */

/** MINE-1A までの ブロックの id と 並び（番号 ＝ 並びの 位置）。1B で 番号が ずれない ことを 見る。書きかえて 通さない */
const BLOCK_IDS_1A: readonly string[] = [
  'air', 'grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'iron_ore', 'water', 'bedrock',
  'furnace', 'kawara', 'brick', 'torch', 'start_torch', 'tansu',
  'farmland', 'farmland_wet', 'crop_onion', 'crop_tomato', 'crop_pumpkin', 'crop_eggplant',
  'wild_onion', 'wild_tomato', 'wild_pumpkin', 'wild_eggplant', 'kakashi', 'kakashi_head', 'saku', 'sprinkler',
  'snow', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo', 'susuki', 'kusa', 'nobana',
  'nukunuku', 'toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box', 'nukunuku_e', 'nukunuku_s', 'nukunuku_se',
  'geyser_dirt', 'lantern', 'futon', 'haniwa', 'futon_s', 'futon_w', 'futon_n', 'futon_foot_e', 'futon_foot_s', 'futon_foot_w', 'futon_foot_n',
];

interface Row {
  id: string;
  /** 画面に 出る 名前 */
  name: string;
  /** 固い（ぶつかる）か。しるしは 通れる */
  solid: boolean;
  /** 掘る 固さ（0 ＝ さわると すぐ こわれる） */
  hardness: number;
  /** 掘れる 段階（0 ＝ すで から・1 ＝ いしの つるはし から・2 ＝ てつの つるはし から） */
  level: number;
  /** なかま（あう 道具）。なかまが ない 物は null */
  family: ToolFamily | null;
  /** めずらしさ。しるしは 何も 出ない ので 決めない */
  rarity: Rarity | null;
  /** ブロックの 光（0 ＝ 光らない） */
  light: number;
}

/** 仕様 §4.4 の 表（ブロック 8 つ） */
const ROWS: readonly Row[] = [
  { id: 'nendo', name: 'ねんど', solid: true, hardness: 1, level: 0, family: 'dirt', rarity: 'uncommon', light: 0 },
  { id: 'sekkaiseki', name: 'せっかいせき', solid: true, hardness: 5, level: 1, family: 'stone', rarity: 'uncommon', light: 0 },
  { id: 'shikkui', name: 'しっくい', solid: true, hardness: 4, level: 0, family: 'stone', rarity: 'uncommon', light: 0 },
  { id: 'hotaruishi', name: 'ほたるいし', solid: true, hardness: 6, level: 1, family: 'stone', rarity: 'rare', light: 7 },
  { id: 'kin_ore', name: 'きんの いし', solid: true, hardness: 15, level: 2, family: 'stone', rarity: 'epic', light: 0 },
  { id: 'suisho_ore', name: 'すいしょうの いし', solid: true, hardness: 12, level: 2, family: 'stone', rarity: 'superRare', light: 0 },
  { id: 'diamond_ore', name: 'ダイヤの いし', solid: true, hardness: 18, level: 2, family: 'stone', rarity: 'mythic', light: 0 },
  { id: 'chalk_mark', name: 'チョークの しるし', solid: false, hardness: 0, level: 0, family: null, rarity: null, light: 0 },
];

/** 型には まだ ない id を 文字で 読む（赤の 間も 型が 通る ように） */
const IDX = BLOCK_INDEX as unknown as Record<string, number | undefined>;
const typeOf = (id: string) => BLOCK_TYPES.find((t) => t.id === (id as BlockId));
const dig = DIG_DEFAULTS as unknown as {
  hardness: Record<string, number | null | undefined>;
  harvestLevel: Record<string, number | undefined>;
  rarity: Record<string, Rarity | undefined>;
};

describe('B1: 今の ブロックの 番号は かわらない', () => {
  it('MINE-1A までの ブロックが 同じ 並びで 先頭に ある（足すのは いちばん 後ろだけ）', () => {
    expect(BLOCK_TYPES.slice(0, BLOCK_IDS_1A.length).map((t) => t.id)).toEqual(BLOCK_IDS_1A);
  });

  it('新しい ブロック 8 つは 今の いちばん 後ろ より 後ろの 番号で、重ならず、1 バイト（256 まで）に 入る', () => {
    const idx = ROWS.map((r) => IDX[r.id]);
    for (const r of ROWS) expect(IDX[r.id], `${r.id} が BLOCK_TYPES に ある`).toBeTypeOf('number');
    for (const i of idx) {
      expect(i!).toBeGreaterThanOrEqual(BLOCK_IDS_1A.length);
      expect(i!).toBeLessThan(256);
    }
    expect(new Set(idx).size).toBe(ROWS.length);
    // 番号と 並びの 位置が 合っている
    for (const r of ROWS) expect(BLOCK_TYPES[IDX[r.id]!]?.id, r.id).toBe(r.id);
  });

  it('id が 重なる ブロックは ない', () => {
    const ids = BLOCK_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('B1: 新しい ブロックの 値（§4.4 の 表）', () => {
  it('名前（画面に 出る。ひらがな・カタカナ）・固い／通れる・こわせる', () => {
    for (const r of ROWS) {
      const t = typeOf(r.id);
      expect(t, `${r.id} の ブロック`).toBeDefined();
      expect(t!.name, `${r.id} の 名前`).toBe(r.name);
      expect(t!.solid, `${r.id} が 固い`).toBe(r.solid);
      expect(t!.breakable, `${r.id} は こわせる`).toBe(true);
    }
  });

  it('固さ・掘れる 段階（すで 0・いしの つるはし 1・てつの つるはし 2）', () => {
    for (const r of ROWS) {
      expect(dig.hardness[r.id], `${r.id} の 固さ`).toBe(r.hardness);
      expect(dig.harvestLevel[r.id], `${r.id} の 掘れる 段階`).toBe(r.level);
    }
  });

  it('なかま（あう 道具）: ねんどは つち〔くわ〕・鉱物と しっくいは いし〔つるはし〕・しるしは なし', () => {
    for (const r of ROWS) expect(blockFamily(r.id as BlockId), `${r.id} の なかま`).toBe(r.family);
  });

  it('めずらしさ（掘ると 出る 数の 上限を きめる）', () => {
    for (const r of ROWS) {
      if (r.rarity === null) continue;
      expect(dig.rarity[r.id], `${r.id} の めずらしさ`).toBe(r.rarity);
    }
  });

  it('光: ほたるいしだけ 7（たいまつは 14）。ほかは 0。ほたるいしは 光を 通さない 固い ブロック・しるしは 光を 通す', () => {
    for (const r of ROWS) {
      expect(IDX[r.id], `${r.id} の ブロック`).toBeTypeOf('number');
      expect(EMISSION[IDX[r.id]!], `${r.id} の 光`).toBe(r.light);
    }
    expect(EMISSION[BLOCK_INDEX.torch]).toBeGreaterThan(EMISSION[IDX.hotaruishi!]!);
    expect(OPACITY[IDX.hotaruishi!], 'ほたるいしは 光を 通さない').toBe(15);
    for (const id of ['nendo', 'sekkaiseki', 'shikkui', 'kin_ore', 'suisho_ore', 'diamond_ore']) expect(OPACITY[IDX[id]!], `${id} は 光を 通さない`).toBe(15);
    expect(OPACITY[IDX.chalk_mark!], 'しるしは 光を 通す〔となりの 面を かくさない〕').toBe(0);
  });

  it('描き方: 固い ブロックは まわりの 面を かくす（不透明）・しるしは かくさない', () => {
    for (const r of ROWS) {
      expect(IDX[r.id], `${r.id} の ブロック`).toBeTypeOf('number');
      expect(isOpaqueIndex(IDX[r.id]!), `${r.id} が 不透明`).toBe(r.solid);
    }
  });
});
