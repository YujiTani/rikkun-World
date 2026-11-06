import { describe, expect, it } from 'vitest';
import { HouseBook, type HouseRec } from './book';
import { HouseRename, RENAME_SAY } from './rename';
import { MSG } from './editor/tuning';

/** HOUSE-1C PR-1（AC53）: なまえを かえる。近い 順の 一覧 → 名前の 画面（エディターの ③ と 同じ 字の きまり）→ これで いい！／やめる */

const mk = (x: number, name = 'ひみつきち', front = 'ひみつ', back = 'きち'): Omit<HouseRec, 'id'> => ({ name, front, back, number: 1, outer: { w: 7, d: 7 }, door: { x, y: 10, z: 30 }, doorOpen: false });

function make(playerX = 0) {
  const book = new HouseBook();
  const player = { x: playerX, y: 10, z: 30 };
  const r = new HouseRename({ book, player: () => player });
  return { book, r, player };
}

describe('なまえを かえる', () => {
  it('家が 0 けんの あいだは 使えない。1 けん 以上で 使える', () => {
    const { book, r } = make();
    expect(r.available()).toBe(false);
    book.add(mk(10));
    expect(r.available()).toBe(true);
  });

  it('一覧は プレイヤーから 近い 順（同じ 近さは 建てた 順）。ボタンは renamePick-<id> ＋ close', () => {
    const { book, r } = make(50);
    const far = book.add(mk(0));
    const near = book.add(mk(48));
    const mid = book.add(mk(30));
    expect(r.list().map((h) => h.id)).toEqual([near.id, mid.id, far.id]);
    expect(r.listButtons().map((b) => b.id)).toEqual([`renamePick-${near.id}`, `renamePick-${mid.id}`, `renamePick-${far.id}`, 'close']);
    expect(r.view().houses.map((h) => h.id)).toEqual([near.id, mid.id, far.id]);
  });

  it('えらぶと 今の 名前から はじまる。知らない 家は えらべない。renaming() は 名前の 画面の 間だけ', () => {
    const { book, r } = make();
    const h = book.add(mk(10));
    expect(r.renaming()).toBeNull();
    expect(r.pick(99)).toBe(false);
    expect(r.pick(h.id)).toBe(true);
    expect(r.renaming()).toEqual({ id: h.id, name: { front: 'ひみつ', back: 'きち' } });
    r.leave();
    expect(r.renaming()).toBeNull();
  });

  it('字を 打つ: かな 1 字ずつ・8 字まで・てんてん・1 もじ けす・カタカナ・後ろの 文字', () => {
    const { book, r } = make();
    const h = book.add(mk(10, 'あいきち', 'あ', 'きち'));
    r.pick(h.id);
    expect(r.press('char-い')).toBe(true);
    expect(r.press('char-か')).toBe(true);
    expect(r.press('dakuten')).toBe(true);
    expect(r.renaming()?.name.front).toBe('あいが');
    expect(r.press('erase')).toBe(true);
    expect(r.renaming()?.name.front).toBe('あい');
    expect(r.press('katakana')).toBe(true);
    expect(r.isKatakana()).toBe(true);
    r.press('char-う');
    expect(r.renaming()?.name.front, 'カタカナで 入る').toBe('あいウ');
    expect(r.press('suffix-1')).toBe(true);
    expect(r.renaming()?.name.back).toBe('ハウス');
    expect(r.press('char-x'), 'かなで ない 字').toBe(false);
    expect(r.press('なにか'), '知らない ボタン').toBe(false);
    for (let i = 0; i < 12; i++) r.press('char-あ');
    expect([...r.renaming()!.name.front], '8 字まで').toHaveLength(8);
    expect(r.nameButtons().find((b) => b.id === 'char-あ')?.enabled, '9 字目は 押せない').toBe(false);
  });

  it('これで いい！: 前の 文字が 0 字 なら 何も かえない（noName）。1 字 以上 なら 記録の 名前が かわって 画面を 出る', () => {
    const { book, r } = make();
    const h = book.add(mk(10, 'あきち', 'あ', 'きち'));
    expect(r.confirm()).toBe('none');
    r.pick(h.id);
    r.press('erase');
    expect(r.confirm()).toBe('noName');
    expect(book.get(h.id)?.name, '0 字では かわらない').toBe('あきち');
    expect(r.renaming(), '名前の 画面の まま').not.toBeNull();
    expect(RENAME_SAY.noName).toBe(MSG.name);
    r.press('char-い');
    r.press('suffix-3');
    expect(r.confirm()).toBe('ok');
    expect(book.get(h.id)).toMatchObject({ front: 'い', back: 'ひみつきち', name: 'いひみつきち' });
    expect(r.renaming()).toBeNull();
  });

  it('やめる（leave）: 何も かえない。つぎに えらぶと 打ちかけは のこらない', () => {
    const { book, r } = make();
    const h = book.add(mk(10));
    r.pick(h.id);
    r.press('erase');
    r.leave();
    expect(book.get(h.id)?.name).toBe('ひみつきち');
    r.pick(h.id);
    expect(r.renaming()?.name).toEqual({ front: 'ひみつ', back: 'きち' });
  });

  it('名前の 画面の ボタン: 50 音・てんてん・まる・カタカナ・けす・後ろの 文字 5 つ・これで いい・やめる。0 字の ときは けせない', () => {
    const { book, r } = make();
    const h = book.add(mk(10, 'きち', '', 'きち'));
    r.pick(h.id);
    const ids = r.nameButtons().map((b) => b.id);
    for (const id of ['char-あ', 'char-ん', 'dakuten', 'handakuten', 'katakana', 'erase', 'suffix-0', 'suffix-4', 'renameOk', 'renameCancel']) expect(ids, id).toContain(id);
    expect(r.nameButtons().find((b) => b.id === 'erase')?.enabled).toBe(false);
    expect(r.nameButtons().find((b) => b.id === 'dakuten')?.enabled).toBe(false);
    expect(r.nameButtons().find((b) => b.id === 'renameOk')?.enabled, '押すと「なまえを つけてね」').toBe(true);
  });

  // ---- AC53 よくない ことば（AC58 と 同じ 表・同じ ふきだし。ngWords.ts の hasNgName）
  describe('よくない ことば（AC53・AC58 と 同じ 表）', () => {
    const open = (front: string, back = 'きち') => {
      const m = make();
      const h = m.book.add(mk(10, front + back, front, back));
      m.r.pick(h.id);
      return { ...m, h };
    };

    it('よくない ことばに なる 字は 入らない（false・名前は そのまま・ふきだし「その ことばは …」）。ほかの 字は 入る', () => {
      const { r } = open('し', 'きち');
      expect(r.press('char-ね'), 'し ＋ ね ＝ しね').toBe(false);
      expect(r.renaming()?.name).toEqual({ front: 'し', back: 'きち' });
      expect(r.takeBubble()).toBe(MSG.ngWord);
      expect(r.takeBubble(), '一度 読むと 消える').toBeNull();
      expect(r.press('char-い')).toBe(true);
      expect(r.takeBubble(), 'ふつうの 字では 出ない').toBeNull();
      expect(RENAME_SAY.ngWord).toBe(MSG.ngWord);
    });

    it('カタカナでも 止まる（シネ）。つなぎ目〔前 ＋ 後ろ〕でも 止まる。後ろの ことばを かえる 操作も 止まる', () => {
      const a = open('シ', 'きち');
      a.r.press('katakana');
      expect(a.r.press('char-ね')).toBe(false);
      expect(a.r.takeBubble()).toBe(MSG.ngWord);
      // 記録の 名前に すでに よくない ことばが のこって いても 開ける。のこった ままの 後ろの ことばの 変更は 止める
      const b = open('ばか', 'きち');
      expect(b.r.renaming()?.name.front).toBe('ばか');
      expect(b.r.press('suffix-1')).toBe(false);
      expect(b.r.takeBubble()).toBe(MSG.ngWord);
    });

    it('1 もじ けす: 止めない。のこった よくない ことばは なくなるまで 1 字ずつ けす（1 回の 操作・同じ ふきだし）', () => {
      const { r } = open('ばかか', 'きち');
      expect(r.press('erase')).toBe(true);
      expect(r.renaming()?.name.front, '1 字 けしても ばか が のこる → もう 1 字 けして ば').toBe('ば');
      expect(r.takeBubble()).toBe(MSG.ngWord);
      expect(r.press('erase')).toBe(true);
      expect(r.renaming()?.name.front).toBe('');
      expect(r.takeBubble(), 'もう よくない ことばは ないので ふきだしなし').toBeNull();
    });

    it('これで いい！: よくない ことばが のこって いれば 通らない（ngWord）。記録の 名前は かわらず、名前の 画面の まま', () => {
      const { book, r, h } = open('ばか', 'きち');
      expect(r.confirm()).toBe('ngWord');
      expect(book.get(h.id)?.name).toBe('ばかきち');
      expect(r.renaming(), '名前の 画面の まま').not.toBeNull();
      r.press('erase');
      r.press('erase');
      r.press('char-い');
      expect(r.confirm()).toBe('ok');
      expect(book.get(h.id)?.front).toBe('い');
    });

    it('ゆるす ことば（ちびっこ）と ふつうの ことばは 通る', () => {
      const { r } = open('ちび', 'きち');
      expect(r.press('char-っ')).toBe(true);
      expect(r.press('char-こ')).toBe(true);
      expect(r.takeBubble()).toBeNull();
      expect(r.confirm()).toBe('ok');
    });
  });
});
