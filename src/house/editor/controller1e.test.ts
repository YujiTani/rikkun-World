import { describe, expect, it } from 'vitest';
import { FURN_ORDER } from './furniture';
import { placeProblem } from './model';
import { makeController } from './testkit';
import { MSG } from './tuning';

/**
 * HOUSE-1E〔#374〕AC13・AC13c〜AC13g・AC44（内装の 仮置き。置けない 所にも 赤で 置ける・もとの マスを 中心に まわす・赤い まま すすめない）。
 * controller.test.ts（1B）で こわれた「まわせない」「左上の マスは 同じ」の 2 つは ここの AC13c〜AC13e に かわった。
 * 窓口の 形（origin・bad・selected・flash）は src/house/system.test.ts、見本に 出さない 見せ方は src/house/preview/preview.test.ts
 */

type Ctl = ReturnType<typeof makeController>['ctl'];

/** 1E: ふきだし「あかい かぐを なおしてね」（実装の MSG.fixRed と 同じ 字。AC13f） */
const FIX_RED = 'あかい かぐを なおしてね';
/** 1E: 赤く 光らせた 家具。フックの `flash` と 同じ 形（`items` ＝ furniture の 番号、`seq` ＝ 光らせる たびに 1 ふえる 数）。controller.flash が この 形に なる */
type Flash = { items: number[]; seq: number } | null;
const flashOf = (ctl: Ctl): Flash => (ctl as unknown as { flash: Flash }).flash;
/** 赤い わけ（フックの `bad` と 同じ。置いた 順）。形から 毎回 決まる ＝ model の placeProblem（自分は skip） */
const bads = (ctl: Ctl) => ctl.s.furniture.map((p, i) => placeProblem(ctl.s, p, i));
/** 今の 形の 左上と 向き */
const pose = (ctl: Ctl, i = 0): [number, number, number] => [ctl.s.furniture[i]!.x, ctl.s.furniture[i]!.z, ctl.s.furniture[i]!.rot];

describe('家具を まわす（AC13c。もとの マスを 中心に。赤く なる 向きにも まわる）', () => {
  it('AC13c ふとんを 5×5 の (4, 4) に 置く → 赤（out）。↻ は もとの マス (4, 4) を 中心に (3,4) rot1 → (4,3) rot2 → (4,4) rot3（赤）→ 4 回目で はじめと 同じ。赤く なる 向きも true', () => {
    const { ctl } = makeController();
    expect(ctl.place('futon', 4, 4), '方眼の 中の マスなら 赤く なる 所でも 置ける').toBe(true);
    expect(pose(ctl)).toEqual([4, 4, 0]);
    expect(bads(ctl)).toEqual(['out']);
    const right = [[3, 4, 1, null], [4, 3, 2, null], [4, 4, 3, 'out'], [4, 4, 0, 'out']] as const;
    for (const [x, z, rot, bad] of right) {
      expect(ctl.rotate(0, 'right'), `rot ${rot}`).toBe(true);
      expect(pose(ctl), `rot ${rot}`).toEqual([x, z, rot]);
      expect(bads(ctl), `rot ${rot}`).toEqual([bad]);
    }
  });

  it('AC13c ↺ は その ぎゃく（rot 0 → 3 → 2 → 1 → 0）。もどす 1 回で 1 つ 前の 向き（赤く なる 向きも）、すすむ で また 同じ', () => {
    const { ctl } = makeController();
    ctl.place('futon', 4, 4);
    const left = [[4, 4, 3, 'out'], [4, 3, 2, null], [3, 4, 1, null], [4, 4, 0, 'out']] as const;
    for (const [x, z, rot, bad] of left) {
      expect(ctl.rotate(0, 'left'), `rot ${rot}`).toBe(true);
      expect(pose(ctl), `rot ${rot}`).toEqual([x, z, rot]);
      expect(bads(ctl), `rot ${rot}`).toEqual([bad]);
    }
    expect(ctl.undo()).toBe(true); // rot 1 → 0 の ↺ を もどす
    expect(pose(ctl)).toEqual([3, 4, 1]);
    expect(bads(ctl), 'もどした あとも 形から 決まる').toEqual([null]);
    expect(ctl.undo()).toBe(true);
    expect(pose(ctl)).toEqual([4, 3, 2]);
    ctl.redo();
    ctl.redo();
    expect(pose(ctl)).toEqual([4, 4, 0]);
    expect(bads(ctl)).toEqual(['out']);
  });

  it('AC13c ながい テーブル（3×1）を (2, 2) に: rot 0 左上 (2, 2) ふつう → rot 1 左上 (2, 2) 1×3 戸の 前で door → rot 2 左上 (0, 2) → rot 3 左上 (2, 0)', () => {
    const { ctl } = makeController();
    ctl.place('long_table', 2, 2);
    expect([pose(ctl), bads(ctl)]).toEqual([[2, 2, 0], [null]]);
    const turns = [[2, 2, 1, 'door'], [0, 2, 2, null], [2, 0, 3, null], [2, 2, 0, null]] as const;
    for (const [x, z, rot, bad] of turns) {
      expect(ctl.rotate(0, 'right'), `rot ${rot}`).toBe(true);
      expect([pose(ctl), bads(ctl)], `rot ${rot}`).toEqual([[x, z, rot], [bad]]);
    }
  });

  it('AC13c こたつ（2×2）を (4, 4) に: 左上 (4, 4)・(3, 4)・(3, 3)・(4, 3) で out・out・ふつう・out', () => {
    const { ctl } = makeController();
    ctl.place('nukunuku', 4, 4);
    expect([pose(ctl), bads(ctl)]).toEqual([[4, 4, 0], ['out']]);
    const turns = [[3, 4, 1, 'out'], [3, 3, 2, null], [4, 3, 3, 'out']] as const;
    for (const [x, z, rot, bad] of turns) {
      expect(ctl.rotate(0, 'right'), `rot ${rot}`).toBe(true);
      expect([pose(ctl), bads(ctl)], `rot ${rot}`).toEqual([[x, z, rot], [bad]]);
    }
  });

  it('AC13c 置く 前の 向きが 0 で なくても、押した マスが もとの マス（ふとん rot 1 を (4, 4) → 左上 (3, 4)）', () => {
    const { ctl } = makeController();
    expect(ctl.place('futon', 4, 4, 1)).toBe(true);
    expect([pose(ctl), bads(ctl)]).toEqual([[3, 4, 1], [null]]);
    expect(ctl.place('long_table', 2, 2, 2)).toBe(true);
    expect(pose(ctl, 1)).toEqual([0, 2, 2]);
  });

  it('AC13c 1D までの セーブ（x・z は 左上・rot つき）は 場所が かわらない: 保存の 形は {kind, x, z, rot} だけ（origin・bad は 保存しない）', () => {
    const { ctl, holder } = makeController();
    holder.draft.furniture.push({ kind: 'table', x: 1, z: 1, rot: 1 });
    expect(pose(ctl)).toEqual([1, 1, 1]);
    expect(bads(ctl)).toEqual([null]);
    expect(ctl.place('futon', 4, 4)).toBe(true);
    for (const f of ctl.s.furniture) expect(Object.keys(f).sort()).toEqual(['kind', 'rot', 'x', 'z']);
    expect(JSON.stringify(ctl.s)).not.toMatch(/origin|bad/);
  });
});

describe('AC13 方眼の 中の マスなら どの 家具も 置ける（赤く なる 所でも）', () => {
  it('13 しゅるい ぜんぶ 5×5 の 右下のすみ (4, 4) に 置ける。方眼の 外の マス・もう 家具が ある マスは false で 何も かわらない', () => {
    for (const kind of FURN_ORDER) {
      const { ctl } = makeController();
      expect(ctl.place(kind, 4, 4), kind).toBe(true);
      expect(ctl.s.furniture, kind).toEqual([{ kind, x: 4, z: 4, rot: 0 }]);
    }
    const { ctl } = makeController();
    for (const [x, z] of [[-1, 0], [0, -1], [5, 0], [0, 5], [9, 9]] as const) {
      expect(ctl.place('chair', x, z), `(${x}, ${z}) は 方眼の 外`).toBe(false);
    }
    expect(ctl.s.furniture).toEqual([]);
    expect(ctl.canUndo()).toBe(false);
    ctl.place('chair', 1, 1);
    expect(ctl.place('table', 1, 1), '家具の ある マス').toBe(false);
    expect(ctl.s.furniture).toHaveLength(1);
    expect(ctl.place('table', 0, 1), '押した マスが 空いて いれば 重なっても 置ける').toBe(true);
  });

  it('戸の 前の 1 マス（5×5 は (2, 4)）にも 置ける ＝ door。ふつうの 場所は null。1×1 が null で 置ける マスの 数は 5×5 24・7×7 48・9×9 80（戸の 前 だけ 赤）', () => {
    const { ctl } = makeController();
    expect(ctl.place('chair', 2, 4)).toBe(true);
    expect(bads(ctl)).toEqual(['door']);
    for (const [n, size] of [[24, 5], [48, 7], [80, 9]] as const) {
      const k = makeController();
      k.ctl.setSize({ w: size, d: size });
      for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
          expect(k.ctl.place('stool', x, z), `${size}×${size} (${x}, ${z})`).toBe(true);
        }
      }
      expect(bads(k.ctl).filter((b) => b === null).length, `${size}×${size}`).toBe(n);
      expect(bads(k.ctl).filter((b) => b === 'door').length, '戸の 前の 1 マス だけ 赤').toBe(1);
    }
  });

  it('こたつ（2×2）は 5×5 の (0, 0) に ふつうに 置ける（bad なし）', () => {
    const { ctl } = makeController();
    ctl.place('nukunuku', 0, 0);
    expect(bads(ctl)).toEqual([null]);
  });
});

describe('AC13d 赤い わけ（out → door → overlap の 順）と 重なり', () => {
  it('(2, 3) の ふとん ＝ (2, 3)・(2, 4) で door。(2, 4) の ふとん ＝ (2, 4)・(2, 5) で out（戸の 前にも かかるが out が 先）', () => {
    const a = makeController();
    a.ctl.place('futon', 2, 3);
    expect(bads(a.ctl)).toEqual(['door']);
    const b = makeController();
    b.ctl.place('futon', 2, 4);
    expect(bads(b.ctl)).toEqual(['out']);
  });

  it('重なりは 両方 赤（overlap）。テーブルを みぎに まわして ほどくと 両方 null。ふとんを とると テーブルは null', () => {
    const { ctl } = makeController();
    ctl.place('futon', 1, 0); // (1, 0)・(1, 1)
    ctl.place('table', 0, 1); // (0, 1)・(1, 1)
    expect(bads(ctl)).toEqual(['overlap', 'overlap']);
    expect(ctl.rotate(1, 'right')).toBe(true); // (0, 1)・(0, 2)
    expect(pose(ctl, 1)).toEqual([0, 1, 1]);
    expect(bads(ctl)).toEqual([null, null]);
    expect(ctl.undo()).toBe(true);
    expect(bads(ctl), 'もどすと また 両方 赤').toEqual(['overlap', 'overlap']);
    ctl.selectPlaced(0);
    expect(ctl.takeSelected()).toBe(true);
    expect(bads(ctl)).toEqual([null]);
    expect(ctl.undo()).toBe(true);
    expect(bads(ctl)).toEqual(['overlap', 'overlap']);
    expect(ctl.redo()).toBe(true);
    expect(bads(ctl)).toEqual([null]);
  });

  it('重なって いる マスを 押すと あとから 置いた 方を えらぶ。重なって いない マスは その 家具。indexAt も あとから 置いた 方', () => {
    const { ctl } = makeController();
    ctl.place('futon', 1, 0);
    ctl.place('table', 0, 1);
    expect(ctl.indexAt(1, 1)).toBe(1);
    expect(ctl.indexAt(1, 0)).toBe(0);
    expect(ctl.indexAt(0, 1)).toBe(1);
    expect(ctl.indexAt(4, 4)).toBe(-1);
    expect(ctl.clickCell(1, 1)).toBe(true);
    expect(ctl.sel.placed).toBe(1);
    expect(ctl.clickCell(1, 0)).toBe(true);
    expect(ctl.sel.placed).toBe(0);
  });

  it('置く 家具を えらんで いても、家具の ある マスを 押すと その 家具を えらぶ（置かない）。赤い 家具も えらべる。空いた マスで 置く', () => {
    const { ctl } = makeController();
    ctl.selectPalette('chair');
    expect(ctl.clickCell(4, 4), '右下のすみに 置く').toBe(true);
    expect(ctl.clickCell(4, 4), '家具の ある マス').toBe(true);
    expect(ctl.s.furniture).toHaveLength(1);
    expect(ctl.sel.placed).toBe(0);
    ctl.selectPalette('futon');
    expect(ctl.clickCell(4, 4)).toBe(true);
    expect(ctl.s.furniture, '重なる ふとんを 置かず、えらぶ').toHaveLength(1);
    expect(ctl.sel.placed).toBe(0);
    expect(ctl.sel.palette, '置いた 家具を えらぶと 右の えらびは はずれる').toBeNull();
    ctl.selectPalette('futon');
    expect(ctl.clickCell(3, 4), '空いた マスは 赤く なっても 置ける').toBe(true);
    expect(ctl.s.furniture).toHaveLength(2);
    expect(bads(ctl)).toEqual([null, 'out']);
  });
});

describe('AC13e 大きさを かえる（消さずに 赤く のこす。1 マスも 入らない 家具 だけ 消える）', () => {
  const nine = (): ReturnType<typeof makeController> => {
    const k = makeController();
    k.ctl.setSize({ w: 9, d: 9 });
    k.ctl.place('long_table', 0, 4);
    k.ctl.place('chair', 4, 6);
    k.ctl.place('chair', 0, 0);
    k.ctl.hideBubble();
    return k;
  };

  it('9×9 → 5×5: (0, 4) の ながい テーブルは 左上 (−2, 2)・out、(4, 6) の いすは (2, 4)・door で のこり、(0, 0) の いすだけ 消えて ふきだし。1 回の 操作', () => {
    const { ctl } = nine();
    expect(ctl.setSize({ w: 5, d: 5 })).toBe(true);
    expect(ctl.s.furniture).toEqual([{ kind: 'long_table', x: -2, z: 2, rot: 0 }, { kind: 'chair', x: 2, z: 4, rot: 0 }]);
    expect(bads(ctl)).toEqual(['out', 'door']);
    expect(ctl.bubble?.text).toBe(MSG.tidy);
    expect(ctl.undo(), '小さく した 直後の もどす 1 回で').toBe(true);
    expect(ctl.s).toMatchObject({ w: 9, d: 9 });
    expect(ctl.s.furniture).toEqual([{ kind: 'long_table', x: 0, z: 4, rot: 0 }, { kind: 'chair', x: 4, z: 6, rot: 0 }, { kind: 'chair', x: 0, z: 0, rot: 0 }]);
    expect(bads(ctl)).toEqual([null, null, null]);
  });

  it('そのまま 9×9 に もどすと ながい テーブル (0, 4)・いす (4, 6) は null（消えた いすは もどらない）', () => {
    const { ctl } = nine();
    ctl.setSize({ w: 5, d: 5 });
    expect(ctl.setSize({ w: 9, d: 9 })).toBe(true);
    expect(ctl.s.furniture).toEqual([{ kind: 'long_table', x: 0, z: 4, rot: 0 }, { kind: 'chair', x: 4, z: 6, rot: 0 }]);
    expect(bads(ctl)).toEqual([null, null]);
  });

  it('消える 家具が ない ときは ふきだしを 出さない。重なって 赤い 家具も 消さずに のこす（9×9 → 7×7）', () => {
    const { ctl } = makeController();
    ctl.setSize({ w: 9, d: 9 });
    ctl.place('chair', 4, 4);
    ctl.place('table', 3, 4); // (3, 4)・(4, 4) で いすと 重なる
    ctl.place('stool', 7, 7); // 7×7 では (6, 6) ＝ 方眼の すみ
    ctl.hideBubble();
    expect(bads(ctl)).toEqual(['overlap', 'overlap', null]);
    expect(ctl.setSize({ w: 7, d: 7 })).toBe(true);
    expect(ctl.s.furniture).toEqual([{ kind: 'chair', x: 3, z: 3, rot: 0 }, { kind: 'table', x: 2, z: 3, rot: 0 }, { kind: 'stool', x: 6, z: 6, rot: 0 }]);
    expect(bads(ctl)).toEqual(['overlap', 'overlap', null]);
    expect(ctl.bubble, '消えた 家具が ない').toBeNull();
  });

  it('もとの マスが 方眼の 外の 家具（のこった ながい テーブル）は どちらに まわしても 1 マスも 入らないので false。赤く 1 回 光る（seq が 1 ふえる）・形と もどすは そのまま', () => {
    const { ctl } = nine();
    ctl.setSize({ w: 5, d: 5 });
    const before = JSON.stringify(ctl.s);
    const seq0 = flashOf(ctl)?.seq ?? 0;
    expect(ctl.rotate(0, 'right')).toBe(false);
    expect(flashOf(ctl)).toEqual({ items: [0], seq: seq0 + 1 });
    expect(ctl.rotate(0, 'left')).toBe(false);
    expect(flashOf(ctl)).toEqual({ items: [0], seq: seq0 + 2 });
    expect(JSON.stringify(ctl.s)).toBe(before);
    expect(ctl.undo(), 'もどす の 記録に 入らない（1 回で 大きさの 前）').toBe(true);
    expect(ctl.s).toMatchObject({ w: 9, d: 9 });
  });
});

describe('AC13f すすめない（赤い 家具が ある 間は ②→③ と できた！）', () => {
  /** ② を 開いて、右下の すみに ふとん（赤）と 左上に いす（ふつう） */
  const withRed = (): ReturnType<typeof makeController> => {
    const k = makeController();
    k.ctl.next();
    k.ctl.place('chair', 0, 0);
    k.ctl.place('futon', 4, 4);
    k.ctl.hideBubble();
    return k;
  };

  it('② の next: step は naka の まま・false・ふきだし・flash.items は 赤い 家具 ぜんぶ・seq が 1 ふえる・形と canUndo は そのまま', () => {
    const { ctl } = withRed();
    ctl.place('stool', 2, 4); // 戸の 前も 赤
    ctl.hideBubble();
    const shape = JSON.stringify(ctl.s);
    const seq0 = flashOf(ctl)?.seq ?? 0;
    expect(ctl.next()).toBe(false);
    expect(ctl.s.step).toBe('naka');
    expect(ctl.bubble?.text).toBe(FIX_RED);
    expect(flashOf(ctl)).toEqual({ items: [1, 2], seq: seq0 + 1 });
    expect(JSON.stringify(ctl.s)).toBe(shape);
    expect(ctl.next()).toBe(false);
    expect(flashOf(ctl)?.seq, '押す たびに 1 ふえる').toBe(seq0 + 2);
    let n = 0;
    while (ctl.undo()) n++;
    expect(n, '止まった ことは もどす に 入らない（置いた 3 つ だけ）').toBe(3);
  });

  it('① の next（① → ②）と ② の prev は 赤くても すすむ。赤を なおす（まわす・とる・大きさ）と next で namae', () => {
    const { ctl } = withRed();
    expect(ctl.prev()).toBe(true);
    expect(ctl.s.step).toBe('soto');
    expect(ctl.next()).toBe(true);
    expect(ctl.s.step).toBe('naka');
    expect(ctl.next()).toBe(false);
    ctl.rotate(1, 'right'); // ふとん → (3, 4) rot 1 ＝ ふつう
    expect(ctl.next()).toBe(true);
    expect(ctl.s.step).toBe('namae');

    const take = withRed();
    take.ctl.selectPlaced(1);
    take.ctl.takeSelected();
    expect(take.ctl.next()).toBe(true);

    const size = withRed();
    size.ctl.setSize({ w: 7, d: 7 }); // ふとんは (5, 5)… → 7×7 では (5,5) で 方眼の 中。ふつうに もどる
    expect(bads(size.ctl)).toEqual([null, null]);
    expect(size.ctl.next()).toBe(true);
  });

  it('done は ① ② の どちらでも 止まり、step は naka に なる。せっけいずは ふえない・同じ ふきだしと flash', () => {
    for (const from of ['soto', 'naka'] as const) {
      const { ctl, made, sheets } = withRed();
      ctl.char('あ');
      if (from === 'soto') ctl.prev();
      const seq0 = flashOf(ctl)?.seq ?? 0;
      expect(ctl.done(), from).toBe('stopped');
      expect(ctl.s.step, from).toBe('naka');
      expect(ctl.bubble?.text, from).toBe(FIX_RED);
      expect(flashOf(ctl), from).toEqual({ items: [1], seq: seq0 + 1 });
      expect(made.n + sheets.length, from).toBe(0);
    }
  });

  it('AC44 ⓪ いちばん 先: 赤い ふとん しか ない ときも・ふとんが 0 でも 名前が 0 字でも この 文。かみ・ふで・持ち物は しらべない', () => {
    let asked = 0;
    const { ctl, made, sheets } = makeController({ problem: () => (asked++, null) });
    ctl.next();
    ctl.place('futon', 4, 4); // 赤い ふとん しか ない ＋ 名前 0 字
    expect(ctl.done()).toBe('stopped');
    expect(ctl.bubble?.text).toBe(FIX_RED);
    expect(ctl.s.step).toBe('naka');
    expect(asked, '④〜⑥ は しらべない').toBe(0);
    ctl.remove(0);
    ctl.place('chair', 2, 4); // 戸の 前の 赤い いす ＋ ふとん 0
    ctl.hideBubble();
    expect(ctl.done()).toBe('stopped');
    expect(ctl.bubble?.text, 'ふとんが ないより 赤い 家具が 先').toBe(FIX_RED);
    expect(made.n + sheets.length).toBe(0);
    ctl.remove(0);
    ctl.hideBubble();
    expect(ctl.done(), '赤が なくなれば 次の しらべ（②）').toBe('stopped');
    expect(ctl.bubble?.text).toBe(MSG.futon);
  });

  it('赤い のが ふとん いがいに あっても 止まり、なおした あとは できた！で 作れる', () => {
    const { ctl, made } = withRed();
    ctl.char('あ');
    expect(ctl.done()).toBe('stopped');
    ctl.rotate(1, 'right');
    expect(ctl.done()).toBe('made');
    expect(made.n).toBe(1);
  });

  it('③ で undo して ② の 操作が もどり 赤く なる ときは step が naka（③ に 赤い 家具は ない）', () => {
    const { ctl } = makeController();
    ctl.next();
    ctl.place('futon', 4, 4);
    ctl.rotate(0, 'right'); // ふつうに なおす
    expect(ctl.next()).toBe(true);
    expect(ctl.s.step).toBe('namae');
    expect(ctl.undo()).toBe(true);
    expect(ctl.s.step).toBe('naka');
    expect(bads(ctl)).toEqual(['out']);
  });
});

describe('AC13g 保存・読みこみ（赤い 家具が のこる）', () => {
  it('赤い 家具が ある まま ① で とじても、開くと naka（名前に よくない ことばが あっても ②）。赤が なければ 今まで どおり', () => {
    const { ctl, holder } = makeController();
    holder.draft.furniture.push({ kind: 'futon', x: 4, z: 4, rot: 0 });
    for (const step of ['soto', 'naka', 'namae'] as const) {
      holder.draft.step = step;
      ctl.open();
      expect(ctl.s.step, `${step} で 保存`).toBe('naka');
    }
    holder.draft.name.front = 'しねこ';
    holder.draft.step = 'namae';
    ctl.open();
    expect(ctl.s.step).toBe('naka');
    expect(ctl.s.furniture, '赤い まま のこる').toEqual([{ kind: 'futon', x: 4, z: 4, rot: 0 }]);
    // 赤が なければ 前の きまり（よくない ことば → ③）
    holder.draft.furniture = [{ kind: 'futon', x: 3, z: 4, rot: 1 }];
    holder.draft.step = 'soto';
    ctl.open();
    expect(ctl.s.step).toBe('namae');
  });

  it('loaded()（保存から 読みなおし）も 同じ: 赤い 家具が あれば naka・もどす の 記録は すてる', () => {
    const { ctl, holder } = makeController();
    ctl.place('chair', 1, 1);
    holder.draft.furniture.push({ kind: 'chair', x: 4, z: 2, rot: 0 }, { kind: 'chair', x: 4, z: 2, rot: 0 });
    holder.draft.step = 'soto';
    ctl.loaded();
    expect(ctl.s.step).toBe('naka');
    expect(ctl.canUndo()).toBe(false);
  });
});
