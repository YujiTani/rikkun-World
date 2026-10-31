import { describe, expect, it } from 'vitest';
import { editorButtons } from './buttons';
import { FURN_ORDER } from './furniture';
import { KANA_CHARS, placeProblem } from './model';
import { editOp, pressEditor } from './ops';
import { makeController } from './testkit';
import { ROOF_KINDS, SIZES, SUFFIXES, WINDOW_KINDS } from './tuning';

/** HOUSE-1B 窓口 edit(op)・press(id) と ボタンの 一覧（画面の もと）。仕様 §6.1・e2e/helpers/house.ts の 先頭の 約束。HOUSE-1E: place／rotate／remove／select の 赤い 家具・next／done */

const ids = (k: ReturnType<typeof makeController>): string[] => editorButtons(k.ctl).map((b) => b.id);

describe('ボタンの 一覧（すすみごと）', () => {
  it('① そと: 帯 ＋ width/depth 5・7・9 ＋ まど − ＋ ＋ しゅるい ＋ やね。prev・家具・名前は 出ない', () => {
    const got = ids(makeController());
    expect(got).toEqual(expect.arrayContaining(['undo', 'redo', 'close', 'new', 'need', 'next', 'done', 'windowsDown', 'windowsUp']));
    for (const n of SIZES) expect(got).toEqual(expect.arrayContaining([`width-${n}`, `depth-${n}`]));
    for (const k of WINDOW_KINDS) expect(got).toContain(`windowKind-${k}`);
    for (const k of ROOF_KINDS) expect(got).toContain(`roof-${k}`);
    for (const no of ['prev', 'light', 'take', 'char-あ', 'furniture-futon']) expect(got).not.toContain(no);
  });

  it('② なか: 家具の ボタン（FURN_ORDER ぜんぶ）＋ あかり。置いた 家具を えらぶと そばの 3 つ。prev も next も ある', () => {
    const k = makeController();
    k.ctl.next();
    const got = ids(k);
    for (const f of FURN_ORDER) expect(got).toContain(`furniture-${f}`);
    expect(got).toEqual(expect.arrayContaining(['light', 'prev', 'next']));
    expect(got).not.toContain('take');
    k.ctl.place('chair', 0, 0);
    k.ctl.selectPlaced(0);
    expect(ids(k)).toEqual(expect.arrayContaining(['take', 'turnRight', 'turnLeft']));
  });

  it('③ なまえ: char-<ひらがな> ぜんぶ ＋ dakuten ＋ handakuten ＋ katakana ＋ erase ＋ suffix-0〜4。next は 出ない', () => {
    const k = makeController();
    k.ctl.next();
    k.ctl.next();
    const got = ids(k);
    for (const c of KANA_CHARS) expect(got).toContain(`char-${c}`);
    for (const id of ['dakuten', 'handakuten', 'katakana', 'erase', 'prev', 'done']) expect(got).toContain(id);
    SUFFIXES.forEach((_, i) => expect(got).toContain(`suffix-${i}`));
    expect(got).not.toContain('next');
  });

  it('押せない: 9 字目の char-*・つけられない 字の あとの dakuten/handakuten・上限の windowsUp・0 の windowsDown・undo/redo・名前が 空の erase', () => {
    const k = makeController();
    const en = (id: string): boolean => editorButtons(k.ctl).find((b) => b.id === id)!.enabled;
    expect([en('windowsDown'), en('undo'), en('redo')]).toEqual([false, false, false]);
    for (let i = 0; i < k.ctl.windowMax(); i++) k.ctl.windows(1);
    expect(en('windowsUp')).toBe(false);
    expect(en('windowsDown')).toBe(true);
    expect(en('undo')).toBe(true);
    k.ctl.next();
    k.ctl.next();
    expect(en('erase')).toBe(false);
    expect([en('dakuten'), en('handakuten')]).toEqual([false, false]);
    k.ctl.char('か');
    expect([en('dakuten'), en('handakuten')]).toEqual([true, false]);
    for (const c of 'あいうえおかき') k.ctl.char(c);
    expect(k.ctl.s.name.front).toHaveLength(8);
    expect(en('char-あ')).toBe(false);
    expect(en('erase')).toBe(true);
  });

  it('確かめの まど ＝ yes・no だけ、ひつような もの ＝ needClose だけ', () => {
    const k = makeController();
    k.ctl.openReset();
    expect(ids(k)).toEqual(['yes', 'no']);
    k.ctl.confirmNo();
    k.ctl.openNeed();
    expect(ids(k)).toEqual(['needClose']);
  });
});

describe('press(id)（ボタンと 同じ 道）', () => {
  it('一覧に 無い・押せない ボタンは 何も おきない（false）。知らない id も', () => {
    const k = makeController();
    expect(pressEditor(k.ctl, 'prev')).toBe(false);
    expect(pressEditor(k.ctl, 'windowsDown')).toBe(false);
    expect(pressEditor(k.ctl, 'nothing')).toBe(false);
    expect(pressEditor(k.ctl, 'char-あ'), '③ でないと 出て いない').toBe(false);
    expect(k.ctl.canUndo()).toBe(false);
  });

  it('① の ボタン: width-7・depth-9・windowsUp/Down・windowKind-shoji・roof-flat（2 引数の 形も 同じ ボタン）', () => {
    const k = makeController();
    expect(pressEditor(k.ctl, 'width-7')).toBe(true);
    expect(pressEditor(k.ctl, 'depth-9')).toBe(true);
    expect(k.ctl.s).toMatchObject({ w: 7, d: 9 });
    expect(pressEditor(k.ctl, 'windowsUp')).toBe(true);
    expect(k.ctl.s.windows).toBe(1);
    expect(pressEditor(k.ctl, 'windowsDown')).toBe(true);
    expect(pressEditor(k.ctl, 'windowKind-shoji'), '今と 同じ ＝ かわらない').toBe(false);
    expect(pressEditor(k.ctl, 'windowKind', 'shoji')).toBe(false);
    expect(pressEditor(k.ctl, 'roof', 'flat')).toBe(false);
    expect(pressEditor(k.ctl, 'roof', 'gabled')).toBe(false);
  });

  it('② の ボタン: furniture-<id> は えらびの 入り切り。置いた 家具の そばの ボタン。light は ふきだし', () => {
    const k = makeController();
    pressEditor(k.ctl, 'next');
    pressEditor(k.ctl, 'furniture-chair');
    expect(k.ctl.sel.palette).toBe('chair');
    pressEditor(k.ctl, 'furniture-chair');
    expect(k.ctl.sel.palette, 'もう 1 度で はずれる').toBeNull();
    k.ctl.place('chair', 1, 1);
    k.ctl.selectPlaced(0);
    expect(pressEditor(k.ctl, 'turnRight')).toBe(true);
    expect(k.ctl.s.furniture[0]!.rot).toBe(1);
    expect(pressEditor(k.ctl, 'turnLeft')).toBe(true);
    expect(pressEditor(k.ctl, 'take')).toBe(true);
    expect(k.ctl.s.furniture).toHaveLength(0);
    pressEditor(k.ctl, 'light');
    expect(k.ctl.bubble?.text).toBe('あかりは ひとつ ひつようだよ');
  });

  it('③ の ボタン: char-<ひらがな>・カタカナで 入る 字は カタカナ（id は ひらがな）・suffix-N・erase', () => {
    const k = makeController();
    pressEditor(k.ctl, 'next');
    pressEditor(k.ctl, 'next');
    pressEditor(k.ctl, 'char-あ');
    pressEditor(k.ctl, 'katakana');
    expect(k.ctl.katakana).toBe(true);
    pressEditor(k.ctl, 'char-い');
    expect(k.ctl.s.name.front).toBe('あイ');
    pressEditor(k.ctl, 'char-は');
    pressEditor(k.ctl, 'handakuten');
    expect(k.ctl.s.name.front).toBe('あイパ');
    pressEditor(k.ctl, 'suffix-3');
    expect(k.ctl.s.name.back).toBe('ひみつきち');
    pressEditor(k.ctl, 'erase');
    expect(k.ctl.s.name.front).toBe('あイ');
  });

  it('何か 押すと ふきだしは すぐ 消える（そのまま ふきだしが 出る 押し方なら 新しい ふきだし）', () => {
    const k = makeController();
    pressEditor(k.ctl, 'next');
    pressEditor(k.ctl, 'done'); // ふとん なし
    expect(k.ctl.bubble).not.toBeNull();
    pressEditor(k.ctl, 'prev');
    expect(k.ctl.bubble).toBeNull();
  });
});

describe('edit(op)（窓口）', () => {
  it('できたら true、今と 同じ 物・形の おかしい op・知らない op は false', () => {
    const k = makeController();
    const e = (op: unknown): boolean => editOp(k.ctl, op);
    expect(e({ op: 'size', w: 9 })).toBe(true);
    expect(e({ op: 'size', w: 9 })).toBe(false);
    expect(e({ op: 'size', w: 6 })).toBe(false);
    expect(e({ op: 'size' })).toBe(false);
    expect(e({ op: 'windows', delta: 1 })).toBe(true);
    expect(e({ op: 'windows', delta: 2 })).toBe(false);
    expect(e({ op: 'windowKind', kind: 'shoji' })).toBe(false);
    expect(e({ op: 'roof', kind: 'flat' })).toBe(false);
    expect(e({ op: 'place', kind: 'futon', x: 0, z: 0 })).toBe(true);
    expect(e({ op: 'place', kind: 'futon', x: 0, z: 0 }), 'もう 家具が ある マス').toBe(false);
    expect(e({ op: 'place', kind: 'sofa', x: 3, z: 3 })).toBe(false);
    expect(e({ op: 'place', kind: 'chair', x: 1.5, z: 3 })).toBe(false);
    expect(e({ op: 'place', kind: 'chair', x: 4, z: 8, rot: 9 })).toBe(false);
    expect(e({ op: 'select', x: 0, z: 1 }), 'ふとんの 2 マス目').toBe(true);
    expect(k.ctl.selected()).toMatchObject({ kind: 'futon' });
    expect(e({ op: 'select', x: 8, z: 8 }), '空き マスは えらびを はずして false').toBe(false);
    expect(k.ctl.selected()).toBeNull();
    expect(e({ op: 'rotate', x: 0, z: 0, dir: 'right' })).toBe(true);
    expect(e({ op: 'rotate', x: 0, z: 0, dir: 'up' })).toBe(false);
    expect(e({ op: 'light', kind: 'lantern' }), 'はずせない').toBe(false);
    expect(k.ctl.bubble?.text).toContain('あかり');
    expect(e({ op: 'remove', x: 0, z: 0 })).toBe(true);
    expect(e({ op: 'remove', x: 0, z: 0 })).toBe(false);
    expect(e({ op: 'char', ch: 'あ' })).toBe(true);
    expect(e({ op: 'char', ch: 'ああ' })).toBe(false);
    expect(e({ op: 'suffix', back: 'ハウス' })).toBe(true);
    expect(e({ op: 'erase' })).toBe(true);
    expect(e({ op: 'erase' })).toBe(false);
    expect(e({ op: 'undo' })).toBe(true);
    expect(e({ op: 'redo' })).toBe(true);
    for (const bad of [null, 5, 'x', {}, { op: 'nope' }]) expect(e(bad)).toBe(false);
  });
});

describe('HOUSE-1E 窓口と ボタン（赤い 家具）', () => {
  const FIX_RED = 'あかい かぐを なおしてね';
  const bads = (k: ReturnType<typeof makeController>) => k.ctl.s.furniture.map((p, i) => placeProblem(k.ctl.s, p, i));

  it('edit place: x・z ＝ 押した マス（もとの マス）。方眼の 中なら 赤く なる 所でも true、外の マス・家具の ある マスは false', () => {
    const k = makeController();
    const e = (op: unknown): boolean => editOp(k.ctl, op);
    expect(e({ op: 'place', kind: 'futon', x: 4, z: 4 }), '右下の すみ ＝ 赤').toBe(true);
    expect(bads(k)).toEqual(['out']);
    expect(e({ op: 'place', kind: 'futon', x: 4, z: 0, rot: 1 }), '向き つきでも 押した マスが もとの マス').toBe(true);
    expect(k.ctl.s.furniture[1]).toEqual({ kind: 'futon', x: 3, z: 0, rot: 1 });
    expect(e({ op: 'place', kind: 'chair', x: 2, z: 4 }), '戸の 前').toBe(true);
    expect(e({ op: 'place', kind: 'chair', x: 5, z: 0 })).toBe(false);
    expect(e({ op: 'place', kind: 'chair', x: 0, z: -1 })).toBe(false);
    expect(e({ op: 'place', kind: 'chair', x: 4, z: 4 }), '家具の ある マス').toBe(false);
    expect(k.ctl.s.furniture).toHaveLength(3);
  });

  it('重なった マスの select・rotate・remove は あとから 置いた 方。rotate は 赤く なる 向きでも true', () => {
    const k = makeController();
    const e = (op: unknown): boolean => editOp(k.ctl, op);
    e({ op: 'place', kind: 'futon', x: 1, z: 0 }); // (1, 0)・(1, 1)
    e({ op: 'place', kind: 'table', x: 0, z: 1 }); // (0, 1)・(1, 1)
    expect(e({ op: 'select', x: 1, z: 1 })).toBe(true);
    expect(k.ctl.sel.placed).toBe(1);
    expect(e({ op: 'select', x: 1, z: 0 })).toBe(true);
    expect(k.ctl.sel.placed).toBe(0);
    expect(e({ op: 'rotate', x: 1, z: 1, dir: 'right' }), 'テーブルが まわる').toBe(true);
    expect(k.ctl.s.furniture[1]!.rot).toBe(1);
    expect(k.ctl.s.furniture[0]!.rot).toBe(0);
    expect(e({ op: 'rotate', x: 1, z: 0, dir: 'left' }), 'ふとんを 赤く なる 向きにも').toBe(true);
    expect(e({ op: 'remove', x: 0, z: 1 })).toBe(true);
    expect(k.ctl.s.furniture.map((p) => p.kind)).toEqual(['futon']);
  });

  it('つぎへ・できた！ボタンは 赤い 家具が あっても 押せる（うすく ならない）が、押しても すすまない。① の つぎへ と ② の まえへ は すすむ', () => {
    const k = makeController();
    pressEditor(k.ctl, 'next');
    editOp(k.ctl, { op: 'place', kind: 'futon', x: 4, z: 4 });
    const en = (id: string): boolean => editorButtons(k.ctl).find((b) => b.id === id)!.enabled;
    expect([en('next'), en('done'), en('prev')]).toEqual([true, true, true]);
    expect(pressEditor(k.ctl, 'next'), 'すすまない').toBe(false);
    expect(k.ctl.s.step).toBe('naka');
    expect(k.ctl.bubble?.text).toBe(FIX_RED);
    expect(pressEditor(k.ctl, 'done'), 'ボタンは 押せた').toBe(true);
    expect(k.ctl.s.step).toBe('naka');
    expect(k.ctl.bubble?.text).toBe(FIX_RED);
    expect(pressEditor(k.ctl, 'prev')).toBe(true);
    expect(pressEditor(k.ctl, 'next')).toBe(true);
    expect(k.ctl.s.step).toBe('naka');
    // 赤い 家具が ふとん 1 つでも そばの ボタンは えらべば 出る
    editOp(k.ctl, { op: 'select', x: 4, z: 4 });
    expect(ids(k)).toEqual(expect.arrayContaining(['take', 'turnRight', 'turnLeft']));
    expect(pressEditor(k.ctl, 'turnRight'), '↻ で ふつうに なる').toBe(true);
    expect(pressEditor(k.ctl, 'next')).toBe(true);
    expect(k.ctl.s.step).toBe('namae');
  });
});
