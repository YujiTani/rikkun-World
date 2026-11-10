import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { ENTRY, SUFFIX_NAME, allRecipes, btnIds, btnOn, ed, goStep, openEd, rh } from './recipeKit';

/**
 * HOUSE-2A（#364）AC3（おぼえた 物だけ 出る・あたらしい！）・AC4（えらび方・かざり・もどす）。仕様 docs/design/HOUSE-2.md §2.3・§6.2。
 * 約束（ボタンの id・editor() の 項目・edit の op）は e2e/helpers/house.ts の「2A の 約束」。レシピの 数は 書かない（recipes().all から）。
 * 画面を 通す 確かめは e2e/house2.spec.ts（通し）と e2e/ui-gate.spec.ts（AC10）。
 */

const ALL = allRecipes();
const SOTO_KINDS = ALL.filter((id) => ENTRY[id]?.step === 'soto');

describe('AC3 おぼえた 物だけ 出る', () => {
  it('表の ぜんぶに えらび方の 約束が ある（recipeKit の ENTRY）。ぜんぶ 窓口が ある', () => {
    expect(ALL.length).toBeGreaterThan(0);
    for (const id of ALL) expect(ENTRY[id], `${id} の えらび方`).toBeDefined();
  });

  it('はじめは: ① ばしょ 4 つ（かざりは なし）・やねは たいら だけ。② ふとん…の 13 しゅるいは まねきねこ なし・あかりは ちょうちん だけ。③ 後ろの 文字は 5 つ。editor() は はじめの 物', () => {
    const r = houseRig();
    openEd(r);
    expect(ed(r)).toMatchObject({ part: 'roof', roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern', marks: [] });
    expect(btnIds(r).filter((i) => i.startsWith('part-')).sort()).toEqual(['part-door', 'part-roof', 'part-wall', 'part-window']);
    expect(btnIds(r).filter((i) => /^(roof|wall|windowKind|door|deco)-/.test(i))).toEqual(['roof-flat']);
    for (const [part, first] of [['wall', 'wall-ki'], ['window', 'windowKind-shoji'], ['door', 'door-ie']] as const) {
      r.sys.press(`part-${part}`);
      expect(ed(r).part).toBe(part);
      expect(btnIds(r).filter((i) => /^(roof|wall|windowKind|door|deco)-/.test(i)), `${part} の しゅるい`).toEqual([first]);
    }
    goStep(r, 'naka');
    expect(btnIds(r).filter((i) => i.startsWith('light-'))).toEqual(['light-lantern']);
    expect(btnIds(r)).not.toContain('furniture-maneki');
    goStep(r, 'namae');
    expect(btnIds(r).filter((i) => i.startsWith('suffix-'))).toEqual(['suffix-0', 'suffix-1', 'suffix-2', 'suffix-3', 'suffix-4']);
  });

  for (const id of ALL) {
    it(`${id}: おぼえる まで 出ない → おぼえると 出て「あたらしい！」→ えらぶ・つける と 消える`, () => {
      const e = ENTRY[id]!;
      // おぼえる 前: 出ない（その すすみ・その ばしょで しらべる）
      const a = houseRig();
      openEd(a);
      goStep(a, e.step);
      if (e.part && e.part !== 'deco') a.sys.press(`part-${e.part}`);
      expect(btnIds(a), `${id}: おぼえる 前は ${e.btn} が 出ない`).not.toContain(e.btn);
      if (e.part === 'deco') expect(btnIds(a), 'かざりの ばしょは かざりを 1 つ おぼえる まで ない').not.toContain('part-deco');

      // おぼえた あと（エディターを 開く 前に）: 出る・ひとつ だけ「あたらしい！」
      const r = houseRig();
      expect(rh(r).learn(id)).toBe(true);
      expect(rh(r).recipes().fresh).toEqual([id]);
      openEd(r);
      goStep(r, e.step);
      if (e.part) {
        expect(btnIds(r), `${id}: ばしょの ボタン`).toContain(`part-${e.part}`);
        r.sys.press(`part-${e.part}`);
      }
      expect(btnOn(r, e.btn), `${id}: ${e.btn} が 出て 押せる`).toBe(true);
      expect(ed(r).marks.sort(), `${id}: 印は しゅるいの ボタンと（① なら）ばしょの ボタン`).toEqual([e.btn, ...(e.part ? [`part-${e.part}`] : [])].sort());

      // えらぶ・つける: 印が 消える・fresh から はずれる・learned には のこる
      r.sys.press(e.btn);
      expect(ed(r).marks, `${id}: えらぶと 印が 消える（ばしょの 印も）`).toEqual([]);
      expect(rh(r).recipes()).toMatchObject({ learned: [id], fresh: [] });
      if (e.field === 'deco') expect(ed(r).deco).toEqual([e.kind]);
      else if (e.field) expect(ed(r)[e.field]).toBe(e.kind);
      if (id in SUFFIX_NAME) expect(ed(r).name.back).toBe(SUFFIX_NAME[id]);
    });
  }

  it('ばしょの ボタンの 印は、その ばしょに 印の のこった 物が ある 間 だけ。かざりの ばしょは かざりを 1 つ おぼえたら 出る', () => {
    const r = houseRig();
    rh(r).learn('roof_kawara');
    rh(r).learn('roof_sankaku');
    rh(r).learn('deco_noren');
    openEd(r);
    expect(ed(r).marks.sort()).toEqual(['part-deco', 'part-roof', 'roof-kawara', 'roof-sankaku'].sort());
    r.sys.press('roof-kawara');
    expect(ed(r).marks, 'まだ さんかくが のこる ので ばしょの 印は のこる').toContain('part-roof');
    expect(ed(r).marks).not.toContain('roof-kawara');
    r.sys.press('roof-sankaku');
    expect(ed(r).marks, 'やねの 印は ぜんぶ 消えた').toEqual(['part-deco']);
    r.sys.press('part-deco');
    expect([...ed(r).marks].sort(), 'ばしょを えらぶ だけでは 消えない').toEqual(['part-deco', 'deco-noren'].sort());
    r.sys.press('deco-noren');
    expect(ed(r).marks).toEqual([]);
    r.sys.press('deco-noren'); // はずす
    expect(ed(r).marks, '一度 えらんだ 物は はずしても 印は 出ない').toEqual([]);
  });

  it('エディターを 開いた ときの ばしょ: 印の ある ばしょが あれば その いちばん 左（やね・かべ・まど・と・かざり の 順）。なければ やね。② ③ から もどった ときは 前の ばしょの まま', () => {
    const r = houseRig();
    rh(r).learn('door_tetsu');
    rh(r).learn('deco_noren');
    openEd(r);
    expect(ed(r).part, 'と が かざりより 左').toBe('door');
    r.sys.press('part-wall');
    goStep(r, 'naka');
    goStep(r, 'soto');
    expect(ed(r).part, '② から もどっても かべの まま').toBe('wall');
    const q = houseRig();
    openEd(q);
    expect(ed(q).part, '印が なければ やね').toBe('roof');
  });

  it('おぼえて いない 物は edit でも えらべない（false・何も かわらない）', () => {
    const r = houseRig();
    openEd(r);
    for (const id of SOTO_KINDS) {
      const e = ENTRY[id]!;
      expect(r.hook.edit({ op: e.field, kind: e.kind }), `${id}: おぼえる 前は false`).toBe(false);
    }
    expect(ed(r).canUndo, '何も かわらない').toBe(false);
  });
});

describe('AC4 えらび方（1 つだけ・かざりは いくつでも・もどす）', () => {
  for (const id of ALL) {
    const e = ENTRY[id]!;
    if (!e.field || e.field === 'deco') continue;
    it(`${id}: 1 つ だけ。今と 同じ 物は false・canUndo 不変。もどす 1 回で もとに もどり、出て いない ばしょなら その ばしょ（すすみ）へ 切りかわる。すすむ で また 同じ`, () => {
      const r = houseRig();
      rh(r).learn(id);
      openEd(r);
      const was = ed(r)[e.field!];
      expect(r.hook.edit({ op: e.field, kind: e.kind }), '変える').toBe(true);
      expect(ed(r)[e.field!]).toBe(e.kind);
      expect(ed(r).canUndo).toBe(true);
      const keep = JSON.stringify({ u: ed(r).canUndo, r: ed(r).canRedo, v: ed(r)[e.field!] });
      expect(r.hook.edit({ op: e.field, kind: e.kind }), '今と 同じ 物').toBe(false);
      expect(JSON.stringify({ u: ed(r).canUndo, r: ed(r).canRedo, v: ed(r)[e.field!] }), '同じ 物を えらんでも もどす・すすむ は かわらない').toBe(keep);
      // 出て いない ところへ 移ってから もどす
      if (e.step === 'soto') r.hook.edit({ op: 'part', part: e.part === 'wall' ? 'roof' : 'wall' });
      else goStep(r, 'soto');
      expect(r.hook.edit({ op: 'undo' })).toBe(true);
      expect(ed(r)[e.field!], 'もどす 1 回で もとの 物').toBe(was);
      if (e.step === 'soto') expect(ed(r).part, 'もどした 物が ある ばしょへ').toBe(e.part);
      else expect(ed(r).step, 'もどした 物が ある すすみへ').toBe(e.step);
      expect(ed(r).canUndo, 'もどす 記録は それだけ').toBe(false);
      expect(r.hook.edit({ op: 'redo' })).toBe(true);
      expect(ed(r)[e.field!]).toBe(e.kind);
    });
  }

  it('たいら・き・しょうじ・いえの と・ちょうちんは いつでも えらべる（今と 同じ 物なので false）。ちがう しゅるいから もどす のは true で 1 回の 操作', () => {
    const r = houseRig();
    rh(r).learn('roof_kawara');
    rh(r).learn('light_hotaru');
    openEd(r);
    expect(r.hook.edit({ op: 'roof', kind: 'flat' }), '今と 同じ').toBe(false);
    expect(r.hook.edit({ op: 'roof', kind: 'kawara' })).toBe(true);
    expect(r.hook.edit({ op: 'roof', kind: 'flat' }), 'たいらへ もどす').toBe(true);
    expect(ed(r).roof).toBe('flat');
    expect(r.hook.edit({ op: 'light', kind: 'hotaru' })).toBe(true);
    expect(r.hook.edit({ op: 'light', kind: 'lantern' }), 'ちょうちんへ もどす').toBe(true);
    expect(ed(r).light).toBe('lantern');
    r.hook.edit({ op: 'undo' });
    r.hook.edit({ op: 'undo' });
    r.hook.edit({ op: 'undo' });
    r.hook.edit({ op: 'undo' });
    expect(ed(r)).toMatchObject({ roof: 'flat', light: 'lantern', canUndo: false });
  });

  it('あかりが ちょうちんの とき ちょうちんを 押す: 何も かわらず ふきだし「あかりは ひとつ ひつようだよ」（press light-lantern）', () => {
    const r = houseRig();
    rh(r).learn('light_suisho');
    openEd(r);
    goStep(r, 'naka');
    r.sys.press('light-lantern');
    expect(ed(r)).toMatchObject({ light: 'lantern', canUndo: false });
    expect(r.hook.menu().bubble.replace(/\s+/g, '')).toBe('あかりはひとつひつようだよ');
    r.sys.press('light', 'suisho'); // 2 引数の 形も 同じ ボタン
    expect(ed(r).light).toBe('suisho');
  });

  it('press の 2 引数の 形は 1 引数と 同じ（part・roof・wall・windowKind・door・deco）', () => {
    const r = houseRig();
    for (const id of ['roof_kawara', 'wall_ishi', 'window_maru', 'door_tetsu', 'deco_noren']) rh(r).learn(id);
    openEd(r);
    r.sys.press('part', 'wall');
    expect(ed(r).part).toBe('wall');
    r.sys.press('wall', 'ishi');
    r.sys.press('part', 'window');
    r.sys.press('windowKind', 'maru');
    r.sys.press('part', 'door');
    r.sys.press('door', 'tetsu');
    r.sys.press('part', 'roof');
    r.sys.press('roof', 'kawara');
    r.sys.press('part', 'deco');
    r.sys.press('deco', 'noren');
    expect(ed(r)).toMatchObject({ roof: 'kawara', wall: 'ishi', windowKind: 'maru', door: 'tetsu', deco: ['noren'] });
  });

  it('かざり: いくつでも。同じ 物を もう 1 回 押すと はずれる。つける・はずす は どちらも もどす 1 回。おぼえて いない かざりは false', () => {
    const r = houseRig();
    rh(r).learn('chimney_renga');
    rh(r).learn('deco_noren');
    openEd(r);
    expect(r.hook.edit({ op: 'deco', kind: 'shachi' }), 'おぼえて いない').toBe(false);
    expect(r.hook.edit({ op: 'deco', kind: 'entotsu' })).toBe(true);
    expect(r.hook.edit({ op: 'deco', kind: 'noren' })).toBe(true);
    expect([...ed(r).deco].sort()).toEqual(['entotsu', 'noren']);
    expect(r.hook.edit({ op: 'deco', kind: 'entotsu' }), 'はずす').toBe(true);
    expect(ed(r).deco).toEqual(['noren']);
    r.hook.edit({ op: 'undo' });
    expect([...ed(r).deco].sort(), 'はずした のを もどす 1 回').toEqual(['entotsu', 'noren']);
    r.hook.edit({ op: 'undo' });
    expect(ed(r).deco, 'つけた のを もどす 1 回').toEqual(['entotsu']);
    r.hook.edit({ op: 'undo' });
    expect(ed(r)).toMatchObject({ deco: [], canUndo: false });
    r.hook.edit({ op: 'redo' });
    expect(ed(r).deco).toEqual(['entotsu']);
  });

  it('はなだんを まどが 0 の 家に つける: つけた ことには なり ふきだし「まどが ないと はなだんは つかないよ」。材料も 0', () => {
    const r = houseRig();
    rh(r).learn('deco_hanadan');
    openEd(r);
    expect(ed(r).windows).toBe(0);
    expect(r.hook.edit({ op: 'deco', kind: 'hanadan' })).toBe(true);
    expect(ed(r).deco).toEqual(['hanadan']);
    expect(r.hook.menu().bubble.replace(/\s+/g, '')).toBe('まどがないとはなだんはつかないよ');
    expect(r.hook.need().some((x) => x.item.startsWith('flower')), 'はなの 材料は 0').toBe(false);
  });

  it('ばしょ（part）の えらびは もどす・オートセーブに 入らない。出て いない ばしょ（かざりを おぼえる 前の deco）は えらべない', () => {
    const r = houseRig();
    openEd(r);
    const draft = JSON.stringify(r.sys.state.serialize().draft);
    expect(r.hook.edit({ op: 'part', part: 'wall' })).toBe(true);
    r.sys.press('part-window');
    expect(ed(r)).toMatchObject({ part: 'window', canUndo: false, canRedo: false });
    expect(JSON.stringify(r.sys.state.serialize().draft), 'セーブする 作りかけは かわらない').toBe(draft);
    expect(r.hook.edit({ op: 'part', part: 'deco' }), 'かざりは まだ 出て いない').toBe(false);
    expect(ed(r).part).toBe('window');
    expect(r.hook.edit({ op: 'part', part: 'bogus' })).toBe(false);
  });

  it('あたらしい せっけいず（まっさら）: たいら・き・しょうじ・いえの と・かざり なし・ちょうちん。おぼえた レシピは のこる', () => {
    const r = houseRig();
    for (const id of ['roof_kin', 'wall_ishi', 'window_maru', 'door_tetsu', 'deco_noren', 'light_suisho']) rh(r).learn(id);
    openEd(r);
    for (const [op, kind] of [['roof', 'kin'], ['wall', 'ishi'], ['windowKind', 'maru'], ['door', 'tetsu'], ['deco', 'noren'], ['light', 'suisho']] as const) {
      expect(r.hook.edit({ op, kind }), op).toBe(true);
    }
    r.sys.press('new');
    r.sys.press('yes');
    expect(ed(r)).toMatchObject({ roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern' });
    expect(rh(r).recipes().learned).toHaveLength(6);
  });
});
