import { describe, expect, it } from 'vitest';
import { FURN_ORDER, FURNITURE } from './furniture';
import {
  KANA_CHARS, KANA_LAYOUT, canAddChar, cloneState, dakuten, doorInside, emptyState, footprint, handakuten, needOf, parseState, placeProblem, refit, toKatakana,
  windowCells, windowMax, type EditorState, type Placed,
} from './model';
import { NAME_FRONT_MAX, SIZES, type Size } from './tuning';

/** HOUSE-1B AC11（まどの 上限）・AC12（窓の ならべ方）・AC13（置ける 所）・AC9〜10（材料）・名前（§2.6）・保存の 読み込み */

const form = (w: Size, d: Size, extra: Partial<EditorState> = {}): EditorState => ({ ...emptyState(), w, d, ...extra });

describe('AC11 まどの 上限 ＝ むかいの かべ ＋ よこの かべ 2 まい', () => {
  it('よこ w・たて d: 上限 ＝ (w＋1)÷2 ＋ (d＋1)（戸は まえ 固定。むかい ＝ うしろ〔長さ w〕、よこ ＝ ひだり・みぎ〔長さ d〕）', () => {
    for (const w of SIZES) for (const d of SIZES) expect(windowMax({ w, d }), `${w}×${d}`).toBe((w + 1) / 2 + (d + 1));
    expect(windowMax({ w: 5, d: 5 })).toBe(9);
    expect(windowMax({ w: 9, d: 9 })).toBe(15);
  });
});

describe('AC12 窓の ならべ方（左右 対称・2 マスおき・まえの かべには 置かない）', () => {
  it('0 〜 上限の どの 数でも: 数が 合う・かべの 中に おさまる・同じ 場所に 2 つ ない・2 マス 以上 はなれる・ひだり みぎ 対称・うしろは まん中を はさんで 対称', () => {
    for (const w of SIZES) {
      for (const d of SIZES) {
        for (let n = 0; n <= windowMax({ w, d }); n++) {
          const cells = windowCells({ w, d, windows: n });
          const tag = `${w}×${d} n=${n}`;
          expect(cells, tag).toHaveLength(n);
          expect(cells.some((c) => c.wall === 'front'), `${tag}: まえには 置かない`).toBe(false);
          const idx = (wall: string): number[] => cells.filter((c) => c.wall === wall).map((c) => c.i).sort((a, b) => a - b);
          const len = (wall: string): number => (wall === 'back' ? w : d);
          for (const wall of ['back', 'left', 'right']) {
            const list = idx(wall);
            for (const i of list) expect(i >= 0 && i < len(wall), `${tag} ${wall}`).toBe(true);
            list.forEach((v, k) => k > 0 && expect(v - list[k - 1]!, `${tag} ${wall}: 2 マスおき`).toBeGreaterThanOrEqual(2));
          }
          expect(idx('left'), `${tag}: ひだり ＝ みぎ`).toEqual(idx('right'));
          expect(idx('back').map((i) => w - 1 - i).sort((a, b) => a - b), `${tag}: うしろは 左右 対称`).toEqual(idx('back'));
        }
      }
    }
  });

  it('例: 5×5 で 1 こ ＝ うしろの まん中、2 こ ＝ ひだり・みぎの まん中、3 こ ＝ その 3 つ', () => {
    expect(windowCells({ w: 5, d: 5, windows: 1 })).toEqual([{ wall: 'back', i: 2 }]);
    expect(windowCells({ w: 5, d: 5, windows: 2 })).toEqual([{ wall: 'left', i: 2 }, { wall: 'right', i: 2 }]);
    expect(windowCells({ w: 5, d: 5, windows: 3 })).toEqual([{ wall: 'back', i: 2 }, { wall: 'left', i: 2 }, { wall: 'right', i: 2 }]);
  });
});

describe('AC13（2.4）13 しゅるいの 大きさと 向き', () => {
  const SIZE_BY_KIND = {
    furnace: [1, 1], tansu: [1, 1], nukunuku: [2, 2], futon: [1, 2], table: [2, 1], long_table: [3, 1], round_table: [1, 1],
    chair: [1, 1], stool: [1, 1], andon: [1, 1], shelf: [1, 1], ofuro: [2, 1], haniwa: [1, 1],
  } as const;

  it('13 しゅるい ぜんぶ 9×9 の 左上に 置ける。大きさは 表の とおり（ながい テーブルは 3×1、みぎに まわすと 1×3）', () => {
    expect(Object.keys(SIZE_BY_KIND).sort()).toEqual([...FURN_ORDER].sort());
    for (const k of FURN_ORDER) {
      expect(footprint(k, 0), k).toEqual(SIZE_BY_KIND[k]);
      expect(placeProblem(form(9, 9), { kind: k, x: 0, z: 0, rot: 0 }), k).toBeNull();
    }
    expect(footprint('long_table', 0)).toEqual([3, 1]);
    expect(footprint('long_table', 1)).toEqual([1, 3]);
  });

  it('ながい テーブル（3×1）: 5×5 で 戸の 前の 列には かかる ので 置けない。うしろの 列には 3 マス 置け、はしを 1 マス こえると はみ出す', () => {
    const s = form(5, 5);
    expect(placeProblem(s, { kind: 'long_table', x: 0, z: 4, rot: 0 }), '戸の 前（2, 4）に かかる').toBe('door');
    expect(placeProblem(s, { kind: 'long_table', x: 0, z: 0, rot: 0 })).toBeNull();
    expect(placeProblem(s, { kind: 'long_table', x: 2, z: 0, rot: 0 })).toBeNull();
    expect(placeProblem(s, { kind: 'long_table', x: 3, z: 0, rot: 0 })).toBe('out');
    expect(placeProblem(s, { kind: 'long_table', x: 0, z: 3, rot: 1 }), '1×3 が 下へ はみ出す').toBe('out');
    expect(placeProblem(s, { kind: 'long_table', x: 0, z: 2, rot: 1 })).toBeNull();
  });
});

describe('AC13 家具を 置ける 所', () => {
  const fill = (s: EditorState): number => {
    let n = 0;
    for (let z = 0; z < s.d; z++) {
      for (let x = 0; x < s.w; x++) {
        const p: Placed = { kind: 'chair', x, z, rot: 0 };
        if (placeProblem(s, p) === null) {
          s.furniture.push(p);
          n++;
        }
      }
    }
    return n;
  };

  it('1×1 の 家具を 戸の 前の 1 マス いがい ぜんぶに 置ける（5×5 ＝ 24・7×7 ＝ 48・9×9 ＝ 80）', () => {
    expect(fill(form(5, 5))).toBe(24);
    expect(fill(form(7, 7))).toBe(48);
    expect(fill(form(9, 9))).toBe(80);
  });

  it('戸の 前の 1 マスは まえの かべの まん中の 内がわ。外・重なりも 置けない', () => {
    const s = form(7, 5);
    expect(doorInside(s)).toEqual({ x: 3, z: 4 });
    expect(placeProblem(s, { kind: 'chair', x: 3, z: 4, rot: 0 })).toBe('door');
    expect(placeProblem(s, { kind: 'table', x: 2, z: 4, rot: 0 }), '2×1 が 戸の 前に かかる').toBe('door');
    expect(placeProblem(s, { kind: 'chair', x: 7, z: 0, rot: 0 })).toBe('out');
    expect(placeProblem(s, { kind: 'chair', x: -1, z: 0, rot: 0 })).toBe('out');
    s.furniture.push({ kind: 'table', x: 0, z: 0, rot: 0 });
    expect(placeProblem(s, { kind: 'chair', x: 1, z: 0, rot: 0 })).toBe('overlap');
    expect(placeProblem(s, { kind: 'chair', x: 2, z: 0, rot: 0 })).toBeNull();
    // 動かして いる 自分とは 重ならない
    expect(placeProblem(s, { kind: 'table', x: 0, z: 0, rot: 1 }, 0)).toBeNull();
  });

  it('向き: 奇数の 向きで よこ・たてが 入れかわる（家具 13 種ぜんぶ）', () => {
    for (const k of FURN_ORDER) {
      const [w, d] = FURNITURE[k].cells;
      expect(footprint(k, 0)).toEqual([w, d]);
      expect(footprint(k, 1)).toEqual([d, w]);
      expect(footprint(k, 2)).toEqual([w, d]);
      expect(footprint(k, 3)).toEqual([d, w]);
    }
  });
});

describe('大きさを かえる（refit）', () => {
  it('家の まん中からの 位置の まま 動く。入らない 物は 消えて 数を 返す', () => {
    const old = form(5, 5, { furniture: [{ kind: 'chair', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 4, z: 0, rot: 0 }] });
    const big = refit(old, form(9, 9, { furniture: old.furniture }));
    expect(big.dropped).toBe(0);
    expect(big.state.furniture.map((p) => [p.x, p.z])).toEqual([[2, 2], [6, 2]]);
    const small = refit(big.state, form(5, 5, { furniture: big.state.furniture }));
    expect(small.state.furniture.map((p) => [p.x, p.z])).toEqual([[0, 0], [4, 0]]);
    const nine = form(9, 9, { furniture: [{ kind: 'chair', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 4, z: 4, rot: 0 }] });
    const clip = refit(nine, form(5, 5));
    expect(clip.dropped, '9→5 で はみ出す いす（左上の かど）は きえる').toBe(1);
    expect(clip.state.furniture.map((p) => [p.x, p.z])).toEqual([[2, 2]]);
  });

  it('窓の 数は 新しい 上限に おさまる', () => {
    const out = refit(form(9, 9, { windows: 15 }), form(5, 5, { windows: 15 }));
    expect(out.state.windows).toBe(9);
  });
});

describe('AC9・AC10 ひつような もの（外装 ＋ 窓 ＋ 家具）', () => {
  it('き ＝ 外まわり 1 周 2(w＋d)＋4、いし ＝ w×d、かみ ＝ 窓の 数、家具は 材料の 合計。あかりは 材料なし', () => {
    const rows = needOf({ w: 5, d: 7, windows: 3, furniture: [{ kind: 'futon', x: 0, z: 0, rot: 0 }, { kind: 'andon', x: 2, z: 0, rot: 0 }, { kind: 'table', x: 0, z: 3, rot: 0 }] }, (i) => (i === 'log' ? 100 : 0));
    const by = Object.fromEntries(rows.map((r) => [r.item, r]));
    expect(by.log).toMatchObject({ need: 2 * (5 + 7) + 4 + 1 + 4, have: 100, short: 0 });
    expect(by.stone).toMatchObject({ need: 35, have: 0, short: 35 });
    expect(by.paper).toMatchObject({ need: 3 + 2 });
    expect(by.cloth?.need).toBe(3);
    expect(by.oil?.need).toBe(1);
    expect(rows.map((r) => r.item), '並び: き・いし・かみ・ぬの・いと・てつ・くさ・たいまつ・あぶら').toEqual(['log', 'stone', 'paper', 'cloth', 'string', 'oil']);
  });

  it('AC10（2.4）: はにわ 1・ながい テーブル 1・まるい テーブル 1・まるいす 1（5×5・窓 0）→ ねんど 2・き ＝ 外まわり 24 ＋ 6＋2＋2 ＝ 34。ねんどは いちばん うしろ（10 しゅるい の 並び）', () => {
    const furniture: Placed[] = [
      { kind: 'haniwa', x: 0, z: 0, rot: 0 }, { kind: 'long_table', x: 0, z: 1, rot: 0 }, { kind: 'round_table', x: 4, z: 0, rot: 0 }, { kind: 'stool', x: 4, z: 1, rot: 0 },
    ];
    const rows = needOf({ w: 5, d: 5, windows: 0, furniture }, () => 0);
    expect(rows.map((r) => [r.item, r.need])).toEqual([['log', 24 + 6 + 2 + 2], ['stone', 25], ['clay', 2]]);
    const all = needOf({ w: 9, d: 9, windows: 1, furniture: FURN_ORDER.map((kind, i) => ({ kind, x: 0, z: i % 8, rot: 0 })) }, () => 0);
    expect(all.map((r) => r.item), '13 しゅるい ぜんぶ で 10 しゅるい').toEqual(['log', 'stone', 'paper', 'cloth', 'string', 'iron_ingot', 'grass', 'torch', 'oil', 'clay']);
  });

  it('何も 置かない 5×5: き 24・いし 25 だけ', () => {
    expect(needOf(emptyState(), () => 0).map((r) => [r.item, r.need])).toEqual([['log', 24], ['stone', 25]]);
  });
});

describe('名前（§2.6）', () => {
  it('50 音の ボタン: 6 行 × 11 列・字の ボタンは 重ならない・゛゜ は 字に 数えない', () => {
    expect(KANA_LAYOUT).toHaveLength(6);
    for (const row of KANA_LAYOUT) expect(row).toHaveLength(11);
    expect(new Set(KANA_CHARS).size).toBe(KANA_CHARS.length);
    for (const c of ['あ', 'ん', 'っ', 'ゃ', 'ゅ', 'ょ', 'ー']) expect(KANA_CHARS).toContain(c);
    expect(KANA_CHARS).not.toContain('゛');
    expect(KANA_CHARS).toHaveLength(46 + 5); // 50 音（46）＋ っ ゃ ゅ ょ ー
  });

  it('゛゜: 付けられる 字だけ（ひらがな・カタカナ）', () => {
    expect(dakuten('か')).toBe('が');
    expect(dakuten('つ')).toBe('づ');
    expect(dakuten('う')).toBe('ゔ');
    expect(dakuten('カ')).toBe('ガ');
    expect(dakuten('あ')).toBeNull();
    expect(handakuten('は')).toBe('ぱ');
    expect(handakuten('ヒ')).toBe('ピ');
    expect(handakuten('か')).toBeNull();
  });

  it('カタカナ: ひらがなだけ かわる。前の 文字は 8 字まで', () => {
    expect(toKatakana('あ')).toBe('ア');
    expect(toKatakana('ー')).toBe('ー');
    expect(canAddChar('あ'.repeat(NAME_FRONT_MAX - 1))).toBe(true);
    expect(canAddChar('あ'.repeat(NAME_FRONT_MAX))).toBe(false);
  });
});

describe('AC32b 保存から 読む（parseState）', () => {
  it('おかしい 値は はじめの まま。置けない 家具・知らない 家具は すてる。名前は 8 字まで', () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState('x')).toEqual(emptyState());
    const s = parseState({
      step: 'naka', w: 7, d: 4, windows: 99, windowKind: 'x', roof: 'flat',
      furniture: [{ kind: 'chair', x: 0, z: 0, rot: 0 }, { kind: 'chair', x: 0, z: 0, rot: 0 }, { kind: 'sofa', x: 1, z: 1, rot: 0 }, { kind: 'chair', x: 99, z: 0, rot: 0 }, { kind: 'chair', x: 1, z: 0, rot: 7 }],
      name: { front: 'あいうえおかきくけこ', back: 'ぜったいちがう' },
    });
    expect(s).toMatchObject({ step: 'naka', w: 7, d: 5, windows: windowMax({ w: 7, d: 5 }), windowKind: 'shoji', furniture: [{ kind: 'chair', x: 0, z: 0, rot: 0 }] });
    expect(s.name).toEqual({ front: 'あいうえおかきく', back: 'のいえ' });
  });

  it('cloneState は 深いコピー', () => {
    const a = form(5, 5, { furniture: [{ kind: 'chair', x: 0, z: 0, rot: 0 }] });
    const b = cloneState(a);
    b.furniture[0]!.x = 3;
    b.name.front = 'x';
    expect(a.furniture[0]!.x).toBe(0);
    expect(a.name.front).toBe('');
  });
});
