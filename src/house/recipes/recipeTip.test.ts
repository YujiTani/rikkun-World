import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { ed, learnAll, openEd, openPopup, rh, type Rig } from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3.2 版 §2.3「名前の ヘルプ」・§6.1・AC9b）: ばしょ・しゅるいの ボタンに のせて 12 コマで `editor().hoverTip { id, lines }`。
 * 11 コマ目までは null。はなすと 次の コマで null。出て いる 間に となりへ うつると 待たずに 切りかわる。押しても 消えない。ポップアップが とじると null。
 * のせる・はなす は 窓口 `hover(id | null)`、コマは 1 ステップ ＝ HouseSystem.update() 1 回（rig.run(n)）。字は 空白を くらべない。
 * 置き場所（カーソルの 近く・画面の ふちで 止める）と 見た目は E2E（e2e/house2.spec.ts・ui-gate）。
 */

const squash = (s: string): string => s.replace(/\s+/g, '');
const tip = (r: Rig): { id: string; lines: string[] } | null => ed(r).hoverTip;
const lines = (r: Rig): string[] => (tip(r)?.lines ?? []).map(squash);
/** のせて 12 コマ まって 出た ヘルプの 字 */
function shown(r: Rig, id: string): string[] {
  r.hook.hover(id);
  r.run(12);
  expect(tip(r)?.id, `${id} の ヘルプ`).toBe(id);
  return lines(r);
}

describe('AC9b 名前の ヘルプ: 出る タイミング', () => {
  it('のせて 11 コマ目までは null・12 コマ目で { id, lines }。はなすと 次の コマで null', () => {
    const r = houseRig();
    rh(r).learn('roof_kawara');
    openEd(r);
    expect(tip(r)).toBeNull();
    openPopup(r, 'roof');
    r.hook.hover('roof-kawara_shiro');
    for (let i = 1; i <= 11; i++) {
      r.run(1);
      expect(tip(r), `${i} コマ目`).toBeNull();
    }
    r.run(1);
    expect(tip(r)?.id, '12 コマ目').toBe('roof-kawara_shiro');
    expect(lines(r), 'しゅるいは 1 行').toEqual(['おしろのかわらのやね']);
    r.hook.hover(null);
    r.run(1);
    expect(tip(r), 'はなすと 次の コマで null').toBeNull();
  });

  it('出て いる 間に となりへ うつると 待たずに 切りかわる。はなして すぐ のせなおすと また 12 コマ', () => {
    const r = houseRig();
    rh(r).learn('roof_kawara');
    openEd(r);
    openPopup(r, 'roof');
    shown(r, 'roof-kawara_mura');
    r.hook.hover('roof-kawara_kozan');
    r.run(1);
    expect(tip(r)?.id, '待たずに 切りかわる').toBe('roof-kawara_kozan');
    expect(lines(r)).toEqual(['こうざんのかわらのやね']);
    r.hook.hover(null);
    r.run(1);
    r.hook.hover('roof-flat');
    r.run(11);
    expect(tip(r), 'のせなおしは また 12 コマ').toBeNull();
    r.run(1);
    expect(tip(r)?.id).toBe('roof-flat');
  });

  it('押しても 消えない。ポップアップが とじると null。ばしょ・しゅるいの ボタン いがい（next など）に のせても 出ない', () => {
    const r = houseRig();
    rh(r).learn('roof_kawara');
    openEd(r);
    openPopup(r, 'roof');
    shown(r, 'roof-kawara_shiro');
    r.sys.press('roof-kawara_shiro');
    r.run(1);
    expect(tip(r)?.id, '押しても 消えない').toBe('roof-kawara_shiro');
    r.sys.press('popupClose');
    r.run(1);
    expect(tip(r), 'ポップアップが とじると null').toBeNull();
    r.hook.hover('next');
    r.run(30);
    expect(tip(r), 'ボタン いがいには 出ない').toBeNull();
    r.hook.hover('width-7');
    r.run(30);
    expect(tip(r)).toBeNull();
  });

  it('② ③ へ 行く・エディターを とじる と null', () => {
    const r = houseRig();
    openEd(r);
    shown(r, 'part-roof');
    r.sys.press('next');
    r.run(1);
    expect(tip(r)).toBeNull();
  });
});

describe('AC9b 名前の ヘルプ: 字', () => {
  it('しゅるいの ボタン: §2.3 の 名前 1 行（いつもの 物・なし・むら/おしろ/こうざんの ＋ 形の 名前・しゃちほこ は きんの しゃちほこ）', () => {
    const r = houseRig();
    learnAll(r);
    openEd(r);
    const want: [string, string, string[]][] = [
      ['roof', 'roof-flat', ['たいら']], ['roof', 'roof-none', ['なし']], ['wall', 'wall-ki', ['き']], ['wall', 'wall-none', ['なし']],
      ['window', 'window-shoji', ['しょうじ']], ['window', 'window-none', ['なし']], ['door', 'door-ie', ['いえのと']],
      ['roof', 'roof-kawara_mura', ['むらのかわらのやね']], ['wall', 'wall-ishi_kozan', ['こうざんのいしのかべ']],
      ['window', 'window-suisho_kozan', ['こうざんのすいしょうのまど']], ['door', 'door-tetsu_shiro', ['おしろのてつのと']],
      ['deco', 'deco-entotsu_kozan', ['こうざんのレンガのえんとつ']], ['deco', 'deco-shachi', ['きんのしゃちほこ']],
    ];
    for (const [part, id, text] of want) {
      openPopup(r, part as 'roof');
      expect(shown(r, id), id).toEqual(text);
      r.hook.hover(null);
      r.sys.press('popupClose');
    }
  });

  it('ばしょの ボタン: 1 行目 ばしょの 名前・2 行目「いま: 〇〇」（えらんで いる しゅるい。かざりは 数、何も なければ「いま: なし」）', () => {
    const r = houseRig();
    learnAll(r);
    openEd(r);
    expect(shown(r, 'part-roof'), 'やね').toEqual(['やね', 'いま:たいら']);
    expect(shown(r, 'part-wall')).toEqual(['かべ', 'いま:き']);
    expect(shown(r, 'part-window')).toEqual(['まど', 'いま:しょうじ']);
    expect(shown(r, 'part-door')).toEqual(['と', 'いま:いえのと']);
    expect(shown(r, 'part-deco'), 'かざりは なにも なければ なし').toEqual(['かざり', 'いま:なし']);
    r.hook.edit({ op: 'roof', kind: 'kawara_shiro' });
    r.hook.edit({ op: 'wall', kind: 'none' });
    expect(shown(r, 'part-roof'), 'えらんだら かわる').toEqual(['やね', 'いま:おしろのかわらのやね']);
    expect(shown(r, 'part-wall'), 'なしは「なし」').toEqual(['かべ', 'いま:なし']);
    r.hook.edit({ op: 'deco', kind: 'entotsu_mura' });
    expect(shown(r, 'part-deco'), '1 つ').toEqual(['かざり', 'いま:1つ']);
    r.hook.edit({ op: 'deco', kind: 'noren_shiro' });
    expect(shown(r, 'part-deco'), '2 つ').toEqual(['かざり', 'いま:2つ']);
  });
});
