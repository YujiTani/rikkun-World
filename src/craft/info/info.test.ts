import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { YOKAI_DROPS } from '../../yokai/ai/config';
import { findUnrubiedKanji } from '../../ui/text';
import { itemType } from '../../inventory/items';
import { rarityTier } from '../../drops/rarity';
import { CRAFT_DEFAULTS } from '../config';
import { ALL_RECIPES } from '../recipes';
import { createItemInfo, defaultInfoNumbers, descOf, type InfoNumbers } from './build';
import { ITEM_INFO } from './table';

const RECIPES = [...ALL_RECIPES.filter((r) => r.station === 'craft'), ...ALL_RECIPES.filter((r) => r.station === 'furnace')];
const nameOf = (i: ItemId) => ((i as string) === 'tansu' ? 'たんす' : (itemType(i)?.name ?? i));

function make(patch: Partial<InfoNumbers> = {}) {
  return createItemInfo({ recipes: () => RECIPES, nameOf, numbers: () => ({ ...defaultInfoNumbers(), ...patch }) });
}

describe('説明の表（M6 §2.2）', () => {
  const src = make();
  it('ようかいだま をのぞく 57 こ（LIVE-1: たまご 込み）。文はすべて ひらがな・カタカナ（漢字なし）', () => {
    const ids = Object.keys(ITEM_INFO).filter((i) => i !== 'yokai_orb');
    expect(ids).toHaveLength(57);
    for (const id of ids) {
      const i = src.info(id as ItemId);
      expect(findUnrubiedKanji(`${i.use}${i.how}${i.source}${i.stats.map((s) => s.label + s.value).join('')}`), id).toEqual([]);
      expect(i.use, id).not.toBe('');
      expect(i.how === '' && i.buttons.length === 0 && !i.later && id !== 'ya', id).toBe(false);
    }
  });
  it('どこで: 自動の文', () => {
    expect(src.info('paper').source).toBe('からかさ・ちょうちん が おとす');
    expect(src.info('kawara').source).toBe('ねんど 1 を かまど で やく');
    expect(src.info('dirt').source).toBe('つち を ほる・ぬりかべ が おとす');
    expect(src.info('iron_ore').source).toBe('てつ を ほる（いしの つるはし から）・からかさ が おとす');
    expect(src.info('furnace').source).toBe('いし 5 で つくる');
    expect(src.info('iron_ingot').source).toBe('てつ 1 を かまど で やく');
  });
  it('U3: sourceYokai はドロップ表と同じ', () => {
    for (const id of ['paper', 'oil', 'string', 'cloth', 'clay', 'crystal', 'log', 'dirt', 'stone', 'coal_ore', 'iron_ore']) {
      const want = Object.entries(YOKAI_DROPS)
        .filter(([, rows]) => rows.some((r) => r.item === id))
        .map(([k]) => k);
      expect(src.info(id as ItemId).sourceYokai, id).toEqual(want);
    }
  });
  it('U4・U14: usedIn は材料にするレシピ（たんす をふくむ 9 こ）', () => {
    expect(src.info('iron_ingot').usedIn).toEqual(['iron_pickaxe', 'iron_axe', 'katana', 'naginata', 'crystal_katana', 'kabuto', 'yoroi', 'kote', 'suneate', 'tansu', 'watering_can', 'long_watering_can', 'sprinkler', 'bucket']);
    for (const id of src.items()) {
      const used = src.info(id as ItemId).usedIn;
      for (const r of RECIPES) expect(used.includes(r.id) === r.inputs.some((i) => i.item === id), `${id}/${r.id}`).toBe(true);
    }
  });
  it('U13: later は 働きがあとの 6 こ（レシピの works:false と同じ）', () => {
    const later = src.items().filter((i) => src.info(i as ItemId).later !== null).sort();
    const recipes = RECIPES.filter((r) => !r.works).map((r) => r.output.item as string).sort();
    expect(later).toEqual(recipes);
    expect(later).toHaveLength(6);
    expect(src.info('kite').how).toBe('いまは もてる だけ');
  });
  it('U1: おけるものは buttons に right。U10 の ぼうぐ は right', () => {
    for (const id of ['grass', 'dirt', 'stone', 'sand', 'log', 'leaves', 'coal_ore', 'furnace', 'kawara', 'brick', 'torch', 'tansu', 'kabuto']) {
      expect(src.info(id as ItemId).buttons, id).toContain('right');
    }
  });
  it('レシピのできるものは かならず「つくる」の文が source に入る', () => {
    for (const r of RECIPES) expect(src.info(r.output.item).source, r.id).toMatch(/で つくる|を かまど で やく/);
  });
});

describe('つよさ は設定から（U7〜U10）', () => {
  it('katana: AC4 の形。設定を変えると数も変わる', () => {
    const a = make().info('katana');
    expect(a.stats.map(({ key, value, max }) => ({ key, value, max }))).toEqual([
      { key: 'damage', value: 4, max: 6 },
      { key: 'reach', value: 2.2, max: undefined }, // WEAPON-4: 刀の 射程 bladeReach
      { key: 'speed', value: 'ふつう', max: undefined },
      { key: 'durability', value: 250, max: undefined },
    ]);
    const b = make({ weaponDamage: { ...defaultInfoNumbers().weaponDamage, katana: 5 } }).info('katana');
    expect(b.stats[0].value).toBe(5);
  });
  it('WEAPON-4 AC10: ぼくとう・かたな・きらめく カタナの「とどく」は 2.2。なぎなた 5.0 は 今のまま', () => {
    for (const id of ['bokuto', 'katana', 'crystal_katana'] as const) {
      const s = make().info(id).stats;
      expect(s[1].key, id).toBe('reach');
      expect(s[1].value, id).toBe(2.2);
    }
    expect(make().info('naginata').stats[1].value).toBe(5.0);
  });
  it('WEAPON-6 AC10: きらめく カタナの 説明（つよさ 4・たいきゅう 400・3 だん わざ）。かたな・ぼくとうは 今のまま', () => {
    const k = make().info('crystal_katana');
    expect(k.stats.find((x) => x.key === 'damage')!.value).toBe(4);
    expect(k.stats.find((x) => x.key === 'durability')!.value).toBe(400);
    expect(k.stats).toHaveLength(4);
    expect(k.use).toBe('れんぞく で ふると 3 だん わざ に なる かたな');
    expect(k.how).toContain('3 だん わざ');
    expect(findUnrubiedKanji(`${k.use}${k.how}`)).toEqual([]);
    expect(make().info('katana').use).toBe('ようかい を つよく たたく');
    expect(make().info('katana').how).not.toContain('3 だん');
    expect(make().info('bokuto').how).not.toContain('3 だん');
  });
  it('なぎなた: とどく（設定の値）・ゆっくり', () => {
    const s = make().info('naginata').stats;
    expect(s[1].value).toBe(defaultInfoNumbers().weaponReach.naginata);
    expect(s[2].value).toBe('ゆっくり');
  });
  it('つるはし: ほる つよさ と てつ ○/×', () => {
    const n = defaultInfoNumbers();
    for (const [id, p, iron] of [['wood_pickaxe', 2, '×'], ['stone_pickaxe', 4, '○'], ['iron_pickaxe', 6, '○']] as const) {
      const s = make().info(id).stats;
      expect(s[0].value).toBe(n.toolPower[id]);
      expect(s[0].value).toBe(p);
      expect(s[1].value).toBe(iron);
    }
    expect(make({ toolPower: { stone_pickaxe: 3 } }).info('stone_pickaxe').stats[0].value).toBe(3);
  });
  it('ゆみ・や', () => {
    expect(make().info('yumi').stats.map((s) => s.value)).toEqual(['1〜3', 384, 'とおくへ とぶ']);
    expect(make().info('ya').stats[0].value).toBe(2);
  });
  it('ぼうぐ: かぶと=玉・よろい・こて=ふつう・すねあて=落下 の数を出す', () => {
    const v = (id: string) => make().info(id as ItemId).stats[0].value;
    expect(v('kabuto')).toBe(CRAFT_DEFAULTS.armorValue.kabuto!.ball);
    expect(v('yoroi')).toBe(CRAFT_DEFAULTS.armorValue.yoroi!.normal);
    expect(v('kote')).toBe(CRAFT_DEFAULTS.armorValue.kote!.normal);
    expect(v('suneate')).toBe(CRAFT_DEFAULTS.armorValue.suneate!.fall);
    expect(make().info('suneate').use).toContain('おちた');
  });
  it('たんす: しまえる マス 54。めずらしさのことば', () => {
    expect(make().info('tansu' as ItemId).stats[0].value).toBe(54);
    expect(make().info('katana').rarityWord).toBe(rarityTier('rare').word);
    expect(make().info('katana').stars).toBe(3);
  });
  it('ツールチップの desc は「なにに」と同じ', () => {
    expect(descOf('log')).toBe(ITEM_INFO.log.use);
  });
});
