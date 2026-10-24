import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { ITEM_TYPES } from '../inventory/items';
import { ITEM_INFO } from '../craft/info/table';
import { createItemInfo, defaultInfoNumbers } from '../craft/info/build';
import { ALL_RECIPES } from '../craft/recipes';
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { TopBandModel } from './celebrate/bandModel';
import { defaultCelebrateSettings } from './celebrate/config';
import { telopText } from './celebrate/telopText';
import { buildTooltip, type TooltipDeps } from './tooltipModel';
import { findUnrubiedKanji, withRuby, yomiOf } from './text';

/**
 * NINJA-1（#299）AC19（文字）・AC25（虹色の「とくべつな ちから」の 行）・§3.2（テロップの 文）。実装の 前の テスト（赤）。
 * 窓口 の 形: `ITEM_INFO[id].special`（table.ts）、`buildTooltip(...).special` / `.specialHead`（tooltipModel.ts）、`craft.info(id).special`（build.ts）、
 *           `telopText(source, 名前)`（ui/celebrate/telopText.ts。source = 'nushi' | 'gasha' | 'chest'）、`TopBandModel.enqueueTelop(item, source?)`。
 */
const NINJA = ['ninja_zukin', 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi'] as ItemId[];
const SPECIAL: Record<string, string> = {
  ninja_zukin: 'ひのたま を ふせぐ。みず の なか で いき が ながく もつ',
  ninja_shozoku: 'ようかい に きづかれ にくい',
  ninja_tekko: 'かたな・すで で こうげき した とき に ［小太刀｜こだち］ で おいうち',
  ninja_tabi: 'たかい ところ から おちても いたく ない',
};
const LEGEND_BLADES: Record<string, string> = {
  raijin_ken: 'ためて はなすと そら から かみなり が おちる',
  fujin_ken: 'てに もつと はやく はしれる。ためて はなすと かぜ が とぶ',
  niji: 'ためて はなすと ひかり の ドーム',
};

const deps = (): TooltipDeps => ({
  nameOf: (i) => itemType(i)?.name ?? i,
  rarityOf: (i) => itemRarity(i),
  placeable: () => false,
  recipes: () => ALL_RECIPES,
});

describe('AC25 虹色の 行（とくべつな ちから）', () => {
  it('ITEM_INFO: 忍者装備 4 つ の special が §3.1 の 表 の とおり', () => {
    for (const id of NINJA) expect((ITEM_INFO as Record<string, { special?: string }>)[id]?.special, id).toBe(SPECIAL[id]);
  });
  it('ITEM_INFO: 雷神剣・風神剣・虹 は 今の use の ためわざの 文を special へ うつし、use は ふつうの 刀の 文', () => {
    const info = ITEM_INFO as Record<string, { use: string; special?: string }>;
    for (const [id, text] of Object.entries(LEGEND_BLADES)) {
      expect(info[id]!.special, id).toBe(text);
      expect(info[id]!.use, id).toBe(info.katana!.use);
    }
  });
  it('ツールチップ: 忍者装備 4 つ と 3 本の 刀に special の 文が 入り、虹色の 見出しは「とくべつな ちから」', () => {
    for (const [id, text] of [...Object.entries(SPECIAL), ...Object.entries(LEGEND_BLADES)]) {
      const t = buildTooltip(id as ItemId, deps()) as unknown as { special: string | null; specialHead: string };
      expect(t.special, id).toBe(text);
      expect(t.specialHead, id).toBe('とくべつな ちから');
    }
  });
  it('足袋の 「おちても いたく ない」は special に うつった（lines に 二重に 出ない）', () => {
    const t = buildTooltip('ninja_tabi' as ItemId, deps());
    expect(t.lines.some((l) => l.includes('おちても いたく ない'))).toBe(false);
  });
  it('レジェンダリー でない 物（かぶと・かたな・すねあて・ぼくとう）には 出ない', () => {
    for (const id of ['kabuto', 'katana', 'suneate', 'bokuto', 'yoroi', 'dirt'] as ItemId[]) {
      const t = buildTooltip(id, deps()) as unknown as { special: string | null };
      expect(t.special ?? null, id).toBeNull();
      expect((ITEM_INFO as Record<string, { special?: string }>)[id]?.special, id).toBeUndefined();
    }
  });
  it('説明パネル（craft.info）にも 同じ special が 入る', () => {
    const info = createItemInfo({ recipes: () => ALL_RECIPES, nameOf: (i) => itemType(i)?.name ?? i, numbers: () => defaultInfoNumbers() });
    for (const id of NINJA) expect((info.info(id) as unknown as { special?: string }).special, id).toBe(SPECIAL[id]);
    expect((info.info('katana' as ItemId) as unknown as { special?: string }).special).toBeUndefined();
  });
});

describe('AC19 文字（ひらがな・カタカナ。漢字は ルビ）', () => {
  it('忍者装備の 名前・use・special・テロップ・実績の 名に ルビなしの 漢字が 無い', () => {
    for (const id of NINJA) {
      const t = ITEM_TYPES.find((x) => x.id === id)!;
      expect(findUnrubiedKanji(withRuby(t.name)), `${id} 名前`).toEqual([]);
      const info = ITEM_INFO[id] as { use: string; special?: string };
      expect(findUnrubiedKanji(withRuby(info.use)), `${id} use`).toEqual([]);
      expect(findUnrubiedKanji(withRuby(info.special ?? '')), `${id} special`).toEqual([]);
      for (const source of ['nushi', 'gasha', 'chest'] as const) {
        expect(findUnrubiedKanji(withRuby(telopText(source, t.name))), `${id} ${source}`).toEqual([]);
      }
    }
    for (const d of ACHIEVEMENT_DEFS.filter((x) => x.id.startsWith('ninja.'))) expect(findUnrubiedKanji(withRuby(d.name)), d.id).toEqual([]);
  });
  it('よみ: 黒頭巾 くろずきん・忍び装束 しのびしょうぞく・忍びの手甲 しのびのてっこう・忍びの足袋 しのびのたび', () => {
    const yomi = (id: string) => yomiOf(ITEM_TYPES.find((x) => x.id === id)!.name).replace(/ /g, '');
    expect(yomi('ninja_zukin')).toBe('くろずきん');
    expect(yomi('ninja_shozoku')).toBe('しのびしょうぞく');
    expect(yomi('ninja_tekko')).toBe('しのびのてっこう');
    expect(yomi('ninja_tabi')).toBe('しのびのたび');
  });
});

describe('§3.2 テロップの 文（出どころで かえる）', () => {
  const name = '［忍｜しの］びの ［足袋｜たび］';
  it('がしゃどくろ / 宝箱 / ヌシ（今のまま）', () => {
    expect(telopText('gasha', name)).toBe(`がしゃどくろ が ${name} を おとした！`);
    expect(telopText('chest', name)).toBe(`たからばこ に ${name} が はいって いた！`);
    expect(telopText('nushi', name)).toBe(`ヌシ が ${name} を おとした！`);
  });
  it('上の 帯: enqueueTelop(item, source) の source が info に 出る。省くと nushi（今のまま）', () => {
    const cfg = () => defaultCelebrateSettings();
    const b = new TopBandModel(cfg);
    b.enqueueTelop('ninja_tabi' as ItemId, 'gasha');
    expect(b.step(1, false).telopStarted).toBe('ninja_tabi');
    expect(b.info(null)).toMatchObject({ kind: 'telop', item: 'ninja_tabi', source: 'gasha' });
    const c = new TopBandModel(cfg);
    c.enqueueTelop('raijin_ken');
    c.step(1, false);
    expect(c.info(null)).toMatchObject({ kind: 'telop', item: 'raijin_ken', source: 'nushi' });
  });
});
