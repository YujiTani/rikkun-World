import { describe, expect, it } from 'vitest';
import type { FocusBox } from '../ui/menu/focusNav';
import { InvFocus } from './invFocus';

/**
 * COOP-1 4a（§3.3「2P の えらび」・AC88）の 先行テスト（赤）。パネルごとに「えらんでいる 物」を 1 つ 持つ。DOM を 使わない 核。
 *
 * ---- 開発への つなぎ目の 約束（新しい ファイル src/duo/invFocus.ts）----
 *   type InvDomFocus = { get(): string | null }   1P の えらび = DOM の フォーカス（document.activeElement）を「名前」に した物を 返す 口。2P は 使わない。
 *   new InvFocus({ who: 1 | 2, dom?: InvDomFocus, onChange?: (name: string | null) => void })
 *     名前 = `duo.inv(who).focus` と 同じ 文字（`slot:<番号>`・`equip:head`〜`equip:legs`・`tile:<レシピ id>`・`tab:items`・`tab:craft`・`craft`・`quit`・`close`・`page-prev`・`page-next`・`tansu:<番号>`）。
 *     見える 物の 一覧は 呼ぶ 側が `FocusBox[]`（`id` = 名前、`group` = data-focus-group）で わたす（`pickNext`〔src/ui/menu/focusNav.ts〕と 同じ 形・同じ きまり）。
 *     current(): string | null        いま えらんでいる 物。2P は 自分で 持つ 物。1P は `dom.get()`（1P の 画面の 中に 無ければ null）。
 *     padMarks(): readonly string[]   `data-pad-focus="true"` を 付ける 物の 名前。2P: 開いている あいだ いつも ちょうど 1 つ（[current()]）。とじていれば []。1P: いつも []（DOM の フォーカスの わくを 使う）。
 *     reset(items): void              開いた とき（1 人の ときと 同じ「はじめの 物」= items[0]）。2P だけ（1P は DOM で 何も しない）。
 *     clear(): void                   とじた とき（current() = null、padMarks() = []）。
 *     move(items, dir): void          十字 1 回（2P）。`pickNext(items, current(), dir)` と 同じ。端では その場。1P では 何も しない（1P は 今の focusNav が DOM を 動かす）。
 *     sync(items): void               ページが かわった とき・パネルを 描きなおした ときだけ 呼ぶ（毎ステップは 呼ばない。毎ステップ 一覧を 作らない ため）。えらんでいた 物が 一覧から 消えていたら はじめの 物に もどす。一覧が 空なら null。
 *     onChange: えらびが かわった とき 1 回（reset・move・sync で 名前が かわった ときだけ。端で その場なら 呼ばない）。#419 の せつめいの 切りかえ（えらんだ レシピの せつめい）が これを 聞く。
 *   配線: 2P の 十字（invPadCommand 'up'…）→ move、'press' → current の 物を クリック、`duo.inv(2).focus` = current()。1P の `duo.inv(1).focus` = new InvFocus({ who: 1, dom }).current()。
 */

const box = (id: string, l: number, t: number, w = 50, h = 50, group?: string): FocusBox => ({ id, l, t, w, h, ...(group ? { group } : {}) });

/** 「もちもの」ページの 形（上に タブ・✕、まん中に マス、下に やめる） */
const ITEMS: FocusBox[] = [
  box('tab:items', 0, 0, 90, 56),
  box('tab:craft', 100, 0, 90, 56),
  box('close', 420, 0, 56, 56),
  box('slot:0', 0, 100),
  box('slot:1', 60, 100),
  box('slot:2', 120, 100),
  box('slot:9', 0, 160),
  box('slot:10', 60, 160),
  box('quit', 0, 300, 480, 56),
];

/** 「つくる」ページの 形（左に レシピ、右に せつめいの まとまり） */
const CRAFT: FocusBox[] = [
  box('tab:items', 0, 0, 90, 56),
  box('tab:craft', 100, 0, 90, 56),
  box('tile:wood_pickaxe', 0, 100),
  box('tile:torch', 60, 100),
  box('page-prev', 300, 100, 40, 40, 'cp-detail'),
  box('page-next', 400, 100, 40, 40, 'cp-detail'),
  box('craft', 300, 300, 140, 56, 'cp-detail'),
];

describe('AC88: 2P の えらび（パネルごとに 1 つ）', () => {
  it('開くと はじめの 物（1 人の ときと 同じ）。とじると 空', () => {
    const f = new InvFocus({ who: 2 });
    expect(f.current()).toBeNull();
    expect(f.padMarks()).toEqual([]);
    f.reset(ITEMS);
    expect(f.current()).toBe('tab:items');
    expect(f.padMarks()).toEqual(['tab:items']);
    f.clear();
    expect(f.current()).toBeNull();
    expect(f.padMarks()).toEqual([]);
  });

  it('十字で 動く。端では その場。data-pad-focus は いつも ちょうど 1 つ', () => {
    const f = new InvFocus({ who: 2 });
    f.reset(ITEMS);
    const seen: string[] = [f.current()!];
    for (const dir of ['right', 'down', 'down', 'right', 'down', 'down', 'up', 'left', 'left', 'left', 'up', 'up', 'up', 'up'] as const) {
      f.move(ITEMS, dir);
      expect(f.padMarks(), dir).toHaveLength(1);
      expect(f.padMarks()[0]).toBe(f.current());
      seen.push(f.current()!);
    }
    expect(seen).toContain('tab:craft');
    expect(seen).toContain('slot:0');
    expect(seen).toContain('quit');
    // 端: 左の いちばん 左で 左を 押しても その場
    const g = new InvFocus({ who: 2 });
    g.reset(ITEMS);
    g.move(ITEMS, 'left');
    expect(g.current()).toBe('tab:items');
  });

  it('タブから 下で マスへ、マスから 下で「やめる」へ、「やめる」から 上で もどれる（はばの 広い ボタン）', () => {
    const f = new InvFocus({ who: 2 });
    f.reset(ITEMS);
    f.move(ITEMS, 'down');
    expect(f.current()).toBe('slot:0');
    f.move(ITEMS, 'down');
    expect(f.current()).toBe('slot:9');
    f.move(ITEMS, 'down');
    expect(f.current()).toBe('quit');
    f.move(ITEMS, 'up');
    expect(f.current()).toMatch(/^slot:/); // どの マスへ もどるかは はばの 中の 近い 物
  });

  it('同じ まとまり（せつめい）の 中を 先に えらぶ（#419 と 同じ）', () => {
    const f = new InvFocus({ who: 2 });
    f.reset(CRAFT);
    for (const d of ['down', 'right', 'right'] as const) f.move(CRAFT, d); // レシピの 列を 出て せつめいの まとまりへ
    expect(f.current()).toBe('page-prev');
    f.move(CRAFT, 'down'); // まとまりの 中の「つくる」（外の 物より 先）
    expect(f.current()).toBe('craft');
  });

  it('えらびが かわった ときだけ onChange（レシピを えらぶと 2P の せつめいが その レシピに なる）', () => {
    const log: Array<string | null> = [];
    const f = new InvFocus({ who: 2, onChange: (n) => log.push(n) });
    f.reset(CRAFT);
    expect(log).toEqual(['tab:items']);
    f.move(CRAFT, 'down');
    expect(log).toEqual(['tab:items', 'tile:wood_pickaxe']);
    f.move(CRAFT, 'left'); // 端: その場
    expect(log).toEqual(['tab:items', 'tile:wood_pickaxe']);
    f.move(CRAFT, 'right');
    expect(log[log.length - 1]).toBe('tile:torch');
  });

  it('ページが かわって えらんでいた 物が 消えたら、はじめの 物に もどる（えらびが 空に ならない）', () => {
    const f = new InvFocus({ who: 2 });
    f.reset(ITEMS);
    f.move(ITEMS, 'down');
    f.move(ITEMS, 'down');
    expect(f.current()).toBe('slot:9');
    f.sync(CRAFT); // 「つくる」に かわった: slot:9 は ない
    expect(f.current()).toBe('tab:items');
    expect(f.padMarks()).toHaveLength(1);
    f.sync(CRAFT); // 物が あれば そのまま
    expect(f.current()).toBe('tab:items');
    f.sync([]);
    expect(f.current()).toBeNull();
    expect(f.padMarks()).toEqual([]);
  });

  it('2P が 開く たびに はじめの 物から（前の えらびを 引きつがない）', () => {
    const f = new InvFocus({ who: 2 });
    f.reset(ITEMS);
    f.move(ITEMS, 'down');
    f.clear();
    f.reset(ITEMS);
    expect(f.current()).toBe('tab:items');
  });
});

describe('AC88: 1P と 2P の えらびは とりあわない', () => {
  function pair() {
    const dom = { value: null as string | null, get: () => dom.value };
    const p1 = new InvFocus({ who: 1, dom });
    const p2 = new InvFocus({ who: 2 });
    return { dom, p1, p2 };
  }

  it('2P の 十字で えらびを うごかしても 1P の フォーカス（DOM）は かわらない', () => {
    const { dom, p1, p2 } = pair();
    dom.value = 'slot:1'; // 1P は キーで マスに フォーカス
    p2.reset(ITEMS);
    for (const d of ['down', 'down', 'right', 'down'] as const) p2.move(ITEMS, d);
    expect(dom.value).toBe('slot:1');
    expect(p1.current()).toBe('slot:1');
  });

  it('1P の フォーカスが うごいても 2P の えらび（duo.inv(2).focus）は かわらない', () => {
    const { dom, p1, p2 } = pair();
    p2.reset(ITEMS);
    p2.move(ITEMS, 'down');
    const before = p2.current();
    for (const n of ['tab:craft', 'slot:2', 'quit']) dom.value = n; // 1P の キー・パッド
    expect(p1.current()).toBe('quit');
    expect(p2.current()).toBe(before);
  });

  it('1P の 画面は DOM の フォーカスの わくを 使う: data-pad-focus は 付けない。1P に move・reset は きかない', () => {
    const { dom, p1 } = pair();
    dom.value = 'slot:0';
    expect(p1.padMarks()).toEqual([]);
    p1.reset(ITEMS);
    p1.move(ITEMS, 'right');
    expect(p1.current()).toBe('slot:0');
    expect(p1.padMarks()).toEqual([]);
  });

  it('1P の 画面の 外に フォーカスが あれば 1P の えらびは null', () => {
    const { p1 } = pair();
    expect(p1.current()).toBeNull();
  });
});
