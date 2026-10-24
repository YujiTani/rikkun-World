import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { ITEM_TYPES, itemType } from '../inventory/items';
import { ITEM_INFO } from '../craft/info/table';
import { createItemInfo, defaultInfoNumbers } from '../craft/info/build';
import { ALL_RECIPES } from '../craft/recipes';
import { itemRarity } from '../drops/rarity';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { TopBandModel } from './celebrate/bandModel';
import { defaultCelebrateSettings } from './celebrate/config';
import { telopText } from './celebrate/telopText';
import { buildTooltip, type TooltipDeps } from './tooltipModel';
import { findUnrubiedKanji, withRuby, yomiOf } from './text';

/**
 * SAMURAI-1（#300）AC19（文字）と §3.1 の 虹色の「とくべつな ちから」の 行・§3.2 テロップの 文。実装の 前の テスト（赤）。
 * 窓口 の 形は NINJA-1 と 同じ: `ITEM_INFO[id].special`・`buildTooltip(...).special / .specialHead`・`craft.info(id).special`・`telopText(source, 名前)`・`TopBandModel.enqueueTelop(item, source?)`。
 * （NINJA-1 で できた 窓口に 4 つ ぶん 足すだけ。新しい 窓口は ない）
 */
const SAMURAI = ['samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta'] as ItemId[];
const SPECIAL: Record<string, string> = {
  samurai_jingasa: 'ひのたま を ふせぐ。パリィ で はじく じかん が ながく なる',
  samurai_haori: 'ようかい の こうげき を ふせぐ。［吹｜ふ］き［飛｜と］ばされ にくく なる',
  samurai_tekko: 'かたな の あつかい が うまく なる。かたい あいて にも こうか ばつぐん',
  samurai_geta: 'おちた とき の いたさ を へらす。はしる と カランコロン と ［心地｜ここち］よい おと が する',
};

const deps = (): TooltipDeps => ({
  nameOf: (i) => itemType(i)?.name ?? i,
  rarityOf: (i) => itemRarity(i),
  placeable: () => false,
  recipes: () => ALL_RECIPES,
});

describe('§3.1 虹色の 行（とくべつな ちから）', () => {
  it('ITEM_INFO: 侍装備 4 つの special が 表の とおり', () => {
    for (const id of SAMURAI) expect((ITEM_INFO as Record<string, { special?: string }>)[id]?.special, id).toBe(SPECIAL[id]);
  });
  it('ツールチップ: special の 文が 入り、虹色の 見出しは「とくべつな ちから」', () => {
    for (const id of SAMURAI) {
      const t = buildTooltip(id, deps()) as unknown as { special: string | null; specialHead: string };
      expect(t.special, id).toBe(SPECIAL[id]);
      expect(t.specialHead, id).toBe('とくべつな ちから');
    }
  });
  it('説明パネル（craft.info）にも 同じ special が 入る', () => {
    const info = createItemInfo({ recipes: () => ALL_RECIPES, nameOf: (i) => itemType(i)?.name ?? i, numbers: () => defaultInfoNumbers() });
    for (const id of SAMURAI) expect((info.info(id) as unknown as { special?: string }).special, id).toBe(SPECIAL[id]);
  });
  it('NINJA-1 の 忍者装備・3 本の 刀の special は そのまま（かわらない）', () => {
    const info = ITEM_INFO as Record<string, { special?: string }>;
    expect(info.ninja_tekko!.special).toBe('かたな・すで で こうげき した とき に ［小太刀｜こだち］ で おいうち');
    expect(info.niji!.special).toBe('ためて はなすと ひかり の ドーム');
  });
});

describe('AC19 文字（ひらがな・カタカナ。漢字は ルビ）', () => {
  it('侍装備の 名前・use・special・テロップ・実績の 名に ルビなしの 漢字が 無い', () => {
    for (const id of SAMURAI) {
      const t = ITEM_TYPES.find((x) => x.id === id)!;
      expect(t, id).toBeDefined();
      expect(findUnrubiedKanji(withRuby(t.name)), `${id} 名前`).toEqual([]);
      const info = ITEM_INFO[id] as { use: string; special?: string };
      expect(findUnrubiedKanji(withRuby(info.use)), `${id} use`).toEqual([]);
      expect(findUnrubiedKanji(withRuby(info.special ?? '')), `${id} special`).toEqual([]);
      for (const source of ['nushi', 'chest'] as const) {
        expect(findUnrubiedKanji(withRuby(telopText(source, t.name))), `${id} ${source}`).toEqual([]);
      }
    }
    const ach = ACHIEVEMENT_DEFS.filter((x) => x.id.startsWith('samurai.'));
    expect(ach).toHaveLength(2);
    for (const d of ach) expect(findUnrubiedKanji(withRuby(d.name)), d.id).toEqual([]);
  });
  it('よみ: 明珍陣笠 みょうちんじんがさ・明珍羽織 みょうちんはおり・明珍手甲 みょうちんてっこう・明珍下駄 みょうちんげた', () => {
    const yomi = (id: string) => yomiOf(ITEM_TYPES.find((x) => x.id === id)!.name).replace(/ /g, '');
    expect(yomi('samurai_jingasa')).toBe('みょうちんじんがさ');
    expect(yomi('samurai_haori')).toBe('みょうちんはおり');
    expect(yomi('samurai_tekko')).toBe('みょうちんてっこう');
    expect(yomi('samurai_geta')).toBe('みょうちんげた');
  });
  it('いちばん 長い 名前は 4 字（NINJA-1 の「忍びの 手甲」6 字より 短い）', () => {
    for (const id of SAMURAI) {
      const plain = withRuby(ITEM_TYPES.find((x) => x.id === id)!.name).replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]*>/g, ''); // 読み（rt）は 数えない
      expect(plain.length, id).toBeLessThanOrEqual(4);
    }
  });
});

describe('§3.2 テロップの 文（ヌシ・宝箱）', () => {
  const name = '［明珍｜みょうちん］［下駄｜げた］';
  it('ヌシから: 今の ままの 文（武器と 同じ）。宝箱: たからばこ に 〜 が はいって いた！', () => {
    expect(telopText('nushi', name)).toBe(`ヌシ が ${name} を おとした！`);
    expect(telopText('chest', name)).toBe(`たからばこ に ${name} が はいって いた！`);
  });
  it('上の 帯: 侍装備でも enqueueTelop(item, source) の source が info に 出る。省くと nushi', () => {
    const cfg = () => defaultCelebrateSettings();
    const b = new TopBandModel(cfg);
    b.enqueueTelop('samurai_geta' as ItemId, 'nushi');
    expect(b.step(1, false).telopStarted).toBe('samurai_geta');
    expect(b.info(null)).toMatchObject({ kind: 'telop', item: 'samurai_geta', source: 'nushi' });
    const c = new TopBandModel(cfg);
    c.enqueueTelop('samurai_haori' as ItemId);
    c.step(1, false);
    expect(c.info(null)).toMatchObject({ kind: 'telop', item: 'samurai_haori', source: 'nushi' });
  });
});
