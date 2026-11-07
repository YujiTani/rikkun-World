import { describe, expect, it } from 'vitest';
import { ACTIONS, type Action } from '../input/actions';
import { BAKE_RECIPES } from '../craft/recipes';
import {
  duoFirstFocus,
  duoInvSnapshot,
  duoPageAvailable,
  duoPageFallback,
  duoPageOf,
  duoQuitShown,
  duoTabs,
  invAccepts,
  invCloseReason,
  invLayoutFor,
  invPadCommand,
  invQuitHeld,
  scrollTopToShow,
  tansuBandIds,
  type InvLayout,
  type InvSource,
} from './invRules';
import { DuoSession, type DuoStepInput } from './session';
import { P2State } from './p2State';
import { DUO_TUNING } from './tuning';

/**
 * COOP-1 4a（docs/design/COOP-1.md §3.3・§12.0、AC75・AC77・AC78・AC79・AC89）の 先行テスト（赤）。2 人用 もちもの・クラフト画面の 「決まり」だけを 見る
 * （DOM の 出し入れ・見た目は E2E〔e2e/duoInv.spec.ts〕と UI 検査）。
 *
 * ---- 開発への つなぎ目の 約束（新しい ファイル src/duo/invRules.ts。DOM を 使わない 関数だけ）----
 *   type InvLayout = 'full' | 'duo'                          画面の 形（`#inventory-screen` の `data-layout` は 'duo' の ときだけ 付く。'full' は 付けない）
 *   type FullPage  = 'items' | 'craft' | 'furnace' | 'storage' | 'achievements' | 'log'
 *                                                             1P の 全面が 今 見せている ページ（タブ「もちもの／じっせき／できごと」と 右の「つくる／やく／たんす」）
 *   type DuoInvPage = 'items' | 'craft' | 'furnace' | 'tansu'  2 人用 画面の ページ（`data-page`・`duo.inv(who).page`）
 *   invLayoutFor({ joined, open, current }): InvLayout
 *       joined（2P が いる）→ いつも 'duo'（開いている 途中で 参加した ときも その ステップで 'duo'。AC79）。
 *       いない → 開いている あいだは current の まま（2P が いなくなっても とじるまで 半分。AC79）、とじていれば 'full'（つぎに 開く ときから 全面）。
 *   duoPageOf(full: FullPage): DuoInvPage                    全面 → 2 人用。items・craft・furnace は そのまま、storage → 'tansu'、achievements・log → 'items'（じっせき・できごと は 2 人用に ない）
 *   duoInvSnapshot({ layout, open, page, focus }): { open, page, focus }
 *                                                             `duo.inv(who)` の 値。layout が 'full'（1 人の 全面）か とじていれば { open: false, page: null, focus: null }。
 *   invAccepts(panel: 1 | 2, src: InvSource): boolean         その 画面が その 入力を うけるか。
 *       InvSource = { device: 'mouse' } | { device: 'key' } | { device: 'pad'; player: 1 | 2 }。マス・タブ・つくる の クリック／ダブルクリック／ドラッグ／ツールチップも 同じ。
 *   invPadCommand(action: Action): 'up' | 'down' | 'left' | 'right' | 'press' | 'close' | null
 *                                                             開いている 2 人用 画面を パッドで うごかす Action の 表。focusUp〜focusRight・confirm・closeMenu だけ。ほかは null。
 *   invQuitHeld({ open, focus, confirmHeld }): boolean        `DuoSession.step` の `quitHeld` に わたす 値。画面が 開いていて、えらびが「やめる」（`duo.inv(2).focus === 'quit'`）で、confirm を 押している ときだけ true。
 *   invCloseReason(who: 1 | 2, { down, padLost, left }): 'left' | 'down' | 'padLost' | null
 *                                                             その 人の パネルを その ステップで とじる 理由。
 *                                                             2P: やめた（left）→ 'left'、倒れた（down）→ 'down'、パッドが ぬけた（padLost）→ 'padLost'（この 順）。
 *                                                             1P: 倒れた → 'down' だけ。1P の パッドが ぬけても（padLost）null（キー・マウスで つづく）。1P には「やめた」が ない。
 *   配線（wireDuo）: 毎ステップ invLayoutFor で 1P の 画面の 形を きめ、invCloseReason が null でなければ その人の パネルを とじる（手に もっている 物は invClose.ts〔invClose.test.ts〕）。
 *   足りない 口: 仕様 §12.0 の 表に 上の 関数名は いらない（内側の 約束）。
 *
 * ---- 【4c】COOP-1 4c（§3.3「4c の しくみ」・§8 の 宿題 4〜6・§9.8・AC80・AC81）で src/duo/invRules.ts に 足す 関数（DOM を 使わない）----
 *   duoTabs(open: { furnace: boolean; storage: boolean }): readonly DuoInvPage[]
 *       上の タブの 並び。いつも ['items', 'craft']、かまどを 開いている あいだは 3 つ目に 'furnace'、たんすを 開いている あいだは 3 つ目に 'tansu'
 *       （両方 同時には 出ない。両方 true には ならない〔開いている 人は その場に 止まり、Y・ZL は 何も しない〕ので 決めない）。
 *   duoPageAvailable(page: DuoInvPage, open: { furnace; storage }): boolean   … duoTabs に ある ページか
 *   duoPageFallback(page: DuoInvPage, open: { furnace; storage }): DuoInvPage … 今の ページが もう 出せない（かまど・たんすが こわれた）なら 'items'、出せるなら そのまま
 *       （パネルは とじない。もちもの／つくる へ 行っても 3 つ目の タブは とじるまで のこる〔open の まま〕）
 *   duoFirstFocus(page: DuoInvPage, bakeRecipeIds: readonly string[]): string | null
 *       開いた ときの 最初の えらび（`duo.inv(who).focus`）。'tansu' → 'tansu:0'、'furnace' → `tile:${bakeRecipeIds[0]}`（はじめの やく レシピ）。
 *       'items'・'craft' は 4a の とおり（null ＝ 画面の いちばん はじめの 物を 呼ぶ側が えらぶ）。やく レシピが 0 こ なら null。
 *       使い方: 2P は いつも、1P は **パッドで 開いた ときも** この 関数を 使う（キー・マウスで 開いた ときは 今の まま）。1P と 2P で 同じ 物から 始まる。
 *   duoQuitShown(page: DuoInvPage): boolean   … 2P の「やめる」(`duo-quit`) を 出すページ。'items' だけ（つくる・やく・たんす には 出さない）
 *   scrollTopToShow(index: number, g: { columns: number; rowHeight: number; rowGap: number; viewHeight: number; scrollTop: number }): number
 *       たんす（9 列）・レシピの 列で、index の マスの 段が まるごと 見える ために 中の スクロール量を どうするか（新しい scrollTop）。
 *       すでに まるごと 見えていれば そのまま。上に はみ出していれば その 段の 上へ、下に はみ出していれば その 段の 下が 見える 最小の 量へ。
 *       段 r の 上 = r × (rowHeight + rowGap)・下 = 上 + rowHeight。
 *   tansuBandIds(layout: InvLayout): readonly string[]
 *       たんすの 帯の ボタンの 種類の 名前（`StorageScreen` の 中の ボタン。1P は これを id に 使う。2P の 画面の ボタンには id を つけない〔id は 1 つの 画面に 1 つ〕。E2E は `.tansu-act` で さがす）。'full' は ['tansu-store-all', 'tansu-store-same', 'tansu-take-all', 'tansu-store-marked']、
 *       'duo' は「えらんだ もの を しまう」（しるし。マウスの Ctrl クリック）を 出さない ので 最初の 3 つ だけ（1P も 2P も 同じ。宿題 6）。
 */

describe('AC75・AC79: 画面の 形（data-layout）', () => {
  const next = (layout: InvLayout, joined: boolean, open: boolean): InvLayout => invLayoutFor({ joined, open, current: layout });

  it('2P が いなければ 開いても 全面（data-layout なし）', () => {
    expect(next('full', false, true)).toBe('full');
    expect(next('full', false, false)).toBe('full');
  });
  it('2P が いれば 開いた 画面は 2 人用（1P も 2P も）', () => {
    expect(next('full', true, true)).toBe('duo');
    expect(next('full', true, false)).toBe('duo'); // 開く 前から 形は 2 人用に そなえる
  });
  it('1P の 全面が 開いている ときに 2P が 参加すると、その ステップで 2 人用に かわる', () => {
    let layout: InvLayout = 'full';
    layout = next(layout, false, true); // 全面を 開いている
    expect(layout).toBe('full');
    layout = next(layout, true, true); // 参加した ステップ
    expect(layout).toBe('duo');
  });
  it('2P が いなくなっても 開いている あいだは 半分の まま。とじた つぎから 全面', () => {
    let layout: InvLayout = 'duo';
    layout = next(layout, false, true); // 2P が やめた。まだ 開いている
    expect(layout).toBe('duo');
    layout = next(layout, false, true);
    expect(layout).toBe('duo');
    layout = next(layout, false, false); // とじた
    expect(layout).toBe('full');
  });
});

describe('AC79: 参加と 重なった とき ページが 引きつがれる', () => {
  it('つくる・もちもの（・4c の やく）は そのまま。たんす は 2 人用の たんす', () => {
    expect(duoPageOf('craft')).toBe('craft');
    expect(duoPageOf('items')).toBe('items');
    expect(duoPageOf('furnace')).toBe('furnace');
    expect(duoPageOf('storage')).toBe('tansu');
  });
  it('じっせき・できごと は 2 人用に ないので「もちもの」', () => {
    expect(duoPageOf('achievements')).toBe('items');
    expect(duoPageOf('log')).toBe('items');
  });
});

describe('AC75・§12.0: duo.inv(who) の 値', () => {
  it('2 人用で 開いている → { open: true, page, focus }', () => {
    expect(duoInvSnapshot({ layout: 'duo', open: true, page: 'items', focus: 'slot:0' })).toEqual({ open: true, page: 'items', focus: 'slot:0' });
    expect(duoInvSnapshot({ layout: 'duo', open: true, page: 'craft', focus: null })).toEqual({ open: true, page: 'craft', focus: null });
  });
  it('とじている・1 人の 全面（who 1 でも）は { open: false, page: null, focus: null }', () => {
    const none = { open: false, page: null, focus: null };
    expect(duoInvSnapshot({ layout: 'duo', open: false, page: 'craft', focus: 'tab:craft' })).toEqual(none);
    expect(duoInvSnapshot({ layout: 'full', open: true, page: 'items', focus: 'slot:0' })).toEqual(none);
  });
});

describe('AC77: だれが 動かすか', () => {
  const mouse: InvSource = { device: 'mouse' };
  const key: InvSource = { device: 'key' };
  const pad = (player: 1 | 2): InvSource => ({ device: 'pad', player });

  it('1P の 画面: 1P の キー・マウス・パッド。2P の パッドは うけない', () => {
    expect(invAccepts(1, mouse)).toBe(true);
    expect(invAccepts(1, key)).toBe(true);
    expect(invAccepts(1, pad(1))).toBe(true);
    expect(invAccepts(1, pad(2))).toBe(false);
  });
  it('2P の 画面: 2P の パッド だけ。マウス（ダブルクリック・ドラッグ・ツールチップ）も キーも うけない', () => {
    expect(invAccepts(2, pad(2))).toBe(true);
    expect(invAccepts(2, mouse)).toBe(false);
    expect(invAccepts(2, key)).toBe(false);
    expect(invAccepts(2, pad(1))).toBe(false);
  });

  it('パッドの 動かし方: 十字・けってい・とじる の 6 つ だけ（L/R・Y・ほかは メニュー中は 何も しない）', () => {
    expect(invPadCommand('focusUp')).toBe('up');
    expect(invPadCommand('focusDown')).toBe('down');
    expect(invPadCommand('focusLeft')).toBe('left');
    expect(invPadCommand('focusRight')).toBe('right');
    expect(invPadCommand('confirm')).toBe('press');
    expect(invPadCommand('closeMenu')).toBe('close');
    const used: Action[] = ['focusUp', 'focusDown', 'focusLeft', 'focusRight', 'confirm', 'closeMenu'];
    for (const a of ACTIONS) if (!used.includes(a)) expect(invPadCommand(a), a).toBeNull();
  });
});

describe('AC78: やめる（duo-quit）は 十字で えらんで confirm を 2 秒（120 ステップ）', () => {
  const idle: DuoStepInput = { padPresent: true, quitHeld: false };
  function make() {
    const left: string[] = [];
    const session = new DuoSession({ p2: new P2State(), saveP2: () => undefined, loadP2: () => null, onLeft: (r) => left.push(r) });
    session.join();
    return { session, left };
  }
  /** 毎ステップ: 画面の 状態から quitHeld を つくって session に わたす（配線と 同じ） */
  const hold = (s: DuoSession, n: number, state: { open: boolean; focus: string | null; confirmHeld: boolean }): void => {
    for (let i = 0; i < n; i++) s.step({ padPresent: true, quitHeld: invQuitHeld(state) });
  };
  const onQuit = { open: true, focus: 'quit', confirmHeld: true };

  it('時間は 表から（120 ステップ）', () => {
    expect(DUO_TUNING.quitHoldSteps).toBe(120);
  });
  it('「やめる」を えらんで 120 ステップ 押しつづけると 2P が いなくなる', () => {
    const { session, left } = make();
    hold(session, 119, onQuit);
    expect(session.joined).toBe(true);
    hold(session, 1, onQuit);
    expect(session.joined).toBe(false);
    expect(left).toEqual(['quit']);
  });
  it('119 ステップで はなすと ゲージは 0、2P は いるまま', () => {
    const { session } = make();
    hold(session, 119, onQuit);
    expect(session.quitGauge()).toBeGreaterThan(0.9);
    session.step(idle);
    expect(session.quitGauge()).toBe(0);
    expect(session.joined).toBe(true);
  });
  it('マス・つくる・タブ・✕ の 上で confirm を 300 ステップ 押しつづけても やめない', () => {
    for (const focus of ['slot:0', 'equip:head', 'tile:wood_pickaxe', 'craft', 'page-next', 'tab:craft', 'tab:items', 'close']) {
      const { session } = make();
      hold(session, 300, { open: true, focus, confirmHeld: true });
      expect(session.joined, focus).toBe(true);
      expect(session.quitGauge(), focus).toBe(0);
    }
  });
  it('画面が とじていれば（えらびが 残っていても）やめない。confirm を はなしていても やめない', () => {
    expect(invQuitHeld({ open: false, focus: 'quit', confirmHeld: true })).toBe(false);
    expect(invQuitHeld({ open: true, focus: 'quit', confirmHeld: false })).toBe(false);
    expect(invQuitHeld({ open: true, focus: null, confirmHeld: true })).toBe(false);
    const { session } = make();
    hold(session, 300, { open: false, focus: 'quit', confirmHeld: true });
    expect(session.joined).toBe(true);
  });
});

describe('AC89: とじる とき（その人が 倒れた・2P の パッドが ぬけた・2P が やめた）', () => {
  const none = { down: false, padLost: false, left: false };

  it('なにも なければ とじない', () => {
    expect(invCloseReason(1, none)).toBeNull();
    expect(invCloseReason(2, none)).toBeNull();
  });
  it('その人が 倒れた ステップに その人の パネルが とじる（2P も 1P も）', () => {
    expect(invCloseReason(1, { ...none, down: true })).toBe('down');
    expect(invCloseReason(2, { ...none, down: true })).toBe('down');
  });
  it('2P の パッドが ぬけた ステップに 2P の パネルが とじる', () => {
    expect(invCloseReason(2, { ...none, padLost: true })).toBe('padLost');
  });
  it('1P の パッドが ぬけても 1P の パネルは とじない（キー・マウスで つづく）', () => {
    expect(invCloseReason(1, { ...none, padLost: true })).toBeNull();
  });
  it('2P が やめた ステップに 2P の パネルは 消える。1P の パネルは そのまま', () => {
    expect(invCloseReason(2, { ...none, left: true })).toBe('left');
    expect(invCloseReason(1, { ...none, left: true })).toBeNull();
  });
  it('2P が パッドぬけで 60 秒 たって やめた とき 理由は「やめた」（消える）', () => {
    expect(invCloseReason(2, { down: false, padLost: true, left: true })).toBe('left');
  });
});

describe('AC80: 3 つ目の タブ（やく・たんす）', () => {
  const none = { furnace: false, storage: false };
  const furnace = { furnace: true, storage: false };
  const storage = { furnace: false, storage: true };

  it('ふだんは もちもの・つくる の 2 つ。かまどを 開いている あいだは 3 つ目に やく、たんすを 開いている あいだは 3 つ目に たんす（両方 同時には 出ない）', () => {
    expect(duoTabs(none)).toEqual(['items', 'craft']);
    expect(duoTabs(furnace)).toEqual(['items', 'craft', 'furnace']);
    expect(duoTabs(storage)).toEqual(['items', 'craft', 'tansu']);
  });
  it('ページが 出せるか: やくは かまどを 開いている とき だけ、たんすは たんすを 開いている とき だけ。もちもの・つくる は いつも', () => {
    for (const o of [none, furnace, storage]) {
      expect(duoPageAvailable('items', o)).toBe(true);
      expect(duoPageAvailable('craft', o)).toBe(true);
    }
    expect(duoPageAvailable('furnace', furnace)).toBe(true);
    expect(duoPageAvailable('furnace', storage)).toBe(false);
    expect(duoPageAvailable('furnace', none)).toBe(false);
    expect(duoPageAvailable('tansu', storage)).toBe(true);
    expect(duoPageAvailable('tansu', furnace)).toBe(false);
    expect(duoPageAvailable('tansu', none)).toBe(false);
  });
  it('「もちもの」「つくる」へ 行っても 3 つ目の タブは のこる（開いている あいだ）', () => {
    for (const page of ['items', 'craft'] as const) {
      expect(duoPageFallback(page, furnace)).toBe(page);
      expect(duoTabs(furnace)).toContain('furnace');
      expect(duoTabs(storage)).toContain('tansu');
    }
  });
  it('かまど・たんすが こわれた（出せなく なった）ら 今の ページは「もちもの」へ（パネルは とじない）。出せる ページは そのまま', () => {
    expect(duoPageFallback('furnace', none)).toBe('items');
    expect(duoPageFallback('tansu', none)).toBe('items');
    expect(duoPageFallback('furnace', storage)).toBe('items');
    expect(duoPageFallback('furnace', furnace)).toBe('furnace');
    expect(duoPageFallback('tansu', storage)).toBe('tansu');
    expect(duoPageFallback('craft', none)).toBe('craft');
  });
  it('2P の「やめる」は「もちもの」の ページ だけ', () => {
    expect(duoQuitShown('items')).toBe(true);
    expect(duoQuitShown('craft')).toBe(false);
    expect(duoQuitShown('furnace')).toBe(false);
    expect(duoQuitShown('tansu')).toBe(false);
  });
});

describe('AC80・§8 宿題 5: 開いた ときの 最初の えらび', () => {
  const ids = BAKE_RECIPES.map((r) => r.id);
  it('たんす → tansu:0、やく → はじめの やく レシピ（登録表の 先頭）', () => {
    expect(ids.length).toBeGreaterThan(0);
    expect(duoFirstFocus('tansu', ids)).toBe('tansu:0');
    expect(duoFirstFocus('furnace', ids)).toBe(`tile:${ids[0]}`);
  });
  it('やく レシピが 0 こ なら null（えらべる 物が ない）', () => {
    expect(duoFirstFocus('furnace', [])).toBeNull();
  });
  it('もちもの・つくる は 4a の とおり（null ＝ いちばん はじめの 物）', () => {
    expect(duoFirstFocus('items', ids)).toBeNull();
    expect(duoFirstFocus('craft', ids)).toBeNull();
  });
});

describe('§8 宿題 5・§9.8: たんすの 中を えらびに ついて スクロール（9 列・3 段 見える・6 段）', () => {
  const g = (scrollTop: number) => ({ columns: 9, rowHeight: 40, rowGap: 4, viewHeight: 3 * 40 + 2 * 4, scrollTop });

  it('見えている 3 段（0〜26）の マスは そのまま', () => {
    for (let i = 0; i < 27; i++) expect(scrollTopToShow(i, g(0)), `index ${i}`).toBe(0);
  });
  it('見えない 段（27〜53）に 入ったら、その 段の 下が まるごと 見える 最小の 量まで', () => {
    // 段 3: 上 132・下 172 → 下に そろえて 172 − 128 = 44
    expect(scrollTopToShow(27, g(0))).toBe(44);
    expect(scrollTopToShow(35, g(0))).toBe(44);
    // 段 5（いちばん 下）: 上 220・下 260 → 132
    expect(scrollTopToShow(53, g(0))).toBe(132);
    expect(scrollTopToShow(45, g(0))).toBe(132);
  });
  it('下まで スクロール している とき 上の 段に 入ったら、その 段の 上へ', () => {
    // scrollTop 132 → 見える 段は 3〜5。段 0 → 0、段 2（上 88）→ 88
    expect(scrollTopToShow(0, g(132))).toBe(0);
    expect(scrollTopToShow(18, g(132))).toBe(88);
    expect(scrollTopToShow(9, g(132))).toBe(44);
  });
  it('すでに まるごと 見えている 段は うごかさない（中途半端な 位置でも）', () => {
    // scrollTop 44: 見える 範囲は 44〜172。段 1（44〜84）・段 3（132〜172）は まるごと 見える
    expect(scrollTopToShow(9, g(44))).toBe(44);
    expect(scrollTopToShow(27, g(44))).toBe(44);
  });
  it('一部だけ 見えている 段は まるごと 見える ところまで（上に 少し はみ出す・下に 少し はみ出す）', () => {
    expect(scrollTopToShow(0, g(10))).toBe(0); // 段 0 は 上が 10 かくれている
    expect(scrollTopToShow(27, g(10))).toBe(44); // 段 3 は 下が はみ出す
  });
  it('十字で 下へ 1 段ずつ 進んでも えらびが いつも 見える（0 → 53）', () => {
    let top = 0;
    for (let i = 0; i < 54; i += 9) {
      top = scrollTopToShow(i, g(top));
      const rowTop = Math.floor(i / 9) * 44;
      expect(rowTop, `index ${i}`).toBeGreaterThanOrEqual(top);
      expect(rowTop + 40, `index ${i}`).toBeLessThanOrEqual(top + 128);
    }
  });
});

describe('§8 宿題 6: 2 人用では「えらんだ もの を しまう」を 出さない', () => {
  it('2 人用の たんすの 帯は 3 つ（1P も 2P も 同じ）。全面は しるし用を ふくめた 4 つ', () => {
    expect(tansuBandIds('duo')).toEqual(['tansu-store-all', 'tansu-store-same', 'tansu-take-all']);
    expect(tansuBandIds('full')).toEqual(['tansu-store-all', 'tansu-store-same', 'tansu-take-all', 'tansu-store-marked']);
  });
});
