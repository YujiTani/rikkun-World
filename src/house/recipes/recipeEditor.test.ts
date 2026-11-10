import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import {
  ENTRY, FORMS, PARTS, STYLES, SUFFIX_NAME, NONE_PARTS, ROW_MAX, USUAL, allRecipes, btnIds, btnOn, ed, formOf, goStep, kindBtns, learnAll, openEd, openPopup, popupRowsOf, rh,
  type Part,
} from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3 版 docs/design/HOUSE-2.md §2.3・§6.2）AC3: おぼえた 物だけ 出る・「あたらしい！」は しゅるいの ボタン ごと。
 * 約束（ボタンの id・editor() の 項目・edit の op・recipeKinds）は e2e/helpers/house.ts の「2A の 約束」。レシピの 数・しゅるいの 数は 書かない（recipes().all・recipeKinds から）。
 * ポップアップの 開き閉じ・えらび方・もどす は recipePopup.test.ts（AC4・AC5）。画面を 通す 確かめは e2e/house2.spec.ts と e2e/ui-gate.spec.ts（AC9）。
 */

const ALL = allRecipes();
const SOTO = ALL.filter((id) => ENTRY[id]?.step === 'soto');
const sorted = (a: readonly string[]): string[] => [...a].sort();

describe('AC3 レシピ 1 まいで 3 つ（むら・おしろ・こうざん）', () => {
  it('ENTRY ＝ 表: recipeKit の ENTRY の 名前と 窓口 recipes().all が 同じ（レシピを ふやしたら ENTRY も ふやす）', () => {
    expect(sorted(rh(houseRig()).recipes().all)).toEqual(sorted(Object.keys(ENTRY)));
  });

  it('表の ぜんぶに えらび方の 約束が ある。窓口 recipeKinds(id) ＝ そのレシピの ボタンの id の 列（recipeKit の ENTRY と 同じ）', () => {
    expect(ALL.length).toBeGreaterThan(0);
    const r = houseRig();
    for (const id of ALL) {
      expect(ENTRY[id], `${id} の えらび方`).toBeDefined();
      expect(rh(r).recipeKinds(id), `${id} の recipeKinds`).toEqual(ENTRY[id]!.btns);
    }
  });

  it('① の 形（やね・かべ・まど・と・えんとつ・のれん・はなだん）は 1 まいで むら・おしろ・こうざんの 3 つ。しゃちほこ・あかり・まねきねこ・後ろの 文字は 1 つ。ボタンの id は どの レシピとも 重ならない', () => {
    const r = houseRig();
    const seen = new Set<string>();
    for (const id of ALL) {
      const e = ENTRY[id]!;
      const got = rh(r).recipeKinds(id);
      if (e.step === 'soto' && id !== 'deco_shachi') {
        expect(got, `${id}: むら・おしろ・こうざん`).toEqual(STYLES.map((s) => `${e.part}-${formOf(id)}_${s}`));
      } else expect(got, `${id}: 1 つ`).toHaveLength(1);
      for (const b of got) {
        expect(seen.has(b), `${b} は ほかの レシピと 重ならない`).toBe(false);
        seen.add(b);
      }
    }
  });

  it('はじめは: ばしょの ボタン 4 つ（かざりは なし）・しゅるいの ボタンは ポップアップを 開くまで 出ない。② は ふとん…の 家具と ちょうちん だけ。③ 後ろの 文字は 5 つ。editor() は はじめの 物', () => {
    const r = houseRig();
    openEd(r);
    expect(ed(r)).toMatchObject({ popup: null, roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern', marks: [] });
    expect(btnIds(r).filter((i) => i.startsWith('part-')).sort()).toEqual(['part-door', 'part-roof', 'part-wall', 'part-window']);
    expect(kindBtns(r), 'ポップアップが とじて いる 間は しゅるいの ボタンは ない').toEqual([]);
    for (const part of PARTS.filter((p) => p !== 'deco')) {
      openPopup(r, part);
      expect(kindBtns(r), `${part} の しゅるい（おぼえた 物は なし ＝ いつもの 物だけ）`).toEqual(USUAL[part].map((k) => `${part}-${k}`));
      r.sys.press('popupClose');
    }
    goStep(r, 'naka');
    expect(btnIds(r).filter((i) => i.startsWith('light-'))).toEqual(['light-lantern']);
    expect(btnIds(r)).not.toContain('furniture-maneki');
    goStep(r, 'namae');
    expect(btnIds(r).filter((i) => i.startsWith('suffix-'))).toEqual(['suffix-0', 'suffix-1', 'suffix-2', 'suffix-3', 'suffix-4']);
  });
});

describe('AC3 おぼえた 物だけ 出る（レシピ 1 まいごと）', () => {
  for (const id of ALL) {
    it(`${id}: おぼえる まで 出ない → おぼえると 出て ボタンごとに「あたらしい！」→ 1 つずつ えらぶと その ボタンの 印だけ 消える`, () => {
      const e = ENTRY[id]!;
      // おぼえる 前: 出ない（その すすみ・その ばしょの ポップアップで しらべる）
      const a = houseRig();
      openEd(a);
      goStep(a, e.step);
      if (e.part === 'deco') expect(btnIds(a), 'かざりの ばしょは かざりを 1 つ おぼえる まで ない').not.toContain('part-deco');
      else if (e.part) openPopup(a, e.part);
      for (const b of e.btns) expect(btnIds(a), `${id}: おぼえる 前は ${b} が 出ない`).not.toContain(b);

      // おぼえた あと（エディターを 開く 前に）: 出る・ボタンごとに「あたらしい！」・レシピは fresh に 1 つ
      const r = houseRig();
      expect(rh(r).learn(id)).toBe(true);
      expect(rh(r).recipes().fresh).toEqual([id]);
      openEd(r);
      goStep(r, e.step);
      expect(ed(r).popup, 'エディターを 開いた ときは ポップアップは とじて いる').toBeNull();
      if (e.part) {
        expect(btnIds(r), `${id}: ばしょの ボタン`).toContain(`part-${e.part}`);
        expect(kindBtns(r), 'ポップアップを 開く 前は しゅるいの ボタンは 出ない').toEqual([]);
        openPopup(r, e.part);
      }
      for (const b of e.btns) expect(btnOn(r, b), `${id}: ${b} が 出て 押せる`).toBe(true);
      expect(sorted(ed(r).marks), `${id}: 印は しゅるいの ボタン ごと（① なら ばしょの ボタンにも）`).toEqual(sorted([...e.btns, ...(e.part ? [`part-${e.part}`] : [])]));

      // 1 つずつ えらぶ・つける: その ボタンの 印だけ 消える。ほかの 案の 印は のこる
      e.btns.forEach((b, i) => {
        r.sys.press(b);
        const left = e.btns.slice(i + 1);
        expect(sorted(ed(r).marks), `${id}: ${b} を えらぶと その 印だけ 消える`).toEqual(sorted(left.length > 0 && e.part ? [...left, `part-${e.part}`] : left));
        expect(rh(r).recipes(), `${id}: のこりの 印が ある 間は fresh に のこる`).toMatchObject({ learned: [id], fresh: left.length > 0 ? [id] : [] });
        if (e.field === 'deco') expect(ed(r).deco, `${id}: ${b}`).toEqual([e.kinds[i]]);
        else if (e.field) expect(ed(r)[e.field], `${id}: ${b}`).toBe(e.kinds[i]);
        if (e.part) expect(ed(r).popup, '1 つ えらんでも ポップアップは 開いた まま').toBe(e.part);
      });
      expect(ed(r).marks, `${id}: ぜんぶ えらんだ あとは 印は ひとつも ない（ばしょの 印も）`).toEqual([]);
      if (id in SUFFIX_NAME) expect(ed(r).name.back).toBe(SUFFIX_NAME[id]);
    });
  }

  it('ばしょの ボタンの 印は、その ばしょに 印の のこった しゅるいが ある 間 だけ。ポップアップを 開いた だけでは 消えない。かざりの ばしょは かざりを 1 つ おぼえたら 出る', () => {
    const r = houseRig();
    for (const id of ['roof_kawara', 'roof_sankaku', 'deco_noren']) rh(r).learn(id);
    openEd(r);
    expect(btnIds(r), 'かざりを おぼえたので かざりの ばしょが 出る').toContain('part-deco');
    const roofBtns = [...ENTRY.roof_kawara!.btns, ...ENTRY.roof_sankaku!.btns];
    expect(sorted(ed(r).marks)).toEqual(sorted(['part-roof', 'part-deco', ...roofBtns, ...ENTRY.deco_noren!.btns]));
    openPopup(r, 'roof');
    expect(ed(r).marks, '開いた だけでは 消えない').toContain('part-roof');
    // やねの しゅるいを 1 つ のこして ぜんぶ えらぶ: ばしょの 印は のこる
    for (const b of roofBtns.slice(0, -1)) r.sys.press(b);
    expect(ed(r).marks, 'まだ 1 つ のこる ので ばしょの 印は のこる').toContain('part-roof');
    r.sys.press(roofBtns.at(-1)!);
    expect(ed(r).marks, 'やねの 印は ぜんぶ 消えた').not.toContain('part-roof');
    expect(sorted(ed(r).marks.filter((m) => m.startsWith('roof-') || m === 'part-roof'))).toEqual([]);
    r.sys.press('popupClose');
    expect(sorted(ed(r).marks), 'かざりの 印は まだ').toEqual(sorted(['part-deco', ...ENTRY.deco_noren!.btns]));
    openPopup(r, 'deco');
    r.sys.press(ENTRY.deco_noren!.btns[0]!); // つける
    r.sys.press(ENTRY.deco_noren!.btns[0]!); // はずす
    expect(sorted(ed(r).marks), '一度 えらんだ 物は はずしても 印は もどらない').toEqual(sorted(['part-deco', ...ENTRY.deco_noren!.btns.slice(1)]));
  });

  it('おぼえて いない 物は edit でも 押しても えらべない（false・何も かわらない）。おぼえた レシピの 3 つだけ えらべて、ほかの レシピの 物は まだ', () => {
    const r = houseRig();
    openEd(r);
    for (const id of SOTO) {
      const e = ENTRY[id]!;
      for (const k of e.kinds) expect(r.hook.edit({ op: e.field, kind: k }), `${id} の ${k}: おぼえる 前は false`).toBe(false);
    }
    expect(ed(r).canUndo, '何も かわらない').toBe(false);
    expect(ed(r)).toMatchObject({ roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [] });
    rh(r).learn('roof_kawara');
    for (const k of ENTRY.roof_kawara!.kinds) expect(r.hook.edit({ op: 'roof', kind: k }), `${k}`).toBe(true);
    for (const k of ENTRY.roof_sankaku!.kinds) expect(r.hook.edit({ op: 'roof', kind: k }), `${k}: まだ`).toBe(false);
    openPopup(r, 'roof');
    const was = JSON.stringify(ed(r));
    for (const b of ENTRY.roof_sankaku!.btns) {
      expect(btnIds(r), `${b} は 出て いない`).not.toContain(b);
      r.sys.press(b);
      expect(JSON.stringify(ed(r)), `${b} を 押しても 何も おきない`).toBe(was);
    }
  });
});

describe('AC3 ポップアップの ならび（popupRows。いつもの → むら → おしろ → こうざん・1 行に 1 つの なかま・1 行 5 こ まで・左 つめ・空の 行 なし）', () => {
  /** popupRows の きまり（表を 見ずに 守る べき 物）。rows ＝ editor().popupRows */
  function rowRules(rows: string[][], part: Part, label: string): void {
    const styleOf = (id: string): number => {
      const m = /_(mura|shiro|kozan)$/.exec(id);
      return m ? 1 + STYLES.indexOf(m[1] as (typeof STYLES)[number]) : id === 'deco-shachi' ? 2 : 0; // しゃちほこ は おしろの 行
    };
    expect(rows.every((r) => r.length > 0), `${label}: 空の 行は ない`).toBe(true);
    expect(rows.every((r) => r.length <= ROW_MAX), `${label}: 1 行 ${ROW_MAX} こ まで`).toBe(true);
    rows.forEach((r, i) => expect(new Set(r.map(styleOf)).size, `${label}: ${i + 1} 行目は 1 つの なかま だけ`).toBe(1));
    const order = rows.map((r) => styleOf(r[0]!));
    expect(order, `${label}: いつもの → むら → おしろ → こうざん の 順`).toEqual([...order].sort((a, b) => a - b));
    expect(rows.flat().every((id) => id.startsWith(`${part}-`)), `${label}: その ばしょの ボタンだけ`).toBe(true);
  }

  it('はじめ: いつもの 行だけ。やね・かべ・まどは「なし」が いちばん 左（<ばしょ>-none）、と・かざりに なしは ない', () => {
    const r = houseRig();
    openEd(r);
    for (const part of PARTS.filter((p) => p !== 'deco')) {
      openPopup(r, part);
      expect(ed(r).popupRows, `${part}`).toEqual(popupRowsOf(part, []));
      expect(ed(r).popupRows.length, `${part}: いつもの 行 1 つ`).toBe(1);
      const first = ed(r).popupRows[0]![0];
      if (NONE_PARTS.includes(part)) expect(first, `${part} の いちばん 左`).toBe(`${part}-none`);
      else expect(ed(r).popupRows.flat().some((id) => id.endsWith('-none')), `${part} に なしは ない`).toBe(false);
      r.sys.press('popupClose');
      expect(ed(r).popupRows, 'とじると 行は ない').toEqual([]);
    }
  });

  it('ぜんぶ おぼえた とき: ばしょごとに 並びが §2.3 の 表の とおり（しゃちほこ は おしろの 行だけ）。menu().buttons の 並びも 同じ。形は 表から（recipeKit の FORMS）', () => {
    const r = houseRig();
    learnAll(r);
    openEd(r);
    for (const part of PARTS) {
      openPopup(r, part);
      expect(ed(r).popupRows, `${part} の 行`).toEqual(popupRowsOf(part, FORMS[part]));
      rowRules(ed(r).popupRows, part, part);
      expect(kindBtns(r), `${part} の ならび（menu の 並び ＝ 行を 上から 左から）`).toEqual(ed(r).popupRows.flat());
      r.sys.press('popupClose');
    }
  });

  it('一部だけ おぼえた とき: おぼえた 形だけが 左から つまる。レシピ 1 まいで 3 つの なかま（むら・おしろ・こうざん）の 行が ぜんぶ そろって 出る', () => {
    const r = houseRig();
    for (const id of ['roof_kin', 'roof_sankaku', 'wall_ishi']) rh(r).learn(id);
    openEd(r);
    for (const [part, forms] of [['roof', ['sankaku', 'kin']], ['wall', ['ishi']]] as [Part, string[]][]) {
      openPopup(r, part);
      expect(ed(r).popupRows).toEqual(popupRowsOf(part, forms));
      rowRules(ed(r).popupRows, part, part);
      expect(ed(r).popupRows.length, `${part}: いつもの 行 ＋ 3 つの なかま`).toBe(1 + STYLES.length);
      for (const [i, s] of STYLES.entries()) expect(ed(r).popupRows[1 + i], `${part} の ${s} の 行`).toEqual(forms.length > 0 ? popupRowsOf(part, forms)[1 + i] : []);
      r.sys.press('popupClose');
    }
  });

  it('かざり: おぼえた 形だけ。むら・おしろ・こうざん の 行（いつもの 行は ない ＝ 空の 行を 出さない）。しゃちほこ だけ おぼえた とき は おしろの 行 1 つ', () => {
    const r = houseRig();
    rh(r).learn('deco_shachi');
    openEd(r);
    openPopup(r, 'deco');
    expect(ed(r).popupRows, 'しゃちほこ だけ').toEqual([['deco-shachi']]);
    rh(r).learn('deco_noren');
    r.sys.press('popupClose');
    openPopup(r, 'deco');
    expect(ed(r).popupRows).toEqual(popupRowsOf('deco', ['noren', 'shachi']));
    rowRules(ed(r).popupRows, 'deco', 'deco');
  });
});
