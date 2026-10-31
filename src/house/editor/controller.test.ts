import { describe, expect, it } from 'vitest';
import { FURN_ORDER, FURNITURE } from './furniture';
import { makeController } from './testkit';
import { BUBBLE, CONFIRM_TEXT, MSG } from './tuning';

/** HOUSE-1B AC8〜AC10・AC13b・AC44・AC44b・AC55・AC56（もどす／すすむ・できた！の しらべ・ふきだし・Esc の 順）。HOUSE-1E の 内装の 仮置きは controller1e.test.ts */

describe('もどす／すすむ（何回でも。見えて いる すすみへ 切りかわる）', () => {
  it('1 回の 操作が 1 つ。20 回 もどして 20 回 すすむと 元に もどる。新しい 操作で すすむ 側は 消える', () => {
    const { ctl } = makeController();
    for (let i = 0; i < 4; i++) ctl.windows(1);
    ctl.setSize({ w: 9 });
    ctl.next();
    ctl.place('chair', 0, 0);
    ctl.place('chair', 1, 0);
    ctl.next();
    for (const ch of 'ひみつ') ctl.char(ch);
    const after = JSON.stringify(ctl.s);
    let n = 0;
    while (ctl.undo()) n++;
    expect(n, '操作の 数').toBe(4 + 1 + 2 + 3);
    expect(ctl.s).toMatchObject({ w: 5, windows: 0, furniture: [], name: { front: '' } });
    expect(ctl.canUndo()).toBe(false);
    while (ctl.redo()) n--;
    expect(n).toBe(0);
    expect(JSON.stringify(ctl.s)).toBe(after);
    ctl.undo();
    expect(ctl.canRedo()).toBe(true);
    ctl.char('あ');
    expect(ctl.canRedo(), '新しい 操作で すすむ 側は 消える').toBe(false);
  });

  it('もどすと その 操作の すすみへ 切りかわり、置いた 家具の えらびは はずれる', () => {
    const { ctl } = makeController();
    ctl.windows(1); // ① の 操作
    ctl.next();
    ctl.place('table', 1, 1);
    ctl.selectPlaced(0);
    ctl.next(); // ③ に いる
    expect(ctl.s.step).toBe('namae');
    ctl.undo(); // ② の 操作 ＝ 家具
    expect(ctl.s.step).toBe('naka');
    expect(ctl.s.furniture).toEqual([]);
    expect(ctl.sel.placed).toBeNull();
    ctl.undo(); // ① の 操作 ＝ 窓
    expect(ctl.s.step).toBe('soto');
    expect(ctl.s.windows).toBe(0);
    ctl.redo();
    expect(ctl.s.step).toBe('soto');
    expect(ctl.s.windows).toBe(1);
  });

  it('もどす に 入らない もの: つぎへ・まえへ・えらび・カタカナ・ひつような もの・あかり・できた！・かわらない 操作', () => {
    const { ctl } = makeController();
    ctl.next();
    ctl.selectPalette('chair');
    ctl.setKatakana(true);
    ctl.openNeed();
    ctl.closeNeed();
    ctl.lightTouched();
    ctl.prev();
    expect(ctl.canUndo()).toBe(false);
    expect(ctl.setSize({ w: 5 }), '今と 同じ 大きさ').toBe(false);
    expect(ctl.setWindowKind('shoji'), '今と 同じ しゅるい').toBe(false);
    expect(ctl.setRoof('flat')).toBe(false);
    expect(ctl.canUndo()).toBe(false);
  });

  it('大きさを かえて 家具が きえたら ふきだし「はいらない かぐを かたづけたよ」。もどすで 戻る', () => {
    const { ctl } = makeController();
    ctl.setSize({ w: 9, d: 9 });
    ctl.place('chair', 0, 0);
    ctl.place('chair', 4, 4);
    ctl.setSize({ w: 5, d: 5 });
    expect(ctl.s.furniture).toHaveLength(1);
    expect(ctl.bubble?.text).toBe(MSG.tidy);
    ctl.undo();
    expect(ctl.s).toMatchObject({ w: 9, d: 9 });
    expect(ctl.s.furniture).toHaveLength(2);
  });

  it('あたらしい せっけいず →［ぜんぶ けす］は 1 回の 操作（もどすで 元に もどる）。①に もどり、見本を はじめの 向きに（resets）', () => {
    const { ctl } = makeController();
    ctl.setSize({ w: 7 });
    ctl.windows(1);
    ctl.next();
    ctl.place('chair', 0, 0);
    ctl.openReset();
    expect(ctl.confirm).toBe('reset');
    const before = JSON.stringify(ctl.s);
    ctl.confirmYes();
    expect(ctl.confirm).toBeNull();
    expect(ctl.s).toMatchObject({ step: 'soto', w: 5, d: 5, windows: 0, furniture: [], name: { front: '', back: 'のいえ' } });
    expect(ctl.resets).toBe(1);
    ctl.undo();
    const strip = (j: string): string => j.replace(/"step":"[a-z]+",/, '');
    expect(strip(JSON.stringify(ctl.s)), '形は もどる（すすみは この 操作の ①）').toBe(strip(before));
    expect(ctl.s.step).toBe('soto');
  });
});

describe('家具を まわす・あかり（AC13b・AC13c の 1×1）', () => {
  // 1E〔#374〕で こわれた「まわせない（はみ出す・重なる）ときは まわらず flash」と「まわしても 左上の マスは 同じ」は、
  // 新しい きまり（もとの マスを 中心に まわる・赤く なる 向きにも まわる）の AC13c〜AC13e に かわった → controller1e.test.ts
  it('AC13c 1×1 の 家具ぜんぶ（いす・まるい テーブル・まるいす・はにわ・たんす・かまど・あんどん・ほんだな）: まわしても x・z は 同じで rot だけ かわる', () => {
    const ones = FURN_ORDER.filter((k) => FURNITURE[k].cells[0] === 1 && FURNITURE[k].cells[1] === 1);
    expect(ones.length, '1×1 の 家具が ある').toBeGreaterThan(0);
    for (const kind of ones) {
      const { ctl } = makeController();
      ctl.place(kind, 1, 1);
      expect(ctl.rotate(0, 'right'), kind).toBe(true);
      expect(ctl.s.furniture[0], kind).toEqual({ kind, x: 1, z: 1, rot: 1 });
      expect(ctl.rotate(0, 'left'), kind).toBe(true);
      expect(ctl.rotate(0, 'left'), kind).toBe(true);
      expect(ctl.s.furniture[0], kind).toEqual({ kind, x: 1, z: 1, rot: 3 });
    }
  });

  it('↻ で rot ＋1、↺ で −1（4 で もとに もどる）', () => {
    const { ctl } = makeController();
    ctl.place('chair', 2, 2);
    for (let i = 1; i <= 4; i++) {
      ctl.rotate(0, 'right');
      expect(ctl.s.furniture[0]!.rot).toBe(i % 4);
    }
    ctl.rotate(0, 'left');
    expect(ctl.s.furniture[0]!.rot).toBe(3);
  });

  it('あかり: 押すと「あかりは ひとつ ひつようだよ」。はずせない・形は かわらない・もどす に 入らない', () => {
    const { ctl } = makeController();
    ctl.lightTouched();
    expect(ctl.bubble?.text).toBe(MSG.light);
    expect(ctl.canUndo()).toBe(false);
  });
});

describe('ふきだしの 長さ（§4.9）: 180 コマ ＋ 字 1 つ 12 コマ（空白は 数えない）', () => {
  it('出て いる コマ数が 文字数で きまり、その 数で 消える。新しい ふきだしは 出しなおす', () => {
    const { ctl } = makeController();
    ctl.say(MSG.name);
    const chars = [...MSG.name].filter((c) => !/\s/.test(c)).length;
    const frames = BUBBLE.baseFrames + BUBBLE.perCharFrames * chars;
    expect(ctl.bubble?.left).toBe(frames);
    for (let i = 1; i < frames; i++) ctl.tick();
    expect(ctl.bubble, `${frames - 1} コマ目までは 出て いる`).not.toBeNull();
    ctl.tick();
    expect(ctl.bubble, `${frames} コマ目で 消える`).toBeNull();
    ctl.say('あ');
    const s1 = ctl.bubble!.seq;
    ctl.say('あ');
    expect(ctl.bubble!.seq).toBeGreaterThan(s1);
  });

  it('いちばん 長い ふきだし（かみの 手がかり）でも 10 秒 いない', () => {
    const longest = Math.max(...Object.values(MSG).map((t) => [...t].filter((c) => !/\s/.test(c)).length));
    expect(BUBBLE.baseFrames + BUBBLE.perCharFrames * longest).toBeLessThanOrEqual(600);
  });
});

describe('AC44・AC44b できた！の しらべ（ひっかかった 1 つ目で 止まる）', () => {
  it('② ふとん 0 → すすみ ②・ふきだし。③ 名前 0 字 → すすみ ③。②が 先', () => {
    const { ctl, made, sheets } = makeController();
    expect(ctl.done()).toBe('stopped');
    expect(ctl.s.step).toBe('naka');
    expect(ctl.bubble?.text).toBe(MSG.futon);
    ctl.place('futon', 0, 0);
    expect(ctl.done()).toBe('stopped');
    expect(ctl.s.step).toBe('namae');
    expect(ctl.bubble?.text).toBe(MSG.name);
    expect(made.n + sheets.length).toBe(0);
  });

  it('④ かみ → ⑤ ふで → ⑥ 持ち物。止まった ときは すすみを かえず せっけいずも できない。⑦ ふとん だけ ＝ 確かめ', () => {
    let problem: 'paper' | 'fude' | 'full' | null = 'paper';
    const { ctl, made, sheets } = makeController({ problem: () => problem });
    ctl.place('futon', 0, 0);
    ctl.char('あ');
    ctl.next();
    ctl.next();
    expect(ctl.s.step).toBe('namae');
    for (const [p, msg] of [['paper', MSG.paper], ['fude', MSG.fude], ['full', MSG.full]] as const) {
      problem = p;
      expect(ctl.done()).toBe('stopped');
      expect(ctl.bubble?.text).toBe(msg);
      expect(ctl.s.step).toBe('namae');
    }
    expect(sheets).toHaveLength(0);
    problem = null;
    expect(ctl.done(), '家具が ふとん だけ').toBe('confirm');
    expect(ctl.confirm).toBe('futonOnly');
    expect(CONFIRM_TEXT.futonOnly).toHaveLength(2);
    ctl.confirmNo();
    expect(ctl.s.step, '［かぐを おく］は ② なかへ').toBe('naka');
    ctl.place('chair', 2, 2);
    ctl.next();
    expect(ctl.done()).toBe('made');
    expect(made.n).toBe(1);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.name.front).toBe('あ');
  });

  it('［このまま つくる］で 作る。Esc は 確かめの まどだけ とじて 作らない', () => {
    const { ctl, made } = makeController();
    ctl.place('futon', 0, 0);
    ctl.char('あ');
    expect(ctl.done()).toBe('confirm');
    expect(ctl.escape()).toBe(true);
    expect(ctl.confirm).toBeNull();
    expect(made.n).toBe(0);
    ctl.done();
    ctl.confirmYes();
    expect(made.n).toBe(1);
  });

  it('作った あとも 作りかけは のこる', () => {
    const { ctl } = makeController();
    ctl.place('futon', 0, 0);
    ctl.place('chair', 2, 2);
    ctl.char('あ');
    expect(ctl.done()).toBe('made');
    expect(ctl.s.furniture).toHaveLength(2);
    expect(ctl.s.name.front).toBe('あ');
    expect(ctl.canUndo(), 'できた！は もどらない が、それまでの 操作は のこる').toBe(true);
  });
});

describe('AC55 Esc の 順', () => {
  it('確かめの まど → ひつような もの → 置いた 家具の えらび → false（エディターを とじる）', () => {
    const { ctl } = makeController();
    ctl.place('chair', 0, 0);
    ctl.selectPlaced(0);
    ctl.openNeed();
    expect(ctl.escape()).toBe(true);
    expect(ctl.needOpen).toBe(false);
    expect(ctl.sel.placed).toBe(0);
    expect(ctl.escape()).toBe(true);
    expect(ctl.sel.placed).toBeNull();
    expect(ctl.escape()).toBe(false);
    ctl.openReset();
    expect(ctl.escape()).toBe(true);
    expect(ctl.confirm).toBeNull();
  });
});

describe('名前の 操作', () => {
  it('9 字目は 入らない・゛゜ は 前の 字に つく・けす・後ろの 文字は 5 つから', () => {
    const { ctl } = makeController();
    for (const ch of 'あいうえおかきく') expect(ctl.char(ch)).toBe(true);
    expect(ctl.char('け')).toBe(false);
    expect(ctl.s.name.front).toBe('あいうえおかきく');
    expect(ctl.mark('dakuten')).toBe(true);
    expect(ctl.s.name.front).toBe('あいうえおかきぐ');
    expect(ctl.mark('handakuten')).toBe(false);
    expect(ctl.canMark('handakuten')).toBe(false);
    expect(ctl.erase()).toBe(true);
    expect(ctl.s.name.front).toBe('あいうえおかき');
    expect(ctl.suffix('ハウス')).toBe(true);
    expect(ctl.suffix('ぜったいちがう')).toBe(false);
    expect(ctl.s.name.back).toBe('ハウス');
  });

  it('KANA_CHARS に ない 字（英字・漢字・゛・空・2 字）は 入らない。カタカナは 入る', () => {
    const { ctl } = makeController();
    for (const bad of ['a', '1', '家', '゛', '', 'あい', ' ']) expect(ctl.char(bad), JSON.stringify(bad)).toBe(false);
    expect(ctl.s.name.front).toBe('');
    expect(ctl.char('ア')).toBe(true);
    expect(ctl.char('ー')).toBe(true);
    expect(ctl.s.name.front).toBe('アー');
  });
});

describe('よくない ことば（AC58。新 21・§2.6）', () => {
  /**
   * ことばを ボタンを 押すのと 同じ 順で 1 つずつ 入れる（にごる 字は 「ふ」＋゛ の ように 分ける）。かえりは 1 つずつの できた か（ー は 字）。
   * 最後の 1 つが 入った あとの 結果は ok.at(-1)
   */
  const typed = (ctl: ReturnType<typeof makeController>['ctl'], text: string): boolean[] =>
    [...text.normalize('NFD')].map((ch) => (ch === '\u3099' ? ctl.mark('dakuten') : ch === '\u309A' ? ctl.mark('handakuten') : ctl.char(ch)));

  it('「し」の あとに「ね」: false・名前は「し」の まま・ふきだし・もどす の 記録は かわらない', () => {
    const { ctl } = makeController();
    expect(ctl.char('し')).toBe(true);
    const undo = ctl.canUndo();
    ctl.hideBubble();
    expect(ctl.char('ね')).toBe(false);
    expect(ctl.s.name.front).toBe('し');
    expect(ctl.bubble?.text).toBe(MSG.ngWord);
    expect(ctl.canUndo()).toBe(undo);
    ctl.undo(); // もどす 1 回で「し」が きえる（止まった 操作は 数えない）
    expect(ctl.s.name.front).toBe('');
  });

  it('そろえた あとで 止める: カタカナ「シ」「ネ」・ー を はさんだ「しー」「ね」・大きい つの「ぶつころ」', () => {
    for (const [word, front] of [['シネ', 'シ'], ['しーね', 'しー'], ['ぶっころ', 'ぶっこ'], ['ぶつころ', 'ぶつこ'], ['あしね', 'あし']] as const) {
      const { ctl } = makeController();
      const ok = typed(ctl, word);
      expect(ok.at(-1), `${word} の 最後の 字`).toBe(false);
      expect(ok.slice(0, -1).every(Boolean), `${word} の 最後の 前までは 入る`).toBe(true);
      expect(ctl.s.name.front, word).toBe(front);
    }
  });

  it('゛ で よくない ことばに なる とき（「でふ」→「でぶ」）は 押しても かわらない。「てふ」「はか」は 止まらない', () => {
    const { ctl } = makeController();
    typed(ctl, 'でふ');
    expect(ctl.mark('dakuten')).toBe(false);
    expect(ctl.s.name.front).toBe('でふ');
    expect(ctl.bubble?.text).toBe(MSG.ngWord);
    const k = makeController();
    expect(typed(k.ctl, 'てふ').every(Boolean)).toBe(true);
    expect(k.ctl.bubble).toBeNull();
    expect(typed(makeController().ctl, 'はか').every(Boolean)).toBe(true);
  });

  it('ゆるす ことば「ちびっこ」は 入る。「ちびっころす」は ころす で 止まる', () => {
    const a = makeController();
    expect(typed(a.ctl, 'ちびっこ').every(Boolean)).toBe(true);
    const b = makeController();
    const ok = typed(b.ctl, 'ちびっころす');
    expect(ok.at(-1)).toBe(false);
    expect(b.ctl.s.name.front).toBe('ちびっころ');
  });

  it('後ろの 文字（suffix）も つないで しらべる: 前に よくない ことばが のこって いる とき', () => {
    const { ctl, holder } = makeController();
    holder.draft.name.front = 'しね'; // 読みこんだ 作りかけ（表が あとで ふえた など）
    expect(ctl.suffix('ハウス')).toBe(false);
    expect(ctl.s.name.back).toBe('のいえ');
    expect(ctl.bubble?.text).toBe(MSG.ngWord);
    const ok = makeController();
    expect(ok.ctl.suffix('ハウス')).toBe(true);
  });

  it('erase は 止まらない: よくない ことばが のこる ときは なくなるまで 1 字ずつ けす（1 回の 操作。同じ ふきだし）', () => {
    const { ctl, holder } = makeController();
    holder.draft.name.front = 'しねこ';
    expect(ctl.erase()).toBe(true);
    expect(ctl.s.name.front).toBe('し');
    expect(ctl.bubble?.text).toBe(MSG.ngWord);
    expect(ctl.undo(), '1 回の 操作').toBe(true);
    expect(ctl.s.name.front).toBe('しねこ');
    // ふつうの けす は 1 字だけ・ふきだしは 出ない
    const k = makeController();
    typed(k.ctl, 'ひみつ');
    expect(k.ctl.erase()).toBe(true);
    expect(k.ctl.s.name.front).toBe('ひみ');
    expect(k.ctl.bubble).toBeNull();
  });

  it('できた！も 止まる: ③ なまえ へ・ふきだし・かみ ふで せっけいずは かわらない', () => {
    const { ctl, holder, sheets, made } = makeController();
    holder.draft.furniture.push({ kind: 'futon', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 2, z: 0, rot: 0 });
    holder.draft.name.front = 'しね';
    holder.draft.step = 'naka';
    expect(ctl.done()).toBe('stopped');
    expect(ctl.s.step).toBe('namae');
    expect(ctl.bubble?.text).toBe(MSG.ngWord);
    expect(sheets).toHaveLength(0);
    expect(made.n).toBe(0);
    ctl.erase();
    expect(ctl.done()).toBe('made');
  });

  it('読みこんだ 作りかけに よくない ことばが あると、どの すすみで 保存して あっても ③ で 開いて 同じ ふきだし', () => {
    const { ctl, holder } = makeController();
    holder.draft.name.front = 'しねこ';
    holder.draft.step = 'soto';
    ctl.open();
    expect(ctl.s.step).toBe('namae');
    expect(ctl.bubble?.text).toBe(MSG.ngWord);
    // よくない ことばが なければ そのまま
    const k = makeController();
    k.holder.draft.name.front = 'ひみつ';
    k.holder.draft.step = 'naka';
    k.ctl.open();
    expect(k.ctl.s.step).toBe('naka');
    expect(k.ctl.bubble).toBeNull();
  });
});
