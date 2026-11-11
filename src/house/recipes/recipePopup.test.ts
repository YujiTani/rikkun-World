import { describe, expect, it } from 'vitest';
import { houseRig } from '../houseRig';
import { ENTRY, PANEL_BTN, PARTS, STYLES, allRecipes, btnIds, ed, edOrNull, goStep, kindBtns, learnAll, notFirst, openEd, openPopup, rh, type Part, type Rig } from './recipeKit';

/**
 * HOUSE-2A（#364・仕様 3 版 §2.3・§6.2）AC4（ポップアップ）・AC5（えらび方・かざり・もどす）。
 * 約束（press の id・editor().popup・edit の op）は e2e/helpers/house.ts の「2A の 約束」。レシピの 数・しゅるいの 数は 書かない（表から）。
 */

const ALL = allRecipes();
const sorted = (a: readonly string[]): string[] => [...a].sort();
const dump = (r: Rig): string => JSON.stringify(r.sys.state.serialize().draft);

describe('AC4 ポップアップ: 開く・とじる', () => {
  it('part-<ばしょ> を 押すと popup が その ばしょ。✕（popupClose）で null。ばしょは ぜんぶ（かざりは おぼえた あと）', () => {
    const r = houseRig();
    learnAll(r);
    openEd(r);
    expect(ed(r).popup).toBeNull();
    for (const part of PARTS) {
      r.sys.press(`part-${part}`);
      expect(ed(r).popup, `part-${part}`).toBe(part);
      r.sys.press('popupClose');
      expect(ed(r).popup, `${part} を ✕ で とじる`).toBeNull();
    }
  });

  it('開いて いる 間: ポップアップの しゅるいの ボタンと ✕、上の 帯・下の 帯の ボタンが 出る。① の パネルの ボタン（ばしょ・よこ・たて・まどの かず）は 出ない（ポップアップの 下に かくれる）', () => {
    const r = houseRig();
    openEd(r);
    const closed = btnIds(r);
    for (const id of closed.filter((i) => PANEL_BTN.test(i))) expect(closed).toContain(id);
    expect(closed, 'とじて いる 間は ✕ は ない').not.toContain('popupClose');
    openPopup(r, 'roof');
    const open = btnIds(r);
    expect(open).toContain('popupClose');
    expect(open.filter((i) => PANEL_BTN.test(i)), '下の パネルの ボタンは かくれる').toEqual([]);
    for (const bar of ['undo', 'redo', 'close', 'new', 'need', 'next', 'done']) expect(open, `帯の ${bar}`).toContain(bar);
    expect(kindBtns(r), 'その ばしょの しゅるいの ボタン（なし・たいら）').toEqual(['roof-none', 'roof-flat']);
  });

  it('ほかの ばしょの しゅるいの ボタンは 押せない（roof を 開いて いる 間に wall-ki）。とじて いる 間は しゅるいの ボタンは 押せない', () => {
    const r = houseRig();
    for (const id of ['wall_ishi']) rh(r).learn(id);
    openEd(r);
    const before = JSON.stringify(ed(r));
    r.sys.press('roof-flat');
    r.sys.press('wall-ishi_mura');
    expect(JSON.stringify(ed(r)), 'とじて いる 間は 何も おきない').toBe(before);
    openPopup(r, 'roof');
    r.sys.press('wall-ishi_mura');
    r.sys.press('wall-ki');
    expect(ed(r), 'ほかの ばしょの 物は 押せない').toMatchObject({ popup: 'roof', wall: 'ki', canUndo: false });
  });

  it('しゅるいを えらんでも とじない（ほかの しゅるいと くらべられる）。何回 えらんでも 開いた まま', () => {
    const r = houseRig();
    rh(r).learn('roof_kawara');
    openEd(r);
    openPopup(r, 'roof');
    for (const b of ENTRY.roof_kawara!.btns) {
      r.sys.press(b);
      expect(ed(r).popup).toBe('roof');
    }
    r.sys.press('roof-flat');
    expect(ed(r)).toMatchObject({ popup: 'roof', roof: 'flat' });
  });

  it('Esc は ポップアップ だけ とじる（エディターは 開いた まま）。もう 1 回 Esc で エディターを とじる（HOUSE-1 の まま）', () => {
    const r = houseRig();
    openEd(r);
    openPopup(r, 'door');
    r.sys.escape();
    expect(ed(r).popup, 'ポップアップだけ とじた').toBeNull();
    expect(r.sys.editing(), 'エディターは 開いた まま').toBe(true);
    expect(r.hook.menu().page).toBe('editor');
    r.sys.escape();
    expect(r.sys.editing(), '2 回目で エディターが とじる').toBe(false);
  });

  it('上の 帯・下の 帯の ボタン（もどす・すすむ を のぞく）を 押すと ポップアップが とじて、その ボタンの はたらきも する', () => {
    const open = (): Rig => {
      const r = houseRig();
      openEd(r);
      openPopup(r, 'wall');
      return r;
    };
    let r = open();
    r.sys.press('next');
    expect(ed(r), 'つぎへ').toMatchObject({ popup: null, step: 'naka' });
    r = open();
    r.sys.press('need');
    expect(r.sys.menu().page, 'ひつような もの').toBe('need');
    r.sys.press('needClose');
    expect(ed(r).popup).toBeNull();
    r = open();
    r.sys.press('new');
    expect(ed(r), 'あたらしい せっけいず（確かめの まど）').toMatchObject({ popup: null, confirm: 'reset' });
    r = open();
    r.sys.press('done');
    expect(edOrNull(r)?.popup ?? null, 'できた！').toBeNull();
    r = open();
    r.sys.press('close');
    expect(r.sys.editing(), '✕（エディターを とじる）').toBe(false);
    openEd(r);
    expect(ed(r).popup, '開いた まま とじて 開きなおすと とじて いる').toBeNull();
  });

  it('もどす・すすむ では ポップアップは とじない（もどした 物の ばしょへ 切りかわる だけ。下の AC5）。開く・とじる は もどす・オートセーブに 入らない', () => {
    const r = houseRig();
    learnAll(r);
    openEd(r);
    const draft = dump(r);
    for (const part of PARTS) {
      expect(r.hook.edit({ op: 'popup', part }), `edit popup ${part}`).toBe(true);
      expect(ed(r)).toMatchObject({ popup: part, canUndo: false, canRedo: false });
      expect(dump(r), 'セーブする 作りかけは かわらない').toBe(draft);
    }
    expect(r.hook.edit({ op: 'popup', part: null })).toBe(true);
    expect(ed(r)).toMatchObject({ popup: null, canUndo: false, canRedo: false });
    expect(dump(r)).toBe(draft);
    // 操作が ある ときも 開く・とじる で もどす の 記録は かわらない
    expect(r.hook.edit({ op: 'roof', kind: 'kawara_shiro' })).toBe(true);
    const undoable = ed(r);
    r.sys.press('part-wall');
    r.sys.press('popupClose');
    expect(ed(r)).toMatchObject({ canUndo: undoable.canUndo, canRedo: undoable.canRedo });
  });

  it('edit popup: おぼえて いない かざりの ばしょ・知らない ばしょ・② ③ では 開けない（false）', () => {
    const r = houseRig();
    openEd(r);
    expect(r.hook.edit({ op: 'popup', part: 'deco' }), 'かざりは まだ 出て いない').toBe(false);
    expect(r.hook.edit({ op: 'popup', part: 'bogus' })).toBe(false);
    expect(ed(r).popup).toBeNull();
    expect(r.hook.edit({ op: 'popup', part: 'wall' })).toBe(true);
    goStep(r, 'naka');
    expect(ed(r).popup, '② へ 行くと とじる').toBeNull();
    expect(r.hook.edit({ op: 'popup', part: 'roof' }), '② では 開けない').toBe(false);
    goStep(r, 'namae');
    expect(r.hook.edit({ op: 'popup', part: 'roof' }), '③ では 開けない').toBe(false);
  });

  it('エディターを 開いた とき・② ③ から もどった とき・あたらしい せっけいず の あとは popup が null', () => {
    const r = houseRig();
    learnAll(r);
    openEd(r);
    expect(ed(r).popup, '印が あっても とじて いる').toBeNull();
    openPopup(r, 'roof');
    goStep(r, 'naka');
    goStep(r, 'soto');
    expect(ed(r).popup, '② から もどった').toBeNull();
    openPopup(r, 'window');
    goStep(r, 'namae');
    goStep(r, 'soto');
    expect(ed(r).popup, '③ から もどった').toBeNull();
    openPopup(r, 'door');
    r.sys.press('new');
    r.sys.press('yes');
    expect(ed(r).popup, 'あたらしい せっけいず').toBeNull();
  });
});

describe('AC5 えらぶ（やね・かべ・まど・と・あかり は 1 つ だけ）', () => {
  for (const id of ALL) {
    const e = ENTRY[id]!;
    if (!e.field || e.field === 'deco') continue;
    it(`${id}: 3 つ（か 1 つ）を 順に えらべる。今と 同じ 物は false・canUndo 不変。もどす で 1 つずつ もとに もどり、すすむ で また`, () => {
      const r = houseRig();
      rh(r).learn(id);
      openEd(r);
      const field = e.field!;
      const trail = [ed(r)[field] as string];
      for (const k of e.kinds) {
        expect(r.hook.edit({ op: field, kind: k }), `${k} を えらぶ`).toBe(true);
        expect(ed(r)[field]).toBe(k);
        trail.push(k);
        const keep = JSON.stringify({ u: ed(r).canUndo, rd: ed(r).canRedo, v: ed(r)[field] });
        expect(r.hook.edit({ op: field, kind: k }), `${k}: 今と 同じ 物`).toBe(false);
        expect(JSON.stringify({ u: ed(r).canUndo, rd: ed(r).canRedo, v: ed(r)[field] }), '同じ 物を えらんでも もどす・すすむ は かわらない').toBe(keep);
      }
      for (let i = trail.length - 1; i > 0; i--) {
        expect(r.hook.edit({ op: 'undo' }), `もどす ${i}`).toBe(true);
        expect(ed(r)[field], 'もどす 1 回で ひとつ まえ').toBe(trail[i - 1]);
      }
      expect(ed(r).canUndo, 'もどす 記録は えらんだ 回数 だけ').toBe(false);
      for (let i = 1; i < trail.length; i++) {
        expect(r.hook.edit({ op: 'redo' })).toBe(true);
        expect(ed(r)[field]).toBe(trail[i]);
      }
    });
  }

  it('ちがう 案を まぜて えらべる（おしろの やね ＋ こうざんの かべ ＋ むらの まど ＋ おしろの と）。それぞれ 1 回の 操作', () => {
    const r = houseRig();
    for (const id of ['roof_kawara', 'wall_ishi', 'window_maru', 'door_tetsu']) rh(r).learn(id);
    openEd(r);
    const pick = [['roof', 'kawara_shiro'], ['wall', 'ishi_kozan'], ['windowKind', 'maru_mura'], ['door', 'tetsu_shiro']] as const;
    for (const [op, kind] of pick) expect(r.hook.edit({ op, kind }), `${op} ${kind}`).toBe(true);
    expect(ed(r)).toMatchObject({ roof: 'kawara_shiro', wall: 'ishi_kozan', windowKind: 'maru_mura', door: 'tetsu_shiro' });
    for (let i = pick.length - 1; i >= 0; i--) {
      expect(r.hook.edit({ op: 'undo' })).toBe(true);
      expect(ed(r)[pick[i]![0]], '1 回で 1 つ もどる').not.toBe(pick[i]![1]);
    }
    expect(ed(r)).toMatchObject({ roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', canUndo: false });
  });

  it('いつもの 物（たいら・き・しょうじ・いえの と・ちょうちん）は いつでも えらべる。ちがう しゅるいから もどす のは true で 1 回の 操作', () => {
    const r = houseRig();
    for (const id of ['roof_kawara', 'wall_renga', 'window_maru', 'door_tetsu', 'light_hotaru']) rh(r).learn(id);
    openEd(r);
    for (const [op, usual, other] of [['roof', 'flat', 'kawara_mura'], ['wall', 'ki', 'renga_shiro'], ['windowKind', 'shoji', 'maru_kozan'], ['door', 'ie', 'tetsu_mura'], ['light', 'lantern', 'hotaru']] as const) {
      const field = op as 'roof' | 'wall' | 'windowKind' | 'door' | 'light';
      if (op !== 'light') expect(r.hook.edit({ op, kind: usual }), `${usual}: 今と 同じ`).toBe(false);
      expect(r.hook.edit({ op, kind: other }), other).toBe(true);
      expect(r.hook.edit({ op, kind: usual }), `${usual} へ もどす`).toBe(true);
      expect(ed(r)[field]).toBe(usual);
    }
  });

  it('あかりが ちょうちんの とき ちょうちんを 押す: 何も かわらず ふきだし「あかりは ひとつ ひつようだよ」（press light-lantern）。ほかの あかりへ かえた あと ちょうちんへは もどせる', () => {
    const r = houseRig();
    rh(r).learn('light_suisho');
    openEd(r);
    goStep(r, 'naka');
    r.sys.press('light-lantern');
    expect(ed(r)).toMatchObject({ light: 'lantern', canUndo: false });
    expect(r.hook.menu().bubble.replace(/\s+/g, '')).toBe('あかりはひとつひつようだよ');
    r.sys.press('light', 'suisho'); // 2 引数の 形も 同じ ボタン
    expect(ed(r).light).toBe('suisho');
    r.sys.press('light-lantern');
    expect(ed(r).light, 'ちょうちんへ もどす').toBe('lantern');
  });

  it('press の 2 引数の 形は 1 引数と 同じ（part・roof・wall・window・door・deco。ポップアップが その ばしょで 開いて いる とき）', () => {
    const r = houseRig();
    for (const id of ['roof_kawara', 'wall_ishi', 'window_maru', 'door_tetsu', 'deco_noren']) rh(r).learn(id);
    openEd(r);
    const go = (part: Part, kind: string): void => {
      r.sys.press('part', part);
      expect(ed(r).popup, `press('part', '${part}')`).toBe(part);
      r.sys.press(part, kind);
      r.sys.press('popupClose');
    };
    go('wall', 'ishi_kozan');
    go('window', 'maru_shiro');
    go('door', 'tetsu_mura');
    go('roof', 'kawara_shiro');
    go('deco', 'noren_kozan');
    expect(ed(r)).toMatchObject({ roof: 'kawara_shiro', wall: 'ishi_kozan', windowKind: 'maru_shiro', door: 'tetsu_mura', deco: ['noren_kozan'] });
  });

  it('あたらしい せっけいず（まっさら）: たいら・き・しょうじ・いえの と・かざり なし・ちょうちん・popup null。おぼえた レシピは のこる', () => {
    const r = houseRig();
    const some = ['roof_kin', 'wall_ishi', 'window_maru', 'door_tetsu', 'deco_noren', 'light_suisho'];
    for (const id of some) rh(r).learn(id);
    openEd(r);
    for (const [op, kind] of [['roof', 'kin_shiro'], ['wall', 'ishi_kozan'], ['windowKind', 'maru_mura'], ['door', 'tetsu_kozan'], ['deco', 'noren_shiro'], ['light', 'suisho']] as const) {
      expect(r.hook.edit({ op, kind }), `${op} ${kind}`).toBe(true);
    }
    openPopup(r, 'roof');
    r.sys.press('new');
    r.sys.press('yes');
    expect(ed(r)).toMatchObject({ popup: null, roof: 'flat', wall: 'ki', windowKind: 'shoji', door: 'ie', deco: [], light: 'lantern' });
    expect(rh(r).recipes().learned).toEqual(some);
  });
});

describe('AC5 かざり（形ごとに 1 つ・形が ちがえば いくつでも）', () => {
  const learnDeco = (r: Rig): void => {
    for (const id of ['chimney_renga', 'deco_noren', 'deco_hanadan', 'deco_shachi']) rh(r).learn(id);
  };

  it('つける・はずす: 同じ 物を もう 1 回 えらぶと はずれる。つける・はずす は どちらも もどす 1 回。おぼえて いない かざりは false', () => {
    const r = houseRig();
    rh(r).learn('chimney_renga');
    rh(r).learn('deco_noren');
    openEd(r);
    expect(r.hook.edit({ op: 'deco', kind: 'hanadan_mura' }), 'おぼえて いない').toBe(false);
    expect(r.hook.edit({ op: 'deco', kind: 'shachi' }), 'おぼえて いない').toBe(false);
    expect(r.hook.edit({ op: 'deco', kind: 'entotsu_mura' })).toBe(true);
    expect(r.hook.edit({ op: 'deco', kind: 'noren_kozan' }), '形が ちがえば いくつでも').toBe(true);
    expect(sorted(ed(r).deco)).toEqual(['entotsu_mura', 'noren_kozan']);
    expect(r.hook.edit({ op: 'deco', kind: 'entotsu_mura' }), '同じ 物でもう 1 回 ＝ はずす').toBe(true);
    expect(ed(r).deco).toEqual(['noren_kozan']);
    r.hook.edit({ op: 'undo' });
    expect(sorted(ed(r).deco), 'はずした のを もどす 1 回').toEqual(['entotsu_mura', 'noren_kozan']);
    r.hook.edit({ op: 'undo' });
    expect(ed(r).deco, 'つけた のを もどす 1 回').toEqual(['entotsu_mura']);
    r.hook.edit({ op: 'undo' });
    expect(ed(r)).toMatchObject({ deco: [], canUndo: false });
    r.hook.edit({ op: 'redo' });
    expect(ed(r).deco).toEqual(['entotsu_mura']);
  });

  it('同じ 形の ちがう 案を 押すと 入れかわる（えんとつ・のれん・はなだん）。1 回の 操作。もどすと もとの 案', () => {
    for (const [id, form] of [['chimney_renga', 'entotsu'], ['deco_noren', 'noren'], ['deco_hanadan', 'hanadan']] as const) {
      const r = houseRig();
      rh(r).learn(id);
      openEd(r);
      const [a, b, c] = STYLES.map((s) => `${form}_${s}`) as [string, string, string];
      expect(r.hook.edit({ op: 'deco', kind: a }), `${a} を つける`).toBe(true);
      expect(r.hook.edit({ op: 'deco', kind: b }), `${b}: 入れかえ`).toBe(true);
      expect(ed(r).deco, '入れかわる（ふえない）').toEqual([b]);
      expect(r.hook.edit({ op: 'deco', kind: c })).toBe(true);
      expect(ed(r).deco).toEqual([c]);
      r.hook.edit({ op: 'undo' });
      expect(ed(r).deco, '入れかえを もどす 1 回').toEqual([b]);
      r.hook.edit({ op: 'undo' });
      expect(ed(r).deco).toEqual([a]);
      r.hook.edit({ op: 'undo' });
      expect(ed(r)).toMatchObject({ deco: [], canUndo: false });
    }
  });

  it('しゃちほこ は 1 つ だけ（つける・はずす）。ぜんぶの 形を まぜて つけられる（えんとつ ＋ のれん ＋ はなだん ＋ しゃちほこ）', () => {
    const r = houseRig();
    learnDeco(r);
    openEd(r);
    for (const k of ['entotsu_shiro', 'noren_kozan', 'hanadan_mura', 'shachi']) expect(r.hook.edit({ op: 'deco', kind: k }), k).toBe(true);
    expect(sorted(ed(r).deco)).toEqual(sorted(['entotsu_shiro', 'noren_kozan', 'hanadan_mura', 'shachi']));
    expect(r.hook.edit({ op: 'deco', kind: 'shachi' }), 'はずす').toBe(true);
    expect(sorted(ed(r).deco)).toEqual(sorted(['entotsu_shiro', 'noren_kozan', 'hanadan_mura']));
    expect(r.hook.edit({ op: 'deco', kind: 'nothing' }), '知らない かざり').toBe(false);
  });

  it('ボタンでも 同じ（ポップアップを 開いて deco-<kind>）。つけて いる 間も ポップアップは 開いた まま', () => {
    const r = houseRig();
    learnDeco(r);
    openEd(r);
    openPopup(r, 'deco');
    r.sys.press('deco-noren_shiro');
    r.sys.press('deco-shachi');
    r.sys.press('deco-noren_kozan');
    expect(sorted(ed(r).deco)).toEqual(['noren_kozan', 'shachi']);
    expect(ed(r).popup).toBe('deco');
  });

  it('はなだんを まどが 0 の 家に つける: つけた ことには なり ふきだし「まどが ないと はなだんは つかないよ」。材料も 0。窓を ふやすと はなの 材料が 出る', () => {
    const r = houseRig();
    notFirst(r);
    rh(r).learn('deco_hanadan');
    openEd(r);
    expect(ed(r).windows).toBe(0);
    expect(r.hook.edit({ op: 'deco', kind: 'hanadan_kozan' })).toBe(true);
    expect(ed(r).deco).toEqual(['hanadan_kozan']);
    expect(r.hook.menu().bubble.replace(/\s+/g, '')).toBe('まどがないとはなだんはつかないよ');
    expect(r.hook.need().some((x) => x.item.startsWith('flower')), 'はなの 材料は 0').toBe(false);
    r.hook.edit({ op: 'windows', delta: 1 });
    expect(r.hook.need().some((x) => x.item.startsWith('flower') && x.need > 0), '窓を ふやすと 出る').toBe(true);
  });
});

describe('AC5 もどす・すすむ と ポップアップ', () => {
  /** やねを かえ → かべを かえ → まどの かずを ふやした 世界。popup は とじて いる */
  function made(): Rig {
    const r = houseRig();
    for (const id of ['roof_kawara', 'wall_ishi']) rh(r).learn(id);
    openEd(r);
    expect(r.hook.edit({ op: 'roof', kind: 'kawara_shiro' })).toBe(true);
    expect(r.hook.edit({ op: 'wall', kind: 'ishi_kozan' })).toBe(true);
    expect(r.hook.edit({ op: 'windows', delta: 1 })).toBe(true);
    return r;
  }

  it('ポップアップが 開いて いる とき: もどした 物が ① の ばしょの しゅるい なら その ばしょに 切りかわる（開いた まま）。ばしょの しゅるい でない 物（まどの かず）なら とじる。すすむ も 同じ', () => {
    const r = made();
    openPopup(r, 'roof');
    expect(r.hook.edit({ op: 'undo' }), 'まどの かずを もどす').toBe(true);
    expect(ed(r), 'ばしょの しゅるい でない ので とじる').toMatchObject({ windows: 0, popup: null });
    openPopup(r, 'roof');
    expect(r.hook.edit({ op: 'undo' }), 'かべを もどす').toBe(true);
    expect(ed(r), 'かべの ばしょへ 切りかわる').toMatchObject({ wall: 'ki', popup: 'wall' });
    expect(r.hook.edit({ op: 'undo' }), 'やねを もどす').toBe(true);
    expect(ed(r), 'やねの ばしょへ 切りかわる').toMatchObject({ roof: 'flat', popup: 'roof' });
    expect(r.hook.edit({ op: 'redo' }), 'やねを すすむ').toBe(true);
    expect(ed(r)).toMatchObject({ roof: 'kawara_shiro', popup: 'roof' });
    expect(r.hook.edit({ op: 'redo' }), 'かべを すすむ').toBe(true);
    expect(ed(r), 'すすむ でも 切りかわる').toMatchObject({ wall: 'ishi_kozan', popup: 'wall' });
    expect(r.hook.edit({ op: 'redo' }), 'まどの かずを すすむ').toBe(true);
    expect(ed(r), 'ばしょで ない 物は とじる').toMatchObject({ windows: 1, popup: null });
  });

  it('ポップアップが とじて いる とき: もどす・すすむ では 開かない（popup は null の まま）', () => {
    const r = made();
    for (let i = 0; i < 3; i++) {
      r.hook.edit({ op: 'undo' });
      expect(ed(r).popup).toBeNull();
    }
    expect(ed(r)).toMatchObject({ roof: 'flat', wall: 'ki', windows: 0, canUndo: false });
    for (let i = 0; i < 3; i++) {
      r.hook.edit({ op: 'redo' });
      expect(ed(r).popup).toBeNull();
    }
    expect(ed(r)).toMatchObject({ roof: 'kawara_shiro', wall: 'ishi_kozan', windows: 1 });
  });

  it('② の あかりの 操作を もどす と、すすみが ② に かわり ポップアップは とじる（① 以外へ 行く とき）', () => {
    const r = houseRig();
    rh(r).learn('light_hotaru');
    rh(r).learn('roof_kawara');
    openEd(r);
    expect(r.hook.edit({ op: 'light', kind: 'hotaru' })).toBe(true);
    expect(ed(r).step, 'edit は すすみを かえない').toBe('soto');
    openPopup(r, 'roof');
    expect(r.hook.edit({ op: 'undo' })).toBe(true);
    expect(ed(r), 'あかりの もどす').toMatchObject({ light: 'lantern', step: 'naka', popup: null });
  });
});
